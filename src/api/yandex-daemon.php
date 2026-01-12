<?php
define('INC', '/var/www/inc');
require_once INC . '/yandex-music.php';

define('STORAGE_DIR', '/dev/shm/yandex_music/');
define('STATE_FILE', STORAGE_DIR . 'state.json');
define('META_CACHE_FILE', STORAGE_DIR . 'meta_cache.json');
define('TOKEN_FILE', '/var/local/www/yandex_token.dat');
define('LOG_FILE', '/dev/shm/wave_daemon.log');

if (!is_dir(STORAGE_DIR)) {
    @mkdir(STORAGE_DIR, 0777, true);
}

$pollInterval = 5;

function logMsg($msg) {
    $str = "[" . date('H:i:s') . "] $msg\n";
    @file_put_contents(LOG_FILE, $str, FILE_APPEND);
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

function parseMpdResponse($resp) {
    $lines = explode("\n", $resp);
    $data = [];
    foreach ($lines as $line) {
        $parts = explode(': ', $line, 2);
        if (count($parts) === 2) {
            $data[strtolower($parts[0])] = trim($parts[1]);
        }
    }
    return $data;
}

function getMpdStatus() {
    $status = parseMpdResponse(mpdSend("status"));
    $song = parseMpdResponse(mpdSend("currentsong"));
    return array_merge($status, ['file' => $song['file'] ?? '']);
}

function getState() {
    return file_exists(STATE_FILE) ? json_decode(file_get_contents(STATE_FILE), true) : null;
}

function saveState($state) {
    file_put_contents(STATE_FILE, json_encode($state));
}

function formatTrackForCache($t) {
    if (!isset($t['id'])) return null;
    
    $img = null;
    if (!empty($t['ogImage'])) $img = $t['ogImage'];
    elseif (!empty($t['coverUri'])) $img = $t['coverUri'];
    
    if ($img) $img = 'https://' . str_replace('%%', '200x200', $img);
    
    $artist = 'Unknown';
    if (isset($t['artists'][0]['name'])) $artist = $t['artists'][0]['name'];
    elseif (isset($t['artist'])) $artist = $t['artist'];

    $album = 'Unknown Album';
    if (isset($t['albums'][0]['title'])) $album = $t['albums'][0]['title'];
    elseif (isset($t['album']['title'])) $album = $t['album']['title'];

    return [
        'title' => $t['title'] ?? 'Unknown',
        'artist' => $artist,
        'album' => $album,
        'id' => (string)$t['id'],
        'image' => $img,
        'isYandex' => true,
        'time' => isset($t['durationMs']) ? $t['durationMs']/1000 : 0
    ];
}

function updateMetaCache($url, $track) {
    $cache = file_exists(META_CACHE_FILE) ? json_decode(file_get_contents(META_CACHE_FILE), true) : [];
    
    if (count($cache) > 300) {
        $cache = array_slice($cache, -100, 100, true);
    }
    
    $formatted = formatTrackForCache($track);
    $cache[md5($url)] = $formatted;
    
    // Сохраняем также по ID для надежности
    if (isset($formatted['id'])) {
        $cache[$formatted['id']] = $formatted;
    }
    
    file_put_contents(META_CACHE_FILE, json_encode($cache));
}

function isYandexFile($file) {
    return strpos($file, 'yandex.net') !== false || 
           strpos($file, 'get-mp3') !== false || 
           strpos($file, 'yandex:') === 0;
}

logMsg("--- Smart Daemon Started ---");

$api = null;
$lastToken = "";

while (true) {
    if (file_exists(TOKEN_FILE)) {
        $token = trim(file_get_contents(TOKEN_FILE));
        if ($token && $token !== $lastToken) {
            try {
                $api = new YandexMusic($token);
                $api->getUserId(); // Проверка авторизации
                $lastToken = $token;
                logMsg("API Initialized Successfully.");
            } catch (Exception $e) { 
                $api = null; 
                logMsg("API Error: " . $e->getMessage());
            }
        }
    }

    $state = getState();

    if ($api && $state && !empty($state['active'])) {
        $status = getMpdStatus();
        $currentFile = $status['file'] ?? '';
        $stateStr = $status['state'] ?? 'stop';

        if ($stateStr === 'play' && !empty($currentFile) && !isYandexFile($currentFile)) {
            logMsg("Detected non-Yandex track ($currentFile). Deactivating daemon.");
            $state['active'] = false;
            saveState($state);
            sleep($pollInterval);
            continue;
        }

        $playlistLen = intval($status['playlistlength'] ?? 0);
        $currentPos = intval($status['song'] ?? -1);
        
        $tracksAhead = $playlistLen - ($currentPos + 1);

        if ($tracksAhead < 5) {
            $buffer = $state['queue_buffer'] ?? [];
            
            if (count($buffer) < 5) {
                $stationId = $state['station_id'] ?? 'user:onetwo';
                $history = $state['played_history'] ?? [];
                
                $extraParams = $state['station_params'] ?? [];
                
                logMsg("Refilling buffer for $stationId...");
                
                $newTracks = $api->getStationTracksV2($stationId, $history, $extraParams);
                
                if (!empty($newTracks)) {
                    $buffer = array_merge($buffer, $newTracks);
                    
                    // Убираем дубликаты внутри буфера
                    $buffer = array_values(array_unique($buffer, SORT_REGULAR));
                    
                    $state['queue_buffer'] = $buffer;
                    saveState($state);
                    logMsg("Buffer refilled. New size: " . count($buffer));
                } else {
                    logMsg("Warning: API returned 0 tracks.");
                }
            }

            $addedThisLoop = 0;
            $history = $state['played_history'] ?? [];

            while ($tracksAhead < 10 && !empty($buffer) && $addedThisLoop < 5) {
                $nextTrack = array_shift($buffer);
                
                if (!isset($nextTrack['id'])) continue;

                if (in_array((string)$nextTrack['id'], $history)) {
                    continue; // Пропускаем
                }

                // Получаем прямую ссылку
                $url = $api->getDirectLink($nextTrack['id']);
                
                if ($url) {
                    mpdSend("add \"$url\"");
                    updateMetaCache($url, $nextTrack);
                    
                    $history[] = (string)$nextTrack['id'];
                    $addedThisLoop++;
                    $tracksAhead++;
                } else {
                    logMsg("Failed to get link for track ID: " . $nextTrack['id']);
                }
                
                if (count($history) > 200) {
                    $history = array_slice($history, -150);
                }
            }

            if ($addedThisLoop > 0) {
                $state['queue_buffer'] = $buffer;
                $state['played_history'] = $history;
                saveState($state);
                logMsg("Added $addedThisLoop tracks to MPD Queue.");
            }
        }
    }
    
    sleep($pollInterval);
}
?>
