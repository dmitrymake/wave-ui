<?php
class YandexMusic {
    private $token;
    private $userId;
    private $userAgent = 'Yandex-Music-Client';
    private $SALT = "XGRlBW9FXlekgbPrRHuSiA";
    
    // ЛОГ ФАЙЛ ДЛЯ ОТЛАДКИ
    private $debugFile = '/dev/shm/yandex_debug.log';

    public function __construct($token) {
        $this->token = $token;
    }

    private function log($msg) {
        $time = date('H:i:s');
        @file_put_contents($this->debugFile, "[$time] $msg\n", FILE_APPEND);
    }

    private function request($path, $postData = null, $isXml = false) {
        $url = strpos($path, 'http') === 0 ? $path : "https://api.music.yandex.net" . $path;
        
        $method = $postData ? "POST" : "GET";
        // ЛОГИРУЕМ ЗАПРОС
        $this->log("REQ [$method]: $url");
        if ($postData) $this->log("DATA: " . json_encode($postData));

        $headers = [
            "Authorization: OAuth " . $this->token,
            "Accept-Language: ru"
        ];

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_USERAGENT, $this->userAgent);
        curl_setopt($ch, CURLOPT_TIMEOUT, 20); // Чуть увеличили таймаут

        if ($postData) {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postData));
            $headers[] = 'Content-Type: application/x-www-form-urlencoded';
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        
        curl_close($ch);

        if ($err) {
            $this->log("CURL ERROR: $err");
            return null;
        }

        $this->log("RESP CODE: $httpCode");

        if ($isXml) return $response;
        
        $json = json_decode($response, true);
        if (!$json) {
            $this->log("JSON ERROR (Raw response len: " . strlen($response) . ")");
        }
        return $json;
    }

    public function getUserId() {
        if ($this->userId) return $this->userId;
        $data = $this->request('/account/status');
        $this->userId = $data['result']['account']['uid'] ?? null;
        return $this->userId;
    }

    public function getUserPlaylists() {
        $uid = $this->getUserId();
        $data = $this->request("/users/{$uid}/playlists/list");
        return $data['result'] ?? [];
    }

    public function getLandingBlocks() {
        $blocks = "personal-playlists,stations,mixes";
        $data = $this->request("/landing3?blocks=" . urlencode($blocks));
        return $data['result']['blocks'] ?? [];
    }

    public function getStationDashboard() {
        $data = $this->request("/rotor/stations/dashboard");
        return $data['result']['stations'] ?? [];
    }

    public function getPlaylistTracks($uid, $kind, $offset = 0, $limit = 100) {
        $data = $this->request("/users/{$uid}/playlists/{$kind}");
        
        if (isset($data['result']['tracks']) && count($data['result']['tracks']) == $data['result']['trackCount']) {
            $tracks = [];
            foreach ($data['result']['tracks'] as $item) {
                $track = $item['track'] ?? $item;
                if (isset($track['id'])) $tracks[] = $track;
            }
            return array_slice($tracks, $offset, $limit);
        }

        if (isset($data['result']['trackIds'])) {
            $allIds = array_map(function($item) {
                return is_array($item) ? $item['id'] : $item;
            }, $data['result']['trackIds']);

            $slice = array_slice($allIds, $offset, $limit);
            if (empty($slice)) return [];
            return $this->getTracksByIds($slice);
        }

        return [];
    }

    public function getAlbum($albumId) {
        $data = $this->request("/albums/{$albumId}/with-tracks");
        return $data['result'] ?? null;
    }

    public function getArtist($artistId) {
        $data = $this->request("/artists/{$artistId}");
        return $data['result']['artist'] ?? null;
    }

    public function getArtistDirectAlbums($artistId) {
        $data = $this->request("/artists/{$artistId}/direct-albums?page-size=50");
        return $data['result']['albums'] ?? [];
    }

    public function getArtistTracks($artistId) {
        $data = $this->request("/artists/{$artistId}/tracks?page-size=50");
        return $data['result']['tracks'] ?? [];
    }

    // --- ГЛАВНАЯ ФУНКЦИЯ ДЛЯ ВАЙБОВ ---
    // Теперь точно передает параметры в URL
    public function getStationTracksV2($stationId, $queue = [], $extraParams = []) {
        $url = "/rotor/station/{$stationId}/tracks"; 
        
        // Добавляем параметры настроения (moodEnergy, diversity)
        $query = $extraParams; 
        
        // Передаем историю, чтобы не повторялось
        if (!empty($queue)) {
            // Яндекс иногда хочет параметр 'queue' как список ID, которые уже были
            // Берем последние 50, чтобы URL не лопнул
            $slice = array_slice($queue, -50); 
            $query['queue'] = implode(',', $slice);
        }
        
        // Строим query string
        $queryString = http_build_query($query);
        $fullUrl = $url . '?' . $queryString;
        
        $this->log("VIBE REQUEST: $fullUrl"); // Проверяем в логах, ушли ли параметры
        
        $data = $this->request($fullUrl);
        $rawSequence = $data['result']['sequence'] ?? [];
        
        $cleanTracks = [];
        foreach ($rawSequence as $item) {
            if (isset($item['track'])) {
                $cleanTracks[] = $item['track'];
            } elseif (isset($item['id'])) {
                $cleanTracks[] = $item;
            }
        }
        
        $this->log("VIBE RESULT: Got " . count($cleanTracks) . " tracks");
        return $cleanTracks;
    }

    public function search($text, $type = 'all', $page = 0) {
        $params = [
            'text' => $text,
            'type' => $type,
            'page' => $page,
            'nocorrect' => 'false'
        ];
        $query = http_build_query($params);
        return $this->request("/search?" . $query);
    }

    public function toggleLike($trackId, $isLike = true) {
        $uid = $this->getUserId();
        $action = $isLike ? 'add' : 'remove';
        return $this->request("/users/{$uid}/likes/tracks/{$action}", ['track-id' => $trackId]);
    }

    public function getFavoritesIds() {
        $uid = $this->getUserId();
        $data = $this->request("/users/{$uid}/likes/tracks");
        $ids = [];
        $res = $data['result'] ?? [];

        if (isset($res['library']['tracks'])) {
            foreach ($res['library']['tracks'] as $t) {
                $ids[] = $t['id'];
            }
        } elseif (isset($res['ids'])) {
            $ids = $res['ids'];
        }
        return $ids;
    }

    public function getFavorites($offset = 0, $limit = 50) {
        $ids = $this->getFavoritesIds();
        $slice = array_slice($ids, $offset, $limit);
        if (empty($slice)) return [];
        return $this->getTracksByIds($slice);
    }

    public function getTracksByIds($ids) {
        if (empty($ids)) return [];
        
        $chunks = array_chunk($ids, 200);
        $allTracks = [];

        foreach ($chunks as $chunk) {
            $chunkStr = implode(',', $chunk);
            $data = $this->request("/tracks", ['track-ids' => $chunkStr]);
            if (isset($data['result']) && is_array($data['result'])) {
                $allTracks = array_merge($allTracks, $data['result']);
            }
        }
        return $allTracks;
    }

    public function getTrackInfo($trackId) {
        $data = $this->request("/tracks/{$trackId}");
        return $data['result'][0] ?? null;
    }

    public function getDirectLink($trackId) {
        if (!$trackId) return null;
        
        $data = $this->request("/tracks/{$trackId}/download-info");
        if (empty($data['result'][0]['downloadInfoUrl'])) {
            $this->log("No download info for $trackId");
            return null;
        }

        usort($data['result'], function($a, $b) {
            return $b['bitrateInKbps'] - $a['bitrateInKbps'];
        });
        
        $infoUrl = $data['result'][0]['downloadInfoUrl'];
        $xml = $this->request($infoUrl, null, true);
        
        if (!preg_match('/<host>(.*?)<\/host>/', $xml, $host)) return null;
        if (!preg_match('/<path>(.*?)<\/path>/', $xml, $path)) return null;
        if (!preg_match('/<ts>(.*?)<\/ts>/', $xml, $ts)) return null;
        if (!preg_match('/<s>(.*?)<\/s>/', $xml, $s)) return null;

        $sign = md5($this->SALT . substr($path[1], 1) . $s[1]);
        return "https://{$host[1]}/get-mp3/{$sign}/{$ts[1]}{$path[1]}";
    }
}
?>
