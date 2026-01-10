<?php
ini_set('display_errors', 0);
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
define('LOG_FILE', '/tmp/wave_debug.log');

$action = $_REQUEST['action'] ?? '';

function debug($msg) {
    @file_put_contents(LOG_FILE, "[" . date('H:i:s') . "] API: $msg\n", FILE_APPEND);
}

function getToken() {
    return file_exists(TOKEN_FILE) ? trim(file_get_contents(TOKEN_FILE)) : null;
}

function saveState($data) {
    if (!is_dir(STORAGE_DIR)) @mkdir(STORAGE_DIR, 0777, true);
    file_put_contents(STATE_FILE, json_encode($data));
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
    $cover = null;
    if (!empty($t['ogImage'])) {
        $cover = $t['ogImage'];
    } elseif (!empty($t['coverUri'])) {
        $cover = $t['coverUri'];
    } elseif (!empty($t['album']['coverUri'])) {
        $cover = $t['album']['coverUri'];
    } elseif (!empty($t['albums'][0]['coverUri'])) {
        $cover = $t['albums'][0]['coverUri'];
    }

    if ($cover) {
        $cover = str_replace('%%', '200x200', $cover);
        if (strpos($cover, 'http') !== 0) {
            $cover = 'https://' . $cover;
        }
    }

    $artistName = isset($t['artists']) ? implode(', ', array_column($t['artists'], 'name')) : 'Unknown Artist';
    $artistId = isset($t['artists'][0]['id']) ? $t['artists'][0]['id'] : null;

    $albumTitle = $t['albums'][0]['title'] ?? $t['album']['title'] ?? 'Single';

    return [
        'title' => $t['title'] ?? 'Unknown Title',
        'artist' => $artistName,
        'artistId' => $artistId,
        'album' => $albumTitle,
        'id' => (string)$t['id'],
        'file' => "yandex:".$t['id'],
        'image' => $cover,
        'isYandex' => true,
        'service' => 'yandex',
        'time' => ($t['durationMs'] ?? 0) / 1000
    ];
}

function cacheTrackMeta($url, $track) {
    if (!is_dir(STORAGE_DIR)) @mkdir(STORAGE_DIR, 0777, true);
    $cache = [];
    if (file_exists(META_CACHE_FILE)) {
        $content = @file_get_contents(META_CACHE_FILE);
        if ($content) $cache = json_decode($content, true) ?: [];
    }
    if (count($cache) > 200) {
        $cache = array_slice($cache, -100, 100, true);
    }
    $key = md5($url);
    $cache[$key] = formatTrack($track);
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
        // --- DATA FETCHING ---
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

        case 'get_artist_details':
            $id = $_GET['id'] ?? '';
            $artist = $api->getArtist($id);
            $tracks = $api->getArtistTracks($id);
            
            $info = [
                'name' => $artist['name'],
                'cover' => isset($artist['cover']['uri']) ? "https://" . str_replace('%%', '400x400', $artist['cover']['uri']) : null,
                'description' => $artist['description']['text'] ?? '',
                'tracks' => array_map('formatTrack', $tracks)
            ];
            echo json_encode($info);
            break;

        case 'get_album_details':
            $id = $_GET['id'] ?? '';
            $raw = $api->getAlbum($id);
            
            $tracks = [];
            foreach ($raw['volumes'] as $vol) $tracks = array_merge($tracks, $vol);
            
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
                'isStation' => false,
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
            $rawTracks = ($kind === 'favorites') ? $api->getFavorites() : $api->getPlaylistTracks($uid, $kind);
            echo json_encode(['tracks' => array_map('formatTrack', $rawTracks)]);
            break;
            
        case 'get_favorites_ids':
            echo json_encode(['ids' => $api->getFavoritesIds()]);
            break;

        case 'search':
            $q = $_GET['query'] ?? '';
            $raw = $api->search($q);
            $res = $raw['result'] ?? [];
            
            $tracks = isset($res['tracks']['results']) ? array_map('formatTrack', $res['tracks']['results']) : [];
            
            $albums = [];
            if (isset($res['albums']['results'])) {
                foreach ($res['albums']['results'] as $a) {
                    $albums[] = [
                        'title' => $a['title'],
                        'artist' => $a['artists'][0]['name'] ?? 'Unknown',
                        'id' => $a['id'],
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
                        'id' => $a['id'],
                        'image' => isset($a['cover']['uri']) ? "https://" . str_replace('%%', '200x200', $a['cover']['uri']) : null,
                        'kind' => 'artist',
                        'service' => 'yandex'
                    ];
                }
            }
            echo json_encode(['tracks' => $tracks, 'albums' => $albums, 'artists' => $artists]);
            break;

        case 'play_station':
            $stationId = $_REQUEST['station'] ?? 'user:onetwo';
            mpdSend("clear");
            $queueData = $api->getStationTracks($stationId, true);
            $initialBuffer = [];
            $count = 0;
            if ($queueData) {
                foreach ($queueData as $item) {
                    $track = $item['track'];
                    if ($count < 2) {
                        $url = $api->getDirectLink($track['id']);
                        if ($url) {
                            mpdSend("add \"$url\"");
                            cacheTrackMeta($url, $track);
                            $count++;
                        }
                    } else {
                        $initialBuffer[] = $track;
                    }
                    if (count($initialBuffer) >= 10) break;
                }
            }
            mpdSend("play");
            saveState([
                'active' => true,
                'mode' => 'station',
                'station_id' => $stationId,
                'queue_buffer' => $initialBuffer,
                'played_history' => []
            ]);
            echo json_encode(['status' => 'started', 'added' => $count]);
            break;

        case 'play_playlist':
            $input = json_decode(file_get_contents('php://input'), true);
            $tracks = $input['tracks'] ?? [];
            if (empty($tracks)) throw new Exception("No tracks provided");
            mpdSend("clear");
            $initialCount = 0;
            $toAddMpd = array_splice($tracks, 0, 3);
            foreach ($toAddMpd as $t) {
                $url = $api->getDirectLink($t['id']);
                if ($url) {
                    mpdSend("add \"$url\"");
                    cacheTrackMeta($url, $t);
                    $initialCount++;
                }
            }
            mpdSend("play");
            saveState([
                'active' => true,
                'mode' => 'playlist_extend',
                'station_id' => 'custom_list',
                'queue_buffer' => $tracks
            ]);
            echo json_encode(['status' => 'ok', 'added_now' => $initialCount]);
            break;

        case 'play_track':
            $id = $_REQUEST['id'] ?? '';
            $append = ($_REQUEST['append'] ?? '0') === '1';
            $trackInfo = $api->getTrackInfo($id);
            $url = $api->getDirectLink($id);
            if ($url && $trackInfo) {
                if (!$append) mpdSend("clear");
                mpdSend("add \"$url\"");
                cacheTrackMeta($url, $trackInfo);
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
            mpdSend("next");
            echo json_encode(['status' => 'disliked']);
            break;
            
        case 'get_meta':
            $url = $_GET['url'] ?? '';
            $cache = file_exists(META_CACHE_FILE) ? json_decode(file_get_contents(META_CACHE_FILE), true) : [];
            echo json_encode($cache[md5($url)] ?? null);
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
