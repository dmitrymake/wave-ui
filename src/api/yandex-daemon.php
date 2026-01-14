<?php
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
    // Используем flock для атомарного чтения, чтобы не прочитать файл в момент записи API
    if (!file_exists(STATE_FILE)) return [];
    $fp = fopen(STATE_FILE, 'r');
    if (flock($fp, LOCK_SH)) {
        $json = stream_get_contents($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        return json_decode($json, true) ?: [];
    }
    fclose($fp);
    return [];
}

function saveState($state) {
    $fp = fopen(STATE_FILE, 'c');
    if (flock($fp, LOCK_EX)) {
        ftruncate($fp, 0);
        fwrite($fp, json_encode($state));
        fflush($fp);
        flock($fp, LOCK_UN);
    }
    fclose($fp);
}

function updateMetaCache($url, $track) {
    $cache = file_exists(META_CACHE_FILE) ? json_decode(file_get_contents(META_CACHE_FILE), true) : [];
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
    // 1. Инициализация API
    if (file_exists(TOKEN_FILE)) {
        $token = trim(file_get_contents(TOKEN_FILE));
        if ($token && $token !== $lastToken) {
            try {
                $api = new YandexMusic($token);
                $api->getUserId(); 
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
        
        // --- FIX: Проверка "Чужого трека" ---
        $currentFile = $mpdStatus['file'] ?? '';
        $stateStr = $mpdStatus['state'] ?? 'stop';
        
        if ($stateStr === 'play' && !empty($currentFile) 
            && strpos($currentFile, 'yandex') === false 
            && strpos($currentFile, 'get-mp3') === false) {
            
            // Кто-то включил локальный файл -> выключаем демона
            $state['active'] = false;
            saveState($state);
            logMsg("External track detected. Daemon paused.");
            sleep(2);
            continue;
        }

        // 3. Проверка очереди
        $playlistLen = intval($mpdStatus['playlistlength'] ?? 0);
        $currentPos = intval($mpdStatus['song'] ?? -1);
        
        // Если ничего не играет, считаем что мы в конце очереди (чтобы стригеррить загрузку, если это старт)
        if ($currentPos === -1 && $playlistLen === 0) $tracksAhead = 0;
        else $tracksAhead = $playlistLen - ($currentPos + 1);

        // Порог пополнения (меньше 3 треков впереди)
        if ($tracksAhead < 3) {
            $buffer = $state['queue_buffer'] ?? [];

            // A. Если буфер пуст и режим STATION -> Качаем новые
            if (empty($buffer) && ($state['mode'] ?? '') === 'station') {
                $stationId = $state['station_id'] ?? 'user:onyourwave';
                $history = $state['played_history'] ?? [];
                
                // --- FIX: Читаем параметры настроения (Fun, Sad, etc) ---
                $params = $state['station_params'] ?? []; 

                logMsg("Refilling radio: $stationId Params: " . json_encode($params));
                
                try {
                    // --- FIX: Передаем параметры в API ---
                    $newTracks = $api->getStationTracks($stationId, $history, $params);
                    
                    if (!empty($newTracks)) {
                        $newBuffer = [];
                        foreach ($newTracks as $nt) {
                            if (!in_array((string)$nt['id'], $history)) {
                                $newBuffer[] = $nt;
                            }
                        }
                        // Сразу сохраняем буфер, чтобы не потерять при перезапуске
                        $state = getState(); // Обновляем стейт перед записью
                        if (empty($state['active'])) {
                             // Если пока мы качали, юзер нажал стоп - не сохраняем
                             continue;
                        }
                        $state['queue_buffer'] = $newBuffer;
                        saveState($state);
                        $buffer = $newBuffer; // Обновляем локальную переменную
                    }
                } catch (Exception $e) {
                    logMsg("Fetch Error: " . $e->getMessage());
                }
            }

            // B. Добавляем трек из буфера в MPD
            if (!empty($buffer)) {
                $nextTrack = array_shift($buffer);
                
                try {
                    // --- FIX: CRITICAL CHECK FOR GHOST TRACK ---
                    // Перед тяжелым запросом ссылки и добавлением в MPD
                    // проверяем, не отменил ли UI активность
                    $checkState = getState();
                    if (empty($checkState['active'])) {
                        logMsg("Daemon stopped abruptly. Aborting add.");
                        continue; 
                    }
                    // -------------------------------------------

                    $url = $api->getDirectLink($nextTrack['id']);
                    
                    if ($url) {
                        updateMetaCache($url, $nextTrack);
                        
                        // --- FIX: DOUBLE CHECK BEFORE MPD ADD ---
                        $checkState = getState();
                        if (empty($checkState['active'])) {
                            logMsg("Daemon stopped before MPD Add. Aborting.");
                            continue;
                        }
                        // ----------------------------------------

                        mpdSend("add \"$url\"");
                        logMsg("Added: " . $nextTrack['title']);

                        // Обновляем историю
                        if (!isset($state['played_history'])) $state['played_history'] = [];
                        $state['played_history'][] = (string)$nextTrack['id'];
                        if (count($state['played_history']) > 150) {
                            $state['played_history'] = array_slice($state['played_history'], -100);
                        }
                    } else {
                        logMsg("Failed URL for: " . $nextTrack['id']);
                    }
                } catch (Exception $e) {
                    logMsg("Link Error: " . $e->getMessage());
                }

                // Сохраняем стейт (уменьшенный буфер)
                // Важно прочитать актуальный стейт, чтобы не перезатереть флаги
                $currentState = getState();
                if (!empty($currentState['active'])) {
                    $currentState['queue_buffer'] = $buffer;
                    $currentState['played_history'] = $state['played_history'];
                    saveState($currentState);
                }
            }
        }
    }

    sleep($pollInterval);
}
?>
