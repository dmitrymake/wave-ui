<?php
ini_set('display_errors', 0);
set_time_limit(0);
ignore_user_abort(true);

// Reflect the request Origin only when it is the same host the API is served from,
// instead of a blanket "*". A cross-origin page then gets no CORS grant, so its
// (preflighted) JSON POSTs — e.g. save_token — are blocked, while the same-origin app
// is unaffected in both production and the dev proxy.
function applyCorsOrigin() {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (!$origin) return;
    $oHost = parse_url($origin, PHP_URL_HOST);
    $oPort = parse_url($origin, PHP_URL_PORT);
    $oHostPort = $oHost . ($oPort ? ":$oPort" : "");
    $host = $_SERVER['HTTP_HOST'] ?? '';
    if ($oHostPort === $host || $oHost === $host) {
        header("Access-Control-Allow-Origin: $origin");
        header("Vary: Origin");
    }
}

header('Content-Type: application/json');
applyCorsOrigin();
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, Accept-Language');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

define('INC', '/var/www/inc');

define('STORAGE_DIR', '/dev/shm/yandex_music/');
define('STATE_FILE', STORAGE_DIR . 'state.json');
define('META_CACHE_FILE', STORAGE_DIR . 'meta_cache.json');
define('DAEMON_LOG_FILE', '/dev/shm/wave_daemon.log');
define('TOKEN_FILE', '/var/local/www/yandex_token.dat');
define('LOG_FILE', '/dev/shm/wave_api.log');

require_once INC . '/yandex-music.php';
require_once INC . '/yandex-cache.php';

if (!is_dir(STORAGE_DIR)) @mkdir(STORAGE_DIR, 0777, true);

function debug($msg) {
    @file_put_contents(LOG_FILE, "[" . date('H:i:s') . "] API: $msg\n", FILE_APPEND);
}

function getToken() {
    return file_exists(TOKEN_FILE) ? trim(file_get_contents(TOKEN_FILE)) : null;
}

// Atomic read-merge-write under an exclusive lock. The daemon writes STATE_FILE
// under LOCK_EX (updateState/saveState); without the same lock here, this side's
// read-modify-write could interleave with a daemon refill and clobber its
// queue_buffer/played_history (or read a half-written file).
function saveState($data) {
    if (!is_dir(STORAGE_DIR)) @mkdir(STORAGE_DIR, 0777, true);
    $fp = fopen(STATE_FILE, 'c+');
    if (!$fp) return;
    if (flock($fp, LOCK_EX)) {
        $current = json_decode(stream_get_contents($fp), true) ?: [];
        $newState = array_merge($current, $data);
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($newState));
        fflush($fp);
        flock($fp, LOCK_UN);
    }
    fclose($fp);
}

function getState() {
    if (!file_exists(STATE_FILE)) return [];
    $fp = fopen(STATE_FILE, 'r');
    if (!$fp) return [];
    $state = [];
    if (flock($fp, LOCK_SH)) {
        $state = json_decode(stream_get_contents($fp), true) ?: [];
        flock($fp, LOCK_UN);
    }
    fclose($fp);
    return $state;
}

function mpdSend($cmd) {
    $fp = @fsockopen("localhost", 6600, $errno, $errstr, 5);
    if (!$fp) return false;
    // Bound the READ too, not just the connect: a stalled MPD (accepted the socket
    // but never replies) would otherwise block fgets indefinitely.
    stream_set_timeout($fp, 5);
    fgets($fp);
    fwrite($fp, "$cmd\n");
    $resp = "";
    while (!feof($fp)) {
        $line = fgets($fp);
        if ($line === false) break;
        $resp .= $line;
        if (strpos($line, 'OK') === 0 || strpos($line, 'ACK') === 0) break;
        $meta = stream_get_meta_data($fp);
        if (!empty($meta['timed_out'])) break;
    }
    fclose($fp);
    return $resp;
}

// MPD treats a literal newline as a command separator and " as a quote terminator.
// Stream URLs are built from Yandex XML regex captures, so a crafted \n or " could
// inject additional MPD commands. Strip control chars and escape per MPD quoting.
function mpdAdd($url) {
    $safe = str_replace(["\r", "\n"], '', (string)$url);
    $safe = str_replace(['\\', '"'], ['\\\\', '\\"'], $safe);
    return mpdSend('add "' . $safe . '"');
}

function resetDaemon() {
    debug("Resetting Daemon...");
    $blankState = [
        'active' => false,
        'mode' => 'idle',
        'queue_buffer' => [],
        'context_name' => 'Stopped'
    ];
    // Full replace under the same exclusive lock the daemon uses, so a reset cannot
    // interleave with a daemon write and leave a half-blanked state.
    $fp = fopen(STATE_FILE, 'c');
    if ($fp) {
        if (flock($fp, LOCK_EX)) {
            ftruncate($fp, 0);
            fwrite($fp, json_encode($blankState));
            fflush($fp);
            flock($fp, LOCK_UN);
        }
        fclose($fp);
    }
    usleep(200000);
    mpdSend("stop");
    mpdSend("clear");
    // Normalize MPD playback mode for Yandex sessions. The daemon assumes strictly
    // sequential playback (it maintains a sliding window and appends tracks ahead).
    // If repeat/single is left on the short window loops the first few tracks;
    // random/consume break the index-based position tracking. Force them off.
    mpdSend("repeat 0");
    mpdSend("single 0");
    mpdSend("random 0");
    mpdSend("consume 0");
    debug("Daemon Reset Complete.");
}

// Normalize a Yandex cover URI (`...%%` template) to an absolute 400x400 URL.
function yandexCoverUrl($uri, $size = '400x400') {
    if (!$uri) return null;
    $u = str_replace('%%', $size, (string)$uri);
    return strpos($u, 'http') === 0 ? $u : 'https://' . $u;
}

function formatTrack($t) {
    if (!$t || !is_array($t)) return null;
    // Already-formatted tracks (re-passed through the buffer/cache path) pass through.
    if (isset($t['isYandex']) && $t['isYandex'] === true) return $t;
    if (empty($t['id'])) return null;
    return yandexFormatTrack($t);
}

function cacheTrackMeta($url, $track) {
    $formatted = formatTrack($track);
    if (!$formatted) return;
    storeTrackMeta($formatted, $url, null);
}

/**
 * Materialize the first $limit tracks into MPD (download link + add) and stash the
 * rest into $initialBuffer for the daemon to page later. Shared by play_station and
 * play_playlist so the buffer-handoff contract lives in one place. Returns 'added',
 * 'failed' (no stream url) or 'stashed'.
 */
function bufferTrack($clean, $api, $limit, &$count, &$initialBuffer, $stashAsYandexUri = false) {
    if ($count < $limit) {
        $url = $api->getDirectLink($clean['id']);
        if (!$url) return 'failed';
        cacheTrackMeta($url, $clean);
        mpdAdd($url);
        $count++;
        return 'added';
    }
    $initialBuffer[] = $clean;
    if ($stashAsYandexUri) cacheTrackMeta("yandex:" . $clean['id'], $clean);
    return 'stashed';
}

try {
    $action = $_REQUEST['action'] ?? '';

    if ($action === 'status') {
        $token = getToken();
        echo json_encode(['authorized' => !!$token]);
        exit;
    }

    if ($action === 'save_token') {
        $input = json_decode(file_get_contents('php://input'), true);
        if (empty($input['token'])) throw new Exception("Empty token");
        $api = new YandexMusic($input['token']);
        // Validate before persisting: getUserId() returns null on a 401 (bad token),
        // so without this check a garbage token would be written and every
        // subsequent action would 401 until manually re-authed.
        $uid = $api->getUserId();
        if (!$uid) throw new Exception("Token validation failed");
        if (!is_dir(dirname(TOKEN_FILE))) mkdir(dirname(TOKEN_FILE), 0755, true);
        file_put_contents(TOKEN_FILE, $input['token']);
        chmod(TOKEN_FILE, 0600);
        echo json_encode(['status' => 'ok']);
        exit;
    }

    $token = getToken();
    if (!$token) throw new Exception("Token not found");
    $api = new YandexMusic($token);

    switch ($action) {
        
        case 'search':
            $q = $_GET['query'] ?? '';
            if (empty($q)) {
                echo json_encode(['tracks' => [], 'albums' => [], 'artists' => []]);
                break;
            }
            $raw = $api->search($q);
            $res = $raw['result'] ?? [];
            
            $tracks = [];
            if (isset($res['tracks']['results'])) {
                foreach ($res['tracks']['results'] as $t) $tracks[] = formatTrack($t);
            }
            $albums = [];
            if (isset($res['albums']['results'])) {
                foreach ($res['albums']['results'] as $a) {
                    $cover = isset($a['coverUri']) ? yandexCoverUrl($a['coverUri']) : null;
                    $artist = $a['artists'][0]['name'] ?? 'Unknown';
                    $albums[] = [
                        'title' => $a['title'],
                        'artist' => $artist,
                        'id' => (string)$a['id'],
                        'image' => $cover,
                        'kind' => 'album',
                        'year' => $a['year'] ?? ''
                    ];
                }
            }
            $artists = [];
            if (isset($res['artists']['results'])) {
                foreach ($res['artists']['results'] as $a) {
                    $cover = isset($a['cover']['uri']) ? yandexCoverUrl($a['cover']['uri']) : null;
                    $artists[] = [
                        'title' => $a['name'],
                        'id' => (string)$a['id'],
                        'image' => $cover,
                        'kind' => 'artist'
                    ];
                }
            }
            echo json_encode(['tracks' => $tracks, 'albums' => $albums, 'artists' => $artists]);
            break;

        case 'get_landing':
            echo json_encode($api->getLandingBlocks());
            break;

        case 'get_stations_dashboard':
            $raw = $api->getStationDashboard();
            $stations = [];
            foreach ($raw as $item) {
                $tag = $item['station']['id']['tag'] ?? '';
                
                if ($tag === 'onyourwave' && isset($item['station']['restrictions2'])) {
                     if (isset($item['station']['restrictions2']['moodEnergy']['possibleValues'])) {
                        foreach ($item['station']['restrictions2']['moodEnergy']['possibleValues'] as $m) {
                            if ($m['value'] === 'all') continue;
                            $img = $m['image']['src'] ?? $m['imageUrl'] ?? null;
                            if ($img) $img = yandexCoverUrl($img);
                            
                            $stations[] = [
                                'title' => $m['name'],
                                'id' => 'vibe:moodEnergy:' . $m['value'], 
                                'kind' => 'station',
                                'service' => 'yandex',
                                'cover' => $img,
                                'bgColor' => $m['image']['backgroundColor'] ?? '#fa2d48',
                                'isStation' => true,
                                'type' => 'mood'
                            ];
                        }
                     }
                }
                
                if (isset($item['station']['name']) && $tag !== 'onyourwave') {
                    $img = $item['station']['icon']['imageUrl'] ?? null;
                    if ($img) $img = yandexCoverUrl($img);
                    $stations[] = [
                        'title' => $item['station']['name'],
                        'id' => $item['station']['id']['type'] . ':' . $item['station']['id']['tag'],
                        'kind' => 'station',
                        'service' => 'yandex',
                        'cover' => $img,
                        'isStation' => true
                    ];
                }
            }
            echo json_encode(['stations' => $stations]);
            break;

        case 'get_playlists':
            $playlists = $api->getUserPlaylists();
            $result = [];
            $result[] = [
                'title' => 'Favorites',
                'kind' => 'favorites', 
                'uid' => $api->getUserId(),
                'cover' => 'https://music.yandex.ru/blocks/playlist-cover/playlist-cover_like.png',
                'trackCount' => '♥',
                'service' => 'yandex'
            ];
            foreach ($playlists as $pl) {
                if (empty($pl['title'])) continue;
                $cover = null;
                if (isset($pl['cover']['uri'])) {
                    $cover = yandexCoverUrl($pl['cover']['uri']);
                } elseif (isset($pl['cover']['itemsUri'][0])) {
                    $cover = yandexCoverUrl($pl['cover']['itemsUri'][0]);
                }
                $result[] = [
                    'title' => $pl['title'],
                    'kind' => $pl['kind'],
                    'uid' => $pl['owner']['uid'] ?? $pl['uid'] ?? null,
                    'cover' => $cover,
                    'trackCount' => $pl['trackCount'] ?? 0,
                    'service' => 'yandex'
                ];
            }
            echo json_encode($result);
            break;

        case 'get_playlist_tracks':
            $uid = $_GET['uid'] ?? '';
            $kind = $_GET['kind'] ?? '';
            $offset = intval($_GET['offset'] ?? 0);
            
            $rawTracks = [];
            if ($kind === 'favorites') {
                $ids = $api->getFavoritesIds();
                $slice = array_slice($ids, $offset, 50);
                $rawTracks = $api->getTracksByIds($slice);
            } else {
                $rawTracks = $api->getPlaylistTracks($uid, $kind, $offset);
            }
            
            $tracks = array_map('formatTrack', $rawTracks);
            echo json_encode(['tracks' => $tracks]);
            break;

        case 'get_artist_details':
            $data = $api->getArtistDetails($_GET['id']);
            $data['tracks'] = array_map('formatTrack', $data['tracks']);
            $cleanAlbums = [];
            foreach ($data['albums'] as $a) {
                $cover = isset($a['coverUri']) ? yandexCoverUrl($a['coverUri']) : null;
                $cleanAlbums[] = [
                    'title' => $a['title'],
                    'id' => (string)$a['id'],
                    'year' => $a['year'] ?? '',
                    'image' => $cover,
                    'kind' => 'album'
                ];
            }
            $data['albums'] = $cleanAlbums;
            if (isset($data['artist']['cover']['uri'])) {
                $data['cover'] = yandexCoverUrl($data['artist']['cover']['uri']);
            }
            echo json_encode($data);
            break;

        case 'get_album_details':
            $data = $api->getAlbumDetails($_GET['id']);
            $info = $data['info'];
            $res = [
                'title' => $info['title'],
                'artist' => $info['artists'][0]['name'] ?? 'Unknown',
                'cover' => isset($info['coverUri']) ? yandexCoverUrl($info['coverUri']) : null,
                'year' => $info['year'] ?? '',
                'tracks' => array_map('formatTrack', $data['tracks'])
            ];
            echo json_encode($res);
            break;

        case 'get_favorites_ids':
            echo json_encode(['ids' => $api->getFavoritesIds()]);
            break;

        case 'play_station':
            $stationId = $_REQUEST['station'] ?? 'user:onyourwave';
            $stationSettings = null;
            $contextName = "My Vibe";

            if (strpos($stationId, 'vibe:') === 0) {
                $parts = explode(':', $stationId);
                if (count($parts) >= 3) {
                    $group = $parts[1];
                    $val = $parts[2];

                    $stationId = 'user:onyourwave';
                    $contextName = "Vibe: " . ucfirst($val);

                    $stationSettings = [
                        'language' => 'any',
                        'moodEnergy' => 'all',
                        'diversity' => 'default',
                    ];
                    if ($group === 'moodEnergy') {
                        $stationSettings['moodEnergy'] = $val;
                    } elseif ($group === 'diversity') {
                        $stationSettings['diversity'] = $val;
                    } elseif ($group === 'language') {
                        $stationSettings['language'] = $val;
                    } else {
                        $stationSettings[$group] = $val;
                    }
                }
            } elseif (strpos($stationId, 'track:') === 0) {
                $contextName = "Track Radio";
            }

            // For My Vibe without explicit mood, reset server-side settings to defaults
            // (rotor remembers per-user settings across sessions — cleanup otherwise)
            if ($stationId === 'user:onyourwave' && $stationSettings === null) {
                $stationSettings = [
                    'language' => 'any',
                    'moodEnergy' => 'all',
                    'diversity' => 'default',
                ];
            }

            // Preserve play history across station switches
            $oldState = getState();
            $globalHistory = $oldState['played_history'] ?? [];
            if (count($globalHistory) > 100) {
                $globalHistory = array_slice($globalHistory, -100);
            }

            resetDaemon();

            // Apply station settings before fetching tracks (mood/energy/language filters)
            if ($stationSettings !== null) {
                try {
                    $api->setStationSettings($stationId, $stationSettings);
                } catch (Exception $e) {
                    debug("setStationSettings failed: " . $e->getMessage());
                }
            }

            $queueData = $api->getStationTracks($stationId, $globalHistory);
            $tracks = $queueData['tracks'] ?? [];
            $batchId = $queueData['batchId'] ?? null;

            // Send radioStarted feedback so rotor knows the session began
            if ($batchId) {
                try {
                    $api->sendFeedback($stationId, 'radioStarted', null, $batchId);
                } catch (Exception $e) {
                    debug("radioStarted feedback failed: " . $e->getMessage());
                }
            }

            $initialBuffer = [];
            $count = 0;
            $newHistory = $globalHistory;

            foreach ($tracks as $clean) {
                if (!$clean) continue;
                if (in_array((string)$clean['id'], $globalHistory)) continue;

                if (bufferTrack($clean, $api, 5, $count, $initialBuffer, true) === 'added') {
                    $newHistory[] = (string)$clean['id'];
                }
                if (count($initialBuffer) >= 20) break;
            }

            // Fallback: ignore history if too few tracks passed the filter
            if ($count < 3 && !empty($tracks)) {
                foreach ($tracks as $clean) {
                    if (!$clean) continue;
                    if (in_array((string)$clean['id'], $newHistory)) continue;
                    if (bufferTrack($clean, $api, 5, $count, $initialBuffer, true) === 'added') {
                        $newHistory[] = (string)$clean['id'];
                        if ($count >= 5) break;
                    }
                }
            }

            mpdSend("play");

            saveState([
                'active' => true,
                'mode' => 'station',
                'station_id' => $stationId,
                'station_settings' => $stationSettings,
                'context_name' => $contextName,
                'queue_buffer' => $initialBuffer,
                'played_history' => $newHistory,
                'batch_id' => $batchId,
            ]);
            echo json_encode(['status' => 'started', 'context' => $contextName, 'tracks' => count($tracks)]);
            break;


        case 'play_playlist':
            $input = json_decode(file_get_contents('php://input'), true);
            $tracks = $input['tracks'] ?? [];
            $contextName = $input['context'] ?? 'Yandex Playlist';
            // Optional paged source {kind, uid, offset}: lets the daemon keep
            // fetching beyond the tracks sent here (favorites/playlists can have
            // hundreds of tracks while the UI only loads a page at a time).
            $source = $input['source'] ?? null;
            if (empty($tracks)) throw new Exception("No tracks provided");
            resetDaemon();
            $count = 0;
            $initialBuffer = [];
            foreach ($tracks as $t) {
                $cleanTrack = formatTrack($t);
                if (!$cleanTrack) continue;
                bufferTrack($cleanTrack, $api, 5, $count, $initialBuffer, false);
            }
            mpdSend("play");
            saveState([
                'active' => true,
                'mode' => 'static',
                'context_name' => $contextName,
                'queue_buffer' => $initialBuffer,
                'played_history' => [],
                'static_source' => $source
            ]);
            echo json_encode(['status' => 'ok', 'buffered' => count($initialBuffer)]);
            break;
            
        case 'add_tracks':
            $input = json_decode(file_get_contents('php://input'), true);
            $tracks = $input['tracks'] ?? [];
            $currentState = getState();
            $buffer = $currentState['queue_buffer'] ?? [];
            $added = 0;
            if (empty($buffer)) {
                 $first = array_shift($tracks);
                 if ($first) {
                     $cleanFirst = formatTrack($first);
                     if ($cleanFirst) {
                         $url = $api->getDirectLink($cleanFirst['id']);
                         if ($url) {
                             cacheTrackMeta($url, $cleanFirst);
                             mpdAdd($url);
                             $added++;
                         }
                     }
                 }
            }
            foreach ($tracks as $t) {
                $clean = formatTrack($t);
                if ($clean) $buffer[] = $clean;
            }
            saveState([
                'active' => true,
                'mode' => 'static', 
                'queue_buffer' => $buffer
            ]);
            echo json_encode(['status' => 'ok', 'added' => $added]);
            break;

        case 'play_track':
            $id = $_REQUEST['id'] ?? '';
            $append = ($_REQUEST['append'] ?? '0') === '1';
            $trackInfo = $api->getTracksByIds([$id]);
            $t = $trackInfo[0] ?? ['id'=>$id, 'title'=>'Unknown'];
            $cleanTrack = formatTrack($t);
            $url = $api->getDirectLink($id);
            if ($url) {
                if (!$append) resetDaemon();
                cacheTrackMeta($url, $cleanTrack);
                mpdAdd($url);
                if (!$append) {
                    mpdSend("play");
                    saveState(['active' => false, 'mode' => 'idle', 'context_name' => 'Single Track']);
                }
                echo json_encode(['status' => 'ok']);
            }
            break;

        case 'stop_daemon':
            saveState(['active' => false, 'mode' => 'idle', 'context_name' => 'Stopped']);
            echo json_encode(['status' => 'stopped']);
            break;

        case 'feedback_skip':
            $input = json_decode(file_get_contents('php://input'), true) ?: [];
            $trackId = (string)($input['track_id'] ?? $_REQUEST['track_id'] ?? '');
            $playedSeconds = intval($input['played_seconds'] ?? $_REQUEST['played_seconds'] ?? 0);
            $state = getState();
            $stationId = $state['station_id'] ?? '';
            $batchId = $state['batch_id'] ?? null;
            if ($trackId && $stationId && ($state['mode'] ?? '') === 'station') {
                try {
                    $api->sendFeedback($stationId, 'trackSkipped', $trackId, $batchId, $playedSeconds);
                } catch (Exception $e) {
                    debug("feedback_skip failed: " . $e->getMessage());
                }
            }
            echo json_encode(['status' => 'ok']);
            break;

        case 'like':
            $api->toggleLike($_REQUEST['track_id'] ?? '', true);
            echo json_encode(['status' => 'liked']);
            break;

        case 'dislike':
            $api->toggleLike($_REQUEST['track_id'] ?? '', false);
            echo json_encode(['status' => 'disliked']);
            break;
            
        case 'get_meta':
            $url = $_GET['url'] ?? '';
            $cache = readMetaCache();
            $res = lookupMeta($cache, $url);
            if ($res) bumpMetaAccessTime($url);
            echo json_encode($res, JSON_UNESCAPED_UNICODE);
            break;

        case 'batch_get_meta':
            $input = json_decode(file_get_contents('php://input'), true) ?: [];
            $urls = $input['urls'] ?? [];
            $cache = readMetaCache();
            $out = [];
            foreach ($urls as $u) {
                $u = (string)$u;
                $res = lookupMeta($cache, $u);
                if ($res) bumpMetaAccessTime($u);
                $out[$u] = $res;
            }
            echo json_encode($out, JSON_UNESCAPED_UNICODE);
            break;

        case 'get_state':
            $state = getState();
            echo json_encode([
                'active' => $state['active'] ?? false,
                'context_name' => $state['context_name'] ?? 'Yandex Music'
            ]);
            break;

        case 'debug_dump':
            $state = getState();
            $dumpCache = file_exists(META_CACHE_FILE) ? json_decode(file_get_contents(META_CACHE_FILE), true) : [];
            $md5Keys = $idKeys = 0;
            $uniqueIds = [];
            foreach ($dumpCache as $k => $v) {
                if (strlen($k) === 32 && ctype_xdigit($k)) $md5Keys++;
                else $idKeys++;
                if (isset($v['id'])) $uniqueIds[(string)$v['id']] = true;
            }
            $trackFiles = glob('/dev/shm/yandex_music/tracks/*.*') ?: [];

            $uaFile = '/var/local/www/yandex_client_ua.dat';
            $clientHeader = (file_exists($uaFile) && trim(file_get_contents($uaFile)))
                ? trim(file_get_contents($uaFile))
                : 'YandexMusicAndroid/24023621';

            echo json_encode([
                'state' => $state,
                'meta_cache' => [
                    'bytes' => file_exists(META_CACHE_FILE) ? filesize(META_CACHE_FILE) : 0,
                    'entries' => count($dumpCache),
                    'md5_keys' => $md5Keys,
                    'id_keys' => $idKeys,
                    'unique_tracks' => count($uniqueIds),
                ],
                'tracks_cached' => count($trackFiles),
                'client_header' => $clientHeader,
                'token_set' => !!getToken(),
            ], JSON_UNESCAPED_UNICODE);
            break;

        default:
            echo json_encode(['error' => 'Unknown action']);
    }

} catch (Throwable $e) {
    debug("Error: " . $e->getMessage());
    http_response_code(500);
    // Return author-controlled Exception messages (used by the UI for auth state),
    // but never leak internals from unexpected errors (TypeError, paths, etc.).
    $msg = ($e instanceof Exception) ? $e->getMessage() : 'Internal server error';
    echo json_encode(['error' => $msg]);
}
?>
