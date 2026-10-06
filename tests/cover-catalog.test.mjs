import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterCoverAlbums,
  formatDuration,
  getAlbumOriginalArtists,
  getFacetOptions,
  mergeCoverAlbums,
} from '../src/cover-catalog.js';

const albums = [
  { id: 'a1', artist: 'Herbie Hancock', album: 'The New Standard', genre: 'Jazz', approach: 'Jazz reinterpretations' },
  { id: 'a2', artist: 'Pat Metheny', album: "What's It All About", genre: 'Jazz', approach: 'Solo guitar covers' },
];
const details = [
  {
    albumId: 'a1',
    originalArtists: ['Prince', 'Nirvana'],
    originalGenres: ['Rock'],
    tracks: [
      { title: 'All Apologies', originalArtist: 'Nirvana', musicians: [{ name: 'Herbie Hancock', roles: ['piano'] }] },
    ],
  },
];

test('merges detail records without duplicating albums', () => {
  const merged = mergeCoverAlbums(albums, details);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].detail.albumId, 'a1');
  assert.equal(merged[1].detail, null);
});

test('filters by cover artist and source/original artist', () => {
  const merged = mergeCoverAlbums(albums, details);
  assert.deepEqual(filterCoverAlbums(merged, { coverArtist: 'Pat Metheny' }).map((x) => x.id), ['a2']);
  assert.deepEqual(filterCoverAlbums(merged, { originalArtist: 'Nirvana' }).map((x) => x.id), ['a1']);
});

test('search includes track titles and musician names', () => {
  const merged = mergeCoverAlbums(albums, details);
  assert.deepEqual(filterCoverAlbums(merged, {}, 'All Apologies').map((x) => x.id), ['a1']);
  assert.deepEqual(filterCoverAlbums(merged, {}, 'Herbie Hancock').map((x) => x.id), ['a1']);
});

test('facet options respond to other selected facets', () => {
  const merged = mergeCoverAlbums(albums, details);
  assert.deepEqual(getFacetOptions(merged, { coverGenre: 'Jazz' }, 'coverArtist'), ['Herbie Hancock', 'Pat Metheny']);
  assert.deepEqual(getFacetOptions(merged, { originalArtist: 'Nirvana' }, 'coverArtist'), ['Herbie Hancock']);
});

test('original artists are unique and durations format as m:ss', () => {
  const merged = mergeCoverAlbums(albums, details);
  assert.deepEqual(getAlbumOriginalArtists(merged[0]), ['Prince', 'Nirvana']);
  assert.equal(formatDuration(393.276), '6:33');
});
