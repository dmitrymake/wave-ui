<?php
class YandexMusic {
    private $token;
    private $userId;
    private $userAgent = 'Yandex-Music-Client';
    private $SALT = "XGRlBW9FXlekgbPrRHuSiA";

    public function __construct($token) {
        $this->token = $token;
    }

    private function request($path, $postData = null, $isXml = false) {
        $url = strpos($path, 'http') === 0 ? $path : "https://api.music.yandex.net" . $path;
        
        $headers = [
            "Authorization: OAuth " . $this->token,
            "Accept-Language: ru"
        ];

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_USERAGENT, $this->userAgent);

        if ($postData) {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postData));
            $headers[] = 'Content-Type: application/x-www-form-urlencoded';
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        $response = curl_exec($ch);
        curl_close($ch);

        if ($isXml) return $response;
        return json_decode($response, true);
    }

    public function getUserId() {
        if ($this->userId) return $this->userId;
        $data = $this->request('/account/status');
        $this->userId = $data['result']['account']['uid'] ?? null;
        return $this->userId;
    }

    public function getUserPlaylists() {
        $uid = $this->getUserId();
        // Получаем плейлисты пользователя
        $data = $this->request("/users/{$uid}/playlists/list");
        $userPlaylists = $data['result'] ?? [];

        // Получаем "Плейлист дня", "Дежавю" и т.д. из ленты
        $feed = $this->request("/landing3?blocks=personal-playlists");
        $smartPlaylists = [];
        
        if (isset($feed['result']['blocks'][0]['entities'])) {
            $smartPlaylists = $feed['result']['blocks'][0]['entities'];
        }

        return array_merge($smartPlaylists, $userPlaylists);
    }

    public function getStationTracks($stationId) {
        // stationId например "user:onetwo" (моя волна) или "playlist:uid:kind"
        $data = $this->request("/info/stations/{$stationId}/tracks-from-queue");
        return $data['result']['sequence'] ?? [];
    }

    public function search($text, $type = 'all', $page = 0) {
        return $this->request("/search", [
            'text' => $text,
            'type' => $type,
            'page' => $page,
            'nocorrect' => 'false'
        ]);
    }

    public function toggleLike($trackId, $isLike = true) {
        $uid = $this->getUserId();
        $action = $isLike ? 'add' : 'remove';
        return $this->request("/users/{$uid}/likes/tracks/{$action}", ['track-id' => $trackId]);
    }

    public function getDirectLink($trackId) {
        $data = $this->request("/tracks/{$trackId}/download-info");
        if (empty($data['result'][0]['downloadInfoUrl'])) return null;

        // Сортировка по качеству (битрейт по убыванию)
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
    
    public function getFavorites($page = 0) {
        $uid = $this->getUserId();
        $data = $this->request("/users/{$uid}/likes/tracks");
        $ids = array_map(function($item) { return $item['id']; }, $data['result']['library']['tracks'] ?? []);
        
        if (empty($ids)) return [];

        $offset = $page * 50;
        $slice = array_slice($ids, $offset, 50);
        
        if (empty($slice)) return [];

        return $this->getTracks(implode(',', $slice));
    }

    public function getTracks($trackIds) {
        if (is_array($trackIds)) $trackIds = implode(',', $trackIds);
        $data = $this->request("/tracks", ['track-ids' => $trackIds]);
        return $data['result'] ?? [];
    }
}
?>
