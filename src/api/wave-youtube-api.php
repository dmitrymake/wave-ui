<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 dmitrymake
// Like the moOde APIs, this endpoint is for a trusted LAN. Credentials live
// outside the web root; only this proxy can forward browser requests to the bridge.
ini_set('display_errors', 0);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function failYoutubeRequest($code, $message) {
    http_response_code($code);
    echo json_encode(['error' => $message]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin) {
    $originHost = parse_url($origin, PHP_URL_HOST);
    $requestHost = parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST);
    if (!$originHost || strcasecmp($originHost, $requestHost) !== 0) {
        failYoutubeRequest(403, 'Cross-origin requests are not allowed');
    }
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}
if (!in_array($method, ['GET', 'POST'], true)) failYoutubeRequest(405, 'Use GET or POST');

$action = $_GET['action'] ?? '';
$readActions = ['status', 'get_settings', 'search', 'get_home', 'get_playlists', 'get_playlist',
                'get_album', 'get_artist', 'get_radio', 'get_lyrics', 'get_meta', 'get_favorites_ids'];
$postActions = ['save_auth', 'disconnect', 'save_settings', 'rate_song', 'batch_get_meta', 'prepare_track'];
if (!is_string($action) || !in_array($action, array_merge($readActions, $postActions), true)) {
    failYoutubeRequest(400, 'Unknown YouTube Music action');
}
if (in_array($action, $postActions, true) && $method !== 'POST') {
    failYoutubeRequest(405, 'This action requires POST');
}
if ($method === 'POST') {
    $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
    if ($contentType !== 'application/json') failYoutubeRequest(415, 'Use application/json');
    $body = file_get_contents('php://input', false, null, 0, 131073);
    if (strlen($body) > 131072) failYoutubeRequest(413, 'Request is too large');
    $params = json_decode($body);
    if (!is_object($params)) failYoutubeRequest(400, 'Invalid JSON object');
} else {
    $params = $_GET;
    unset($params['action']);
    $params = (object)$params;
}

if (!function_exists('curl_init')) failYoutubeRequest(503, 'Install php-curl on the moOde device');
$curl = curl_init('http://127.0.0.1:8766/api');
curl_setopt_array($curl, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode(['action' => $action, 'params' => $params, 'method' => $method]),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Wave-Proxy: 1'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 3,
    CURLOPT_TIMEOUT => 85,
]);
$result = curl_exec($curl);
$code = curl_getinfo($curl, CURLINFO_HTTP_CODE);
curl_close($curl);
if ($result === false || !$code) failYoutubeRequest(503, 'YouTube Music bridge is not running; update the moOde installation');
if (json_decode($result) === null) failYoutubeRequest(502, 'Invalid YouTube Music response');
http_response_code($code);
echo $result;
