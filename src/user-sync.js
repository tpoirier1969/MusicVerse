import { createClient } from '@supabase/supabase-js';
import { musicVerseSupabaseConfig } from './supabase-catalog.js';
import {
  MUSICVERSE_STORE_KEYS,
  getLocalUserSnapshot,
  hydrateLocalUserSnapshot,
} from './store.js';

const SYNC_STATE_KEY = 'musicverse.user-sync-state.v1';
const ARCHIVE_PREFIX = 'musicverse.user-archive.';
const ALL_DOMAINS = ['playlists', 'favorites', 'listening', 'featured', 'references'];
const KEY_DOMAIN = new Map([
  [MUSICVERSE_STORE_KEYS.playlists, 'playlists'],
  [MUSICVERSE_STORE_KEYS.favorites, 'favorites'],
  [MUSICVERSE_STORE_KEYS.listened, 'listening'],
  [MUSICVERSE_STORE_KEYS.spotifyHistory, 'listening'],
  [MUSICVERSE_STORE_KEYS.featuredAlbums, 'featured'],
  [MUSICVERSE_STORE_KEYS.references, 'references'],
]);

const { url, publishableKey } = musicVerseSupabaseConfig();
const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

let initialized = false;
let currentSession = null;
let syncTimer = null;
let syncChain = Promise.resolve();
let lastPullAt = 0;

let publicState = {
  initialized: false,
  signedIn: false,
  email: '',
  status: 'signed-out',
  lastSyncAt: '',
  error: '',
  linkSentTo: '',
  warnings: [],
};

function emitState(patch = {}) {
  publicState = { ...publicState, ...patch };
  window.dispatchEvent(new CustomEvent('musicverse:user-sync-state', { detail: { ...publicState } }));
}

function readSyncState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_STATE_KEY) || 'null') || {};
    return {
      userId: String(parsed.userId || ''),
      established: Boolean(parsed.established),
      dirtyVersions: parsed.dirtyVersions && typeof parsed.dirtyVersions === 'object'
        ? parsed.dirtyVersions
        : {},
      lastSyncAt: String(parsed.lastSyncAt || ''),
    };
  } catch {
    return { userId: '', established: false, dirtyVersions: {}, lastSyncAt: '' };
  }
}

function writeSyncState(value) {
  localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(value));
}

function updateSyncState(patch = {}) {
  const next = { ...readSyncState(), ...patch };
  writeSyncState(next);
  return next;
}

function isPermanentSession(session) {
  return Boolean(session?.user && !session.user.is_anonymous && session.user.email);
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function spotifyTrackId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('spotify:track:')) return raw.split(':').pop() || '';
  try {
    const parsed = new URL(raw);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (/^intl-[a-z]{2}$/i.test(parts[0] || '')) parts.shift();
    return parts[0] === 'track' ? String(parts[1] || '') : '';
  } catch {
    return '';
  }
}

function emptySnapshot() {
  return {
    playlists: [],
    favorites: [],
    listeningLog: {},
    spotifyHistory: [],
    featuredAlbumHistory: [],
    references: [],
  };
}

function archiveLocalSnapshot(userId) {
  if (!userId) return;
  const key = `${ARCHIVE_PREFIX}${userId}.v1`;
  localStorage.setItem(key, JSON.stringify({
    archivedAt: new Date().toISOString(),
    snapshot: getLocalUserSnapshot(),
  }));
}

function mergeById(localItems = [], remoteItems = [], itemMerge = null) {
  const result = new Map();
  for (const item of localItems) if (item?.id) result.set(item.id, item);
  for (const item of remoteItems) {
    if (!item?.id) continue;
    const existing = result.get(item.id);
    result.set(item.id, existing && itemMerge ? itemMerge(existing, item) : item);
  }
  return [...result.values()];
}

function mergePlaylists(localItems, remoteItems) {
  return mergeById(localItems, remoteItems, (local, remote) => {
    const tracks = mergeById(local.tracks || [], remote.tracks || []);
    return { ...local, ...remote, tracks };
  });
}

function mergeSnapshots(local, remote) {
  const listeningLog = { ...(local.listeningLog || {}) };
  for (const [key, playedAt] of Object.entries(remote.listeningLog || {})) {
    if (!listeningLog[key] || String(playedAt) > String(listeningLog[key])) listeningLog[key] = playedAt;
  }

  const spotifyHistory = mergeById(local.spotifyHistory || [], remote.spotifyHistory || [])
    .sort((a, b) => String(b.playedAt).localeCompare(String(a.playedAt)))
    .slice(0, 1000);

  const features = new Map();
  for (const item of local.featuredAlbumHistory || []) if (item?.date) features.set(item.date, item);
  for (const item of remote.featuredAlbumHistory || []) if (item?.date) features.set(item.date, item);

  return {
    playlists: mergePlaylists(local.playlists || [], remote.playlists || []),
    favorites: [...new Set([...(local.favorites || []), ...(remote.favorites || [])])],
    listeningLog,
    spotifyHistory,
    featuredAlbumHistory: [...features.values()]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(-366),
    references: mergeById(local.references || [], remote.references || []),
  };
}

function queue(task) {
  syncChain = syncChain.then(task, task);
  return syncChain;
}

function markDirty(domain) {
  if (!ALL_DOMAINS.includes(domain)) return;
  const state = readSyncState();
  state.dirtyVersions[domain] = Number(state.dirtyVersions[domain] || 0) + 1;
  writeSyncState(state);
  if (isPermanentSession(currentSession)) scheduleDirtySync();
}

function clearDirtyIfVersion(domain, version) {
  const state = readSyncState();
  if (Number(state.dirtyVersions[domain] || 0) === Number(version || 0)) {
    delete state.dirtyVersions[domain];
    writeSyncState(state);
  }
}

function scheduleDirtySync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const dirty = Object.keys(readSyncState().dirtyVersions);
    if (!dirty.length || !isPermanentSession(currentSession)) return;
    void queue(() => pushDomains(dirty));
  }, 500);
}

function check(result, context) {
  if (result?.error) throw new Error(`${context}: ${result.error.message}`);
  return result?.data || [];
}

async function resolveRecordingIds(sourceKeys = [], spotifyIds = []) {
  const bySource = new Map();
  const bySpotify = new Map();

  const cleanKeys = [...new Set(sourceKeys.filter(Boolean))];
  const cleanSpotify = [...new Set(spotifyIds.filter(Boolean))];
  const legacyKeys = cleanKeys.filter((key) => !validUuid(key));
  const uuidKeys = cleanKeys.filter(validUuid);

  if (legacyKeys.length) {
    const aliases = check(
      await supabase
        .from('musicverse_recording_aliases')
        .select('alias_id,recording_id')
        .in('alias_id', legacyKeys),
      'Could not resolve MusicVerse recording IDs',
    );
    for (const row of aliases) bySource.set(row.alias_id, row.recording_id);
  }

  if (uuidKeys.length) {
    const recordings = check(
      await supabase.from('musicverse_recordings').select('id').in('id', uuidKeys),
      'Could not resolve older recording UUIDs',
    );
    for (const row of recordings) bySource.set(row.id, row.id);
  }

  if (cleanSpotify.length) {
    const recordings = check(
      await supabase
        .from('musicverse_recordings')
        .select('id,spotify_track_id')
        .in('spotify_track_id', cleanSpotify),
      'Could not resolve Spotify recording IDs',
    );
    for (const row of recordings) bySpotify.set(row.spotify_track_id, row.id);
  }

  return { bySource, bySpotify };
}

async function resolveAlbumIds(legacyIds = []) {
  const map = new Map();
  const clean = [...new Set(legacyIds.filter(Boolean))];
  if (!clean.length) return map;
  const rows = check(
    await supabase.from('musicverse_albums').select('id,legacy_id').in('legacy_id', clean),
    'Could not resolve album IDs',
  );
  for (const row of rows) map.set(row.legacy_id, row.id);
  return map;
}

async function resolveInstrumentIds(slugs = []) {
  const map = new Map();
  const clean = [...new Set(slugs.filter(Boolean))];
  if (!clean.length) return map;
  const rows = check(
    await supabase.from('musicverse_instruments').select('id,slug').in('slug', clean),
    'Could not resolve instrument IDs',
  );
  for (const row of rows) map.set(row.slug, row.id);
  return map;
}

async function syncPlaylists(snapshot, userId) {
  const playlists = (snapshot.playlists || []).filter((playlist) => validUuid(playlist.id));
  const localPlaylistIds = new Set(playlists.map((playlist) => playlist.id));

  const remotePlaylists = check(
    await supabase.from('musicverse_user_playlists').select('id').eq('user_id', userId),
    'Could not read synced playlists',
  );

  if (playlists.length) {
    check(await supabase.from('musicverse_user_playlists').upsert(
      playlists.map((playlist) => ({
        id: playlist.id,
        user_id: userId,
        name: String(playlist.name || 'Untitled Playlist'),
        description: String(playlist.description || ''),
        spotify_playlist_id: playlist.spotifyPlaylistId || null,
        spotify_url: playlist.spotifyUrl || null,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'id' },
    ), 'Could not save playlists');
  }

  const remoteItems = check(
    await supabase
      .from('musicverse_user_playlist_items')
      .select('id,playlist_id,source_item_key')
      .eq('user_id', userId),
    'Could not read synced playlist tracks',
  );
  const existingItem = new Map(
    remoteItems
      .filter((item) => item.source_item_key)
      .map((item) => [`${item.playlist_id}:${item.source_item_key}`, item]),
  );

  const flatTracks = playlists.flatMap((playlist) =>
    (playlist.tracks || []).map((track, position) => ({ playlist, track, position })));
  const sourceKeys = flatTracks.map(({ track }) => String(track.id || '')).filter(Boolean);
  const spotifyIds = flatTracks.map(({ track }) =>
    spotifyTrackId(track.spotifyUri || track.spotifyUrl)).filter(Boolean);
  const resolved = await resolveRecordingIds(sourceKeys, spotifyIds);

  const targetKeys = new Set();
  const itemRows = flatTracks.flatMap(({ playlist, track, position }) => {
    const sourceKey = String(track.id || '').trim();
    if (!sourceKey) return [];
    const spotifyId = spotifyTrackId(track.spotifyUri || track.spotifyUrl);
    const recordingId = resolved.bySource.get(sourceKey) || resolved.bySpotify.get(spotifyId) || null;
    const compound = `${playlist.id}:${sourceKey}`;
    targetKeys.add(compound);
    return [{
      id: existingItem.get(compound)?.id || crypto.randomUUID(),
      playlist_id: playlist.id,
      user_id: userId,
      recording_id: recordingId,
      spotify_track_id: spotifyId || null,
      source_item_key: sourceKey,
      title_snapshot: String(track.title || 'Unknown track'),
      artist_snapshot: String(track.artist || ''),
      original_artist_snapshot: String(track.originalArtist || ''),
      spotify_url: String(track.spotifyUrl || ''),
      spotify_uri: String(track.spotifyUri || ''),
      artwork_url: String(track.artwork || ''),
      position,
      match_status: recordingId || spotifyId ? 'matched' : 'unmatched',
    }];
  });

  if (itemRows.length) {
    check(
      await supabase.from('musicverse_user_playlist_items').upsert(itemRows, { onConflict: 'id' }),
      'Could not save playlist tracks',
    );
  }

  const staleItems = remoteItems
    .filter((item) => localPlaylistIds.has(item.playlist_id))
    .filter((item) => !item.source_item_key || !targetKeys.has(`${item.playlist_id}:${item.source_item_key}`))
    .map((item) => item.id);

  if (staleItems.length) {
    check(
      await supabase.from('musicverse_user_playlist_items').delete().in('id', staleItems),
      'Could not remove deleted playlist tracks',
    );
  }

  const stalePlaylists = remotePlaylists
    .filter((item) => !localPlaylistIds.has(item.id))
    .map((item) => item.id);

  if (stalePlaylists.length) {
    check(
      await supabase.from('musicverse_user_playlists').delete().in('id', stalePlaylists),
      'Could not remove deleted playlists',
    );
  }
}

async function syncFavorites(snapshot, userId) {
  const favorites = [...new Set((snapshot.favorites || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const resolved = await resolveRecordingIds(favorites, []);
  const remote = check(
    await supabase
      .from('musicverse_user_saved_items')
      .select('id,recording_id,source_item_key')
      .eq('user_id', userId)
      .not('recording_id', 'is', null),
    'Could not read synced favorites',
  );

  const existingByKey = new Map(remote.filter((row) => row.source_item_key).map((row) => [row.source_item_key, row]));
  const existingByRecording = new Map(remote.map((row) => [row.recording_id, row]));
  const rows = [];
  const targetRecordingIds = new Set();

  for (const sourceKey of favorites) {
    const recordingId = resolved.bySource.get(sourceKey);
    if (!recordingId) continue;
    targetRecordingIds.add(recordingId);
    const existing = existingByKey.get(sourceKey) || existingByRecording.get(recordingId);
    rows.push({
      id: existing?.id || crypto.randomUUID(),
      user_id: userId,
      recording_id: recordingId,
      source_item_key: sourceKey,
    });
  }

  if (rows.length) {
    check(
      await supabase.from('musicverse_user_saved_items').upsert(rows, { onConflict: 'id' }),
      'Could not save favorites',
    );
  }

  const stale = remote.filter((row) => !targetRecordingIds.has(row.recording_id)).map((row) => row.id);
  if (stale.length) {
    check(
      await supabase.from('musicverse_user_saved_items').delete().in('id', stale),
      'Could not remove deleted favorites',
    );
  }

  return favorites.length - rows.length;
}

async function syncListening(snapshot, userId) {
  const localOpenEntries = Object.entries(snapshot.listeningLog || {});
  const spotifyItems = snapshot.spotifyHistory || [];
  const sourceKeys = localOpenEntries.map(([id]) => id);
  const spotifyIds = spotifyItems.map((item) => String(item.trackId || '')).filter(Boolean);
  const resolved = await resolveRecordingIds(sourceKeys, spotifyIds);

  const remote = check(
    await supabase
      .from('musicverse_user_listening_events')
      .select('id,source,source_event_key')
      .eq('user_id', userId),
    'Could not read synced listening history',
  );
  const existing = new Map(
    remote
      .filter((row) => row.source_event_key)
      .map((row) => [`${row.source}:${row.source_event_key}`, row.id]),
  );

  const rows = [];

  for (const [sourceKey, playedAt] of localOpenEntries) {
    const eventKey = `musicverse-open:${sourceKey}`;
    rows.push({
      id: existing.get(`musicverse_play:${eventKey}`) || crypto.randomUUID(),
      user_id: userId,
      recording_id: resolved.bySource.get(sourceKey) || null,
      spotify_track_id: null,
      source: 'musicverse_play',
      played_at: playedAt,
      source_event_key: eventKey,
      source_item_key: sourceKey,
      title_snapshot: sourceKey,
      artist_snapshot: null,
      artists_snapshot: [],
      album_snapshot: null,
      spotify_album_id: null,
      spotify_url: null,
      artwork_url: null,
      context_url: null,
    });
  }

  for (const item of spotifyItems) {
    const eventKey = String(item.id || '').trim();
    const trackId = String(item.trackId || '').trim();
    if (!eventKey || !trackId || !item.playedAt) continue;
    const artists = Array.isArray(item.artists) ? item.artists.filter(Boolean) : [];
    rows.push({
      id: existing.get(`spotify:${eventKey}`) || crypto.randomUUID(),
      user_id: userId,
      recording_id: resolved.bySpotify.get(trackId) || null,
      spotify_track_id: trackId,
      source: 'spotify',
      played_at: item.playedAt,
      spotify_event_key: eventKey,
      source_event_key: eventKey,
      source_item_key: null,
      title_snapshot: String(item.title || ''),
      artist_snapshot: artists.join(', ') || null,
      artists_snapshot: artists,
      album_snapshot: String(item.album || ''),
      spotify_album_id: String(item.albumId || '') || null,
      spotify_url: String(item.spotifyUrl || '') || null,
      artwork_url: String(item.artwork || '') || null,
      context_url: String(item.contextUrl || '') || null,
    });
  }

  if (rows.length) {
    check(
      await supabase.from('musicverse_user_listening_events').upsert(rows, { onConflict: 'id' }),
      'Could not save listening history',
    );
  }
}

async function syncFeatured(snapshot, userId) {
  const history = (snapshot.featuredAlbumHistory || []).filter((item) => item?.date && item?.albumId);
  if (!history.length) return;

  const albumIds = await resolveAlbumIds(history.map((item) => item.albumId));
  const rows = history.flatMap((item) => {
    const albumId = albumIds.get(item.albumId);
    if (!albumId) return [];
    return [{
      user_id: userId,
      feature_date: item.date,
      album_id: albumId,
      selected_at: item.selectedAt || new Date().toISOString(),
      reason: {},
    }];
  });

  if (rows.length) {
    check(
      await supabase
        .from('musicverse_user_feature_history')
        .upsert(rows, { onConflict: 'user_id,feature_date' }),
      'Could not save featured-album history',
    );
  }
}

async function syncReferences(snapshot, userId) {
  const references = (snapshot.references || []).filter((item) => validUuid(item.id));
  const instruments = await resolveInstrumentIds(references.map((item) => item.instrument));
  const remote = check(
    await supabase.from('musicverse_user_references').select('id').eq('user_id', userId),
    'Could not read synced references',
  );

  if (references.length) {
    check(
      await supabase.from('musicverse_user_references').upsert(
        references.map((item) => ({
          id: item.id,
          user_id: userId,
          recording_id: null,
          reference_type: ['tab', 'chords', 'sheet_music', 'tuning', 'lesson', 'other'].includes(item.type)
            ? item.type
            : 'other',
          title: String(item.title || 'Untitled reference'),
          url: String(item.url || '') || null,
          provider: String(item.provider || '') || null,
          tuning: String(item.tuning || '') || null,
          capo: String(item.capo || '') || null,
          difficulty: String(item.difficulty || '') || null,
          notes: String(item.notes || '') || null,
          instrument_id: instruments.get(item.instrument) || null,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'id' },
      ),
      'Could not save references',
    );
  }

  const localIds = new Set(references.map((item) => item.id));
  const stale = remote.filter((item) => !localIds.has(item.id)).map((item) => item.id);
  if (stale.length) {
    check(
      await supabase.from('musicverse_user_references').delete().in('id', stale),
      'Could not remove deleted references',
    );
  }
}

async function pushDomains(domains) {
  if (!isPermanentSession(currentSession)) return;
  const userId = currentSession.user.id;
  const uniqueDomains = [...new Set(domains)].filter((domain) => ALL_DOMAINS.includes(domain));
  if (!uniqueDomains.length) return;

  emitState({ status: 'syncing', error: '' });
  const versions = Object.fromEntries(
    uniqueDomains.map((domain) => [domain, Number(readSyncState().dirtyVersions[domain] || 0)]),
  );
  const snapshot = getLocalUserSnapshot();
  const warnings = [];

  for (const domain of uniqueDomains) {
    if (domain === 'playlists') await syncPlaylists(snapshot, userId);
    if (domain === 'favorites') {
      const unmatched = await syncFavorites(snapshot, userId);
      if (unmatched) warnings.push(`${unmatched} favorite${unmatched === 1 ? '' : 's'} could not be matched to a catalog recording.`);
    }
    if (domain === 'listening') await syncListening(snapshot, userId);
    if (domain === 'featured') await syncFeatured(snapshot, userId);
    if (domain === 'references') await syncReferences(snapshot, userId);
    clearDirtyIfVersion(domain, versions[domain]);
  }

  const now = new Date().toISOString();
  updateSyncState({ lastSyncAt: now });
  emitState({ status: 'synced', lastSyncAt: now, error: '', warnings });
}

async function loadRemoteSnapshot(userId) {
  const [
    playlistResult,
    playlistItemsResult,
    favoritesResult,
    listeningResult,
    referencesResult,
    featuresResult,
  ] = await Promise.all([
    supabase.from('musicverse_user_playlists').select('*').eq('user_id', userId).order('created_at'),
    supabase.from('musicverse_user_playlist_items').select('*').eq('user_id', userId).order('position'),
    supabase.from('musicverse_user_saved_items').select('*').eq('user_id', userId).not('recording_id', 'is', null),
    supabase.from('musicverse_user_listening_events').select('*').eq('user_id', userId).order('played_at', { ascending: false }).limit(2000),
    supabase.from('musicverse_user_references').select('*').eq('user_id', userId).order('created_at'),
    supabase.from('musicverse_user_feature_history').select('*').eq('user_id', userId).order('feature_date'),
  ]);

  const playlists = check(playlistResult, 'Could not load playlists');
  const playlistItems = check(playlistItemsResult, 'Could not load playlist tracks');
  const favorites = check(favoritesResult, 'Could not load favorites');
  const listening = check(listeningResult, 'Could not load listening history');
  const references = check(referencesResult, 'Could not load references');
  const features = check(featuresResult, 'Could not load featured-album history');

  const albumUuidIds = [...new Set(features.map((item) => item.album_id).filter(Boolean))];
  const albumLegacy = new Map();
  if (albumUuidIds.length) {
    const rows = check(
      await supabase.from('musicverse_albums').select('id,legacy_id').in('id', albumUuidIds),
      'Could not resolve featured albums',
    );
    for (const row of rows) albumLegacy.set(row.id, row.legacy_id);
  }

  const instrumentUuidIds = [...new Set(references.map((item) => item.instrument_id).filter(Boolean))];
  const instrumentSlug = new Map();
  if (instrumentUuidIds.length) {
    const rows = check(
      await supabase.from('musicverse_instruments').select('id,slug').in('id', instrumentUuidIds),
      'Could not resolve reference instruments',
    );
    for (const row of rows) instrumentSlug.set(row.id, row.slug);
  }

  const favoriteRecordingIds = [...new Set(favorites.map((item) => item.recording_id).filter(Boolean))];
  const favoriteAlias = new Map();
  if (favoriteRecordingIds.length) {
    const aliases = check(
      await supabase
        .from('musicverse_recording_aliases')
        .select('recording_id,alias_id,alias_type')
        .in('recording_id', favoriteRecordingIds),
      'Could not resolve favorite IDs',
    );
    const priority = { crazy_cover: 3, album_track: 2, soundtrail: 1, legacy_import: 0 };
    for (const alias of aliases) {
      const current = favoriteAlias.get(alias.recording_id);
      if (!current || (priority[alias.alias_type] || 0) > (priority[current.alias_type] || 0)) {
        favoriteAlias.set(alias.recording_id, alias);
      }
    }
  }

  const itemsByPlaylist = new Map();
  for (const item of playlistItems) {
    if (!itemsByPlaylist.has(item.playlist_id)) itemsByPlaylist.set(item.playlist_id, []);
    itemsByPlaylist.get(item.playlist_id).push({
      id: item.source_item_key || item.recording_id || item.spotify_track_id || item.id,
      title: item.title_snapshot || 'Unknown track',
      artist: item.artist_snapshot || '',
      originalArtist: item.original_artist_snapshot || '',
      spotifyUrl: item.spotify_url || '',
      spotifyUri: item.spotify_uri || (item.spotify_track_id ? `spotify:track:${item.spotify_track_id}` : ''),
      artwork: item.artwork_url || '',
    });
  }

  const listeningLog = {};
  const spotifyHistory = [];
  for (const item of listening) {
    if (item.source === 'musicverse_play') {
      const key = item.source_item_key || String(item.source_event_key || '').replace(/^musicverse-open:/, '');
      if (key && (!listeningLog[key] || String(item.played_at) > String(listeningLog[key]))) {
        listeningLog[key] = item.played_at;
      }
    }
    if (item.source === 'spotify' && item.spotify_track_id) {
      spotifyHistory.push({
        id: item.source_event_key || item.spotify_event_key || `spotify-play:${item.played_at}:${item.spotify_track_id}`,
        source: 'spotify',
        playedAt: item.played_at,
        trackId: item.spotify_track_id,
        title: item.title_snapshot || 'Unknown track',
        artists: Array.isArray(item.artists_snapshot) && item.artists_snapshot.length
          ? item.artists_snapshot
          : (item.artist_snapshot ? [item.artist_snapshot] : []),
        album: item.album_snapshot || '',
        albumId: item.spotify_album_id || '',
        spotifyUrl: item.spotify_url || '',
        artwork: item.artwork_url || '',
        contextUrl: item.context_url || '',
      });
    }
  }

  return {
    playlists: playlists.map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description || '',
      spotifyPlaylistId: playlist.spotify_playlist_id || '',
      spotifyUrl: playlist.spotify_url || '',
      tracks: itemsByPlaylist.get(playlist.id) || [],
    })),
    favorites: favorites.map((item) => {
      const contextualAlias = favoriteAlias.get(item.recording_id)?.alias_id;
      if (contextualAlias && (!item.source_item_key || validUuid(item.source_item_key))) return contextualAlias;
      return item.source_item_key || contextualAlias || item.recording_id;
    }).filter(Boolean),
    listeningLog,
    spotifyHistory: spotifyHistory
      .sort((a, b) => String(b.playedAt).localeCompare(String(a.playedAt)))
      .slice(0, 1000),
    featuredAlbumHistory: features.flatMap((item) => {
      const legacyId = albumLegacy.get(item.album_id);
      if (!legacyId) return [];
      return [{
        date: item.feature_date,
        albumId: legacyId,
        selectedAt: item.selected_at,
      }];
    }),
    references: references.map((item) => ({
      id: item.id,
      type: item.reference_type,
      title: item.title,
      url: item.url || '',
      provider: item.provider || '',
      instrument: instrumentSlug.get(item.instrument_id) || '',
      tuning: item.tuning || '',
      capo: item.capo || '',
      difficulty: item.difficulty || '',
      notes: item.notes || '',
    })),
  };
}

async function pullRemoteIntoCache() {
  if (!isPermanentSession(currentSession)) return;
  const remote = await loadRemoteSnapshot(currentSession.user.id);
  hydrateLocalUserSnapshot(remote);
  lastPullAt = Date.now();
  const now = new Date().toISOString();
  updateSyncState({ lastSyncAt: now });
  emitState({ status: 'synced', lastSyncAt: now, error: '' });
}

async function reconcileSignedInUser() {
  if (!isPermanentSession(currentSession)) return;
  const user = currentSession.user;
  let syncState = readSyncState();

  if (syncState.userId && syncState.userId !== user.id) {
    archiveLocalSnapshot(syncState.userId);
    hydrateLocalUserSnapshot(emptySnapshot());
    syncState = {
      userId: user.id,
      established: false,
      dirtyVersions: {},
      lastSyncAt: '',
    };
    writeSyncState(syncState);
  } else if (!syncState.userId) {
    syncState.userId = user.id;
    writeSyncState(syncState);
  }

  emitState({
    signedIn: true,
    email: user.email || '',
    status: 'syncing',
    error: '',
    linkSentTo: '',
  });

  if (!syncState.established) {
    const local = getLocalUserSnapshot();
    const remote = await loadRemoteSnapshot(user.id);
    const merged = mergeSnapshots(local, remote);
    hydrateLocalUserSnapshot(merged);

    const dirtyVersions = Object.fromEntries(ALL_DOMAINS.map((domain) => [domain, 1]));
    writeSyncState({
      userId: user.id,
      established: true,
      dirtyVersions,
      lastSyncAt: '',
    });
    await pushDomains(ALL_DOMAINS);
    await pullRemoteIntoCache();
    return;
  }

  const dirty = Object.keys(syncState.dirtyVersions || {});
  if (dirty.length) await pushDomains(dirty);
  await pullRemoteIntoCache();
}

async function handleSession(nextSession) {
  currentSession = isPermanentSession(nextSession) ? nextSession : null;

  if (!currentSession) {
    emitState({
      initialized: true,
      signedIn: false,
      email: '',
      status: 'signed-out',
      error: '',
      linkSentTo: publicState.linkSentTo,
    });
    return;
  }

  try {
    await queue(reconcileSignedInUser);
  } catch (error) {
    console.warn('MusicVerse personal sync failed.', error);
    emitState({
      initialized: true,
      signedIn: true,
      email: currentSession.user.email || '',
      status: 'error',
      error: error.message || 'Personal sync failed.',
    });
  }
}

export function getMusicVerseUserSyncState() {
  return { ...publicState };
}

export async function requestMusicVerseSignIn(email) {
  const cleanEmail = String(email || '').trim();
  if (!cleanEmail) throw new Error('Enter an email address.');

  emitState({ status: 'signing-in', error: '', linkSentTo: '' });
  const redirectTo = new URL(location.pathname || '/', location.origin).toString();
  const { error } = await supabase.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: redirectTo,
    },
  });

  if (error) {
    emitState({ status: 'signed-out', error: error.message, linkSentTo: '' });
    throw error;
  }

  emitState({
    status: 'link-sent',
    error: '',
    linkSentTo: cleanEmail,
  });
}

export async function signOutMusicVerse() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  currentSession = null;
  emitState({
    signedIn: false,
    email: '',
    status: 'signed-out',
    error: '',
    linkSentTo: '',
  });
}

export async function syncMusicVerseNow() {
  if (!isPermanentSession(currentSession)) throw new Error('Sign in to sync MusicVerse.');
  return queue(async () => {
    const dirty = Object.keys(readSyncState().dirtyVersions || {});
    if (dirty.length) await pushDomains(dirty);
    await pullRemoteIntoCache();
  });
}

export async function initMusicVerseUserSync() {
  if (initialized) return getMusicVerseUserSyncState();
  initialized = true;

  window.addEventListener('musicverse:sync-dirty', (event) => {
    const domain = KEY_DOMAIN.get(event.detail?.key);
    if (domain) markDirty(domain);
  });

  window.addEventListener('focus', () => {
    if (!isPermanentSession(currentSession)) return;
    if (Date.now() - lastPullAt < 30_000) return;
    void syncMusicVerseNow().catch((error) => {
      emitState({ status: 'error', error: error.message || 'Could not refresh synced data.' });
    });
  });

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED') {
      currentSession = isPermanentSession(session) ? session : null;
      return;
    }
    if (event === 'SIGNED_OUT') {
      void handleSession(null);
      return;
    }
    if (event === 'SIGNED_IN') {
      setTimeout(() => void handleSession(session), 0);
    }
  });

  emitState({ initialized: false, status: 'checking' });
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    emitState({ initialized: true, status: 'error', error: error.message });
    throw error;
  }

  await handleSession(data.session);
  publicState.initialized = true;
  emitState({ initialized: true });
  return getMusicVerseUserSyncState();
}
