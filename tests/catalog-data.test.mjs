import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isCoverAlbumEligible, mergeCoverAlbums } from '../src/cover-catalog.js';

const albums = JSON.parse(await readFile(new URL('../public/data/cover-albums.json', import.meta.url), 'utf8'));
const details = JSON.parse(await readFile(new URL('../public/data/cover-album-details.json', import.meta.url), 'utf8'));
const crazyCovers = JSON.parse(await readFile(new URL('../public/data/crazy-covers.json', import.meta.url), 'utf8'));

test('CoverVerse album IDs are present and unique', () => {
  const ids = albums.map((album) => album.id);
  assert.equal(ids.length, 111);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^cover-album-\d{4}$/);
});

test('album detail records reference real albums and unique tracks', () => {
  const albumIds = new Set(albums.map((album) => album.id));
  const detailIds = details.map((detail) => detail.albumId);
  assert.equal(new Set(detailIds).size, detailIds.length);

  const trackIds = [];
  for (const detail of details) {
    assert.ok(albumIds.has(detail.albumId), `Unknown album detail target: ${detail.albumId}`);
    for (const track of detail.tracks || []) {
      trackIds.push(track.id);
      assert.ok(Number(track.durationSeconds) > 0);
      assert.match(track.spotify || '', /^https:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]+$/);
      assert.match(track.spotifyUri || '', /^spotify:track:[A-Za-z0-9]+$/);
    }
  }
  assert.equal(new Set(trackIds).size, trackIds.length);
});

test('existing album catalog keeps real Spotify album links', () => {
  for (const album of albums) {
    assert.match(album.spotify || '', /^https:\/\/open\.spotify\.com\/album\/[A-Za-z0-9]+/);
  }
});

test('audited mixed releases follow the 90 percent and cover-album-intent policy', () => {
  const merged = mergeCoverAlbums(albums, details);
  const eligibleIds = new Set(merged.filter(isCoverAlbumEligible).map((album) => album.id));

  for (const id of [
    'cover-album-0023',
    'cover-album-0039',
    'cover-album-0042',
    'cover-album-0050',
    'cover-album-0057',
    'cover-album-0067',
    'cover-album-0073',
  ]) {
    assert.ok(eligibleIds.has(id), `Expected cover-focused album to be eligible: ${id}`);
  }

  for (const id of ['cover-album-0002', 'cover-album-0003', 'cover-album-0103', 'cover-album-0104']) {
    assert.equal(eligibleIds.has(id), false, `Mixed concert release should stay out of Cover Albums: ${id}`);
  }
});

test('standout covers salvaged from mixed albums live in Crazy Covers', () => {
  const expected = [
    ['Phish', 'Crosseyed And Painless'],
    ['Phish', '2001'],
    ['Phish', 'While My Guitar Gently Weeps'],
    ['Les Claypool', 'Shine on You Crazy Diamond'],
    ["Gov't Mule", 'Time'],
  ];
  for (const [coverArtist, song] of expected) {
    assert.ok(crazyCovers.some((item) => item.coverArtist === coverArtist && item.song === song), `Missing Crazy Covers migration: ${coverArtist} — ${song}`);
  }
});
