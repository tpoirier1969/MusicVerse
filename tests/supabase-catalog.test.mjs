import test from 'node:test';
import assert from 'node:assert/strict';
import { mapSupabaseCatalog } from '../src/supabase-catalog.js';

test('maps Supabase catalog views into the existing MusicVerse data shape', () => {
  const data = mapSupabaseCatalog({
    albumRows: [{
      id: 'album-uuid',
      legacy_id: 'cover-album-0001',
      album: 'Example Album',
      artist: 'Example Artist',
      cover_genres: ['Jazz'],
      original_genres: ['Rock'],
      release_date: '2020-01-01',
      artwork_url: 'https://example.com/album.jpg',
      spotify_album_id: 'album123',
      spotify_url: 'https://open.spotify.com/album/album123',
      catalog_rank: 2,
      start_here: true,
      cover_album_intent: true,
      cover_track_count: 9,
      total_track_count: 10,
      approach: 'Rearranged',
      why: 'Interesting',
      catalog_note: '',
    }],
    detailRows: [{
      album_id: 'cover-album-0001',
      release_date: '2020-01-01',
      artwork: 'https://example.com/album.jpg',
      original_artists: ['Source Artist'],
      original_genres: ['Rock'],
      notes: ['Album note'],
      personnel: [{ name: 'Player', roles: ['guitar'] }],
      sources: [{ label: 'Source', url: 'https://example.com' }],
      tracks: [{
        id: 'cover-track-0001-01',
        recordingUuid: 'recording-uuid',
        number: 1,
        title: 'Example Song',
        durationSeconds: 240,
        originalArtist: 'Source Artist',
        originalGenre: 'Rock',
        isCover: true,
        spotify: 'https://open.spotify.com/track/track123',
        spotifyUri: 'spotify:track:track123',
        artwork: '',
        musicians: [{ name: 'Player', roles: ['guitar'] }],
      }],
    }],
    crazyRows: [{
      recording_id: 'crazy-uuid',
      source_artist: 'Source Artist',
      song: 'Wild Song',
      cover_artist: 'Cover Artist',
      style: 'Jazz',
      wildness: 5,
      standout: true,
      why: 'Very different',
      spotify_url: 'https://open.spotify.com/track/crazy123',
      catalog_order: 7,
    }],
    instrumentRows: [{
      id: 'cello',
      label: 'Cello',
      description: 'Cello description',
      genres: [{ name: 'Classical', about: 'About cello in classical music.' }],
      sort_order: 3,
    }],
    soundTrailRows: [{
      recording_id: 'sound-uuid',
      legacy_id: 'soundtrail-recording-0001',
      artist: 'Cellist',
      track: 'Cello Track',
      region: 'USA',
      start_here: true,
      instrument_slug: 'cello',
      genre: 'Classical',
      instrument_note: 'Cello is featured.',
      spotify_url: 'https://open.spotify.com/track/sound123',
      catalog_order: 4,
    }],
  });

  assert.equal(data.catalogSource, 'supabase');
  assert.equal(data.coverAlbums[0].id, 'cover-album-0001');
  assert.equal(data.coverAlbums[0].detail.tracks[0].originalArtist, 'Source Artist');
  assert.equal(data.crazyCovers[0].catalogOrder, 7);
  assert.equal(data.soundTrail.instruments[0].id, 'cello');
  assert.equal(data.soundTrail.recordings[0].genresByInstrument.cello, 'Classical');
});

test('one Supabase recording can belong to multiple SoundTrail instruments without duplication', () => {
  const data = mapSupabaseCatalog({
    albumRows: [],
    detailRows: [],
    crazyRows: [],
    instrumentRows: [
      { id: 'sitar', label: 'Sitar', description: '', genres: [], sort_order: 1 },
      { id: 'tabla', label: 'Tabla', description: '', genres: [], sort_order: 2 },
    ],
    soundTrailRows: [
      {
        recording_id: 'shared-recording',
        legacy_id: 'soundtrail-recording-0042',
        artist: 'Artist',
        track: 'Track',
        instrument_slug: 'sitar',
        genre: 'Fusion',
        instrument_note: 'Sitar note',
        catalog_order: 5,
      },
      {
        recording_id: 'shared-recording',
        legacy_id: 'soundtrail-recording-0042',
        artist: 'Artist',
        track: 'Track',
        instrument_slug: 'tabla',
        genre: 'Fusion',
        instrument_note: 'Tabla note',
        catalog_order: 5,
      },
    ],
  });

  assert.equal(data.soundTrail.recordings.length, 1);
  assert.deepEqual(data.soundTrail.recordings[0].instruments.sort(), ['sitar', 'tabla']);
  assert.equal(data.soundTrail.recordings[0].instrumentNotes.tabla, 'Tabla note');
});
