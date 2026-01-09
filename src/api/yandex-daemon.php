<?php
// /var/www/bin/yandex-daemon.php

define('INC', '/var/www/inc');
require_once INC . '/yandex-music.php';

// Пути должны совпадать с wave-yandex-api.php
define('STATE_FILE', '/dev/shm/yandex_state.json');
define('META_CACHE_FILE', '/dev/shm/yandex_meta_cache.json');
define('TOKEN_FILE', '/var/local/www/yandex_token.dat');

$minQueueSize = 2;

function logMsg($msg) {
    echo "[" . date('H:i:s') . "] $msg\n";
}

function mpdCmd($cmd) {
    $cmd = str_replace('"', '\"', $cmd);
    exec("mpc " . $cmd, $out);
    return $out;
}

function getState() {
    if (!file_exists(STATE_FILE)) return null;
    return json_decode(file_get_contents(STATE_FILE), true);
}

function saveState($state) {
    file_put_contents(STATE_FILE, json_encode($state));
}

function updateMetaCache($url, $track) {
    $cache = file_exists(META_CACHE_FILE) ? json_decode(file_get_contents(META_CACHE_FILE), true) : [];
    
    // Очистка старого (оставляем 50 последних)
    if (count($cache) > 50) $cache = array_slice($cache, -50, 50, true);
    
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

logMsg("Daemon Started");

$lastTokenTime = 0;
$api = null;

while (true) {
    // 1. Горячая перезагрузка API при изменении файла токена
    if (file_exists(TOKEN_FILE)) {
        $fileTime = filemtime(TOKEN_FILE);
        if ($fileTime > $lastTokenTime) {
            $token = trim(file_get_contents(TOKEN_FILE));
            if ($token) {
                try {
                    $api = new YandexMusic($token);
                    // Проверка валидности
                    $api->getUserId(); 
                    $lastTokenTime = $fileTime;
                    logMsg("API Initialized / Updated");
                } catch (Exception $e) {
                    logMsg("Token invalid: " . $e->getMessage());
                    $api = null;
                }
            }
        }
    }

    $state = getState();

    // Работаем только если есть API и флаг активности
    if ($api && $state && !empty($state['active'])) {
        
        // Проверка очереди MPD
        $queueCount = (int)shell_exec("mpc playlist | wc -l");
        
        if ($queueCount < $minQueueSize) {
            logMsg("Queue low ($queueCount). Fetching tracks...");

            // 2. Если локальный буфер пуст, качаем пачку из Яндекса
            if (empty($state['queue_buffer'])) {
                try {
                    $stationId = $state['station_id'] ?? 'user:onetwo';
                    $tracks = $api->getStationTracks($stationId);
                    
                    if ($tracks) {
                        // Берем только полезные данные 'track'
                        $cleanTracks = array_map(function($item) { return $item['track']; }, $tracks);
                        $state['queue_buffer'] = $cleanTracks;
                        saveState($state);
                        logMsg("Fetched " . count($cleanTracks) . " tracks from Yandex");
                    }
                } catch (Exception $e) {
                    logMsg("Error fetching tracks: " . $e->getMessage());
                    sleep(10); // Не долбим API при ошибке
                }
            }

            // 3. Берем трек из буфера и добавляем в MPD
            if (!empty($state['queue_buffer'])) {
                $nextTrack = array_shift($state['queue_buffer']);
                saveState($state); 

                try {
                    $url = $api->getDirectLink($nextTrack['id']);
                    if ($url) {
                        mpdCmd("add \"$url\"");
                        updateMetaCache($url, $nextTrack);
                        logMsg("Added: " . $nextTrack['title']);
                        
                        // Если очередь была пуста, запускаем
                        if ($queueCount == 0) mpdCmd("play");
                    }
                } catch (Exception $e) {
                    logMsg("Failed to add track {$nextTrack['id']}: " . $e->getMessage());
                }
            }
        }
    }

    // Экономим CPU, ждем изменений MPD или тайм-аута (для проверки токена)
    $socket = fsockopen("localhost", 6600);
    if ($socket) {
        fwrite($socket, "idle player playlist\n");
        stream_set_timeout($socket, 2); 
        fgets($socket);
        fclose($socket);
    } else {
        sleep(2);
    }
}
?>
