export const MUSICVERSE_STORE_KEYS = Object.freeze({
  playlists: 'musicverse.playlists.v1',
  listened: 'musicverse.listened.v1',
  favorites: 'musicverse.favorites.v1',
  spotifyHistory: 'musicverse.spotify-history.v1',
  featuredAlbums: 'musicverse.featured-cover-albums.v1',
  references: 'musicverse.references.v1',
});

const PLAYLIST_KEY = MUSICVERSE_STORE_KEYS.playlists;
const LISTENED_KEY = MUSICVERSE_STORE_KEYS.listened;
const FAVORITES_KEY = MUSICVERSE_STORE_KEYS.favorites;
const SPOTIFY_HISTORY_KEY = MUSICVERSE_STORE_KEYS.spotifyHistory;
const FEATURED_ALBUM_HISTORY_KEY = MUSICVERSE_STORE_KEYS.featuredAlbums;
const REFERENCES_KEY = MUSICVERSE_STORE_KEYS.references;

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

function notifySync(key) {
  window.dispatchEvent(new CustomEvent('musicverse:sync-dirty', { detail: { key } }));
}

function write(key, value) {
  writeSilent(key, value);
  notifySync(key);
  window.dispatchEvent(new CustomEvent('musicverse:store-change', { detail: { key, source: 'local' } }));
}

export function getPlaylists() {
  return read(PLAYLIST_KEY, []);
}

export function savePlaylists(playlists) {
  write(PLAYLIST_KEY, playlists);
}

export function createPlaylist(name) {
  const playlists = getPlaylists();
  const next = {
    id: crypto.randomUUID(),
    name: String(name || '').trim() || 'Untitled Playlist',
    description: '',
    tracks: [],
  };
  savePlaylists([...playlists, next]);
  return next;
}

export function addTracksToPlaylist(playlistId, tracks) {
  const additions = (Array.isArray(tracks) ? tracks : []).filter((track) => track?.id);
  if (!additions.length) return;

  const playlists = getPlaylists();
  const next = playlists.map((playlist) => {
    if (playlist.id !== playlistId) return playlist;
    const existing = new Set((playlist.tracks || []).map((item) => item.id));
    const uniqueAdditions = additions.filter((track) => !existing.has(track.id));
    return uniqueAdditions.length
      ? { ...playlist, tracks: [...(playlist.tracks || []), ...uniqueAdditions] }
      : playlist;
  });
  savePlaylists(next);
}

export function addTrackToPlaylist(playlistId, track) {
  addTracksToPlaylist(playlistId, [track]);
}

export function removeTrackFromPlaylist(playlistId, trackId) {
  savePlaylists(getPlaylists().map((playlist) => playlist.id === playlistId
    ? { ...playlist, tracks: (playlist.tracks || []).filter((track) => track.id !== trackId) }
    : playlist));
}

export function getFavorites() {
  return read(FAVORITES_KEY, []);
}

export function toggleFavorite(id) {
  const values = new Set(getFavorites());
  values.has(id) ? values.delete(id) : values.add(id);
  write(FAVORITES_KEY, [...values]);
}

export function isFavorite(id) {
  return new Set(getFavorites()).has(id);
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
  notifySync(FEATURED_ALBUM_HISTORY_KEY);
  return next;
}

export function getReferences() {
  return read(REFERENCES_KEY, []);
}

export function saveReferences(references) {
  write(REFERENCES_KEY, Array.isArray(references) ? references : []);
}

export function createReference(input = {}) {
  const title = String(input.title || '').trim();
  if (!title) return null;

  const next = {
    id: crypto.randomUUID(),
    type: String(input.type || 'tab').trim() || 'tab',
    title,
    url: String(input.url || '').trim(),
    provider: String(input.provider || '').trim(),
    instrument: String(input.instrument || '').trim(),
    tuning: String(input.tuning || '').trim(),
    capo: String(input.capo || '').trim(),
    difficulty: String(input.difficulty || '').trim(),
    notes: String(input.notes || '').trim(),
  };

  saveReferences([...getReferences(), next]);
  return next;
}

export function removeReference(referenceId) {
  saveReferences(getReferences().filter((item) => item.id !== referenceId));
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
    writeSilent(SPOTIFY_HISTORY_KEY, next);
    notifySync(SPOTIFY_HISTORY_KEY);
    if (!options.silent) {
      window.dispatchEvent(new CustomEvent('musicverse:store-change', {
        detail: { key: SPOTIFY_HISTORY_KEY, source: 'local' },
      }));
    }
  }
  return next;
}

export function getLocalUserSnapshot() {
  return {
    playlists: getPlaylists(),
    favorites: getFavorites(),
    listeningLog: getListeningLog(),
    spotifyHistory: getSpotifyListeningHistory(),
    featuredAlbumHistory: getFeaturedAlbumHistory(),
    references: getReferences(),
  };
}

export function hydrateLocalUserSnapshot(snapshot = {}) {
  writeSilent(PLAYLIST_KEY, Array.isArray(snapshot.playlists) ? snapshot.playlists : []);
  writeSilent(FAVORITES_KEY, Array.isArray(snapshot.favorites) ? snapshot.favorites : []);
  writeSilent(LISTENED_KEY, snapshot.listeningLog && typeof snapshot.listeningLog === 'object' ? snapshot.listeningLog : {});
  writeSilent(SPOTIFY_HISTORY_KEY, Array.isArray(snapshot.spotifyHistory) ? snapshot.spotifyHistory : []);
  writeSilent(FEATURED_ALBUM_HISTORY_KEY, Array.isArray(snapshot.featuredAlbumHistory) ? snapshot.featuredAlbumHistory : []);
  writeSilent(REFERENCES_KEY, Array.isArray(snapshot.references) ? snapshot.references : []);

  window.dispatchEvent(new CustomEvent('musicverse:store-change', {
    detail: { source: 'remote', key: 'snapshot' },
  }));
}
