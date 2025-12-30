export function getStationImageUrl(station) {
  if (!station || !station.image) return null;

  if (station.image.startsWith("http")) {
    return station.image;
  }

  let filename = "";
  if (station.image === "local") {
    filename = `${station.name}.jpg`;
  } else {
    filename = station.image;
  }

  const safeFilename = encodeURIComponent(filename);
  return `/imagesw/radio-logos/thumbs/${safeFilename}`;
}

export function getCoverUrl(song) {
  if (!song || !song.file) return null;

  if (!song.file.startsWith("http")) {
    return `/coverart.php?u=${encodeURIComponent(song.file)}`;
  }

  return null;
}

export function generateUid() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
