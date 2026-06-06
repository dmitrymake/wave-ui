<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake

if (!defined('META_CACHE_FILE')) {
    define('META_CACHE_FILE', '/dev/shm/yandex_music/meta_cache.json');
}
if (!defined('MAX_CACHE_BYTES')) {
    define('MAX_CACHE_BYTES', 5 * 1024 * 1024);
    define('EVICT_TARGET_BYTES', 3 * 1024 * 1024);
}

function normalizeYandexKey($input) {
    if ($input === null) return '';
    $s = (string)$input;
    if (strpos($s, 'file://') === 0) $s = substr($s, 7);
    return trim($s);
}

function trackIdFromUrl($input) {
    if (!$input) return null;
    $s = (string)$input;
    if (preg_match('/^yandex:(\d+)$/', $s, $m)) return $m[1];
    if (ctype_digit($s)) return $s;
    if (preg_match('#/tracks/(\d+)\.\w+#', $s, $m)) return $m[1];
    if (preg_match('#/tracks/(\d+)(?:/|$|\?)#', $s, $m)) return $m[1];
    if (preg_match('/[?&](?:track-id|id)=(\d+)/', $s, $m)) return $m[1];
    return null;
}

function lookupMeta(array $cache, $input) {
    $n = normalizeYandexKey($input);
    if ($n === '') return null;

    if (isset($cache[md5($n)])) return $cache[md5($n)];

    if (strpos($n, 'yandex:') === 0) {
        $id = substr($n, 7);
        if (isset($cache[$id])) return $cache[$id];
    }

    if (ctype_digit($n) && isset($cache[$n])) return $cache[$n];

    $id = trackIdFromUrl($n);
    if ($id && isset($cache[$id])) return $cache[$id];

    return null;
}

function readMetaCache() {
    if (!file_exists(META_CACHE_FILE)) return [];
    $json = @file_get_contents(META_CACHE_FILE);
    if (!$json) return [];
    $d = json_decode($json, true);
    return is_array($d) ? $d : [];
}

function writeMetaCache(array $cache) {
    $dir = dirname(META_CACHE_FILE);
    if (!is_dir($dir)) @mkdir($dir, 0777, true);
    $fp = @fopen(META_CACHE_FILE, 'c+');
    if (!$fp) return false;
    $ok = false;
    if (flock($fp, LOCK_EX)) {
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($cache, JSON_UNESCAPED_UNICODE));
        fflush($fp);
        flock($fp, LOCK_UN);
        $ok = true;
    }
    fclose($fp);
    return $ok;
}

function evictMetaCacheIfLarge(array &$cache) {
    $encoded = json_encode($cache);
    if (strlen($encoded) <= MAX_CACHE_BYTES) return;

    $entries = [];
    foreach ($cache as $k => $v) {
        $at = (is_array($v) && isset($v['_atime'])) ? (int)$v['_atime'] : 0;
        $entries[] = ['k' => $k, 'at' => $at];
    }
    usort($entries, function($a, $b) { return $a['at'] - $b['at']; });

    foreach ($entries as $e) {
        unset($cache[$e['k']]);
        if (strlen(json_encode($cache)) <= EVICT_TARGET_BYTES) break;
    }
}

/**
 * Store a track under four keys so lookup succeeds regardless of what the
 * caller has: normalized URL md5, normalized localPath md5 (if provided),
 * bare track id, and "yandex:{id}" short form.
 */
function storeTrackMeta(array $track, $primaryUrl = null, $localPath = null) {
    if (!is_array($track) || empty($track['id'])) return;
    $track['_atime'] = time();
    $id = (string)$track['id'];

    $fp = @fopen(META_CACHE_FILE, 'c+');
    if (!$fp) return;
    if (!flock($fp, LOCK_EX)) { fclose($fp); return; }

    $json = stream_get_contents($fp) ?: '';
    $cache = $json ? (json_decode($json, true) ?: []) : [];

    if ($primaryUrl !== null && $primaryUrl !== '') {
        $cache[md5(normalizeYandexKey($primaryUrl))] = $track;
    }
    if ($localPath !== null && $localPath !== '') {
        $cache[md5(normalizeYandexKey($localPath))] = $track;
    }
    $cache[$id] = $track;
    $cache['yandex:' . $id] = $track;

    evictMetaCacheIfLarge($cache);

    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($cache, JSON_UNESCAPED_UNICODE));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}

/**
 * Bump _atime on a cache hit so LRU keeps hot entries.
 * Only writes to disk if the bump delta is significant (>60s).
 */
function bumpMetaAccessTime($input) {
    $n = normalizeYandexKey($input);
    if ($n === '') return;

    $fp = @fopen(META_CACHE_FILE, 'c+');
    if (!$fp) return;
    if (!flock($fp, LOCK_EX)) { fclose($fp); return; }

    $json = stream_get_contents($fp) ?: '';
    $cache = $json ? (json_decode($json, true) ?: []) : [];

    $now = time();
    $modified = false;
    $keys = [];

    if (isset($cache[md5($n)])) $keys[] = md5($n);
    if (strpos($n, 'yandex:') === 0) {
        $id = substr($n, 7);
        if (isset($cache[$id])) $keys[] = $id;
        if (isset($cache['yandex:' . $id])) $keys[] = 'yandex:' . $id;
    }
    if (ctype_digit($n)) {
        if (isset($cache[$n])) $keys[] = $n;
        if (isset($cache['yandex:' . $n])) $keys[] = 'yandex:' . $n;
    }
    $extractedId = trackIdFromUrl($n);
    if ($extractedId) {
        if (isset($cache[$extractedId])) $keys[] = $extractedId;
        if (isset($cache['yandex:' . $extractedId])) $keys[] = 'yandex:' . $extractedId;
    }

    foreach (array_unique($keys) as $k) {
        $at = (int)($cache[$k]['_atime'] ?? 0);
        if ($now - $at > 60) {
            $cache[$k]['_atime'] = $now;
            $modified = true;
        }
    }

    if ($modified) {
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($cache, JSON_UNESCAPED_UNICODE));
        fflush($fp);
    }
    flock($fp, LOCK_UN);
    fclose($fp);
}
