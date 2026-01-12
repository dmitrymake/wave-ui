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

$pollInterval = 4;

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

function isYandexFile($file) {
    return strpos($file, 'yandex.net') !== false || strpos($file, 'get-mp3') !== false || strpos($file, 'yandex:') === 0;
}

logMsg("Smart Daemon Started (Buffered 2)");

$api = null;
$lastToken = "";

while (true) {
    // 1. Init API
    if (file_exists(TOKEN_FILE)) {
        $token = trim(file_get_contents(TOKEN_FILE));
        if ($token && $token !== $lastToken) {
            try {
                $api = new YandexMusic($token);
                $api->getUserId(); // Check auth
                $lastToken = $token;
                logMsg("API Initialized.");
            } catch (Exception $e) { 
                $api = null; 
                logMsg("API Init Failed: " . $e->getMessage());
            }
        }
    }

    $state = getState();

    if ($api && $state && !empty($state['active'])) {
        $status = getMpdStatus();
        $currentFile = $status['file'] ?? '';
        $stateStr = $status['state'] ?? 'stop';

        // 2. Auto-stop if user plays local file
        if ($stateStr === 'play' && !isYandexFile($currentFile)) {
            logMsg("Detected non-Yandex track playing. Deactivating.");
            $state['active'] = false;
            saveState($state);
            sleep($pollInterval);
            continue;
        }

        $playlistLen = intval($status['playlistlength'] ?? 0);
        $currentPos = intval($status['song'] ?? -1);
        
        // 3. Check Buffer
        $tracksAhead = $playlistLen - ($currentPos + 1);

        if ($tracksAhead < 2) {
            $buffer = $state['queue_buffer'] ?? [];
            
            // 4. Fetch New Tracks if buffer empty
            if (empty($buffer)) {
                $context = $state['mode'] ?? 'station';
                $newTracks = [];

                if ($context === 'station') {
                    $stationId = $state['station_id'] ?? 'user:onetwo';
                    $history = $state['played_history'] ?? [];
                    
                    // READ PARAMS (Mood, Diversity)
                    $extraParams = $state['station_params'] ?? [];
                    $paramsLog = !empty($extraParams) ? "Params: " . json_encode($extraParams) : "Default";
                    
                    logMsg("Buffer empty. Fetching $stationId ($paramsLog)");
                    
                    $newTracks = $api->getStationTracksV2($stationId, $history, $extraParams);
                    logMsg("Got " . count($newTracks) . " new tracks.");
                }

                if (!empty($newTracks)) {
                    $buffer = array_merge($buffer, $newTracks);
                    $state['queue_buffer'] = $buffer;
                    saveState($state);
                }
            }

            // 5. Add ONE track from buffer to MPD
            if (!empty($buffer)) {
                $nextTrack = array_shift($buffer);
                
                // Validate ID
                if (!isset($nextTrack['id'])) {
                    logMsg("Skipping track with no ID");
                    $state['queue_buffer'] = $buffer; 
                    saveState($state);
                    continue; 
                }

                $url = $api->getDirectLink($nextTrack['id']);
                
                if ($url) {
                    mpdSend("add \"$url\"");
                    updateMetaCache($url, $nextTrack);
                    
                    $state['queue_buffer'] = $buffer;
                    
                    // Update History
                    $history = $state['played_history'] ?? [];
                    $history[] = (string)$nextTrack['id'];
                    if (count($history) > 100) $history = array_slice($history, -100);
                    $state['played_history'] = $history;

                    saveState($state);
                    logMsg("Auto-added: " . ($nextTrack['title'] ?? 'Unknown'));
                } else {
                    logMsg("Failed to get link for " . $nextTrack['id']);
                    $state['queue_buffer'] = $buffer; 
                    saveState($state);
                }
            }
        }
    }
    sleep($pollInterval);
}
?>
