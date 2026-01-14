<?php
class YandexMusic {
    private $token;
    private $userId = null;
    private $userAgent = 'Yandex-Music-Client';
    private $salt = "XGRlBW9FXlekgbPrRHuSiA";
    private $debug = true;
    private $logFile = '/dev/shm/wave_yandex_debug.log';

    public function __construct($token) {
        $this->token = $token;
    }

    private function log($msg) {
        if (!$this->debug) return;
        $ts = date('H:i:s');
        @file_put_contents($this->logFile, "[$ts] $msg\n", FILE_APPEND);
    }

    private function request($path, $postData = null, $isXml = false, $asJson = false) {
        $url = strpos($path, 'http') === 0 ? $path : "https://api.music.yandex.net" . $path;
        
        $logMsg = "REQ: $url";
        if ($postData) $logMsg .= " | DATA: " . json_encode($postData);
        $this->log($logMsg);

        $headers = [
            "Authorization: OAuth " . $this->token,
            "Accept-Language: ru",
            "X-Yandex-Music-Client: YandexMusic/24023251"
        ];

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_USERAGENT, $this->userAgent);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);

        if ($postData) {
            curl_setopt($ch, CURLOPT_POST, true);
            if ($asJson) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($postData));
                $headers[] = 'Content-Type: application/json';
            } else {
                curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postData));
            }
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 400 && $httpCode != 401) {
            $this->log("ERR [$httpCode]: " . substr($response, 0, 150));
        }

        if ($isXml) return $response;
        return json_decode($response, true);
    }

    public function getUserId() {
        if ($this->userId) return $this->userId;
        $data = $this->request('/account/status');
        $this->userId = $data['result']['account']['uid'] ?? null;
        return $this->userId;
    }

    // --- FIX: Добавлен аргумент $extraParams ---
    public function getStationTracks($stationId, $queueHistory = [], $extraParams = []) {
        $this->log("Getting tracks for Station: $stationId with params: " . json_encode($extraParams));
        
        $url = "/rotor/station/{$stationId}/tracks";
        
        $params = [
            "includeTracksInResponse" => "true",
            "recursive" => "true"
        ];

        if ($stationId === 'user:onyourwave') {
            $params['external-infos'] = 'onyourwave';
        }

        // Внедряем параметры настроения (moodEnergy, diversity и т.д.)
        if (!empty($extraParams)) {
            foreach ($extraParams as $k => $v) {
                $params[$k] = $v;
            }
        }

        if (!empty($queueHistory)) {
            $historySlice = array_slice($queueHistory, -20);
            $params['queue'] = implode(',', $historySlice);
        }

        $fullUrl = $url . '?' . http_build_query($params);
        $data = $this->request($fullUrl); // Логирование внутри request покажет финальный URL

        if (isset($data['result']['batchId'])) {
            $this->log("Rotor returned batchId: " . $data['result']['batchId']);
        }

        $tracks = [];
        $sequence = $data['result']['sequence'] ?? [];
        
        foreach ($sequence as $item) {
            $t = $item['track'] ?? $item;
            if (isset($t['id'])) {
                $formatted = $this->formatTrack($t);
                if ($formatted) $tracks[] = $formatted;
            }
        }
        return $tracks;
    }

    public function getDirectLink($trackId) {
        if (!$trackId) return null;
        
        $data = $this->request("/tracks/{$trackId}/download-info");
        if (empty($data['result'][0]['downloadInfoUrl'])) return null;

        usort($data['result'], function($a, $b) {
            return ($b['bitrateInKbps'] ?? 0) - ($a['bitrateInKbps'] ?? 0);
        });
        
        $infoUrl = $data['result'][0]['downloadInfoUrl'];
        $xml = $this->request($infoUrl, null, true);
        
        if (!preg_match('/<host>(.*?)<\/host>/', $xml, $host)) return null;
        if (!preg_match('/<path>(.*?)<\/path>/', $xml, $path)) return null;
        if (!preg_match('/<ts>(.*?)<\/ts>/', $xml, $ts)) return null;
        if (!preg_match('/<s>(.*?)<\/s>/', $xml, $s)) return null;

        $sign = md5($this->salt . substr($path[1], 1) . $s[1]);
        return "https://{$host[1]}/get-mp3/{$sign}/{$ts[1]}{$path[1]}";
    }

    // ... (Остальные методы без изменений) ...
    public function search($text, $type = 'all', $page = 0) {
        $params = ['text' => $text, 'type' => $type, 'page' => $page, 'nocorrect' => 'false'];
        return $this->request("/search?" . http_build_query($params));
    }
    public function getUserPlaylists() {
        $uid = $this->getUserId();
        return $this->request("/users/{$uid}/playlists/list")['result'] ?? [];
    }
    public function getLandingBlocks() {
        $blocks = "personal-playlists,stations,mixes,chart";
        return $this->request("/landing3?blocks=" . urlencode($blocks))['result']['blocks'] ?? [];
    }
    public function getStationDashboard() {
        return $this->request("/rotor/stations/dashboard")['result']['stations'] ?? [];
    }
    public function getPlaylistTracks($uid, $kind, $offset = 0) {
        $data = $this->request("/users/{$uid}/playlists/{$kind}");
        if (isset($data['result']['tracks']) && is_array($data['result']['tracks'])) {
            $tracks = [];
            foreach ($data['result']['tracks'] as $item) {
                $t = $item['track'] ?? $item;
                if (isset($t['id'])) $tracks[] = $this->formatTrack($t);
            }
            return array_slice($tracks, $offset, 50);
        }
        if (isset($data['result']['trackIds'])) {
            $ids = array_map(function($i) { return is_array($i) ? $i['id'] : $i; }, $data['result']['trackIds']);
            $slice = array_slice($ids, $offset, 50);
            return $this->getTracksByIds($slice);
        }
        return [];
    }
    public function getFavoritesIds() {
        $uid = $this->getUserId();
        $data = $this->request("/users/{$uid}/likes/tracks");
        $ids = [];
        $res = $data['result'] ?? [];
        if (isset($res['library']['tracks'])) {
            foreach ($res['library']['tracks'] as $t) $ids[] = $t['id'];
        } elseif (isset($res['ids'])) {
            $ids = $res['ids'];
        }
        return $ids;
    }
    public function getTracksByIds($ids) {
        if (empty($ids)) return [];
        $chunkStr = implode(',', $ids);
        $data = $this->request("/tracks", ['track-ids' => $chunkStr]);
        $result = [];
        if (isset($data['result']) && is_array($data['result'])) {
            foreach ($data['result'] as $t) {
                $result[] = $this->formatTrack($t);
            }
        }
        return $result;
    }
    public function getArtistDetails($id) {
        $artist = $this->request("/artists/{$id}");
        $tracks = $this->request("/artists/{$id}/tracks?page-size=50");
        $albums = $this->request("/artists/{$id}/direct-albums?page-size=50");
        return [
            'artist' => $artist['result']['artist'] ?? [],
            'tracks' => isset($tracks['result']['tracks']) ? array_map([$this, 'formatTrack'], $tracks['result']['tracks']) : [],
            'albums' => $albums['result']['albums'] ?? []
        ];
    }
    public function getAlbumDetails($id) {
        $raw = $this->request("/albums/{$id}/with-tracks");
        $tracks = [];
        if (isset($raw['result']['volumes'])) {
            foreach ($raw['result']['volumes'] as $vol) {
                foreach ($vol as $t) $tracks[] = $this->formatTrack($t);
            }
        }
        return ['info' => $raw['result'] ?? [], 'tracks' => $tracks];
    }
    public function toggleLike($trackId, $isLike = true) {
        $uid = $this->getUserId();
        $action = $isLike ? 'add' : 'remove';
        return $this->request("/users/{$uid}/likes/tracks/{$action}", ['track-id' => $trackId]);
    }
    public function formatTrack($t) {
        if (!$t || !is_array($t)) return null;
        $artistName = 'Unknown Artist';
        if (!empty($t['artists'])) {
            $names = array_map(function($a) { return $a['name']; }, $t['artists']);
            $artistName = implode(', ', $names);
        } elseif (isset($t['artist'])) {
            $artistName = $t['artist'];
        }
        $cover = null;
        if (!empty($t['ogImage'])) $cover = $t['ogImage'];
        elseif (!empty($t['coverUri'])) $cover = $t['coverUri'];
        elseif (!empty($t['album']['coverUri'])) $cover = $t['album']['coverUri'];
        if ($cover) {
            $cover = str_replace('%%', '400x400', $cover);
            if (strpos($cover, 'http') !== 0) $cover = 'https://' . $cover;
        }
        $albumTitle = '';
        if (!empty($t['albums'][0]['title'])) $albumTitle = $t['albums'][0]['title'];
        elseif (!empty($t['album']['title'])) $albumTitle = $t['album']['title'];
        return [
            'title'    => $t['title'] ?? 'Unknown Title',
            'artist'   => $artistName,
            'album'    => $albumTitle,
            'id'       => (string)($t['id'] ?? ''),
            'file'     => "yandex:" . ($t['id'] ?? ''),
            'image'    => $cover,
            'isYandex' => true,
            'service'  => 'yandex',
            'time'     => isset($t['durationMs']) ? ($t['durationMs'] / 1000) : 0
        ];
    }
}
?>
