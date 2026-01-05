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

$action = isset($_GET['action']) ? $_GET['action'] : 'library';

try {
    if ($action === 'stations') {
        $dbh = sqlConnect();
        if (!$dbh) throw new Exception("Moode DB Error");
        
        $stations = sqlRead('cfg_radio', $dbh, 'all');
        
        echo json_encode(is_array($stations) ? $stations : []);
        
    } else {
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
