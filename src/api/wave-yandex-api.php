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

if (!is_dir(STORAGE_DIR)) @mkdir(STORAGE_DIR, 0777, true);

// --- HELPER FUNCTIONS ---

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
    fgets($fp); // skip welcome
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

// --- ROBUST TRACK FORMATTER (Исправленная логика для обложек и имен) ---
function formatTrack($t) {
    if (!$t || !is_array($t)) return null;

    // 1. Обложка (Cover)
    $cover = null;
    if (!empty($t['ogImage'])) $cover = $t['ogImage'];
    elseif (!empty($t['coverUri'])) $cover = $t['coverUri'];
    elseif (!empty($t['image'])) $cover = $t['image']; // иногда API отдает image
    elseif (!empty($t['album']['coverUri'])) $cover = $t['album']['coverUri'];
    
    if ($cover) {
        // Убеждаемся, что размер подставлен и протокол есть
        $cover = str_replace('%%', '400x400', $cover);
        if (strpos($cover, 'http') !== 0) $cover = 'https://' . $cover;
    }

    // 2. Имя Артиста
    $artistName = 'Unknown Artist';
    if (!empty($t['artists'])) {
        // Собираем всех артистов через запятую
        $names = array_map(function($a) { return $a['name']; }, $t['artists']);
        $artistName = implode(', ', $names);
    } elseif (isset($t['artist']) && is_string($t['artist'])) {
        $artistName = $t['artist'];
    } elseif (isset($t['artist']['name'])) {
        $artistName = $t['artist']['name'];
    }

    // 3. Название Альбома
    $albumTitle = '';
    if (!empty($t['albums'][0]['title'])) $albumTitle = $t['albums'][0]['title'];
    elseif (!empty($t['album']['title'])) $albumTitle = $t['album']['title'];
    elseif (isset($t['album']) && is_string($t['album'])) $albumTitle = $t['album'];

    // 4. ID и Файл
    $id = (string)($t['id'] ?? '');
    
    // Формируем чистый объект
    return [
        'title'    => $t['title'] ?? 'Unknown Title',
        'artist'   => $artistName,
        'album'    => $albumTitle,
        'id'       => $id,
        'file'     => "yandex:" . $id, // Специальный формат для распознавания фронтендом
        'image'    => $cover,
        'isYandex' => true,
        'service'  => 'yandex',
        'time'     => isset($t['durationMs']) ? ($t['durationMs'] / 1000) : ($t['time'] ?? 0)
    ];
}

// Кэшируем метаданные, чтобы демон и MPD могли их подхватить
function cacheTrackMeta($url, $track) {
    if (!is_dir(STORAGE_DIR)) @mkdir(STORAGE_DIR, 0777, true);
    
    $cache = [];
    if (file_exists(META_CACHE_FILE)) {
        $content = @file_get_contents(META_CACHE_FILE);
        if ($content) $cache = json_decode($content, true) ?: [];
    }
    
    // Ограничиваем размер кэша
    if (count($cache) > 300) $cache = array_slice($cache, -100, 100, true);
    
    $formatted = formatTrack($track);
    if (!$formatted) return;

    // Ключ по MD5 от URL (для надежности)
    $key = md5($url);
    $cache[$key] = $formatted;
    
    // Ключ по ID (для быстрого поиска)
    if (!empty($formatted['id'])) {
        $cache[$formatted['id']] = $formatted;
    }

    file_put_contents(META_CACHE_FILE, json_encode($cache));
}

// --- MAIN LOGIC ---

try {
    $action = $_REQUEST['action'] ?? '';

    // 1. Статус авторизации
    if ($action === 'status') {
        $token = getToken();
        echo json_encode(['authorized' => !!$token]);
        exit;
    }

    // 2. Сохранение токена
    if ($action === 'save_token') {
        $input = json_decode(file_get_contents('php://input'), true);
        if (empty($input['token'])) throw new Exception("Empty token");
        $api = new YandexMusic($input['token']);
        $api->getUserId(); // Проверка валидности
        if (!is_dir(dirname(TOKEN_FILE))) mkdir(dirname(TOKEN_FILE), 0755, true);
        file_put_contents(TOKEN_FILE, $input['token']);
        chmod(TOKEN_FILE, 0600);
        echo json_encode(['status' => 'ok']);
        exit;
    }

    // Инициализация API
    $token = getToken();
    if (!$token) throw new Exception("Token not found");
    $api = new YandexMusic($token);

    switch ($action) {
        
        // --- ПОИСК ---
        case 'search':
            $q = $_GET['query'] ?? '';
            if (empty($q)) {
                echo json_encode(['tracks' => [], 'albums' => [], 'artists' => []]);
                break;
            }
            $raw = $api->search($q);
            $res = $raw['result'] ?? [];
            
            // Используем formatTrack для треков
            $tracks = [];
            if (isset($res['tracks']['results'])) {
                foreach ($res['tracks']['results'] as $t) {
                    $tracks[] = formatTrack($t);
                }
            }
            
            // Форматируем альбомы
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
            
            // Форматируем артистов
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

        // --- ЛЭНДИНГ И ПЛЕЙЛИСТЫ ---
        case 'get_landing':
            echo json_encode($api->getLandingBlocks());
            break;

        case 'get_stations_dashboard':
            echo json_encode(['stations' => $api->getStationDashboard()]);
            break;

        case 'get_playlists':
            $playlists = $api->getUserPlaylists();
            // Форматируем список плейлистов для фронта
            $result = [];
            // Добавляем Избранное как плейлист
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
            // Форматируем треки внутри ответа
            $data['tracks'] = array_map('formatTrack', $data['tracks']);
            
            // Форматируем альбомы
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
            
            // Форматируем обложку артиста
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

        // --- ВОСПРОИЗВЕДЕНИЕ (Сложная логика) ---

        case 'play_station':
            $stationId = $_REQUEST['station'] ?? 'user:onyourwave';
            $extraParams = []; // Для настроений и энергии
            $contextName = "My Vibe";

            // Парсинг спец. ID для настроений (vibe:moodEnergy:fun)
            if (strpos($stationId, 'vibe:') === 0) {
                $parts = explode(':', $stationId);
                if (count($parts) >= 3) {
                    $type = $parts[1]; // moodEnergy или diversity
                    $val = $parts[2];
                    $extraParams[$type] = $val;
                    $stationId = 'user:onyourwave'; // Базовая станция всегда Моя Волна
                    $contextName = "Vibe: " . ucfirst($val);
                }
            } elseif (strpos($stationId, 'track:') === 0) {
                $contextName = "Track Radio";
            }

            mpdSend("clear");
            
            // Запрашиваем треки у API (передаем пустую историю для начала)
            $queueData = $api->getStationTracks($stationId, []); 
            
            $initialBuffer = [];
            $count = 0;
            $history = [];

            if ($queueData) {
                foreach ($queueData as $track) { 
                    // Первые 3 грузим сразу в MPD
                    if ($count < 3) {
                        $url = $api->getDirectLink($track['id']);
                        if ($url) {
                            cacheTrackMeta($url, $track);
                            mpdSend("add \"$url\"");
                            $count++;
                            $history[] = (string)$track['id'];
                        }
                    } else {
                        // Остальные в буфер для демона
                        $initialBuffer[] = $track; 
                        cacheTrackMeta("yandex:" . $track['id'], $track); 
                    }
                    if (count($initialBuffer) >= 20) break; // Хватит для начала
                }
            }
            mpdSend("play");
            
            // Сохраняем состояние демона
            saveState([
                'active' => true,
                'mode' => 'station',
                'station_id' => $stationId,
                'station_params' => $extraParams, // Важно! Передаем параметры настроения
                'context_name' => $contextName,
                'queue_buffer' => $initialBuffer,
                'played_history' => $history // История, чтобы не повторялось
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
                // Преобразуем входящие данные в надежный формат
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
                'mode' => 'static', // Демон только догружает, не качает новое
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
            $buffer = $currentState['queue_buffer'] ?? [];
            $added = 0;

            // Если буфер пуст и ничего не играет, можем попробовать запустить сразу
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
            
            // Остальное добавляем в хвост буфера
            foreach ($tracks as $t) {
                $clean = formatTrack($t);
                if ($clean) $buffer[] = $clean;
            }

            saveState([
                'active' => true,
                'mode' => 'static', 
                'queue_buffer' => $buffer
            ]);

            echo json_encode(['status' => 'ok', 'added' => $added, 'buffered' => count($tracks)]);
            break;

        case 'play_track':
            $id = $_REQUEST['id'] ?? '';
            // Поддержка параметра append (добавить в конец или играть сразу)
            $append = ($_REQUEST['append'] ?? '0') === '1';
            
            $trackInfo = $api->getTracksByIds([$id]);
            $t = $trackInfo[0] ?? ['id'=>$id, 'title'=>'Unknown'];
            $cleanTrack = formatTrack($t);

            $url = $api->getDirectLink($id);
            if ($url) {
                if (!$append) mpdSend("clear");
                
                cacheTrackMeta($url, $cleanTrack);
                mpdSend("add \"$url\"");
                
                if (!$append) {
                    mpdSend("play");
                    // Останавливаем демона, так как это одиночный трек
                    saveState(['active' => false, 'mode' => 'idle']);
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
