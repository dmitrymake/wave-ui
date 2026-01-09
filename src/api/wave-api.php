<?php

ini_set('display_errors', 0);
error_reporting(E_ALL);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept-Language');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

define('INC', '/var/www/inc');
require_once INC . '/common.php';
require_once INC . '/sql.php';
require_once INC . '/mpd.php';
require_once INC . '/music-library.php';

// Файл будет храниться в оперативной памяти (/dev/shm)
// Это предотвращает износ SD-карты. Данные исчезают при перезагрузке.
define('RAM_STORE_FILE', '/dev/shm/wave_yandex_state.json');

session_start();

if (!isset($_SESSION['xss_detect'])) $_SESSION['xss_detect'] = 'off';
if (!isset($_SESSION['library_utf8rep'])) $_SESSION['library_utf8rep'] = 'Yes';
if (!isset($_SESSION['library_flatlist_filter'])) $_SESSION['library_flatlist_filter'] = 'full_lib';
if (!isset($_SESSION['library_misc_options'])) $_SESSION['library_misc_options'] = 'No,Album@Artist';

$action = isset($_REQUEST['action']) ? $_REQUEST['action'] : 'library';

if ($action !== 'yandex_proxy') {
    header('Content-Type: application/json');
}

try {
    // --- YANDEX STATE SHARING (RAM) START ---
    
    // Сохранить метаданные трека в RAM
    if ($action === 'set_yandex_meta') {
        $input = json_decode(file_get_contents('php://input'), true);
        $fileUrl = $input['url'] ?? '';
        $meta = $input['meta'] ?? null;

        if (!$fileUrl || !$meta) {
            throw new Exception("URL and Meta are required");
        }

        // Читаем текущее состояние из RAM
        $data = [];
        if (file_exists(RAM_STORE_FILE)) {
            $content = file_get_contents(RAM_STORE_FILE);
            if ($content) {
                $data = json_decode($content, true) ?: [];
            }
        }

        // Используем MD5 от URL как ключ, чтобы избежать проблем со спецсимволами
        $key = md5($fileUrl);
        $data[$key] = $meta;

        // Ограничиваем размер кэша (храним последние 100 треков), чтобы не забить RAM
        if (count($data) > 100) {
            // Удаляем старые (из начала массива)
            $data = array_slice($data, -100, 100, true);
        }

        file_put_contents(RAM_STORE_FILE, json_encode($data));
        echo json_encode(['status' => 'saved']);
        exit;
    }

    // Получить метаданные трека из RAM
    if ($action === 'get_yandex_meta') {
        $fileUrl = $_GET['url'] ?? '';
        
        if (!$fileUrl) {
            echo json_encode(null);
            exit;
        }

        if (!file_exists(RAM_STORE_FILE)) {
            echo json_encode(null);
            exit;
        }

        $content = file_get_contents(RAM_STORE_FILE);
        $data = json_decode($content, true) ?: [];
        $key = md5($fileUrl);

        if (isset($data[$key])) {
            echo json_encode($data[$key]);
        } else {
            echo json_encode(null);
        }
        exit;
    }
    // --- YANDEX STATE SHARING END ---


    // --- YANDEX PROXY START ---
    if ($action === 'yandex_proxy') {
        $path = $_GET['path'] ?? '';
        if (!$path) {
            header('Content-Type: application/json');
            throw new Exception("No path provided for proxy");
        }

        $is_storage = strpos($path, 'http') === 0;
        $url = $is_storage ? $path : "https://api.music.yandex.net" . $path;

        $ch = curl_init($url);
        
        $requestHeaders = [];

        // 1. Токен из заголовков Nginx
        $auth_token = null;
        if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
            $auth_token = $_SERVER['HTTP_AUTHORIZATION'];
        } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            $auth_token = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
        }
        
        // 2. Токен из GET (резерв)
        if (!$auth_token && isset($_GET['token'])) {
            $raw_token = $_GET['token'];
            if (strpos($raw_token, 'OAuth') === 0) {
                $auth_token = $raw_token;
            } else {
                $auth_token = "OAuth " . $raw_token;
            }
        }

        if ($auth_token) {
            $requestHeaders[] = "Authorization: $auth_token";
        }

        if (isset($_SERVER['HTTP_ACCEPT_LANGUAGE'])) {
            $requestHeaders[] = "Accept-Language: " . $_SERVER['HTTP_ACCEPT_LANGUAGE'];
        } else {
            $requestHeaders[] = "Accept-Language: ru";
        }

        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            curl_setopt($ch, CURLOPT_POST, 1);
            $postBody = file_get_contents('php://input');
            curl_setopt($ch, CURLOPT_POSTFIELDS, $postBody);
            $requestHeaders[] = 'Content-Type: application/x-www-form-urlencoded';
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $requestHeaders);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Yandex-Music-Client'); 

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $curlError = curl_error($ch);
        
        curl_close($ch);

        if ($curlError) {
            header('Content-Type: application/json');
            http_response_code(500);
            echo json_encode(["error" => "Proxy Curl Error: " . $curlError]);
            exit;
        }

        if ($contentType) {
            header("Content-Type: $contentType");
        }
        
        http_response_code($httpCode);
        echo $response;
        exit;
    }
    // --- YANDEX PROXY END ---

    if ($action === 'stations') {
        $dbh = sqlConnect();
        if (!$dbh) throw new Exception("Moode DB Error");
        $stations = sqlRead('cfg_radio', $dbh, 'all');
        echo json_encode(is_array($stations) ? $stations : []);
        
    } elseif ($action === 'get_time') {
        echo json_encode(['time' => date('H:i')]);

    } elseif ($action === 'set_alarm') {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            throw new Exception("POST required for setting alarm");
        }

        $enabled = ($_POST['enabled'] ?? '0') === '1';
        $timeStr = $_POST['time'] ?? '08:00';
        $playlist = $_POST['playlist'] ?? 'Favorites';

        $safePlaylist = str_replace('"', '\"', $playlist); 
        $cronId = "# WAVE_UI_ALARM";

        $currentCron = shell_exec('crontab -l 2>/dev/null');
        if (!$currentCron) $currentCron = "";

        $lines = explode("\n", $currentCron);
        $newLines = [];
        foreach ($lines as $line) {
            if (trim($line) && strpos($line, $cronId) === false) {
                $newLines[] = $line;
            }
        }

        if ($enabled) {
            $parts = explode(':', $timeStr);
            $hour = intval($parts[0]);
            $min = intval($parts[1]);
            $cmd = "/usr/bin/mpc clear && /usr/bin/mpc volume 70 && /usr/bin/mpc load \"$safePlaylist\" && /usr/bin/mpc play";
            $cronLine = "$min $hour * * * $cmd $cronId";
            $newLines[] = $cronLine;
        }

        $newCronContent = implode("\n", $newLines) . "\n";
        
        $descriptorSpec = [
            0 => ["pipe", "r"],
            1 => ["pipe", "w"],
            2 => ["pipe", "w"]
        ];
        
        $process = proc_open('crontab -', $descriptorSpec, $pipes);
        
        if (is_resource($process)) {
            fwrite($pipes[0], $newCronContent);
            fclose($pipes[0]);
            
            $stderr = stream_get_contents($pipes[2]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            
            $return_value = proc_close($process);
            
            if ($return_value === 0) {
                echo json_encode(['status' => 'ok', 'enabled' => $enabled, 'time' => $timeStr]);
            } else {
                throw new Exception("Crontab update failed: " . $stderr);
            }
        } else {
            throw new Exception("Failed to open crontab process");
        }

    } else {
        $sock = openMpdSock('localhost', 6600);
        $lib = loadLibrary($sock);
        closeMpdSock($sock);
        echo $lib ?: json_encode([]);
    }

} catch (Throwable $e) {
    if (!headers_sent()) {
        header('Content-Type: application/json');
        http_response_code(500);
    }
    echo json_encode(["error" => "PHP Error: " . $e->getMessage()]);
}
?>
