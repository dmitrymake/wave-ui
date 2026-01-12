<?php
define('INC', '/var/www/inc');
require_once INC . '/yandex-music.php';

define('STORAGE_DIR', '/dev/shm/yandex_music/');
define('STATE_FILE', STORAGE_DIR . 'state.json');
define('META_CACHE_FILE', STORAGE_DIR . 'meta_cache.json');
define('TOKEN_FILE', '/var/local/www/yandex_token.dat');
define('LOG_FILE', '/dev/shm/wave_daemon.log');

if (!is_dir(STORAGE_DIR)) @mkdir(STORAGE_DIR, 0777, true);

$pollInterval = 2;

function logMsg($msg) {
    $str = "[" . date('H:i:s') . "] $msg\n";
    @file_put_contents(LOG_FILE, $str, FILE_APPEND);
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
        if (count($parts) === 2) $data[strtolower($parts[0])] = trim($parts[1]);
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

function updateMetaCache($url, $track) {
    $cache = file_exists(META_CACHE_FILE) ? json_decode(file_get_contents(META_CACHE_FILE), true) : [];
    if (count($cache) > 300) $cache = array_slice($cache, -100, 100, true);
    
    $img = $track['ogImage'] ?? $track['coverUri'] ?? $track['image'] ?? null;
    if ($img && strpos($img, '%%') !== false) $img = 'https://' . str_replace('%%', '200x200', $img);
    
    $artist = isset($track['artists'][0]['name']) ? $track['artists'][0]['name'] : ($track['artist'] ?? 'Unknown');
    $title = $track['title'] ?? 'Unknown';
    
    $formatted = [
        'title' => $title,
        'artist' => $artist,
        'id' => (string)$track['id'],
        'image' => $img,
        'isYandex' => true,
        'time' => isset($track['durationMs']) ? $track['durationMs']/1000 : ($track['time'] ?? 0)
    ];
    
    $cache[md5($url)] = $formatted;
    if (isset($track['id'])) $cache[$track['id']] = $formatted;
    file_put_contents(META_CACHE_FILE, json_encode($cache));
}

function isYandexFile($file) {
    return strpos($file, 'yandex.net') !== false || strpos($file, 'get-mp3') !== false || strpos($file, 'yandex:') === 0;
}

logMsg("Daemon Started (Mode: Load +1)");

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
                logMsg("API Connected");
            } catch (Exception $e) { $api = null; }
        }
    }

    $state = getState();

    if ($api && $state && !empty($state['active'])) {
        $status = getMpdStatus();
        $currentFile = $status['file'] ?? '';
        $stateStr = $status['state'] ?? 'stop';

        if ($stateStr === 'play' && !empty($currentFile) && !isYandexFile($currentFile)) {
            logMsg("External track detected. Sleeping.");
            $state['active'] = false;
            saveState($state);
            sleep(2);
            continue;
        }

        $playlistLen = intval($status['playlistlength'] ?? 0);
        $currentPos = intval($status['song'] ?? -1);
        $tracksAhead = $playlistLen - ($currentPos + 1);

        if ($tracksAhead < 3) {
            $buffer = $state['queue_buffer'] ?? [];
            
            if (empty($buffer) && ($state['mode'] ?? '') === 'station') {
                $stationId = $state['station_id'] ?? 'user:onetwo';
                $params = $state['station_params'] ?? [];
                $history = $state['played_history'] ?? [];
                
                logMsg("Refilling buffer: $stationId " . json_encode($params));
                
                $newTracks = $api->getStationTracksV2($stationId, $history, $params);
                
                if (!empty($newTracks)) {
                    foreach ($newTracks as $nt) {
                        if (!in_array((string)$nt['id'], $history)) {
                            $buffer[] = $nt;
                        }
                    }
                    $state['queue_buffer'] = $buffer;
                    saveState($state);
                }
            }

            if (!empty($buffer)) {
                $nextTrack = array_shift($buffer);
                $url = $api->getDirectLink($nextTrack['id']);
                
                if ($url) {
                    updateMetaCache($url, $nextTrack);
                    mpdSend("add \"$url\"");
                    
                    if (($state['mode'] ?? '') === 'station') {
                        $history = $state['played_history'] ?? [];
                        $history[] = (string)$nextTrack['id'];
                        if (count($history) > 150) $history = array_slice($history, -100);
                        $state['played_history'] = $history;
                    }
                    
                    $state['queue_buffer'] = $buffer;
                    saveState($state);
                    logMsg("Added: " . ($nextTrack['title'] ?? 'Unknown'));
                } else {
                    $state['queue_buffer'] = $buffer;
                    saveState($state);
                }
            }
        }
    }
    sleep($pollInterval);
}
?>
