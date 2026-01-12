<?php
ini_set('display_errors', 0);
set_time_limit(0); 
ignore_user_abort(true);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header('Access-Control-Allow-Headers: *');

define('INC', '/var/www/inc');
require_once INC . '/yandex-music.php';

define('STORAGE_DIR', '/dev/shm/yandex_music/');
define('STATE_FILE', STORAGE_DIR . 'state.json');
define('META_CACHE_FILE', STORAGE_DIR . 'meta_cache.json');
define('TOKEN_FILE', '/var/local/www/yandex_token.dat');
define('LOG_FILE', '/dev/shm/wave_api.log');

$action = $_REQUEST['action'] ?? '';

if (!function_exists('mb_strtolower')) {
    function mb_strtolower($str) { return strtolower($str); }
}

function debug($msg) {
    @file_put_contents(LOG_FILE, "[" . date('H:i:s') . "] API: $msg\n", FILE_APPEND);
}

function getToken() {
    return file_exists(TOKEN_FILE) ? trim(file_get_contents(TOKEN_FILE)) : null;
}

function saveState($data) {
    if (!is_dir(STORAGE_DIR)) @mkdir(STORAGE_DIR, 0777, true);
    $current = [];
    if (file_exists(STATE_FILE)) $current = json_decode(file_get_contents(STATE_FILE), true) ?: [];
    $newState = array_merge($current, $data);
    file_put_contents(STATE_FILE, json_encode($newState));
}

function getState() {
    return file_exists(STATE_FILE) ? json_decode(file_get_contents(STATE_FILE), true) : [];
}

function mpdSend($cmd) {
    $fp = @fsockopen("localhost", 6600, $errno, $errstr, 5);
    if (!$fp) return false;
    fgets($fp); 
    fwrite($fp, "$cmd\n");
    $resp = "";
    while (!feof($fp)) {
        $line = fgets($fp); 
        $resp .= $line;
        if (strpos($line, 'OK') === 0 || strpos($line, 'ACK') === 0) break;
    }
    fclose($fp);
    return $resp;
}

function formatTrack($t) {
    if (!$t) return null;

    if (isset($t['artist']) && is_string($t['artist'])) {
        return [
            'title' => $t['title'] ?? 'Unknown Title',
            'artist' => $t['artist'],
            'artistId' => $t['artistId'] ?? null,
            'album' => $t['album'] ?? '',
            'id' => (string)($t['id'] ?? ''),
            'file' => "yandex:" . ($t['id'] ?? ''),
            'image' => $t['image'] ?? $t['cover'] ?? null,
            'isYandex' => true,
            'service' => 'yandex',
            'time' => $t['time'] ?? 0
        ];
    }

    $cover = null;
    if (!empty($t['ogImage'])) $cover = $t['ogImage'];
    elseif (!empty($t['coverUri'])) $cover = $t['coverUri'];
    elseif (!empty($t['album']['coverUri'])) $cover = $t['album']['coverUri'];
    
    if ($cover) {
        $cover = str_replace('%%', '200x200', $cover);
        if (strpos($cover, 'http') !== 0) $cover = 'https://' . $cover;
    }

    $artistName = 'Unknown Artist';
    if (isset($t['artists'][0]['name'])) {
        $artistName = $t['artists'][0]['name'];
    }

    return [
        'title' => $t['title'] ?? 'Unknown Title',
        'artist' => $artistName,
        'album' => $t['albums'][0]['title'] ?? $t['album']['title'] ?? '',
        'id' => (string)$t['id'],
        'file' => "yandex:".$t['id'],
        'image' => $cover,
        'isYandex' => true,
        'service' => 'yandex',
        'time' => isset($t['durationMs']) ? ($t['durationMs'] / 1000) : 0
    ];
}

function cacheTrackMeta($url, $track) {
    if (!is_dir(STORAGE_DIR)) @mkdir(STORAGE_DIR, 0777, true);
    $cache = [];
    if (file_exists(META_CACHE_FILE)) {
        $content = @file_get_contents(META_CACHE_FILE);
        if ($content) $cache = json_decode($content, true) ?: [];
    }
    if (count($cache) > 300) $cache = array_slice($cache, -100, 100, true);
    
    $key = md5($url);
    $formatted = formatTrack($track);
    $cache[$key] = $formatted;
    
    if (isset($formatted['id']) && $formatted['id']) {
        $cache[$formatted['id']] = $formatted;
    }

    file_put_contents(META_CACHE_FILE, json_encode($cache));
}

try {
    if ($action === 'status') {
        $token = getToken();
        echo json_encode(['authorized' => !!$token]);
        exit;
    }

    if ($action === 'save_token') {
        $input = json_decode(file_get_contents('php://input'), true);
        if (empty($input['token'])) throw new Exception("Empty token");
        $api = new YandexMusic($input['token']);
        $api->getUserId(); 
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
            $tracks = isset($res['tracks']['results']) ? array_map('formatTrack', $res['tracks']['results']) : [];
            
            $albums = [];
            if (isset($res['albums']['results'])) {
                foreach ($res['albums']['results'] as $a) {
                    $albums[] = [
                        'title' => $a['title'],
                        'artist' => $a['artists'][0]['name'] ?? 'Unknown',
                        'id' => (string)$a['id'],
                        'image' => isset($a['coverUri']) ? "https://" . str_replace('%%', '200x200', $a['coverUri']) : null,
                        'kind' => 'album',
                        'service' => 'yandex'
                    ];
                }
            }
            
            $artists = [];
            if (isset($res['artists']['results'])) {
                foreach ($res['artists']['results'] as $a) {
                    $artists[] = [
                        'title' => $a['name'],
                        'id' => (string)$a['id'],
                        'image' => isset($a['cover']['uri']) ? "https://" . str_replace('%%', '200x200', $a['cover']['uri']) : null,
                        'kind' => 'artist',
                        'service' => 'yandex'
                    ];
                }
            }
            echo json_encode(['tracks' => $tracks, 'albums' => $albums, 'artists' => $artists]);
            break;

        case 'get_landing':
            $blocks = $api->getLandingBlocks();
            $result = ['personal' => [], 'moods' => []];
            foreach($blocks as $block) {
                if ($block['type'] === 'personal-playlists') {
                    $result['personal'] = array_map(function($ent) {
                        return [
                            'title' => $ent['data']['data']['title'],
                            'cover' => 'https://' . str_replace('%%', '200x200', $ent['data']['data']['cover']['uri']),
                            'id' => $ent['data']['data']['uid'] . ':' . $ent['data']['data']['kind'],
                            'kind' => 'playlist',
                            'service' => 'yandex'
                        ];
                    }, $block['entities']);
                }
                if ($block['type'] === 'stations') {
                    $result['moods'] = array_map(function($ent) {
                        return [
                            'title' => $ent['data']['station']['name'],
                            'cover' => 'https://' . str_replace('%%', '200x200', $ent['data']['station']['icon']['imageUrl']),
                            'id' => $ent['data']['station']['id']['type'] . ':' . $ent['data']['station']['id']['tag'],
                            'kind' => 'station',
                            'service' => 'yandex',
                            'bgColor' => $ent['data']['station']['icon']['backgroundColor'] ?? '#000'
                        ];
                    }, $block['entities']);
                }
            }
            echo json_encode($result);
            break;

        case 'get_stations_dashboard':
            $raw = $api->getStationDashboard();
            $moodStations = [];
            foreach($raw as $item) {
                $tag = $item['station']['id']['tag'] ?? '';
                if ($tag === 'onyourwave') {
                    $moods = $item['station']['restrictions2']['moodEnergy']['possibleValues'] ?? [];
                    foreach ($moods as $m) {
                        if ($m['value'] === 'all') continue;
                        $moodStations[] = [
                            'title' => $m['name'],
                            'id' => 'vibe:moodEnergy:' . $m['value'], 
                            'kind' => 'station',
                            'service' => 'yandex',
                            'bgColor' => '#a4508b',
                            'cover' => isset($m['imageUrl']) ? 'https://' . str_replace('%%', '200x200', $m['imageUrl']) : null,
                            'isStation' => true
                        ];
                    }
                    $diversities = $item['station']['restrictions2']['diversity']['possibleValues'] ?? [];
                    foreach ($diversities as $d) {
                        if ($d['value'] === 'default') continue;
                        $moodStations[] = [
                            'title' => 'My Vibe: ' . $d['name'], 
                            'id' => 'vibe:diversity:' . $d['value'],
                            'kind' => 'station',
                            'service' => 'yandex',
                            'bgColor' => '#5f0a87',
                            'cover' => isset($d['imageUrl']) ? 'https://' . str_replace('%%', '200x200', $d['imageUrl']) : null,
                            'isStation' => true
                        ];
                    }
                }
            }
            echo json_encode(['stations' => $moodStations]);
            break;

        case 'get_artist_details':
            $id = $_GET['id'] ?? '';
            $artist = $api->getArtist($id);
            $tracks = $api->getArtistTracks($id);
            $rawAlbums = $api->getArtistDirectAlbums($id);
            $albums = [];
            foreach ($rawAlbums as $a) {
                $albums[] = [
                    'title' => $a['title'],
                    'id' => (string)$a['id'],
                    'year' => $a['year'] ?? '',
                    'image' => isset($a['coverUri']) ? "https://" . str_replace('%%', '200x200', $a['coverUri']) : null,
                    'artist' => $artist['name'] ?? '',
                    'kind' => 'album',
                    'service' => 'yandex'
                ];
            }
            $info = [
                'name' => $artist['name'],
                'cover' => isset($artist['cover']['uri']) ? "https://" . str_replace('%%', '400x400', $artist['cover']['uri']) : null,
                'description' => $artist['description']['text'] ?? '',
                'tracks' => array_map('formatTrack', $tracks),
                'albums' => $albums
            ];
            echo json_encode($info);
            break;

        case 'get_album_details':
            $id = $_GET['id'] ?? '';
            $raw = $api->getAlbum($id);
            $tracks = [];
            if(isset($raw['volumes'])){
                foreach ($raw['volumes'] as $vol) $tracks = array_merge($tracks, $vol);
            }
            $info = [
                'title' => $raw['title'],
                'artist' => $raw['artists'][0]['name'] ?? 'Unknown',
                'cover' => isset($raw['coverUri']) ? "https://" . str_replace('%%', '400x400', $raw['coverUri']) : null,
                'year' => $raw['year'] ?? '',
                'tracks' => array_map('formatTrack', $tracks)
            ];
            echo json_encode($info);
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
                    $cover = "https://" . str_replace('%%', '200x200', $pl['cover']['uri']);
                } elseif (isset($pl['cover']['itemsUri'][0])) {
                    $cover = "https://" . str_replace('%%', '200x200', $pl['cover']['itemsUri'][0]);
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
            
            if ($kind === 'favorites') {
                $rawTracks = $api->getFavorites($offset, 50);
            } else {
                $rawTracks = $api->getPlaylistTracks($uid, $kind, $offset, 50);
            }
            echo json_encode(['tracks' => array_map('formatTrack', $rawTracks)]);
            break;
            
        case 'get_favorites_ids':
            echo json_encode(['ids' => $api->getFavoritesIds()]);
            break;

        case 'play_station':
            $stationId = $_REQUEST['station'] ?? 'user:onyourwave';
            $extraParams = [];
            $contextName = "My Vibe";

            if (strpos($stationId, 'vibe:') === 0) {
                $parts = explode(':', $stationId);
                if (count($parts) === 3) {
                    $type = $parts[1];
                    $val = $parts[2];
                    $extraParams[$type] = $val;
                    $stationId = 'user:onyourwave'; 
                    $contextName = "Vibe: " . ucfirst($val);
                }
            } elseif (strpos($stationId, 'track:') === 0) {
                $contextName = "Track Radio";
            }

            mpdSend("clear");
            
            $queueData = $api->getStationTracksV2($stationId, [], $extraParams);
            
            $initialBuffer = [];
            $count = 0;
            $history = [];

            if ($queueData) {
                foreach ($queueData as $track) { 
                    if ($count < 3) {
                        $url = $api->getDirectLink($track['id']);
                        if ($url) {
                            cacheTrackMeta($url, $track);
                            mpdSend("add \"$url\"");
                            $count++;
                            $history[] = (string)$track['id'];
                        }
                    } else {
                        $initialBuffer[] = $track; 
                        cacheTrackMeta("yandex:" . $track['id'], $track); 
                    }
                    if (count($initialBuffer) >= 20) break; 
                }
            }
            mpdSend("play");
            
            saveState([
                'active' => true,
                'mode' => 'station',
                'station_id' => $stationId,
                'station_params' => $extraParams, 
                'context_name' => $contextName,
                'queue_buffer' => $initialBuffer,
                'played_history' => $history
            ]);
            echo json_encode(['status' => 'started', 'context' => $contextName]);
            break;


        case 'play_playlist':
            $input = json_decode(file_get_contents('php://input'), true);
            $tracks = $input['tracks'] ?? [];
            if (empty($tracks)) throw new Exception("No tracks provided");
            
            mpdSend("clear");
            
            $count = 0;
            $initialBuffer = [];

            foreach ($tracks as $t) {
                if ($count < 3) {
                    $url = $api->getDirectLink($t['id']);
                    if ($url) {
                        cacheTrackMeta($url, $t);
                        mpdSend("add \"$url\"");
                        $count++;
                    }
                } else {
                    $initialBuffer[] = $t;
                }
            }
            mpdSend("play");

            saveState([
                'active' => true,
                'mode' => 'static',
                'context_name' => 'Yandex Playlist',
                'queue_buffer' => $initialBuffer,
                'played_history' => []
            ]);
            
            echo json_encode(['status' => 'ok', 'buffered' => count($initialBuffer)]);
            break;

        case 'add_tracks':
            $input = json_decode(file_get_contents('php://input'), true);
            $tracks = $input['tracks'] ?? [];
            if (empty($tracks)) throw new Exception("No tracks provided");
            
            $currentState = getState();
            // Сбрасываем режим на static, чтобы демон не подмешивал вайб
            // Но флаг active оставляем, чтобы он догрузил эти треки
            $buffer = $currentState['queue_buffer'] ?? [];
            
            // Если добавили много треков в конец очереди, просто суем их в буфер
            // Если очередь была пуста, демон сам начнет их играть
            $added = 0;
            // Если MPD пуст, добавляем первый сразу, чтобы не ждать демона
            if (empty($buffer)) {
                 $first = array_shift($tracks);
                 if ($first) {
                     $url = $api->getDirectLink($first['id']);
                     if ($url) {
                         cacheTrackMeta($url, $first);
                         mpdSend("add \"$url\"");
                         $added++;
                     }
                 }
            }
            
            $newBuffer = array_merge($buffer, $tracks);

            saveState([
                'active' => true,
                'mode' => 'static', // Блокируем подкачку радио
                'queue_buffer' => $newBuffer
            ]);

            echo json_encode(['status' => 'ok', 'added' => $added, 'buffered' => count($tracks)]);
            break;

        case 'play_track':
            $id = $_REQUEST['id'] ?? '';
            $append = ($_REQUEST['append'] ?? '0') === '1';
            $trackInfo = $api->getTrackInfo($id);
            $url = $api->getDirectLink($id);
            if ($url && $trackInfo) {
                if (!$append) mpdSend("clear");
                cacheTrackMeta($url, $trackInfo);
                mpdSend("add \"$url\"");
                if (!$append) {
                    mpdSend("play");
                    saveState(['active' => false]);
                }
                echo json_encode(['status' => 'ok']);
            }
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
            $cache = file_exists(META_CACHE_FILE) ? json_decode(file_get_contents(META_CACHE_FILE), true) : [];
            $res = $cache[md5($url)] ?? null;
            echo json_encode($res);
            break;

        case 'get_state':
            $state = getState();
            echo json_encode([
                'active' => $state['active'] ?? false,
                'context_name' => $state['context_name'] ?? 'Yandex Music'
            ]);
            break;

        default:
            echo json_encode(['error' => 'Unknown action']);
    }
} catch (Exception $e) {
    debug("Error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
