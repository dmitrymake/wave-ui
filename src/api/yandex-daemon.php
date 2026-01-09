<?php
define('INC', '/var/www/inc');
require_once INC . '/yandex-music.php';

define('STATE_FILE', '/dev/shm/yandex_state.json');
define('META_CACHE_FILE', '/dev/shm/yandex_meta_cache.json');
define('TOKEN_FILE', '/var/local/www/yandex_token.dat');
define('LOG_FILE', '/tmp/wave_daemon.log');

$minQueueSize = 2; 

function logMsg($msg) {
    // Enable for debugging:
    // file_put_contents(LOG_FILE, "[" . date('H:i:s') . "] $msg\n", FILE_APPEND);
}

function mpdSend($cmd) {
    $fp = fsockopen("localhost", 6600, $errno, $errstr, 5);
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

function getQueueLength() {
    $resp = mpdSend("status");
    if (preg_match('/playlistlength: (\d+)/', $resp, $matches)) {
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
    if (count($cache) > 50) $cache = array_slice($cache, -50, 50, true);
    
    $key = md5($url);
    
    $cover = null;
    if (isset($track['coverUri'])) {
        $cover = "https://" . str_replace('%%', '400x400', $track['coverUri']);
    } elseif (isset($track['ogImage'])) {
        $cover = "https://" . str_replace('%%', '200x200', $track['ogImage']);
    }

    $artistName = 'Unknown';
    if (isset($track['artists']) && is_array($track['artists'])) {
        $artistName = implode(', ', array_column($track['artists'], 'name'));
    }

    $albumTitle = $track['albums'][0]['title'] ?? '';

    $cache[$key] = [
        'id' => $track['id'],
        'title' => $track['title'],
        'artist' => $artistName,
        'album' => $albumTitle,
        'image' => $cover,
        'isYandex' => true,
        'time' => ($track['durationMs'] ?? 0) / 1000
    ];
    
    file_put_contents(META_CACHE_FILE, json_encode($cache));
}

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
                } catch (Exception $e) {
                    $api = null;
                }
            }
        }
    }

    $state = getState();

    // Only run if active
    if ($api && $state && !empty($state['active'])) {
        
        $queueCount = getQueueLength();
        
        // Refill Queue Logic
        if ($queueCount < $minQueueSize) {
            
            // 1. Fetch more if buffer empty
            if (empty($state['queue_buffer'])) {
                try {
                    $stationId = $state['station_id'] ?? 'user:onetwo';
                    $tracksData = $api->getStationTracks($stationId);
                    
                    if ($tracksData) {
                        $cleanTracks = [];
                        foreach ($tracksData as $item) {
                            $cleanTracks[] = $item['track'];
                        }
                        $state['queue_buffer'] = $cleanTracks;
                        saveState($state);
                    }
                } catch (Exception $e) {
                    sleep(5);
                }
            }

            // 2. Push next track to MPD
            if (!empty($state['queue_buffer'])) {
                $nextTrack = array_shift($state['queue_buffer']);
                saveState($state); 

                try {
                    $url = $api->getDirectLink($nextTrack['id']);
                    if ($url) {
                        mpdSend("add \"$url\"");
                        updateMetaCache($url, $nextTrack);
                        
                        if ($queueCount == 0) mpdSend("play");
                    }
                } catch (Exception $e) {
                    // Skip broken track
                }
            }
        }
    }

    // Wait for MPD event (Blocking I/O saves CPU)
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
