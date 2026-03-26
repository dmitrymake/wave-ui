import { describe, it, expect } from "vitest";
import { MpdParser } from "../../mpd/parser.js";

describe("MpdParser.parseKeyValue", () => {
  it("parses key-value pairs", () => {
    const text = "volume: 85\nrepeat: 1\nrandom: 0\n";
    const result = MpdParser.parseKeyValue(text);
    expect(result).toEqual({ volume: "85", repeat: "1", random: "0" });
  });

  it("returns empty object for empty input", () => {
    expect(MpdParser.parseKeyValue("")).toEqual({});
    expect(MpdParser.parseKeyValue(null as any)).toEqual({});
    expect(MpdParser.parseKeyValue(undefined as any)).toEqual({});
  });

  it("ignores lines without separator", () => {
    const text = "OK\nvolume: 50\nbadline\n";
    const result = MpdParser.parseKeyValue(text);
    expect(result).toEqual({ volume: "50" });
  });

  it("lowercases keys", () => {
    const text = "Artist: Radiohead\nTitle: Creep\n";
    const result = MpdParser.parseKeyValue(text);
    expect(result.artist).toBe("Radiohead");
    expect(result.title).toBe("Creep");
  });

  it("handles values containing colons", () => {
    const text = "file: http://stream.example.com:8080/live\n";
    const result = MpdParser.parseKeyValue(text);
    expect(result.file).toBe("http://stream.example.com:8080/live");
  });
});

describe("MpdParser.parseStatus", () => {
  const statusText = [
    "volume: 75",
    "repeat: 1",
    "random: 0",
    "state: play",
    "song: 3",
    "songid: 42",
    "elapsed: 123.456",
    "duration: 300.0",
    "bitrate: 320",
    "audio: 44100:16:2",
    "playlistlength: 10",
    "playlist: 5",
    "",
  ].join("\n");

  it("parses full status", () => {
    const s = MpdParser.parseStatus(statusText);
    expect(s.state).toBe("play");
    expect(s.volume).toBe(75);
    expect(s.elapsed).toBeCloseTo(123.456);
    expect(s.duration).toBeCloseTo(300.0);
    expect(s.random).toBe(false);
    expect(s.repeat).toBe(true);
    expect(s.song).toBe(3);
    expect(s.songId).toBe(42);
    expect(s.bitrate).toBe(320);
    expect(s.format).toBe("16-bit");
    expect(s.playlistLength).toBe(10);
    expect(s.playlistVersion).toBe(5);
  });

  it("uses defaults for empty input", () => {
    const s = MpdParser.parseStatus("");
    expect(s.state).toBe("stop");
    expect(s.volume).toBe(0);
    expect(s.elapsed).toBe(0);
    expect(s.duration).toBe(0);
    expect(s.random).toBe(false);
    expect(s.repeat).toBe(false);
  });

  it("parses format without audio field", () => {
    const s = MpdParser.parseStatus("state: stop\n");
    expect(s.format).toBe("");
  });
});

describe("MpdParser.parseCurrentSong", () => {
  it("parses current song", () => {
    const text = [
      "file: Music/Artist/Album/01-track.flac",
      "Title: My Track",
      "Artist: My Artist",
      "Album: My Album",
      "Genre: Rock",
      "Time: 245",
      "Track: 1",
      "Id: 7",
      "Pos: 0",
      "",
    ].join("\n");

    const song = MpdParser.parseCurrentSong(text);
    expect(song.file).toBe("Music/Artist/Album/01-track.flac");
    expect(song.title).toBe("My Track");
    expect(song.artist).toBe("My Artist");
    expect(song.album).toBe("My Album");
    expect(song.genre).toBe("Rock");
    expect(song.time).toBe(245);
    expect(song.track).toBe("1");
    expect(song.id).toBe("7");
    expect(song.pos).toBe("0");
  });

  it("uses defaults for missing fields", () => {
    const song = MpdParser.parseCurrentSong("file: test.mp3\n");
    expect(song.title).toBe("test.mp3");
    expect(song.artist).toBe("Unknown Artist");
    expect(song.album).toBe("Unknown Album");
    expect(song.genre).toBe("Unknown");
  });

  it("handles empty input", () => {
    const song = MpdParser.parseCurrentSong("");
    expect(song.file).toBe("");
    expect(song.title).toBe("Unknown");
  });
});

describe("MpdParser.parsePlaylists", () => {
  it("parses playlist list", () => {
    const text = [
      "playlist: Rock Mix",
      "Last-Modified: 2024-01-15T10:00:00Z",
      "playlist: Jazz",
      "Last-Modified: 2024-02-01T12:30:00Z",
      "",
    ].join("\n");

    const result = MpdParser.parsePlaylists(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: "Rock Mix",
      lastModified: "2024-01-15T10:00:00Z",
    });
    expect(result[1]).toEqual({
      name: "Jazz",
      lastModified: "2024-02-01T12:30:00Z",
    });
  });

  it("handles empty input", () => {
    expect(MpdParser.parsePlaylists("")).toEqual([]);
  });

  it("handles playlist without Last-Modified", () => {
    const text = "playlist: MyList\n";
    const result = MpdParser.parsePlaylists(text);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("MyList");
    expect(result[0].lastModified).toBeUndefined();
  });
});

describe("MpdParser.parseTracks", () => {
  it("parses multiple tracks", () => {
    const text = [
      "file: Music/track1.flac",
      "Title: First",
      "Artist: Artist A",
      "Album: Album 1",
      "Time: 180",
      "file: Music/track2.flac",
      "Title: Second",
      "Artist: Artist B",
      "Album: Album 2",
      "Time: 200",
      "",
    ].join("\n");

    const tracks = MpdParser.parseTracks(text);
    expect(tracks).toHaveLength(2);
    expect(tracks[0].title).toBe("First");
    expect(tracks[0].artist).toBe("Artist A");
    expect(tracks[1].title).toBe("Second");
    expect(tracks[1].time).toBe(200);
  });

  it("handles single track", () => {
    const text = "file: test.mp3\nTitle: Solo\n";
    const tracks = MpdParser.parseTracks(text);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].title).toBe("Solo");
  });

  it("returns empty for empty input", () => {
    expect(MpdParser.parseTracks("")).toEqual([]);
  });

  it("uses filename as title when title missing", () => {
    const text = "file: path/to/song.mp3\nArtist: Someone\n";
    const tracks = MpdParser.parseTracks(text);
    expect(tracks[0].title).toBe("song.mp3");
  });
});

describe("MpdParser._normalizeTrack", () => {
  it("handles case-insensitive keys", () => {
    const track = MpdParser._normalizeTrack({
      file: "test.mp3",
      Title: "Proper Case",
      artist: "lower case",
    });
    expect(track.title).toBe("Proper Case");
    expect(track.artist).toBe("lower case");
  });

  it("sets stationName from Name field", () => {
    const track = MpdParser._normalizeTrack({
      file: "http://stream.example.com",
      Name: "Cool Radio",
    });
    expect(track.stationName).toBe("Cool Radio");
    expect(track.title).toBe("Cool Radio");
  });
});
