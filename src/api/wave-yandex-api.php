<?php
// /var/www/wave-yandex-api.php

ini_set('display_errors', 0);
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

define('INC', '/var/www/inc');
require_once INC . '/common.php';
require_once INC . '/yandex-music.php';

// Файлы
define('TOKEN_FILE', '/var/local/www/yandex_token.dat');
define('STATE_FILE', '/dev/shm/yandex_state.json');
define('META_CACHE_FILE', '/dev/shm/yandex_meta_cache.json');

$action = $_REQUEST['action'] ?? '';

// --- Хелперы ---
function getToken() {
    if (file_exists(TOKEN_FILE)) {
        return trim(file_get_contents(TOKEN_FILE));
    }
    return null;
}

function saveState($data) {
    file_put_contents(STATE_FILE, json_encode($data));
}

try {
    // --- 1. ПРОВЕРКА СТАТУСА (Без токена) ---
    if ($action === 'status') {
        $token = getToken();
        if (!$token) {
            echo json_encode(['authorized' => false, 'message' => 'No token']);
            exit;
        }
        
        // Проверяем валидность токена запросом к Яндексу
        try {
            $api = new YandexMusic($token);
            $uid = $api->getUserId();
            echo json_encode(['authorized' => true, 'uid' => $uid]);
        } catch (Exception $e) {
            // Токен есть, но он протух
            echo json_encode(['authorized' => false, 'message' => 'Invalid token']);
        }
        exit;
    }

    // --- 2. СОХРАНЕНИЕ ТОКЕНА (С клиента) ---
    if ($action === 'save_token') {
        $input = json_decode(file_get_contents('php://input'), true);
        $newToken = $input['token'] ?? null;

        if (!$newToken) throw new Exception("Token is empty");

        // Проверяем токен перед сохранением
        try {
            $api = new YandexMusic($newToken);
            $uid = $api->getUserId(); // Если упадет - токен плохой
            
            // Сохраняем
            if (!is_dir(dirname(TOKEN_FILE))) mkdir(dirname(TOKEN_FILE), 0755, true);
            file_put_contents(TOKEN_FILE, $newToken);
            chmod(TOKEN_FILE, 0600); // Безопасность: читать может только владелец (www-data)
            
            echo json_encode(['status' => 'ok', 'uid' => $uid]);
        } catch (Exception $e) {
            http_response_code(401);
            echo json_encode(['error' => 'Invalid token provided']);
        }
        exit;
    }

    // --- 3. ОСТАЛЬНЫЕ ДЕЙСТВИЯ (Требуют токен) ---
    
    $token = getToken();
    if (!$token) throw new Exception("Server not authorized via Yandex");
    
    $api = new YandexMusic($token);

    switch ($action) {
        case 'play_station':
            $stationId = $_REQUEST['station'] ?? 'user:onetwo';
            exec("mpc clear");
            saveState([
                'active' => true,
                'mode' => 'station',
                'station_id' => $stationId,
                'queue_buffer' => []
            ]);
            // Пингуем демона (через файл или просто ждем крон/цикл)
            // Демон сам увидит обновление STATE_FILE и начнет играть
            echo json_encode(['status' => 'started']);
            break;

        case 'like':
            $trackId = $_REQUEST['track_id'];
            $api->toggleLike($trackId, true);
            echo json_encode(['status' => 'liked']);
            break;

        case 'dislike':
            $trackId = $_REQUEST['track_id'];
            $api->toggleLike($trackId, false);
            exec("mpc next");
            echo json_encode(['status' => 'disliked']);
            break;

        case 'search':
            $q = $_GET['query'];
            $res = $api->search($q);
            echo json_encode($res['result']);
            break;
            
        case 'get_meta':
            $url = $_GET['url'];
            $urlHash = md5($url);
            $cache = file_exists(META_CACHE_FILE) ? json_decode(file_get_contents(META_CACHE_FILE), true) : [];
            echo json_encode($cache[$urlHash] ?? null);
            break;

        default:
            echo json_encode(['error' => 'Unknown action']);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
