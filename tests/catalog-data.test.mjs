import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const albums = JSON.parse(await readFile(new URL('../public/data/cover-albums.json', import.meta.url), 'utf8'));
const details = JSON.parse(await readFile(new URL('../public/data/cover-album-details.json', import.meta.url), 'utf8'));

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
