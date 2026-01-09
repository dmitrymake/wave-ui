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
            "Accept-Language: en"
        ];

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_USERAGENT, $this->userAgent);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);

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
        // Fetch user created playlists
        $data = $this->request("/users/{$uid}/playlists/list");
        $userPlaylists = $data['result'] ?? [];

        // Fetch smart playlists (Playlist of the day, Deja Vu, etc.)
        $feed = $this->request("/landing3?blocks=personal-playlists");
        $smartPlaylists = [];
        if (isset($feed['result']['blocks'][0]['entities'])) {
            $smartPlaylists = $feed['result']['blocks'][0]['entities'];
        }

        return array_merge($smartPlaylists, $userPlaylists);
    }

    public function getPlaylistTracks($uid, $kind) {
        $data = $this->request("/users/{$uid}/playlists/{$kind}");
        if (!isset($data['result']['tracks'])) return [];
        
        $tracks = [];
        foreach ($data['result']['tracks'] as $item) {
            // Handle differences in API response structure
            $track = $item['track'] ?? $item;
            if (isset($track['id'])) $tracks[] = $track;
        }
        return $tracks;
    }

    public function getAlbumTracks($albumId) {
        $data = $this->request("/albums/{$albumId}/with-tracks");
        if (!isset($data['result']['volumes'])) return [];
        
        $tracks = [];
        foreach ($data['result']['volumes'] as $vol) {
            if (is_array($vol)) $tracks = array_merge($tracks, $vol);
        }
        return $tracks;
    }

    public function getArtistTracks($artistId) {
        $data = $this->request("/artists/{$artistId}/tracks?page-size=50");
        return $data['result']['tracks'] ?? [];
    }

    // Use the rotor endpoint for infinite radio generation
    public function getStationTracks($stationId) {
        $data = $this->request("/rotor/station/{$stationId}/tracks?new-queue=true");
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

    public function getFavorites() {
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
        } elseif (is_array($res)) {
            foreach ($res as $t) {
                if (isset($t['id'])) $ids[] = $t['id'];
            }
        }
        
        // Limit to 100 recent favorites to prevent timeouts
        $ids = array_slice($ids, 0, 100);
        
        if (empty($ids)) return [];
        
        return $this->getTracksByIds($ids);
    }

    public function getTracksByIds($ids) {
        if (is_array($ids)) $ids = implode(',', $ids);
        $data = $this->request("/tracks", ['track-ids' => $ids]);
        return $data['result'] ?? [];
    }

    public function getTrackInfo($trackId) {
        $data = $this->request("/tracks/{$trackId}");
        return $data['result'][0] ?? null;
    }

    public function getDirectLink($trackId) {
        $data = $this->request("/tracks/{$trackId}/download-info");
        if (empty($data['result'][0]['downloadInfoUrl'])) return null;

        // Sort by bitrate descending (Highest Quality)
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
