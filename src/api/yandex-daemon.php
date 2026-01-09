<?php
// /var/www/bin/yandex-daemon.php

define('INC', '/var/www/inc');
require_once INC . '/yandex-music.php';

define('STATE_FILE', '/dev/shm/yandex_state.json');
define('META_CACHE_FILE', '/dev/shm/yandex_meta_cache.json');
define('TOKEN_FILE', '/var/local/www/yandex_token.dat');
define('LOG_FILE', '/tmp/wave_daemon.log');

$minQueueSize = 3; 
$pollInterval = 5; 

function logMsg($msg) {
    $str = "[" . date('H:i:s') . "] $msg\n";
    // Пишем в лог так, чтобы все могли читать
    file_put_contents(LOG_FILE, $str, FILE_APPEND);
    chmod(LOG_FILE, 0666); 
    echo $str;
}

function mpdSend($cmd) {
    $fp = @fsockopen("localhost", 6600, $errno, $errstr, 5);
    if (!$fp) {
        logMsg("ERROR: MPD Connection Failed: $errstr");
        return false;
    }
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

function getQueueLength() {
    $resp = mpdSend("status");
    if (preg_match('/playlistlength: (\d+)/', $resp, $matches)) {
        return intval($matches[1]);
    }
    return 0;
}

function getMpdState() {
    $resp = mpdSend("status");
    if (preg_match('/state: (\w+)/', $resp, $matches)) {
        return $matches[1];
    }
    return 'unknown';
}

function getCurrentSongPos() {
    $resp = mpdSend("status");
    if (preg_match('/song: (\d+)/', $resp, $matches)) {
        return intval($matches[1]);
    }
    return 0;
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
    if (count($cache) > 100) $cache = array_slice($cache, -100, 100, true);
    $key = md5($url);
    
    $cover = null;
    if (isset($track['coverUri'])) {
        $cover = "https://" . str_replace('%%', '400x400', $track['coverUri']);
    }

    $artistName = 'Unknown';
    if (isset($track['artists'])) {
        $artistName = implode(', ', array_column($track['artists'], 'name'));
    }

    $cache[$key] = [
        'id' => $track['id'],
        'title' => $track['title'],
        'artist' => $artistName,
        'album' => $track['albums'][0]['title'] ?? '',
        'image' => $cover,
        'isYandex' => true,
        'time' => ($track['durationMs'] ?? 0) / 1000
    ];
    file_put_contents(META_CACHE_FILE, json_encode($cache));
}

logMsg("Daemon Started (Robust Polling)");

$lastTokenTime = 0;
$api = null;

while (true) {
    if (file_exists(TOKEN_FILE)) {
        $fileTime = filemtime(TOKEN_FILE);
        if ($fileTime > $lastTokenTime) {
            $token = trim(file_get_contents(TOKEN_FILE));
            if ($token) {
                try {
                    $api = new YandexMusic($token);
                    $api->getUserId(); 
                    $lastTokenTime = $fileTime;
                    logMsg("API Initialized.");
                } catch (Exception $e) {
                    logMsg("Token Error: " . $e->getMessage());
                    $api = null;
                }
            }
        }
    }

    $state = getState();

    if ($api && $state && !empty($state['active'])) {
        $totalQueue = getQueueLength();
        $currentPos = getCurrentSongPos();
        $tracksAhead = $totalQueue - ($currentPos + 1);

        if ($tracksAhead < $minQueueSize) {
            logMsg("Status: Queue has $tracksAhead ahead. Minimum is $minQueueSize.");

            if (empty($state['queue_buffer'])) {
                logMsg("Fetching more tracks from Yandex...");
                try {
                    $stationId = $state['station_id'] ?? 'user:onetwo';
                    $tracksData = $api->getStationTracks($stationId, false);
                    
                    if ($tracksData && is_array($tracksData)) {
                        $cleanTracks = [];
                        foreach ($tracksData as $item) {
                            $cleanTracks[] = $item['track'];
                        }
                        $state['queue_buffer'] = $cleanTracks;
                        saveState($state);
                        logMsg("Got " . count($cleanTracks) . " tracks from Yandex.");
                    } else {
                        logMsg("Yandex returned no tracks. Waiting 10s.");
                        sleep(10);
                        continue;
                    }
                } catch (Exception $e) {
                    logMsg("Fetch Error: " . $e->getMessage());
                    sleep(10);
                    continue;
                }
            }

            if (!empty($state['queue_buffer'])) {
                $nextTrack = array_shift($state['queue_buffer']);
                saveState($state);

                try {
                    $url = $api->getDirectLink($nextTrack['id']);
                    if ($url) {
                        mpdSend("add \"$url\"");
                        updateMetaCache($url, $nextTrack);
                        logMsg(">>> Added to MPD: " . $nextTrack['title']);
                        
                        if (getMpdState() !== 'play') mpdSend("play");
                    } else {
                        logMsg("Skipping track (no URL): " . $nextTrack['title']);
                    }
                } catch (Exception $e) {
                    logMsg("Add Error: " . $e->getMessage());
                }
            }
        }
    }

    sleep($pollInterval);
}
