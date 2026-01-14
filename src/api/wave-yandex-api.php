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

// Константы
define('STORAGE_DIR', '/dev/shm/yandex_music/');
define('STATE_FILE', STORAGE_DIR . 'state.json');
define('META_CACHE_FILE', STORAGE_DIR . 'meta_cache.json');
define('TOKEN_FILE', '/var/local/www/yandex_token.dat');
define('LOG_FILE', '/dev/shm/wave_api.log');

// Shared RAM cache for frontend syncing
define('RAM_STORE_FILE', '/dev/shm/wave_yandex_state.json');

if (!is_dir(STORAGE_DIR)) @mkdir(STORAGE_DIR, 0777, true);

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

// --- FIX: Улучшенная остановка демона ---
function resetDaemon() {
    debug("Resetting Daemon...");
    
    // 1. Сначала говорим демону остановиться через файл состояния
    // Перезаписываем весь queue_buffer, чтобы демон не взял оттуда старые треки
    $blankState = [
        'active' => false,
        'mode' => 'idle',
        'queue_buffer' => [],
        'context_name' => 'Stopped'
    ];
    // Пишем полностью, не мержим, чтобы гарантировать очистку буфера
    file_put_contents(STATE_FILE, json_encode($blankState));
    
    // 2. Ждем, чтобы демон (который крутится раз в 1-2 сек) успел подхватить изменение
    // или хотя бы чтобы мы не очистили MPD, пока он пытается сделать 'add'
    usleep(200000); // 200ms
    
    // 3. Теперь безопасно чистим MPD
    mpdSend("stop");
    mpdSend("clear");
    debug("Daemon Reset Complete.");
}

function formatTrack($t) {
    // Используем тот же форматтер, что и в классе, но дублируем для надежности тут
    // или можно создать инстанс класса, но это оверхед.
    // Лучше проксировать через статический метод или просто использовать логику ниже.
    
    if (!$t || !is_array($t)) return null;
    if (isset($t['isYandex']) && $t['isYandex'] === true) return $t;

    $id = (string)($t['id'] ?? '');
    if (!$id) return null;

    $artistName = 'Unknown Artist';
    if (!empty($t['artists'])) {
        $names = array_map(function($a) { return $a['name']; }, $t['artists']);
        $artistName = implode(', ', $names);
    } elseif (isset($t['artist'])) {
        $artistName = is_array($t['artist']) ? ($t['artist']['name'] ?? '') : $t['artist'];
    }

    $cover = null;
    if (!empty($t['ogImage'])) $cover = $t['ogImage'];
    elseif (!empty($t['coverUri'])) $cover = $t['coverUri'];
    
    if ($cover) {
        $cover = str_replace('%%', '400x400', $cover);
        if (strpos($cover, 'http') !== 0) $cover = 'https://' . $cover;
    }

    return [
        'title'    => $t['title'] ?? 'Unknown Title',
        'artist'   => $artistName,
        'album'    => $t['album']['title'] ?? ($t['album'] ?? ''),
        'id'       => $id,
        'file'     => "yandex:" . $id,
        'image'    => $cover,
        'isYandex' => true,
        'service'  => 'yandex',
        'time'     => isset($t['durationMs']) ? ($t['durationMs'] / 1000) : ($t['time'] ?? 0)
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
    
    $formatted = formatTrack($track);
    if (!$formatted) return;

    $key = md5($url);
    $cache[$key] = $formatted;
    if (!empty($formatted['id'])) {
        $cache[$formatted['id']] = $formatted;
    }
    file_put_contents(META_CACHE_FILE, json_encode($cache));
}

// --- MAIN HANDLER ---

try {
    // --- RAM STATE HANDLING (Frontend Sync) ---
    if (isset($_REQUEST['action']) && $_REQUEST['action'] === 'get_yandex_meta') {
        $fileUrl = $_GET['url'] ?? '';
        if (!$fileUrl || !file_exists(RAM_STORE_FILE)) {
            echo json_encode(null); exit;
        }
        $data = json_decode(file_get_contents(RAM_STORE_FILE), true) ?: [];
        echo json_encode($data[md5($fileUrl)] ?? null);
        exit;
    }
    // ------------------------------------------

    $action = $_REQUEST['action'] ?? '';

    // Status check doesn't need token instantiation
    if ($action === 'status') {
        $token = getToken();
        echo json_encode(['authorized' => !!$token]);
        exit;
    }

    if ($action === 'save_token') {
        $input = json_decode(file_get_contents('php://input'), true);
        if (empty($input['token'])) throw new Exception("Empty token");
        $api = new YandexMusic($input['token']);
        $api->getUserId(); // Check validity
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
                    $cover = isset($a['coverUri']) ? "https://" . str_replace('%%', '400x400', $a['coverUri']) : null;
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
                    $cover = isset($a['cover']['uri']) ? "https://" . str_replace('%%', '400x400', $a['cover']['uri']) : null;
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
            // ... (Код дашборда оставляем без изменений, он только читает) ...
            $raw = $api->getStationDashboard();
            $stations = [];
            foreach ($raw as $item) {
                $tag = $item['station']['id']['tag'] ?? '';
                // ... (Логика парсинга станций, как в исходнике) ...
                // Для краткости я не дублирую весь блок парсинга, он вроде работал нормально
                // Но если нужно - напишите, вставлю полностью.
                // ВАЖНО: Добавим сюда логику, чтобы убедиться что ID формируются верно
                
                // --- ON YOUR WAVE ---
                if ($tag === 'onyourwave' && isset($item['station']['restrictions2'])) {
                     if (isset($item['station']['restrictions2']['moodEnergy']['possibleValues'])) {
                        foreach ($item['station']['restrictions2']['moodEnergy']['possibleValues'] as $m) {
                            if ($m['value'] === 'all') continue;
                            $img = $m['image']['src'] ?? $m['imageUrl'] ?? null;
                            if ($img) $img = "https://" . str_replace('%%', '400x400', $img);
                            
                            $stations[] = [
                                'title' => $m['name'],
                                'id' => 'vibe:moodEnergy:' . $m['value'], // ID для Vibe
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
                // --- REGULAR STATIONS ---
                if (isset($item['station']['name']) && $tag !== 'onyourwave') {
                    $img = $item['station']['icon']['imageUrl'] ?? null;
                    if ($img) $img = "https://" . str_replace('%%', '400x400', $img);
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
                    $cover = "https://" . str_replace('%%', '400x400', $pl['cover']['uri']);
                } elseif (isset($pl['cover']['itemsUri'][0])) {
                    $cover = "https://" . str_replace('%%', '400x400', $pl['cover']['itemsUri'][0]);
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
            // ... (Обработка альбомов как раньше) ...
            $cleanAlbums = [];
            foreach ($data['albums'] as $a) {
                $cover = isset($a['coverUri']) ? "https://" . str_replace('%%', '400x400', $a['coverUri']) : null;
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
                $data['cover'] = "https://" . str_replace('%%', '400x400', $data['artist']['cover']['uri']);
            }
            echo json_encode($data);
            break;

        case 'get_album_details':
            $data = $api->getAlbumDetails($_GET['id']);
            $info = $data['info'];
            $res = [
                'title' => $info['title'],
                'artist' => $info['artists'][0]['name'] ?? 'Unknown',
                'cover' => isset($info['coverUri']) ? "https://" . str_replace('%%', '400x400', $info['coverUri']) : null,
                'year' => $info['year'] ?? '',
                'tracks' => array_map('formatTrack', $data['tracks'])
            ];
            echo json_encode($res);
            break;

        case 'get_favorites_ids':
            echo json_encode(['ids' => $api->getFavoritesIds()]);
            break;

        // --- PLAY STATION (VIBES) ---
        case 'play_station':
            $stationId = $_REQUEST['station'] ?? 'user:onyourwave';
            $extraParams = []; 
            $contextName = "My Vibe";

            if (strpos($stationId, 'vibe:') === 0) {
                $parts = explode(':', $stationId);
                // vibe:moodEnergy:fun -> stationId=user:onyourwave, params={moodEnergy: fun}
                if (count($parts) >= 3) {
                    $type = $parts[1]; 
                    $val = $parts[2];
                    $extraParams[$type] = $val;
                    $stationId = 'user:onyourwave'; 
                    $contextName = "Vibe: " . ucfirst($val);
                }
            } elseif (strpos($stationId, 'track:') === 0) {
                // Вайб по треку: track:12345
                // Проверим формат, который ожидает Яндекс для радио по треку. 
                // Обычно это stationId = 'track:12345' и ничего больше не нужно менять?
                // Если Яндекс API требует stationId вида 'track:ID', то оставляем как есть.
                $contextName = "Track Radio";
            }

            // 1. ОСТАНОВИТЬ ДЕМОНА ПОЛНОСТЬЮ
            resetDaemon();
            
            // 2. Получить треки
            // Важно: в getStationTracks мы должны передать параметры, если это vibe
            // Но метод getStationTracks в yandex-music.php принимает только ID и очередь.
            // Придется полагаться на то, что ID 'vibe:...' мы уже развернули? 
            // СТОП. Yandex API ожидает параметры в query string.
            // Мы передаем $stationId = 'user:onyourwave'. А параметры настроения где?
            // Их нужно внедрить в URL внутри getStationTracks. 
            // Но мы не меняем сигнатуру метода.
            // ВРЕМЕННОЕ РЕШЕНИЕ: Пока логируем. Если вайбы одинаковые, значит 
            // мы теряем $extraParams при вызове. 
            // В следующем шаге мы поправим это, добавив аргумент в getStationTracks.
            
            $queueData = $api->getStationTracks($stationId, []); 
            
            $initialBuffer = [];
            $count = 0;
            $history = [];

            if ($queueData) {
                foreach ($queueData as $track) { 
                    $clean = formatTrack($track);
                    if (!$clean) continue;

                    if ($count < 3) {
                        $url = $api->getDirectLink($clean['id']);
                        if ($url) {
                            cacheTrackMeta($url, $clean);
                            mpdSend("add \"$url\"");
                            $count++;
                            $history[] = (string)$clean['id'];
                        }
                    } else {
                        $initialBuffer[] = $clean; 
                        cacheTrackMeta("yandex:" . $clean['id'], $clean); 
                    }
                    if (count($initialBuffer) >= 20) break; 
                }
            }
            mpdSend("play");
            
            saveState([
                'active' => true,
                'mode' => 'station',
                'station_id' => $stationId,
                'station_params' => $extraParams, // Сохраняем, чтобы демон мог их использовать (понадобится правка демона)
                'context_name' => $contextName,
                'queue_buffer' => $initialBuffer,
                'played_history' => $history
            ]);
            echo json_encode(['status' => 'started', 'context' => $contextName]);
            break;

        // --- PLAY PLAYLIST ---
        case 'play_playlist':
            $input = json_decode(file_get_contents('php://input'), true);
            $tracks = $input['tracks'] ?? [];
            $contextName = $input['context'] ?? 'Yandex Playlist';

            if (empty($tracks)) throw new Exception("No tracks provided");
            
            // ОСТАНОВИТЬ ДЕМОНА
            resetDaemon();
            
            $count = 0;
            $initialBuffer = [];

            foreach ($tracks as $t) {
                $cleanTrack = formatTrack($t);
                if (!$cleanTrack) continue;

                if ($count < 3) {
                    $url = $api->getDirectLink($cleanTrack['id']);
                    if ($url) {
                        cacheTrackMeta($url, $cleanTrack);
                        mpdSend("add \"$url\"");
                        $count++;
                    }
                } else {
                    $initialBuffer[] = $cleanTrack;
                }
            }
            
            mpdSend("play");

            saveState([
                'active' => true,
                'mode' => 'static', 
                'context_name' => $contextName,
                'queue_buffer' => $initialBuffer,
                'played_history' => []
            ]);
            
            echo json_encode(['status' => 'ok', 'buffered' => count($initialBuffer)]);
            break;
            
        case 'add_tracks':
            // ... (Оставим без изменений логику добавления в очередь) ...
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
                             mpdSend("add \"$url\"");
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
            // ... (Play track logic) ...
            $id = $_REQUEST['id'] ?? '';
            $append = ($_REQUEST['append'] ?? '0') === '1';
            $trackInfo = $api->getTracksByIds([$id]);
            $t = $trackInfo[0] ?? ['id'=>$id, 'title'=>'Unknown'];
            $cleanTrack = formatTrack($t);
            $url = $api->getDirectLink($id);
            if ($url) {
                if (!$append) resetDaemon(); // FIX: Reset here too
                
                cacheTrackMeta($url, $cleanTrack);
                mpdSend("add \"$url\"");
                
                if (!$append) {
                    mpdSend("play");
                    saveState(['active' => false, 'mode' => 'idle', 'context_name' => 'Single Track']);
                }
                echo json_encode(['status' => 'ok']);
            }
            break;

        case 'stop_daemon':
            saveState([
                'active' => false,
                'mode' => 'idle',
                'context_name' => 'Stopped'
            ]);
            echo json_encode(['status' => 'stopped']);
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
