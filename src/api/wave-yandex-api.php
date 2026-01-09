<?php
ini_set('display_errors', 0);
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header('Access-Control-Allow-Headers: *');

define('INC', '/var/www/inc');
require_once INC . '/yandex-music.php';

define('STATE_FILE', '/dev/shm/yandex_state.json');
define('META_CACHE_FILE', '/dev/shm/yandex_meta_cache.json');
define('TOKEN_FILE', '/var/local/www/yandex_token.dat');

$action = $_REQUEST['action'] ?? '';

function getToken() {
    return file_exists(TOKEN_FILE) ? trim(file_get_contents(TOKEN_FILE)) : null;
}

function saveState($data) {
    file_put_contents(STATE_FILE, json_encode($data));
}

function mpdExec($cmd) {
    $cmd = str_replace('"', '\"', $cmd);
    exec("mpc " . $cmd);
}

// Хелпер для сохранения меты трека (чтобы фронт видел название)
function cacheTrackMeta($url, $track) {
    $cache = file_exists(META_CACHE_FILE) ? json_decode(file_get_contents(META_CACHE_FILE), true) : [];
    if (count($cache) > 100) $cache = array_slice($cache, -100, 100, true);
    
    $key = md5($url);
    $cache[$key] = [
        'id' => $track['id'],
        'title' => $track['title'],
        'artist' => implode(', ', array_column($track['artists'], 'name')),
        'album' => $track['albums'][0]['title'] ?? '',
        'image' => isset($track['coverUri']) ? "https://" . str_replace('%%', '400x400', $track['coverUri']) : null,
        'isYandex' => true
    ];
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
        case 'get_playlists':
            $playlists = $api->getUserPlaylists();
            $result = [];
            foreach ($playlists as $pl) {
                $cover = null;
                if (isset($pl['cover']['uri'])) {
                    $cover = "https://" . str_replace('%%', '200x200', $pl['cover']['uri']);
                }
                
                $result[] = [
                    'title' => $pl['title'],
                    'kind' => $pl['kind'],
                    'uid' => $pl['owner']['uid'] ?? $pl['uid'] ?? null,
                    'cover' => $cover,
                    'trackCount' => $pl['trackCount'] ?? 0
                ];
            }
            echo json_encode($result);
            break;

        case 'get_playlist_tracks':
            $uid = $_GET['uid'];
            $kind = $_GET['kind'];
            $rawTracks = $api->getPlaylistTracks($uid, $kind);
            
            $tracks = [];
            foreach ($rawTracks as $t) {
                $tracks[] = [
                    'title' => $t['title'],
                    'artist' => implode(', ', array_column($t['artists'], 'name')),
                    'album' => $t['albums'][0]['title'] ?? '',
                    'id' => $t['id'],
                    'image' => isset($t['coverUri']) ? "https://" . str_replace('%%', '200x200', $t['coverUri']) : null,
                    'isYandex' => true
                ];
            }
            echo json_encode(['tracks' => $tracks]);
            break;

        case 'play_station':
            $stationId = $_REQUEST['station'] ?? 'user:onetwo';
            
            mpdExec("clear");
            
            $queueData = $api->getStationTracks($stationId);
            $initialBuffer = [];
            
            $count = 0;
            if ($queueData) {
                foreach ($queueData as $item) {
                    if ($count >= 3) break;
                    $track = $item['track'];
                    
                    $url = $api->getDirectLink($track['id']);
                    if ($url) {
                        mpdExec("add \"$url\"");
                        cacheTrackMeta($url, $track);
                        $count++;
                    }
                    // Остальное оставим демону
                    if ($count >= 3) {
                       $initialBuffer[] = $item['track']; // Демон подхватит остатки
                    }
                }
            }

            mpdExec("play");

            saveState([
                'active' => true,
                'mode' => 'station',
                'station_id' => $stationId,
                'queue_buffer' => []
            ]);
            
            echo json_encode(['status' => 'started', 'added' => $count]);
            break;

        case 'play_track':
            $id = $_REQUEST['id'];
            $trackInfo = $api->search($id, 'track')['result']['tracks']['results'][0] ?? null; // Хайп, ищем инфу чтобы закешировать
            
            $url = $api->getDirectLink($id);
            
            if ($url) {
                mpdExec("clear");
                mpdExec("add \"$url\"");
                mpdExec("play");
                
                if ($trackInfo) cacheTrackMeta($url, $trackInfo);
                
                saveState(['active' => false]);
                echo json_encode(['status' => 'playing']);
            } else {
                throw new Exception("Link generation failed");
            }
            break;

        case 'search':
            $q = $_GET['query'];
            $raw = $api->search($q);
            $res = $raw['result'] ?? [];
            
            $tracks = [];
            if (isset($res['tracks']['results'])) {
                foreach ($res['tracks']['results'] as $t) {
                    $tracks[] = [
                        'title' => $t['title'],
                        'artist' => implode(', ', array_column($t['artists'], 'name')),
                        'album' => $t['albums'][0]['title'] ?? 'Single',
                        'id' => $t['id'],
                        'image' => isset($t['coverUri']) ? "https://" . str_replace('%%', '200x200', $t['coverUri']) : null,
                        'isYandex' => true
                    ];
                }
            }
            
            $albums = [];
            if (isset($res['albums']['results'])) {
                foreach ($res['albums']['results'] as $a) {
                    $albums[] = [
                        'title' => $a['title'],
                        'artist' => $a['artists'][0]['name'] ?? 'Unknown',
                        'id' => $a['id'],
                        'image' => isset($a['coverUri']) ? "https://" . str_replace('%%', '200x200', $a['coverUri']) : null,
                        'kind' => 'album'
                    ];
                }
            }
            
            echo json_encode([
                'tracks' => $tracks, 
                'albums' => $albums, 
                'artists' => []
            ]);
            break;
            
        case 'get_meta':
            $url = $_GET['url'];
            $urlHash = md5($url);
            $cache = file_exists(META_CACHE_FILE) ? json_decode(file_get_contents(META_CACHE_FILE), true) : [];
            echo json_encode($cache[$urlHash] ?? null);
            break;

        case 'like':
            $api->toggleLike($_REQUEST['track_id'], true);
            echo json_encode(['status' => 'liked']);
            break;

        case 'dislike':
            $api->toggleLike($_REQUEST['track_id'], false);
            mpdExec("next");
            echo json_encode(['status' => 'disliked']);
            break;

        default:
            echo json_encode(['error' => 'Unknown action']);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
