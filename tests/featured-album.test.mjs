import test from 'node:test';
import assert from 'node:assert/strict';
import { featuredAlbumDateKey, selectFeaturedCoverAlbum } from '../src/featured-album.js';

function album(id, options = {}) {
  return {
    id,
    album: options.album || `Album ${id}`,
    artist: options.artist || 'Artist',
    spotifyAlbumId: options.spotifyAlbumId || `spotify-${id}`,
    addedAt: options.addedAt || null,
    startHere: options.startHere ?? true,
    rank: options.rank ?? 10,
    detail: { tracks: [{ id: `${id}-track` }] },
  };
}

function plays(albumId, count, playedAt) {
  return Array.from({ length: count }, (_, index) => ({
    id: `play-${albumId}-${index}`,
    albumId: `spotify-${albumId}`,
    album: `Album ${albumId}`,
    artists: ['Artist'],
    playedAt,
  }));
}

test('keeps the same Featured Cover Album for the entire calendar day', () => {
  const now = new Date('2026-10-07T12:00:00');
  const albums = [album('a'), album('b')];
  const history = [{ date: featuredAlbumDateKey(now), albumId: 'b' }];

  const selected = selectFeaturedCoverAlbum(albums, {
    now,
    history,
    spotifyHistory: plays('a', 40, '2026-09-20T12:00:00Z'),
  });

  assert.equal(selected.id, 'b');
});

test('avoids repeating albums until the current candidate pool has cycled', () => {
  const albums = [album('a'), album('b'), album('c')];
  const selected = selectFeaturedCoverAlbum(albums, {
    now: new Date('2026-10-07T12:00:00'),
    history: [
      { date: '2026-10-05', albumId: 'a' },
      { date: '2026-10-06', albumId: 'b' },
    ],
    spotifyHistory: [],
  });

  assert.equal(selected.id, 'c');
});

test('favors albums with substantial listening when they have rested for more than a week', () => {
  const albums = [album('heavy'), album('unplayed')];
  const selected = selectFeaturedCoverAlbum(albums, {
    now: new Date('2026-10-07T12:00:00'),
    history: [],
    spotifyHistory: plays('heavy', 24, '2026-09-20T12:00:00Z'),
  });

  assert.equal(selected.id, 'heavy');
});

test('recent listening suppresses the heavy-listening boost for seven days', () => {
  const albums = [album('recent'), album('rested')];
  const history = [];
  const spotifyHistory = [
    ...plays('recent', 30, '2026-10-05T12:00:00Z'),
    ...plays('rested', 6, '2026-09-20T12:00:00Z'),
  ];

  const selected = selectFeaturedCoverAlbum(albums, {
    now: new Date('2026-10-07T12:00:00'),
    history,
    spotifyHistory,
  });

  assert.equal(selected.id, 'rested');
});

test('newly added albums receive a meaningful feature boost', () => {
  const albums = [
    album('new', { addedAt: '2026-10-06T12:00:00Z' }),
    album('old', { addedAt: '2025-10-01T12:00:00Z' }),
  ];

  const selected = selectFeaturedCoverAlbum(albums, {
    now: new Date('2026-10-07T12:00:00'),
    history: [],
    spotifyHistory: [],
  });

  assert.equal(selected.id, 'new');
});
