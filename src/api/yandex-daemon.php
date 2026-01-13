<?php
// yandex-daemon.php
define('INC', '/var/www/inc');
require_once INC . '/yandex-music.php';

// Константы
define('STORAGE_DIR', '/dev/shm/yandex_music/');
define('STATE_FILE', STORAGE_DIR . 'state.json');
define('META_CACHE_FILE', STORAGE_DIR . 'meta_cache.json');
define('TOKEN_FILE', '/var/local/www/yandex_token.dat');
define('LOG_FILE', '/dev/shm/wave_daemon.log');

if (!is_dir(STORAGE_DIR)) @mkdir(STORAGE_DIR, 0777, true);

$pollInterval = 2; // секунды

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
        $line = fgets($fp); $resp .= $line;
        if (strpos($line, 'OK') === 0 || strpos($line, 'ACK') === 0) break;
    }
    fclose($fp);
    return $resp;
}

function getMpdStatus() {
    $rawStat = mpdSend("status");
    $rawSong = mpdSend("currentsong");
    
    $data = [];
    foreach (explode("\n", $rawStat . "\n" . $rawSong) as $line) {
        $parts = explode(': ', $line, 2);
        if (count($parts) === 2) $data[strtolower($parts[0])] = trim($parts[1]);
    }
    return $data;
}

function getState() {
    return file_exists(STATE_FILE) ? json_decode(file_get_contents(STATE_FILE), true) : [];
}

function saveState($state) {
    file_put_contents(STATE_FILE, json_encode($state));
}

function updateMetaCache($url, $track) {
    $cache = file_exists(META_CACHE_FILE) ? json_decode(file_get_contents(META_CACHE_FILE), true) : [];
    // Кэш максимум 300 записей
    if (count($cache) > 300) $cache = array_slice($cache, -100, 100, true);
    
    $key = md5($url);
    $cache[$key] = $track;
    if (isset($track['id'])) $cache[(string)$track['id']] = $track;
    
    file_put_contents(META_CACHE_FILE, json_encode($cache));
}

logMsg("Daemon Started");

$api = null;
$lastToken = "";

while (true) {
    // 1. Проверяем токен и инициализируем API
    if (file_exists(TOKEN_FILE)) {
        $token = trim(file_get_contents(TOKEN_FILE));
        if ($token && $token !== $lastToken) {
            try {
                $api = new YandexMusic($token);
                $api->getUserId(); // Check valid
                $lastToken = $token;
                logMsg("API Connected");
            } catch (Exception $e) {
                logMsg("API Init Error: " . $e->getMessage());
                $api = null;
            }
        }
    }

    $state = getState();

    // 2. Если активен режим Яндекс
    if ($api && !empty($state['active'])) {
        $mpdStatus = getMpdStatus();
        
        // Проверка: Если играет что-то не из Яндекса (например, локальный файл), засыпаем
        $currentFile = $mpdStatus['file'] ?? '';
        $stateStr = $mpdStatus['state'] ?? 'stop';
        
        if ($stateStr === 'play' && !empty($currentFile) 
            && strpos($currentFile, 'yandex') === false 
            && strpos($currentFile, 'get-mp3') === false) {
            
            // Кто-то включил локальный трек -> выключаем наш демон
            $state['active'] = false;
            saveState($state);
            logMsg("External track detected. Daemon paused.");
            sleep(2);
            continue;
        }

        // 3. Проверка длины очереди
        $playlistLen = intval($mpdStatus['playlistlength'] ?? 0);
        $currentPos = intval($mpdStatus['song'] ?? -1);
        $tracksAhead = $playlistLen - ($currentPos + 1);

        // Если осталось мало треков (меньше 3)
        if ($tracksAhead < 3) {
            $buffer = $state['queue_buffer'] ?? [];

            // A. Если буфер пуст и это режим РАДИО -> Качаем новые
            if (empty($buffer) && ($state['mode'] ?? '') === 'station') {
                $stationId = $state['station_id'] ?? 'user:onyourwave';
                $history = $state['played_history'] ?? [];

                logMsg("Refilling radio: $stationId");
                try {
                    // Передаем историю, чтобы не было повторов!
                    $newTracks = $api->getStationTracks($stationId, $history);
                    
                    if (!empty($newTracks)) {
                        foreach ($newTracks as $nt) {
                            // Дополнительная проверка на всякий случай
                            if (!in_array((string)$nt['id'], $history)) {
                                $buffer[] = $nt;
                            }
                        }
                        $state['queue_buffer'] = $buffer;
                        saveState($state);
                    }
                } catch (Exception $e) {
                    logMsg("Fetch Error: " . $e->getMessage());
                }
            }

            // B. Добавляем трек из буфера в MPD
            if (!empty($buffer)) {
                $nextTrack = array_shift($buffer);
                
                // Получаем ссылку
                try {
                    $url = $api->getDirectLink($nextTrack['id']);
                    if ($url) {
                        updateMetaCache($url, $nextTrack);
                        mpdSend("add \"$url\"");
                        logMsg("Added: " . $nextTrack['title']);

                        // Обновляем историю
                        if (!isset($state['played_history'])) $state['played_history'] = [];
                        $state['played_history'][] = (string)$nextTrack['id'];
                        // Храним последние 100 ID
                        if (count($state['played_history']) > 150) {
                            $state['played_history'] = array_slice($state['played_history'], -100);
                        }
                    } else {
                        logMsg("Failed URL for: " . $nextTrack['id']);
                    }
                } catch (Exception $e) {
                    logMsg("Link Error: " . $e->getMessage());
                }

                // Сохраняем уменьшенный буфер и обновленную историю
                $state['queue_buffer'] = $buffer;
                saveState($state);
            }
        }
    }

    sleep($pollInterval);
}
?>
