/**
 * Robust MPD Parser.
 * Handles parsing iteratively to avoid memory spikes on large libraries.
 */
export const MpdParser = {
  parseKeyValue(text) {
    const result = {};
    if (!text) return result;

    const lines = text.split("\n");
    for (const line of lines) {
      const idx = line.indexOf(": ");
      if (idx === -1) continue;
      // ВАЖНО: приводим ключ к нижнему регистру
      const key = line.substring(0, idx).toLowerCase();
      const val = line.substring(idx + 2);
      result[key] = val;
    }
    return result;
  },

  parseStatus(text) {
    const data = this.parseKeyValue(text);
    let format = "";
    if (data.audio) {
      const parts = data.audio.split(":");
      if (parts[1]) {
        format = `${parts[1]}-bit`;
      }
    }
    return {
      state: data.state || "stop",
      volume: parseInt(data.volume) || 0,
      elapsed: parseFloat(data.elapsed) || 0,
      duration: parseFloat(data.duration) || 0,
      random: data.random === "1",
      repeat: data.repeat === "1",

      // ВОТ ЭТОЙ СТРОКИ НЕ ХВАТАЛО:
      song: parseInt(data.song) || 0,

      songId: parseInt(data.songid) || -1,
      playlistLength: parseInt(data.playlistlength) || 0,
      bitrate: parseInt(data.bitrate) || 0,
      format: format,
      playlistVersion: parseInt(data.playlist) || 0,
    };
  },

  parseCurrentSong(text) {
    const data = this.parseKeyValue(text);
    return this._normalizeTrack(data);
  },

  parsePlaylists(text) {
    const lines = text.split("\n");
    const items = [];
    let current = null;

    for (const line of lines) {
      if (line.startsWith("playlist: ")) {
        if (current) items.push(current);
        current = { playlist: line.substring(10) };
      } else if (line.startsWith("Last-Modified: ") && current) {
        current["last-modified"] = line.substring(15);
      }
    }
    if (current) items.push(current);
    return items.map((i) => ({
      name: i.playlist,
      lastModified: i["last-modified"],
    }));
  },

  /**
   * STREAMING-LIKE PARSER FOR TRACKS
   */
  parseTracks(rawText) {
    const tracks = [];
    let currentTrack = null;

    let start = 0;
    let end = rawText.indexOf("\n", start);

    while (end !== -1) {
      const line = rawText.substring(start, end);
      const sepIndex = line.indexOf(": ");

      if (sepIndex !== -1) {
        const key = line.substring(0, sepIndex).toLowerCase();
        const value = line.substring(sepIndex + 2);

        if (key === "file") {
          if (currentTrack) {
            tracks.push(this._normalizeTrack(currentTrack));
          }
          currentTrack = { file: value };
        } else if (currentTrack) {
          currentTrack[key] = value;
        }
      }

      start = end + 1;
      end = rawText.indexOf("\n", start);
    }

    if (currentTrack) {
      tracks.push(this._normalizeTrack(currentTrack));
    }

    return tracks;
  },

  _normalizeTrack(raw) {
    const file = raw.file || raw.File || "";
    const title =
      raw.Title ||
      raw.title ||
      raw.Name ||
      raw.name ||
      file.split("/").pop() ||
      "Unknown";

    return {
      file: file,
      title: title,
      artist: raw.Artist || raw.artist || "Unknown Artist",
      album: raw.Album || raw.album || "Unknown Album",
      genre: raw.Genre || raw.genre || "Unknown",
      time: parseFloat(raw.Time || raw.time || 0),
      track: raw.Track || raw.track || "",
      id: raw.Id || raw.id,
      pos: raw.Pos || raw.pos || null,
      stationName: raw.name || raw.Name || null,
    };
  },
};
