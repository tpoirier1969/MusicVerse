import { createHash } from 'node:crypto';

function spotifyId(value, type) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith(`spotify:${type}:`)) return raw.split(':').pop() || '';
  try {
    const url = new URL(raw);
    const parts = url.pathname.split('/').filter(Boolean);
    if (/^intl-[a-z]{2}$/i.test(parts[0] || '')) parts.shift();
    return parts[0] === type ? String(parts[1] || '') : '';
  } catch {
    return '';
  }
}

function canonicalSpotifyUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return raw;
  }
}

function stableJson(value) {
  return JSON.stringify(value);
}

function uniqueIds(items, label) {
  const ids = items.map((item) => item.legacyId || item.id).filter(Boolean);
  if (ids.length !== items.length) throw new Error(`${label} contains a record without an ID.`);
  if (new Set(ids).size !== ids.length) throw new Error(`${label} contains duplicate IDs.`);
}

export function buildCatalogBundle({ albums, details, crazyCovers, soundTrail }) {
  const albumRows = Array.isArray(albums) ? albums : [];
  const detailRows = Array.isArray(details) ? details : [];
  const crazyRows = Array.isArray(crazyCovers) ? crazyCovers : [];
  const instruments = Array.isArray(soundTrail?.instruments) ? soundTrail.instruments : [];
  const soundRows = Array.isArray(soundTrail?.recordings) ? soundTrail.recordings : [];
  const detailByAlbum = new Map(detailRows.map((detail) => [detail.albumId, detail]));

  const normalizedAlbums = albumRows.map((album) => {
    const detail = detailByAlbum.get(album.id) || null;
    return {
      legacyId: album.id,
      catalogRank: album.rank ?? null,
      startHere: Boolean(album.startHere),
      artist: album.artist || '',
      title: album.album || '',
      coverGenre: album.genre || '',
      approach: album.approach || '',
      why: album.why || '',
      spotifyUrl: canonicalSpotifyUrl(album.spotify),
      spotifyAlbumId: spotifyId(album.spotify, 'album'),
      coverAlbumIntent: typeof album.coverAlbumIntent === 'boolean' ? album.coverAlbumIntent : null,
      coverTrackCount: album.coverTrackCount ?? null,
      totalTrackCount: album.totalTrackCount ?? null,
      catalogNote: album.catalogNote || '',
      detail: detail ? {
        releaseDate: detail.releaseDate || null,
        artwork: detail.artwork || '',
        originalArtists: detail.originalArtists || [],
        originalGenres: detail.originalGenres || [],
        notes: detail.notes || [],
        personnel: detail.personnel || [],
        sources: detail.sources || [],
        tracks: (detail.tracks || []).map((track) => ({
          legacyId: track.id,
          number: Number(track.number) || 0,
          title: track.title || '',
          durationSeconds: Number(track.durationSeconds) || 0,
          originalArtist: track.originalArtist || '',
          originalGenre: track.originalGenre || null,
          isCover: typeof track.isCover === 'boolean' ? track.isCover : null,
          spotifyUrl: canonicalSpotifyUrl(track.spotify),
          spotifyTrackId: spotifyId(track.spotifyUri || track.spotify, 'track'),
          artwork: track.artwork || '',
          musicians: track.musicians || [],
        })),
      } : null,
    };
  });

  const normalizedCrazy = crazyRows.map((track, index) => ({
    legacyId: track.id,
    catalogOrder: index + 1,
    sourceArtist: track.sourceArtist || '',
    song: track.song || '',
    coverArtist: track.coverArtist || '',
    style: track.style || '',
    wildness: Number(track.wildness) || 0,
    standout: Boolean(track.standout),
    why: track.why || '',
    artwork: track.artwork || '',
    spotifyUrl: canonicalSpotifyUrl(track.spotify),
    spotifyTrackId: spotifyId(track.spotify, 'track'),
  }));

  const normalizedSoundTrail = {
    instruments: instruments.map((instrument, index) => ({
      id: instrument.id,
      label: instrument.label || '',
      description: instrument.description || '',
      importance: instrument.importance || '',
      researchSources: instrument.researchSources || [],
      researchStandardVersion: Number(instrument.researchStandardVersion) || 0,
      sortOrder: index + 1,
      genres: (instrument.genres || []).map((genre) => ({
        name: genre.name || '',
        about: genre.about || '',
        researchSources: genre.researchSources || [],
      })),
    })),
    recordings: soundRows.map((recording, index) => ({
      legacyId: recording.id,
      catalogOrder: index + 1,
      artist: recording.artist || '',
      track: recording.track || '',
      region: recording.region || '',
      startHere: Boolean(recording.startHere),
      instruments: recording.instruments || [],
      genresByInstrument: recording.genresByInstrument || {},
      instrumentNotes: recording.instrumentNotes || {},
      spotifyUrl: canonicalSpotifyUrl(recording.spotify),
      spotifyTrackId: spotifyId(recording.spotify, 'track'),
      artwork: recording.artwork || '',
    })),
  };

  const payload = {
    schemaVersion: 1,
    albums: normalizedAlbums,
    crazyCovers: normalizedCrazy,
    soundTrail: normalizedSoundTrail,
  };
  const sourceFingerprint = createHash('sha256').update(stableJson(payload)).digest('hex');
  return { ...payload, sourceFingerprint };
}

export function validateCatalogBundle(bundle) {
  uniqueIds(bundle.albums || [], 'Albums');
  uniqueIds(bundle.crazyCovers || [], 'Crazy Covers');
  uniqueIds(bundle.soundTrail?.instruments || [], 'SoundTrail instruments');
  uniqueIds(bundle.soundTrail?.recordings || [], 'SoundTrail recordings');

  const albumIds = new Set((bundle.albums || []).map((item) => item.legacyId));
  const trackIds = [];
  for (const album of bundle.albums || []) {
    for (const track of album.detail?.tracks || []) {
      if (!track.legacyId) throw new Error(`Album ${album.legacyId} has a track without a stable ID.`);
      trackIds.push(track.legacyId);
    }
  }
  if (new Set(trackIds).size !== trackIds.length) throw new Error('Album details contain duplicate track IDs.');

  const instruments = bundle.soundTrail?.instruments || [];
  const instrumentIds = new Set(instruments.map((item) => item.id));
  const soundRecordings = bundle.soundTrail?.recordings || [];

  for (const instrument of instruments) {
    if (!String(instrument.importance || '').trim()) {
      throw new Error(`SoundTrail instrument ${instrument.id} is missing why-it-matters research.`);
    }
    if (!(instrument.researchSources || []).length) {
      throw new Error(`SoundTrail instrument ${instrument.id} is missing research sources.`);
    }
    if (Number(instrument.researchStandardVersion) < 1) {
      throw new Error(`SoundTrail instrument ${instrument.id} has not completed the current research standard.`);
    }
    if ((instrument.genres || []).length < 3) {
      throw new Error(`SoundTrail instrument ${instrument.id} needs a researched style map, not just starter tracks.`);
    }
    for (const genre of instrument.genres || []) {
      if (!String(genre.about || '').trim()) {
        throw new Error(`SoundTrail style ${instrument.id} / ${genre.name} is missing its role description.`);
      }
      if (!(genre.researchSources || []).length) {
        throw new Error(`SoundTrail style ${instrument.id} / ${genre.name} is missing research provenance.`);
      }
      const hasExample = soundRecordings.some((recording) =>
        (recording.instruments || []).includes(instrument.id)
        && recording.genresByInstrument?.[instrument.id] === genre.name
      );
      if (!hasExample) {
        throw new Error(`SoundTrail style ${instrument.id} / ${genre.name} has no verified recording example.`);
      }
    }
  }

  for (const recording of soundRecordings) {
    for (const instrumentId of recording.instruments || []) {
      if (!instrumentIds.has(instrumentId)) {
        throw new Error(`SoundTrail recording ${recording.legacyId} references unknown instrument ${instrumentId}.`);
      }
    }
  }

  return {
    albums: albumIds.size,
    albumDetails: (bundle.albums || []).filter((album) => album.detail).length,
    albumTracks: trackIds.length,
    crazyCovers: (bundle.crazyCovers || []).length,
    soundTrailInstruments: instrumentIds.size,
    soundTrailRecordings: (bundle.soundTrail?.recordings || []).length,
    sourceFingerprint: bundle.sourceFingerprint,
  };
}

export function assertExpectedProject(url, expectedProjectRef) {
  const host = new URL(url).hostname;
  const actual = host.split('.')[0];
  if (actual !== expectedProjectRef) {
    throw new Error(`Refusing catalog write: expected Supabase project ${expectedProjectRef}, got ${actual}.`);
  }
  return actual;
}
