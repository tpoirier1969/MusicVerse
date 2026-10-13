import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildCatalogBundle,
  validateCatalogBundle,
  assertExpectedProject,
} from '../scripts/catalog-sync-lib.mjs';

const albums = JSON.parse(await readFile(new URL('../public/data/cover-albums.json', import.meta.url), 'utf8'));
const details = JSON.parse(await readFile(new URL('../public/data/cover-album-details.json', import.meta.url), 'utf8'));
const crazyCovers = JSON.parse(await readFile(new URL('../public/data/crazy-covers.json', import.meta.url), 'utf8'));
const soundTrail = JSON.parse(await readFile(new URL('../public/data/soundtrail.json', import.meta.url), 'utf8'));

test('catalog sync bundle preserves stable MusicVerse identities', () => {
  const bundle = buildCatalogBundle({ albums, details, crazyCovers, soundTrail });
  const summary = validateCatalogBundle(bundle);

  assert.equal(summary.albums, albums.length);
  assert.equal(summary.albumDetails, details.length);
  assert.equal(summary.crazyCovers, crazyCovers.length);
  assert.equal(summary.soundTrailInstruments, soundTrail.instruments.length);
  assert.equal(summary.soundTrailRecordings, soundTrail.recordings.length);

  assert.deepEqual(bundle.albums.map((item) => item.legacyId), albums.map((item) => item.id));
  assert.deepEqual(bundle.crazyCovers.map((item) => item.legacyId), crazyCovers.map((item) => item.id));
  assert.deepEqual(bundle.soundTrail.recordings.map((item) => item.legacyId), soundTrail.recordings.map((item) => item.id));
  assert.equal(bundle.soundTrail.instruments[0].importance, soundTrail.instruments[0].importance);
  assert.deepEqual(bundle.soundTrail.instruments[0].researchSources, soundTrail.instruments[0].researchSources);
  assert.equal(bundle.soundTrail.instruments[0].researchStandardVersion, 1);
});

test('catalog sync fingerprint is repeat-safe for unchanged input', () => {
  const first = buildCatalogBundle({ albums, details, crazyCovers, soundTrail });
  const second = buildCatalogBundle({ albums, details, crazyCovers, soundTrail });
  assert.equal(first.sourceFingerprint, second.sourceFingerprint);
});

test('catalog sync strips tracking parameters from Spotify links', () => {
  const bundle = buildCatalogBundle({
    albums: [{
      id: 'cover-album-test',
      artist: 'Artist',
      album: 'Album',
      spotify: 'https://open.spotify.com/album/ABC123?utm_source=test&request_id=abc',
    }],
    details: [],
    crazyCovers: [],
    soundTrail: { instruments: [], recordings: [] },
  });

  assert.equal(bundle.albums[0].spotifyUrl, 'https://open.spotify.com/album/ABC123');
  assert.equal(bundle.albums[0].spotifyAlbumId, 'ABC123');
});

test('catalog sync refuses to write to a different shared Supabase project', () => {
  assert.equal(
    assertExpectedProject('https://wntakzfoprthwggkidyq.supabase.co', 'wntakzfoprthwggkidyq'),
    'wntakzfoprthwggkidyq',
  );
  assert.throws(
    () => assertExpectedProject('https://tdepltlnughyfrjqufdg.supabase.co', 'wntakzfoprthwggkidyq'),
    /Refusing catalog write/,
  );
});
