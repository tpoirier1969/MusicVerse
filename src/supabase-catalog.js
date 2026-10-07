const DEFAULT_SUPABASE_URL = 'https://wntakzfoprthwggkidyq.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_gWu_EQ1J3s0iNjeDeINJwQ_xKy8QgAJ';

function envValue(name) {
  return String(import.meta.env?.[name] || '').trim();
}

export function musicVerseSupabaseConfig() {
  return {
    url: envValue('VITE_MUSICVERSE_SUPABASE_URL') || DEFAULT_SUPABASE_URL,
    publishableKey: envValue('VITE_MUSICVERSE_SUPABASE_PUBLISHABLE_KEY') || DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  };
}

async function selectRows(resource, params = {}) {
  const { url, publishableKey } = musicVerseSupabaseConfig();
  if (!url || !publishableKey) throw new Error('MusicVerse Supabase is not configured.');

  const endpoint = new URL(`${url.replace(/\/$/, '')}/rest/v1/${resource}`);
  endpoint.searchParams.set('select', params.select || '*');
  if (params.order) endpoint.searchParams.set('order', params.order);
  if (params.limit) endpoint.searchParams.set('limit', String(params.limit));

  const response = await fetch(endpoint, {
    cache: 'no-store',
    headers: {
      apikey: publishableKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Supabase catalog request failed for ${resource} (${response.status})${detail ? `: ${detail}` : ''}`);
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeAlbumDetail(row) {
  return {
    albumId: row.album_id,
    releaseDate: row.release_date || row.release_date_text || null,
    artwork: row.artwork || '',
    originalArtists: asArray(row.original_artists),
    originalGenres: asArray(row.original_genres),
    notes: asArray(row.notes),
    personnel: asArray(row.personnel),
    sources: asArray(row.sources),
    tracks: asArray(row.tracks).map((track) => ({
      id: track.id || track.recordingUuid || '',
      recordingUuid: track.recordingUuid || '',
      number: Number(track.number) || 0,
      title: track.title || '',
      durationSeconds: Number(track.durationSeconds) || 0,
      originalArtist: track.originalArtist || '',
      originalGenre: track.originalGenre || null,
      isCover: typeof track.isCover === 'boolean' ? track.isCover : null,
      spotify: track.spotify || '',
      spotifyUri: track.spotifyUri || '',
      artwork: track.artwork || '',
      musicians: asArray(track.musicians),
    })),
  };
}

export function mapSupabaseCatalog({ albumRows, detailRows, crazyRows, instrumentRows, soundTrailRows }) {
  const detailByAlbum = new Map(asArray(detailRows).map((row) => [row.album_id, normalizeAlbumDetail(row)]));

  const coverAlbums = asArray(albumRows)
    .map((row) => ({
      id: row.legacy_id || row.id,
      uuid: row.id || '',
      artist: row.artist || '',
      album: row.album || '',
      genre: asArray(row.cover_genres)[0] || '',
      coverGenres: asArray(row.cover_genres),
      originalGenres: asArray(row.original_genres),
      releaseDate: row.release_date || row.release_date_text || null,
      addedAt: row.added_at || null,
      artwork: row.artwork_url || '',
      spotify: row.spotify_url || '',
      spotifyAlbumId: row.spotify_album_id || '',
      rank: Number(row.catalog_rank) || null,
      startHere: Boolean(row.start_here),
      coverAlbumIntent: typeof row.cover_album_intent === 'boolean' ? row.cover_album_intent : null,
      coverTrackCount: row.cover_track_count == null ? null : Number(row.cover_track_count),
      totalTrackCount: row.total_track_count == null ? null : Number(row.total_track_count),
      approach: row.approach || '',
      why: row.why || '',
      catalogNote: row.catalog_note || '',
      detail: detailByAlbum.get(row.legacy_id) || null,
    }))
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));

  const crazyCovers = asArray(crazyRows)
    .map((row) => ({
      id: row.recording_id || row.legacy_id || '',
      sourceArtist: row.source_artist || '',
      song: row.song || '',
      coverArtist: row.cover_artist || '',
      style: row.style || '',
      wildness: Number(row.wildness) || 0,
      standout: Boolean(row.standout),
      why: row.why || '',
      artwork: row.artwork_url || '',
      spotify: row.spotify_url || '',
      catalogOrder: Number(row.catalog_order) || 0,
    }))
    .sort((a, b) => a.catalogOrder - b.catalogOrder);

  const instruments = asArray(instrumentRows)
    .map((row) => ({
      id: row.id,
      label: row.label,
      description: row.description || '',
      genres: asArray(row.genres),
      sortOrder: Number(row.sort_order) || 999,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const recordingMap = new Map();
  for (const row of asArray(soundTrailRows)) {
    const key = row.recording_id || row.legacy_id;
    if (!key) continue;
    if (!recordingMap.has(key)) {
      recordingMap.set(key, {
        id: row.legacy_id || row.recording_id,
        uuid: row.recording_id || '',
        artist: row.artist || '',
        track: row.track || '',
        region: row.region || '',
        startHere: Boolean(row.start_here),
        instruments: [],
        genresByInstrument: {},
        instrumentNotes: {},
        spotify: row.spotify_url || '',
        artwork: row.artwork_url || '',
        catalogOrder: Number(row.catalog_order) || 0,
      });
    }
    const recording = recordingMap.get(key);
    if (row.instrument_slug && !recording.instruments.includes(row.instrument_slug)) {
      recording.instruments.push(row.instrument_slug);
    }
    if (row.instrument_slug && row.genre) recording.genresByInstrument[row.instrument_slug] = row.genre;
    if (row.instrument_slug && row.instrument_note) recording.instrumentNotes[row.instrument_slug] = row.instrument_note;
    const order = Number(row.catalog_order) || 0;
    if (!recording.catalogOrder || (order && order < recording.catalogOrder)) recording.catalogOrder = order;
  }

  const recordings = [...recordingMap.values()].sort((a, b) => a.catalogOrder - b.catalogOrder);

  return {
    coverAlbums,
    crazyCovers,
    soundTrail: { instruments, recordings },
    catalogSource: 'supabase',
  };
}

export async function loadSupabaseCatalog() {
  const [albumRows, detailRows, crazyRows, instrumentRows, soundTrailRows] = await Promise.all([
    selectRows('musicverse_cover_albums_v', { order: 'catalog_rank.asc.nullslast', limit: 1000 }),
    selectRows('musicverse_album_details_v', { limit: 1000 }),
    selectRows('musicverse_crazy_covers_v', { order: 'catalog_order.asc.nullslast', limit: 1000 }),
    selectRows('musicverse_soundtrail_instruments_v', { order: 'sort_order.asc.nullslast', limit: 100 }),
    selectRows('musicverse_soundtrail_v', { order: 'catalog_order.asc.nullslast', limit: 1000 }),
  ]);

  return mapSupabaseCatalog({ albumRows, detailRows, crazyRows, instrumentRows, soundTrailRows });
}
