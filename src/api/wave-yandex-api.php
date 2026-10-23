<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 dmitrymake
// Trusted-LAN endpoint, like moOde's APIs. The SDK, token and queue state live in
// the loopback Python bridge; PHP never reads credentials or writes daemon state.
ini_set('display_errors', 0);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function failYandexRequest($code, $message) {
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
        failYandexRequest(403, 'Cross-origin requests are not allowed');
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
if (!in_array($method, ['GET', 'POST'], true)) failYandexRequest(405, 'Use GET or POST');

$action = $_GET['action'] ?? '';
$readActions = ['status', 'search', 'get_landing', 'get_stations_dashboard', 'get_playlists',
                'get_playlist_tracks', 'get_artist_details', 'get_album_details', 'get_favorites_ids',
                'get_meta', 'get_state'];
$postActions = ['save_token', 'play_playlist', 'add_tracks', 'feedback_skip', 'batch_get_meta', 'prepare_track'];
// GET controls are retained for compatibility with already-installed frontends.
$controlActions = ['play_station', 'play_track', 'stop_daemon', 'like', 'dislike'];
if ($action === 'debug_dump') failYandexRequest(403, 'debug_dump disabled');
if (!is_string($action) || !in_array($action, array_merge($readActions, $postActions, $controlActions), true)) {
    failYandexRequest(400, 'Unknown Yandex Music action');
}
if (in_array($action, $postActions, true) && $method !== 'POST') {
    failYandexRequest(405, 'This action requires POST');
}
if ($method === 'POST') {
    $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
    if ($contentType !== 'application/json') failYandexRequest(415, 'Use application/json');
    $body = file_get_contents('php://input', false, null, 0, 2097153);
    if (strlen($body) > 2097152) failYandexRequest(413, 'Request is too large');
    $params = json_decode($body);
    if (!is_object($params)) failYandexRequest(400, 'Invalid JSON object');
} else {
    $params = $_GET;
    unset($params['action']);
    $params = (object)$params;
}

if (!function_exists('curl_init')) failYandexRequest(503, 'Install php-curl on the moOde device');
$curl = curl_init('http://127.0.0.1:8767/api');
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
if ($result === false || !$code) failYandexRequest(503, 'Yandex Music bridge is not running; update the moOde installation');
if (json_decode($result) === null && trim($result) !== 'null') failYandexRequest(502, 'Invalid Yandex Music response');
http_response_code($code);
echo $result;
