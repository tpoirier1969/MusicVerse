const PLAYLIST_KEY = 'musicverse.playlists.v1';
const LISTENED_KEY = 'musicverse.listened.v1';
const FAVORITES_KEY = 'musicverse.favorites.v1';

function read(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('musicverse:store-change'));
}

export function getPlaylists() {
  return read(PLAYLIST_KEY, [{ id: 'roadtrip', name: 'Open Road', description: 'Songs for the long way home.', tracks: [] }]);
}

export function savePlaylists(playlists) {
  write(PLAYLIST_KEY, playlists);
}

export function createPlaylist(name) {
  const playlists = getPlaylists();
  const next = { id: crypto.randomUUID(), name: name.trim() || 'Untitled Playlist', description: '', tracks: [] };
  savePlaylists([...playlists, next]);
  return next;
}

export function addTrackToPlaylist(playlistId, track) {
  const playlists = getPlaylists();
  const next = playlists.map((playlist) => {
    if (playlist.id !== playlistId) return playlist;
    if (playlist.tracks.some((item) => item.id === track.id)) return playlist;
    return { ...playlist, tracks: [...playlist.tracks, track] };
  });
  savePlaylists(next);
}

export function removeTrackFromPlaylist(playlistId, trackId) {
  savePlaylists(getPlaylists().map((playlist) => playlist.id === playlistId
    ? { ...playlist, tracks: playlist.tracks.filter((track) => track.id !== trackId) }
    : playlist));
}

export function toggleFavorite(id) {
  const values = new Set(read(FAVORITES_KEY, []));
  values.has(id) ? values.delete(id) : values.add(id);
  write(FAVORITES_KEY, [...values]);
}

export function isFavorite(id) {
  return new Set(read(FAVORITES_KEY, [])).has(id);
}

export function markListened(id) {
  const values = read(LISTENED_KEY, {});
  values[id] = new Date().toISOString();
  write(LISTENED_KEY, values);
}

export function getListeningLog() {
  return read(LISTENED_KEY, {});
}
