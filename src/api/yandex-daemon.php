<?php
define('INC', '/var/www/inc');
require_once INC . '/yandex-music.php';

define('STORAGE_DIR', '/dev/shm/yandex_music/');
define('TRACKS_DIR', STORAGE_DIR . 'tracks/');
define('STATE_FILE', STORAGE_DIR . 'state.json');
define('META_CACHE_FILE', STORAGE_DIR . 'meta_cache.json');
define('TOKEN_FILE', '/var/local/www/yandex_token.dat');
define('LOG_FILE', '/dev/shm/wave_daemon.log');
define('MAX_CACHED_FILES', 12);

if (!is_dir(STORAGE_DIR)) @mkdir(STORAGE_DIR, 0777, true);
if (!is_dir(TRACKS_DIR)) @mkdir(TRACKS_DIR, 0777, true);

$pollInterval = 2;

function logMsg($msg) {
    // Rotate log if > 500KB
    if (file_exists(LOG_FILE) && filesize(LOG_FILE) > 512000) {
        $lines = file(LOG_FILE);
        file_put_contents(LOG_FILE, implode('', array_slice($lines, -200)));
    }
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

/**
 * Download MP3 from Yandex CDN to RAM (/dev/shm).
 * Returns local file path on success, null on failure.
 */
function downloadTrack($url, $trackId, $codec = 'mp3') {
    $ext = $codec === 'aac' ? 'aac' : ($codec === 'flac' ? 'flac' : 'mp3');
    $localPath = TRACKS_DIR . $trackId . '.' . $ext;

    // Already cached
    if (file_exists($localPath) && filesize($localPath) > 0) {
        return $localPath;
    }

    $ch = curl_init($url);
    $fp = fopen($localPath, 'w');
    if (!$fp) return null;

    curl_setopt_array($ch, [
        CURLOPT_FILE => $fp,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_FAILONERROR => true,
        CURLOPT_USERAGENT => 'Yandex-Music-API',
    ]);

    $ok = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    fclose($fp);

    if (!$ok || $httpCode !== 200 || filesize($localPath) === 0) {
        @unlink($localPath);
        return null;
    }

    return $localPath;
}

/**
 * Get set of track files currently in MPD queue.
 */
function getMpdQueueFiles() {
    $raw = mpdSend("playlistinfo");
    $files = [];
    foreach (explode("\n", $raw) as $line) {
        if (strpos($line, 'file: ') === 0) {
            $files[] = trim(substr($line, 6));
        }
    }
    return $files;
}

/**
 * Remove cached MP3 files that are no longer in the MPD queue.
 * Keeps files within MAX_CACHED_FILES limit.
 */
function cleanupCachedTracks() {
    $queueFiles = getMpdQueueFiles();

    // Collect local paths that are still referenced by MPD
    $activeFiles = [];
    foreach ($queueFiles as $f) {
        if (strpos($f, TRACKS_DIR) === 0 || strpos($f, 'file://' . TRACKS_DIR) === 0) {
            $activeFiles[] = str_replace('file://', '', $f);
        }
    }

    $cached = glob(TRACKS_DIR . '*.*');
    if (!$cached) return;

    // Remove files not in MPD queue
    $removed = 0;
    foreach ($cached as $file) {
        if (!in_array($file, $activeFiles)) {
            @unlink($file);
            $removed++;
        }
    }

    // Safety net: if still over limit, remove oldest by mtime
    $cached = glob(TRACKS_DIR . '*.*');
    if ($cached && count($cached) > MAX_CACHED_FILES) {
        usort($cached, function($a, $b) {
            return filemtime($a) - filemtime($b);
        });
        while (count($cached) > MAX_CACHED_FILES) {
            @unlink(array_shift($cached));
            $removed++;
        }
    }

    if ($removed > 0) {
        logMsg("Cleanup: removed $removed cached files");
    }
}

/**
 * Wipe all cached tracks (used when daemon stops).
 */
function clearAllCachedTracks() {
    $files = glob(TRACKS_DIR . '*.*');
    if ($files) {
        foreach ($files as $f) @unlink($f);
        logMsg("Cleared all cached tracks");
    }
}

/**
 * Check if a file path belongs to Yandex (remote URL or local cache).
 */
function isYandexFile($file) {
    return strpos($file, 'yandex') !== false
        || strpos($file, 'get-mp3') !== false
        || strpos($file, TRACKS_DIR) === 0;
}

logMsg("Daemon Started");

$api = null;
$lastToken = "";
$lastPlayingTrackId = null;
$trackStartTime = null;

while (true) {
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

    if ($api && !empty($state['active'])) {
        $mpdStatus = getMpdStatus();

        // Pause daemon if a non-Yandex track is playing (user switched to local)
        $currentFile = $mpdStatus['file'] ?? '';
        $stateStr = $mpdStatus['state'] ?? 'stop';

        if ($stateStr === 'play' && !empty($currentFile) && !isYandexFile($currentFile)) {
            $state['active'] = false;
            saveState($state);
            clearAllCachedTracks();
            $lastPlayingTrackId = null;
            $trackStartTime = null;
            logMsg("External track detected. Daemon paused.");
            sleep(2);
            continue;
        }

        // Send feedback to Yandex when track changes
        if ($stateStr === 'play' && ($state['mode'] ?? '') === 'station') {
            $stationId = $state['station_id'] ?? 'user:onyourwave';
            $batchId = $state['batch_id'] ?? null;

            // Resolve current track ID from meta cache
            $currentTrackId = null;
            if (!empty($currentFile) && file_exists(META_CACHE_FILE)) {
                $metaCache = json_decode(file_get_contents(META_CACHE_FILE), true) ?: [];
                $filePath = str_replace('file://', '', $currentFile);
                $key = md5($filePath);
                if (isset($metaCache[$key]['id'])) {
                    $currentTrackId = $metaCache[$key]['id'];
                } elseif (isset($metaCache[$filePath]['id'])) {
                    $currentTrackId = $metaCache[$filePath]['id'];
                }
            }

            if ($currentTrackId && $currentTrackId !== $lastPlayingTrackId) {
                // Send trackFinished for previous track
                if ($lastPlayingTrackId && $trackStartTime) {
                    $playedSeconds = time() - $trackStartTime;
                    try {
                        $api->sendFeedback($stationId, 'trackFinished', $lastPlayingTrackId, $batchId, $playedSeconds);
                    } catch (Exception $e) {
                        logMsg("Feedback trackFinished error: " . $e->getMessage());
                    }
                }

                // Send trackStarted for new track
                try {
                    $api->sendFeedback($stationId, 'trackStarted', $currentTrackId, $batchId);
                } catch (Exception $e) {
                    logMsg("Feedback trackStarted error: " . $e->getMessage());
                }

                $lastPlayingTrackId = $currentTrackId;
                $trackStartTime = time();
            }
        }

        $playlistLen = intval($mpdStatus['playlistlength'] ?? 0);
        $currentPos = intval($mpdStatus['song'] ?? -1);

        // When MPD is stopped/idle, 'song' may be absent (-1).
        // In that case tracksAhead = the entire playlist (all unplayed).
        if ($currentPos === -1) {
            $tracksAhead = ($stateStr === 'stop' || $stateStr === 'pause') ? 0 : $playlistLen;
        } else {
            $tracksAhead = $playlistLen - ($currentPos + 1);
        }

        // Remove old tracks, keep 5 behind current position
        $KEEP_BEHIND = 5;
        if ($currentPos > $KEEP_BEHIND) {
            $toDelete = $currentPos - $KEEP_BEHIND;
            for ($i = 0; $i < $toDelete; $i++) {
                mpdSend("delete 0");
            }
            logMsg("Cleaned $toDelete old tracks from queue");

            // Clean up cached files that were removed from queue
            cleanupCachedTracks();

            $mpdStatus = getMpdStatus();
            $playlistLen = intval($mpdStatus['playlistlength'] ?? 0);
            $currentPos = intval($mpdStatus['song'] ?? -1);
            $tracksAhead = $playlistLen - ($currentPos + 1);
        }

        if ($tracksAhead < 5) {
            $buffer = $state['queue_buffer'] ?? [];

            // Fetch new tracks from station if buffer is empty
            if (empty($buffer) && ($state['mode'] ?? '') === 'station') {
                $stationId = $state['station_id'] ?? 'user:onyourwave';
                $history = $state['played_history'] ?? [];
                $params = $state['station_params'] ?? [];

                logMsg("Refilling radio: $stationId Params: " . json_encode($params));

                try {
                    $result = $api->getStationTracks($stationId, $history, $params);
                    $newTracks = $result['tracks'];
                    $batchId = $result['batchId'];

                    if (!empty($newTracks)) {
                        $newBuffer = [];
                        foreach ($newTracks as $nt) {
                            if (!in_array((string)$nt['id'], $history)) {
                                $newBuffer[] = $nt;
                            }
                        }
                        // Fallback: if all tracks filtered by history, use them anyway
                        if (empty($newBuffer)) {
                            logMsg("All station tracks in history, ignoring filter");
                            $newBuffer = $newTracks;
                        }
                        // Re-read state to avoid overwriting concurrent changes
                        $state = getState();
                        if (empty($state['active'])) {
                             continue;
                        }
                        $state['queue_buffer'] = $newBuffer;
                        if ($batchId) {
                            $state['batch_id'] = $batchId;
                        }
                        saveState($state);
                        $buffer = $newBuffer;
                        logMsg("Buffer refilled with " . count($newBuffer) . " tracks (batchId=$batchId)");
                    } else {
                        logMsg("Station returned empty tracks");
                    }
                } catch (Exception $e) {
                    logMsg("Fetch Error: " . $e->getMessage());
                }
            }

            // Cap buffer to avoid unbounded memory growth on Pi
            if (count($buffer) > 300) {
                $buffer = array_slice($buffer, 0, 300);
                $state['queue_buffer'] = $buffer;
                saveState($state);
            }

            // Add up to $batchSize tracks per iteration to keep ahead of playback
            $batchSize = ($tracksAhead <= 1) ? 3 : 1;
            $added = 0;
            $skipped = 0;
            $wasStopped = ($stateStr === 'stop');

            while (!empty($buffer) && $added < $batchSize) {
                $nextTrack = array_shift($buffer);

                try {
                    // Verify daemon is still active before expensive operations
                    $checkState = getState();
                    if (empty($checkState['active'])) {
                        logMsg("Daemon stopped abruptly. Aborting add.");
                        break;
                    }

                    $linkInfo = $api->getDirectLinkInfo($nextTrack['id']);
                    $url = $linkInfo ? $linkInfo['url'] : null;
                    $codec = $linkInfo ? ($linkInfo['codec'] ?? 'mp3') : 'mp3';

                    if ($url) {
                        updateMetaCache($url, $nextTrack);

                        $checkState = getState();
                        if (empty($checkState['active'])) {
                            logMsg("Daemon stopped before download. Aborting.");
                            break;
                        }

                        // Download track to RAM, fall back to remote URL on failure
                        $localPath = downloadTrack($url, $nextTrack['id'], $codec);
                        if ($localPath) {
                            // Also cache meta under local path for client lookup
                            updateMetaCache($localPath, $nextTrack);
                            mpdSend('add "file://' . $localPath . '"');
                            logMsg("Added (cached): " . $nextTrack['title']);
                        } else {
                            mpdSend("add \"$url\"");
                            logMsg("Added (stream): " . $nextTrack['title']);
                        }

                        $added++;
                        if (!isset($state['played_history'])) $state['played_history'] = [];
                        $state['played_history'][] = (string)$nextTrack['id'];
                        if (count($state['played_history']) > 150) {
                            $state['played_history'] = array_slice($state['played_history'], -100);
                        }
                    } else {
                        logMsg("Failed URL for: " . ($nextTrack['title'] ?? $nextTrack['id']) . " — skipping");
                        $skipped++;
                    }
                } catch (Exception $e) {
                    logMsg("Link Error: " . $e->getMessage() . " — skipping track");
                    $skipped++;
                }
            }

            // Always persist buffer when tracks were consumed (added or skipped)
            if ($added > 0 || $skipped > 0) {
                $currentState = getState();
                if (!empty($currentState['active'])) {
                    $currentState['queue_buffer'] = $buffer;
                    $currentState['played_history'] = $state['played_history'] ?? ($currentState['played_history'] ?? []);
                    saveState($currentState);
                }
            }

            // Resume playback if MPD was stopped (end of queue) and we just added tracks
            if ($added > 0 && $wasStopped) {
                mpdSend("play");
                logMsg("Resumed playback after queue refill");
            }
        }
    } else {
        // Daemon inactive — clean up any leftover cached tracks
        $cached = glob(TRACKS_DIR . '*.*');
        if ($cached && count($cached) > 0) {
            clearAllCachedTracks();
        }
    }

    sleep($pollInterval);
}
?>
