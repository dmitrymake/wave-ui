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

function formatTrackForCache($t) {
    if (!$t) return null;

    if (isset($t['artist']) && is_string($t['artist'])) {
         return [
            'title' => $t['title'] ?? 'Unknown Title',
            'artist' => $t['artist'],
            'artistId' => $t['artistId'] ?? null,
            'album' => $t['album'] ?? '',
            'id' => (string)($t['id'] ?? ''),
            'file' => "yandex:" . ($t['id'] ?? ''),
            'image' => $t['image'] ?? $t['cover'] ?? null,
            'isYandex' => true,
            'service' => 'yandex',
            'time' => $t['time'] ?? 0
        ];
    }
    // -------------------------------------------------------------

    $cover = null;
    if (!empty($t['ogImage'])) {
        $cover = $t['ogImage'];
    } elseif (!empty($t['coverUri'])) {
        $cover = $t['coverUri'];
    } elseif (!empty($t['album']['coverUri'])) {
        $cover = $t['album']['coverUri'];
    } elseif (!empty($t['albums'][0]['coverUri'])) {
        $cover = $t['albums'][0]['coverUri'];
    }

    if ($cover) {
        $cover = str_replace('%%', '200x200', $cover);
        if (strpos($cover, 'http') !== 0) {
            $cover = 'https://' . $cover;
        }
    }

    $artistName = 'Unknown Artist';
    $artistId = null;
    if (isset($t['artists']) && is_array($t['artists']) && count($t['artists']) > 0) {
        $names = array_column($t['artists'], 'name');
        $artistName = implode(', ', $names);
        $artistId = $t['artists'][0]['id'] ?? null;
    }

    $albumTitle = $t['albums'][0]['title'] ?? $t['album']['title'] ?? 'Single';

    return [
        'title' => $t['title'] ?? 'Unknown Title',
        'artist' => $artistName,
        'artistId' => $artistId,
        'album' => $albumTitle,
        'id' => (string)$t['id'],
        'file' => "yandex:".$t['id'],
        'image' => $cover,
        'isYandex' => true,
        'service' => 'yandex',
        'time' => isset($t['durationMs']) ? ($t['durationMs'] / 1000) : 0
    ];
}

function updateMetaCache($url, $track) {
    $cache = file_exists(META_CACHE_FILE) ? json_decode(file_get_contents(META_CACHE_FILE), true) : [];
    if (count($cache) > 200) $cache = array_slice($cache, -100, 100, true);
    
    $formatted = formatTrackForCache($track);
    $cache[md5($url)] = $formatted;
    
    if (isset($formatted['id']) && $formatted['id']) {
        $cache[$formatted['id']] = $formatted;
    }

    file_put_contents(META_CACHE_FILE, json_encode($cache));
}

logMsg("Daemon Started");

$api = null;
$lastToken = "";
$lastAddedId = "";

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
                            if (in_array($t['id'], $history)) continue;
                            if ($t['id'] === $lastAddedId) continue;
                            $newBuffer[] = $t;
                        }
                        
                        if (empty($newBuffer) && !empty($tracksData)) {
                             logMsg("Loop detected. Forcing new queue.");
                             $tracksData = $api->getStationTracks($state['station_id'] ?? 'user:onetwo', true);
                             if ($tracksData) {
                                foreach ($tracksData as $item) {
                                    $t = $item['track'];
                                    if ($t['id'] !== $lastAddedId) {
                                        $newBuffer[] = $t;
                                    }
                                }
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
                
                $tid = is_array($nextTrack) ? ($nextTrack['id'] ?? '') : '';
                
                if ($tid) {
                    $history[] = $tid;
                    if (count($history) > 200) $history = array_slice($history, -200);
                    
                    $state['played_history'] = $history;
                    saveState($state);

                    $lastAddedId = $tid;

                    if ($url = $api->getDirectLink($tid)) {
                        mpdSend("add \"$url\"");
                        updateMetaCache($url, $nextTrack);
                        
                        $tTitle = is_array($nextTrack) ? ($nextTrack['title'] ?? 'Unknown') : 'Unknown';
                        logMsg("Added: " . $tTitle);
                    }
                }
            }
        }
    }
    sleep($pollInterval);
}
?>
