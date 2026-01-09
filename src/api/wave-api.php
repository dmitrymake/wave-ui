<?php

define('DEBUG_LOG_FILE', '/tmp/wave-debug.log');

function writeLog($message) {
    $date = date('Y-m-d H:i:s');
    if (is_array($message) || is_object($message)) {
        $message = print_r($message, true);
    }
    file_put_contents(DEBUG_LOG_FILE, "[$date] $message" . PHP_EOL, FILE_APPEND);
}

register_shutdown_function(function() {
    $error = error_get_last();
    if ($error && ($error['type'] === E_ERROR || $error['type'] === E_PARSE || $error['type'] === E_COMPILE_ERROR)) {
        writeLog("CRITICAL PHP ERROR: " . print_r($error, true));
        // Пытаемся отдать хоть что-то клиенту
        if (!headers_sent()) {
            header('Content-Type: application/json');
            http_response_code(500);
        }
        echo json_encode(["error" => "Critical Server Error", "details" => $error]);
    }
});

writeLog("--- Request Started ---");
writeLog("URI: " . $_SERVER['REQUEST_URI']);
// ---------------------------

ini_set('display_errors', 0);
error_reporting(E_ALL);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept-Language');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

define('INC', '/var/www/inc');

try {
    if (!file_exists(INC . '/common.php')) throw new Exception("Moode include files not found in " . INC);
    
    require_once INC . '/common.php';
    require_once INC . '/sql.php';
    require_once INC . '/mpd.php';
    require_once INC . '/music-library.php';
    writeLog("Includes loaded successfully");

    session_start();

    if (!isset($_SESSION['xss_detect'])) $_SESSION['xss_detect'] = 'off';
    if (!isset($_SESSION['library_utf8rep'])) $_SESSION['library_utf8rep'] = 'Yes';
    if (!isset($_SESSION['library_flatlist_filter'])) $_SESSION['library_flatlist_filter'] = 'full_lib';
    if (!isset($_SESSION['library_misc_options'])) $_SESSION['library_misc_options'] = 'No,Album@Artist';

    $action = isset($_REQUEST['action']) ? $_REQUEST['action'] : 'library';
    writeLog("Action detected: $action");

    if ($action !== 'yandex_proxy') {
        header('Content-Type: application/json');
    }

    if ($action === 'yandex_proxy') {
        writeLog("Entering Yandex Proxy logic");

        if (!function_exists('curl_init')) {
            throw new Exception("PHP cURL extension is NOT installed/enabled!");
        }

        $path = $_GET['path'] ?? '';
        writeLog("Proxy Path: $path");

        if (!$path) {
            header('Content-Type: application/json');
            throw new Exception("No path provided for proxy");
        }

        // Определяем URL
        $is_storage = strpos($path, 'http') === 0;
        $url = $is_storage ? $path : "https://api.music.yandex.net" . $path;
        writeLog("Target URL: $url");

        $ch = curl_init($url);
        
        $requestHeaders = [];

        $auth_token = null;
        if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
            $auth_token = $_SERVER['HTTP_AUTHORIZATION'];
            writeLog("Token found in HTTP_AUTHORIZATION");
        } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            $auth_token = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
            writeLog("Token found in REDIRECT_HTTP_AUTHORIZATION");
        }
        
        if (!$auth_token && isset($_GET['token']) && !empty($_GET['token'])) {
            $raw_token = $_GET['token'];
            if (strpos($raw_token, 'OAuth') === 0) {
                $auth_token = $raw_token;
            } else {
                $auth_token = "OAuth " . $raw_token;
            }
            writeLog("Token found in GET parameter");
        }

        if ($auth_token) {
            $requestHeaders[] = "Authorization: $auth_token";
            writeLog("Auth Header set: " . substr($auth_token, 0, 10) . "...");
        } else {
            writeLog("WARNING: No Authorization token found!");
        }

        if (isset($_SERVER['HTTP_ACCEPT_LANGUAGE'])) {
            $requestHeaders[] = "Accept-Language: " . $_SERVER['HTTP_ACCEPT_LANGUAGE'];
        } else {
            $requestHeaders[] = "Accept-Language: ru";
        }

        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            writeLog("Method is POST");
            curl_setopt($ch, CURLOPT_POST, 1);
            $postBody = file_get_contents('php://input');
            writeLog("POST Body length: " . strlen($postBody));
            curl_setopt($ch, CURLOPT_POSTFIELDS, $postBody);
            $requestHeaders[] = 'Content-Type: application/x-www-form-urlencoded';
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $requestHeaders);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Yandex-Music-Client'); 
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);

        writeLog("Executing cURL...");
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $curlError = curl_error($ch);
        $curlErrno = curl_errno($ch);
        
        curl_close($ch);

        writeLog("cURL finished. HTTP Code: $httpCode");
        
        if ($curlErrno) {
            writeLog("cURL Error ($curlErrno): $curlError");
            header('Content-Type: application/json');
            http_response_code(500);
            echo json_encode(["error" => "Proxy Curl Error: " . $curlError]);
            exit;
        }

        if ($contentType) {
            header("Content-Type: $contentType");
        }
        
        writeLog("Sending response (Length: " . strlen($response) . ")");
        http_response_code($httpCode);
        echo $response;
        exit;
    }

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
    writeLog("EXCEPTION CAUGHT: " . $e->getMessage());
    writeLog("Trace: " . $e->getTraceAsString());
    
    if (!headers_sent()) {
        header('Content-Type: application/json');
        http_response_code(500);
    }
    echo json_encode(["error" => "PHP Error: " . $e->getMessage()]);
}
?>
