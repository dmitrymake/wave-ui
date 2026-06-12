<?php
define('INC', '/var/www/inc');

define('STORAGE_DIR', '/dev/shm/yandex_music/');
define('TRACKS_DIR', STORAGE_DIR . 'tracks/');
define('STATE_FILE', STORAGE_DIR . 'state.json');
define('META_CACHE_FILE', STORAGE_DIR . 'meta_cache.json');
define('TOKEN_FILE', '/var/local/www/yandex_token.dat');
define('LOG_FILE', '/dev/shm/wave_daemon.log');
define('MAX_CACHED_FILES', 8);

require_once INC . '/yandex-music.php';
require_once INC . '/yandex-cache.php';

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

// Escape a stream URL before sending it in an MPD `add "..."` command. CR/LF would
// be treated as command separators and " as a quote terminator, so a crafted CDN
// URL (built from Yandex XML regex captures) could otherwise inject MPD commands.
function mpdAdd($url) {
    $safe = str_replace(["\r", "\n"], '', (string)$url);
    $safe = str_replace(['\\', '"'], ['\\\\', '\\"'], $safe);
    return mpdSend('add "' . $safe . '"');
}

/**
 * Add a local file to MPD via its Unix socket. MPD forbids adding local files
 * over TCP ("Access to local files via TCP is not allowed") but allows it over a
 * local socket. Returns true on OK, false on ACK / no socket — so the caller can
 * fall back to streaming the CDN URL over TCP (e.g. if moOde regenerated
 * mpd.conf without the socket line).
 */
function mpdAddLocalSocket($path) {
    $fp = @fsockopen("unix:///run/mpd/socket", 0, $errno, $errstr, 3);
    if (!$fp) return false;
    fgets($fp); // greeting
    fwrite($fp, 'add "file://' . $path . "\"\n");
    $ok = false;
    while (!feof($fp)) {
        $line = fgets($fp);
        if (strpos($line, 'OK') === 0) { $ok = true; break; }
        if (strpos($line, 'ACK') === 0) { break; }
    }
    fclose($fp);
    return $ok;
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

/**
 * Atomically read-modify-write the daemon state under a single exclusive lock,
 * closing the race window between a separate getState()/saveState() pair. $mutate
 * receives the FRESHEST state and returns the new state, or null to skip the write
 * (e.g. when a concurrent API call has already flipped 'active' off). No blocking
 * I/O may run inside $mutate — it executes while the lock is held.
 */
function updateState(callable $mutate) {
    $fp = fopen(STATE_FILE, 'c+');
    if (!$fp) return;
    if (flock($fp, LOCK_EX)) {
        $json = stream_get_contents($fp);
        $state = json_decode($json, true) ?: [];
        $new = $mutate($state);
        if ($new !== null) {
            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, json_encode($new));
            fflush($fp);
        }
        flock($fp, LOCK_UN);
    }
    fclose($fp);
}

function updateMetaCache($url, $track, $localPath = null) {
    storeTrackMeta($track, $url, $localPath);
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

    // Download to a per-process temp file and atomically rename into place only after
    // verifying the response, so the cached-file check never sees a truncated/partial
    // file (concurrent daemons or re-entrant calls would otherwise race on $localPath).
    $tmpPath = $localPath . '.tmp.' . getmypid();
    $ch = curl_init($url);
    $fp = fopen($tmpPath, 'w');
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

    if (!$ok || $httpCode !== 200 || !file_exists($tmpPath) || filesize($tmpPath) === 0) {
        @unlink($tmpPath);
        return null;
    }

    if (!@rename($tmpPath, $localPath)) {
        @unlink($tmpPath);
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

/**
 * De-duplicate a fresh batch of station tracks against the play history. Falls back
 * to "not among the most recent 30 plays", then to the raw batch, so playback never
 * stalls when the entire history filters everything out.
 */
function filterByHistory($newTracks, $history) {
    $buffer = [];
    $seen = [];
    foreach ($newTracks as $nt) {
        $tid = (string)$nt['id'];
        if (isset($seen[$tid])) continue;          // de-dup within this batch
        if (!in_array($tid, $history)) {
            $seen[$tid] = true;
            $buffer[] = $nt;
        }
    }
    if (!empty($buffer)) return $buffer;

    // Soft fallback: allow tracks that are NOT among the most recent plays.
    $recent = array_slice($history, -30);
    foreach ($newTracks as $nt) {
        $tid = (string)$nt['id'];
        if (isset($seen[$tid])) continue;
        if (!in_array($tid, $recent)) {
            $seen[$tid] = true;
            $buffer[] = $nt;
        }
    }
    if (!empty($buffer)) {
        logMsg("History soft-fallback: " . count($buffer) . " not-recent tracks");
        return $buffer;
    }

    logMsg("All station tracks recently played; accepting batch as-is");
    return $newTracks;
}

// Singleton guard: a second daemon instance would double-add tracks and race on
// state.json / MPD mutations. Hold an exclusive lock for the process lifetime.
$daemonLock = fopen('/dev/shm/wave_daemon.lock', 'c');
if (!$daemonLock || !flock($daemonLock, LOCK_EX | LOCK_NB)) {
    logMsg("Another daemon instance is already running; exiting.");
    exit(0);
}

logMsg("Daemon Started");

@unlink('/dev/shm/wave_yandex_state.json');

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
            if (!empty($currentFile)) {
                $metaCache = readMetaCache();
                $meta = lookupMeta($metaCache, $currentFile);
                if ($meta && !empty($meta['id'])) {
                    $currentTrackId = $meta['id'];
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

        // Remove old tracks, keep 3 behind current position (for instant "previous")
        $KEEP_BEHIND = 3;
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

        if ($tracksAhead < 3) {
            $buffer = $state['queue_buffer'] ?? [];

            // Fetch new tracks from station if buffer is empty
            if (empty($buffer) && ($state['mode'] ?? '') === 'station') {
                $stationId = $state['station_id'] ?? 'user:onyourwave';
                $history = $state['played_history'] ?? [];
                $settings = $state['station_settings'] ?? null;

                logMsg("Refilling radio: $stationId settings=" . json_encode($settings) . " historyCount=" . count($history));

                try {
                    // Re-apply settings on every refill (rotor remembers per-session)
                    if ($settings !== null) {
                        try {
                            $api->setStationSettings($stationId, $settings);
                        } catch (Exception $e) {
                            logMsg("setStationSettings failed: " . $e->getMessage());
                        }
                    }

                    $result = $api->getStationTracks($stationId, $history);
                    $newTracks = $result['tracks'];
                    $batchId = $result['batchId'];

                    if (!empty($newTracks)) {
                        $newBuffer = filterByHistory($newTracks, $history);
                        // Atomically write the refilled buffer; skip if a concurrent
                        // API call has deactivated the daemon meanwhile.
                        $applied = false;
                        updateState(function($s) use ($newBuffer, $batchId, &$applied) {
                            if (empty($s['active'])) return null;
                            $s['queue_buffer'] = $newBuffer;
                            if ($batchId) $s['batch_id'] = $batchId;
                            $applied = true;
                            return $s;
                        });
                        if (!$applied) continue;
                        $state = getState();
                        $buffer = $newBuffer;
                        logMsg("Buffer refilled with " . count($newBuffer) . " tracks (batchId=$batchId)");
                    } else {
                        logMsg("Station returned empty tracks");
                    }
                } catch (Exception $e) {
                    logMsg("Fetch Error: " . $e->getMessage());
                }
            }

            // Page the next chunk of a static source (favorites / playlist) when
            // the buffer runs dry — mirrors the station refill so "Play All" can
            // continue past the initially-sent page (e.g. 851 favorites).
            if (empty($buffer) && ($state['mode'] ?? '') === 'static' && !empty($state['static_source'])) {
                $src = $state['static_source'];
                $skind = $src['kind'] ?? '';
                $suid = $src['uid'] ?? '';
                $soffset = intval($src['offset'] ?? 0);
                logMsg("Paging static source: kind=$skind offset=$soffset");
                try {
                    $total = -1;
                    if ($skind === 'favorites') {
                        $ids = $api->getFavoritesIds();
                        $total = count($ids);
                        $slice = array_slice($ids, $soffset, 50);
                        $window = count($slice);
                        $page = $window ? $api->getTracksByIds($slice) : [];
                    } else {
                        $page = $api->getPlaylistTracks($suid, $skind, $soffset);
                        $window = 50;
                    }
                    $page = array_values(array_filter($page));
                    $state = getState();
                    if (empty($state['active'])) continue;
                    if (!empty($page)) {
                        $state['queue_buffer'] = $page;
                        $state['static_source']['offset'] = $soffset + $window;
                        saveState($state);
                        $buffer = $page;
                        logMsg("Static source paged: +" . count($page) . " tracks (next offset=" . ($soffset + $window) . ")");
                    } else {
                        // Empty page: only treat as the real end when we know the
                        // total and have passed it. An empty result before the end
                        // (or a failed favorites fetch → total 0) is a transient
                        // error — keep the source and retry on the next poll instead
                        // of killing playback continuation.
                        $atEnd = ($skind === 'favorites') ? ($total > 0 && $soffset >= $total) : true;
                        if ($atEnd) {
                            $state['static_source'] = null;
                            saveState($state);
                            logMsg("Static source exhausted at offset $soffset (total $total)");
                        } else {
                            logMsg("Static page empty at offset $soffset — transient, will retry");
                        }
                    }
                } catch (Exception $e) {
                    logMsg("Static paging error: " . $e->getMessage());
                }
            }

            // Cap buffer to avoid unbounded memory growth on Pi
            if (count($buffer) > 300) {
                $buffer = array_slice($buffer, 0, 300);
                $state['queue_buffer'] = $buffer;
                saveState($state);
            }

            // Add up to $batchSize tracks per iteration to keep ~3 ahead (downloaded)
            $batchSize = ($tracksAhead <= 1) ? 2 : 1;
            $added = 0;
            $skipped = 0;
            $deduped = 0;
            $wasStopped = ($stateStr === 'stop');

            // Track ids already in the MPD queue. A daemon restart re-reads
            // queue_buffer, and pages can overlap — without this guard the same
            // track gets appended twice and the queue fills with duplicates.
            $queueIds = [];
            $dedupCache = readMetaCache();
            foreach (getMpdQueueFiles() as $qf) {
                $qm = lookupMeta($dedupCache, $qf);
                if ($qm && !empty($qm['id'])) $queueIds[(string)$qm['id']] = true;
            }

            while (!empty($buffer) && $added < $batchSize) {
                $nextTrack = array_shift($buffer);
                $tid = (string)$nextTrack['id'];
                if (isset($queueIds[$tid])) { $deduped++; continue; }

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
                        // Prefetch to RAM and add the local file via the MPD socket so
                        // track switching is instant. MPD rejects local-file adds over
                        // TCP, so this needs the Unix socket. Fall back to streaming the
                        // CDN URL over TCP if the download fails or the socket is gone
                        // (e.g. moOde regenerated mpd.conf without the socket line).
                        $localPath = downloadTrack($url, $nextTrack['id'], $codec);
                        if ($localPath && mpdAddLocalSocket($localPath)) {
                            updateMetaCache($url, $nextTrack, $localPath);
                            logMsg("Added (RAM): " . $nextTrack['title']);
                        } else {
                            updateMetaCache($url, $nextTrack);
                            mpdAdd($url);
                            logMsg("Added (stream): " . $nextTrack['title']);
                        }
                        $queueIds[$tid] = true;

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

            // Always persist buffer when tracks were consumed (added, skipped or deduped).
            // Atomic read-check-write under one lock: a concurrent API call (stop_daemon
            // / add_tracks) that fired during the download window above is seen here, so a
            // stopped daemon is not resurrected by this write.
            if ($added > 0 || $skipped > 0 || $deduped > 0) {
                $newHistory = $state['played_history'] ?? null;
                updateState(function($s) use ($buffer, $newHistory) {
                    if (empty($s['active'])) return null;
                    $s['queue_buffer'] = $buffer;
                    $s['played_history'] = $newHistory ?? ($s['played_history'] ?? []);
                    return $s;
                });
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
