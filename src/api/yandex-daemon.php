<?php
define('INC', '/var/www/inc');
require_once INC . '/yandex-music.php';

define('STORAGE_DIR', '/dev/shm/yandex_music/');
define('STATE_FILE', STORAGE_DIR . 'state.json');
define('META_CACHE_FILE', STORAGE_DIR . 'meta_cache.json');
define('TOKEN_FILE', '/var/local/www/yandex_token.dat');
define('LOG_FILE', '/tmp/wave_daemon.log');

if (!is_dir(STORAGE_DIR)) {
    @mkdir(STORAGE_DIR, 0777, true);
}

$minQueueSize = 5; 
$pollInterval = 5; 

function logMsg($msg) {
    $str = "[" . date('H:i:s') . "] $msg\n";
    @file_put_contents(LOG_FILE, $str, FILE_APPEND);
    echo $str;
}

function mpdSend($cmd) {
    $fp = @fsockopen("localhost", 6600, $errno, $errstr, 5);
    if (!$fp) return false;
    fgets($fp); fwrite($fp, "$cmd\n");
    $resp = "";
    while (!feof($fp)) {
        $line = fgets($fp); $resp .= $line;
        if (strpos($line, 'OK') === 0 || strpos($line, 'ACK') === 0) break;
    }
    fclose($fp);
    return $resp;
}

function getQueueLength() {
    $resp = mpdSend("status");
    return preg_match('/playlistlength: (\d+)/', $resp, $m) ? intval($m[1]) : 0;
}

function getCurrentSongPos() {
    $resp = mpdSend("status");
    return preg_match('/song: (\d+)/', $resp, $m) ? intval($m[1]) : 0;
}

function getState() {
    return file_exists(STATE_FILE) ? json_decode(file_get_contents(STATE_FILE), true) : null;
}

function saveState($state) {
    file_put_contents(STATE_FILE, json_encode($state));
}

function updateMetaCache($url, $track) {
    $cache = file_exists(META_CACHE_FILE) ? json_decode(file_get_contents(META_CACHE_FILE), true) : [];
    if (count($cache) > 200) $cache = array_slice($cache, -100, 100, true);
    
    $artistName = isset($track['artists']) ? implode(', ', array_column($track['artists'], 'name')) : 'Unknown Artist';
    $artistId = isset($track['artists'][0]['id']) ? $track['artists'][0]['id'] : null;

    $cache[md5($url)] = [
        'id' => (string)$track['id'],
        'title' => $track['title'],
        'artist' => $artistName,
        'artistId' => $artistId,
        'album' => $track['albums'][0]['title'] ?? 'Single',
        'image' => isset($track['coverUri']) ? "https://" . str_replace('%%', '400x400', $track['coverUri']) : null,
        'isYandex' => true,
        'service' => 'yandex',
        'time' => ($track['durationMs'] ?? 0) / 1000
    ];
    file_put_contents(META_CACHE_FILE, json_encode($cache));
}

logMsg("Daemon Started");

$api = null;
$lastToken = "";

while (true) {
    if (file_exists(TOKEN_FILE)) {
        $token = trim(file_get_contents(TOKEN_FILE));
        if ($token && $token !== $lastToken) {
            try {
                $api = new YandexMusic($token);
                $api->getUserId();
                $lastToken = $token;
                logMsg("API Initialized.");
            } catch (Exception $e) { $api = null; }
        }
    }

    $state = getState();

    if ($api && $state && !empty($state['active'])) {
        $tracksRemaining = getQueueLength() - (getCurrentSongPos() + 1);

        if ($tracksRemaining < $minQueueSize) {
            
            if (empty($state['queue_buffer'])) {
                if (($state['mode'] ?? '') === 'station') {
                    logMsg("Fetching station tracks...");
                    
                    $tracksData = $api->getStationTracks($state['station_id'] ?? 'user:onetwo', false);
                    
                    if ($tracksData) {
                        $newBuffer = [];
                        $history = $state['played_history'] ?? [];
                        
                        foreach ($tracksData as $item) {
                            $t = $item['track'];
                            if (!in_array($t['id'], $history)) {
                                $newBuffer[] = $t;
                            }
                        }
                        
                        if (empty($newBuffer) && !empty($tracksData)) {
                             logMsg("Loop detected. Forcing new queue.");
                             $tracksData = $api->getStationTracks($state['station_id'] ?? 'user:onetwo', true);
                             if ($tracksData) {
                                $newBuffer = array_column($tracksData, 'track');
                             }
                        }

                        $state['queue_buffer'] = $newBuffer;
                        saveState($state);
                    }
                } else {
                    $state['active'] = false;
                    saveState($state);
                    continue;
                }
            }

            if (!empty($state['queue_buffer'])) {
                $nextTrack = array_shift($state['queue_buffer']);
                
                $history = $state['played_history'] ?? [];
                $history[] = $nextTrack['id'];
                if (count($history) > 100) $history = array_slice($history, -100);
                $state['played_history'] = $history;
                
                saveState($state);

                if ($url = $api->getDirectLink($nextTrack['id'])) {
                    mpdSend("add \"$url\"");
                    updateMetaCache($url, $nextTrack);
                    logMsg("Added: " . $nextTrack['title']);
                }
            }
        }
    }
    sleep($pollInterval);
}
?>
