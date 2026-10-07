const PLAYLIST_KEY = 'musicverse.playlists.v1';
const LISTENED_KEY = 'musicverse.listened.v1';
const FAVORITES_KEY = 'musicverse.favorites.v1';
const SPOTIFY_HISTORY_KEY = 'musicverse.spotify-history.v1';
const FEATURED_ALBUM_HISTORY_KEY = 'musicverse.featured-cover-albums.v1';

function read(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeSilent(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function write(key, value) {
  writeSilent(key, value);
  window.dispatchEvent(new CustomEvent('musicverse:store-change'));
}

export function getPlaylists() {
  return read(PLAYLIST_KEY, []);
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

export function addTracksToPlaylist(playlistId, tracks) {
  const additions = (Array.isArray(tracks) ? tracks : []).filter((track) => track?.id);
  if (!additions.length) return;

  const playlists = getPlaylists();
  const next = playlists.map((playlist) => {
    if (playlist.id !== playlistId) return playlist;
    const existing = new Set(playlist.tracks.map((item) => item.id));
    const uniqueAdditions = additions.filter((track) => !existing.has(track.id));
    return uniqueAdditions.length ? { ...playlist, tracks: [...playlist.tracks, ...uniqueAdditions] } : playlist;
  });
  savePlaylists(next);
}

export function addTrackToPlaylist(playlistId, track) {
  addTracksToPlaylist(playlistId, [track]);
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

export function getSpotifyListeningHistory() {
  return read(SPOTIFY_HISTORY_KEY, []);
}

export function getFeaturedAlbumHistory() {
  return read(FEATURED_ALBUM_HISTORY_KEY, []);
}

export function rememberFeaturedAlbum(albumId, date) {
  const cleanAlbumId = String(albumId || '').trim();
  const cleanDate = String(date || '').trim();
  if (!cleanAlbumId || !cleanDate) return getFeaturedAlbumHistory();

  const existing = getFeaturedAlbumHistory();
  const current = existing.find((entry) => entry?.date === cleanDate);
  if (current?.albumId === cleanAlbumId) return existing;

  const next = existing
    .filter((entry) => entry?.date !== cleanDate)
    .concat({ date: cleanDate, albumId: cleanAlbumId, selectedAt: new Date().toISOString() })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-366);

  writeSilent(FEATURED_ALBUM_HISTORY_KEY, next);
  return next;
}

export function normalizeSpotifyListeningItems(items) {
  return (Array.isArray(items) ? items : []).flatMap((item) => {
    const track = item?.track;
    const playedAt = String(item?.played_at || '').trim();
    const trackId = String(track?.id || '').trim();
    if (!playedAt || !trackId) return [];

    return [{
      id: `spotify-play:${playedAt}:${trackId}`,
      source: 'spotify',
      playedAt,
      trackId,
      title: String(track?.name || 'Unknown track'),
      artists: (track?.artists || []).map((artist) => String(artist?.name || '').trim()).filter(Boolean),
      album: String(track?.album?.name || ''),
      albumId: String(track?.album?.id || ''),
      spotifyUrl: String(track?.external_urls?.spotify || ''),
      artwork: String(track?.album?.images?.[1]?.url || track?.album?.images?.[0]?.url || ''),
      contextUrl: String(item?.context?.external_urls?.spotify || ''),
    }];
  });
}

export function mergeSpotifyListeningHistory(items, options = {}) {
  const existing = getSpotifyListeningHistory();
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const item of normalizeSpotifyListeningItems(items)) byId.set(item.id, item);

  const next = [...byId.values()]
    .sort((a, b) => String(b.playedAt).localeCompare(String(a.playedAt)))
    .slice(0, 1000);

  if (JSON.stringify(next) !== JSON.stringify(existing)) {
    if (options.silent) writeSilent(SPOTIFY_HISTORY_KEY, next);
    else write(SPOTIFY_HISTORY_KEY, next);
  }
  return next;
}
