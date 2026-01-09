<?php

ini_set('display_errors', 0);
error_reporting(E_ALL);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

define('INC', '/var/www/inc');
require_once INC . '/common.php';
require_once INC . '/sql.php';
require_once INC . '/mpd.php';
require_once INC . '/music-library.php';

session_start();

if (!isset($_SESSION['xss_detect'])) $_SESSION['xss_detect'] = 'off';
if (!isset($_SESSION['library_utf8rep'])) $_SESSION['library_utf8rep'] = 'Yes';
if (!isset($_SESSION['library_flatlist_filter'])) $_SESSION['library_flatlist_filter'] = 'full_lib';
if (!isset($_SESSION['library_misc_options'])) $_SESSION['library_misc_options'] = 'No,Album@Artist';

$action = isset($_REQUEST['action']) ? $_REQUEST['action'] : 'library';

try {
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

        // Escape quotes for the shell command inside crontab
        $safePlaylist = str_replace('"', '\"', $playlist); 
        $cronId = "# WAVE_UI_ALARM";

        $currentCron = shell_exec('crontab -l 2>/dev/null');
        if (!$currentCron) $currentCron = "";

        // Filter out existing alarm lines
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

            // MPC sequence: Clear Queue -> Vol 70 -> Load Playlist -> Play
            $cmd = "/usr/bin/mpc clear && /usr/bin/mpc volume 70 && /usr/bin/mpc load \"$safePlaylist\" && /usr/bin/mpc play";
            
            // Crontab format: m h dom mon dow command
            $cronLine = "$min $hour * * * $cmd $cronId";
            $newLines[] = $cronLine;
        }

        $newCronContent = implode("\n", $newLines) . "\n";
        
        // Write to crontab via pipe
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
        // Default: Sync Library using Moode logic
        $sock = openMpdSock('localhost', 6600);
        $lib = loadLibrary($sock);
        closeMpdSock($sock);
        
        echo $lib ?: json_encode([]);
    }

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
}
?>
