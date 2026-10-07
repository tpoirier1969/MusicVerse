import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpotifyListeningItems } from '../src/store.js';

test('normalizes Spotify recently-played items with stable play identity', () => {
  const items = normalizeSpotifyListeningItems([
    {
      played_at: '2026-10-07T12:34:56.000Z',
      track: {
        id: 'track123',
        name: 'A Different Road',
        artists: [{ name: 'Artist One' }, { name: 'Artist Two' }],
        album: {
          id: 'album123',
          name: 'Album Name',
          images: [
            { url: 'https://i.scdn.co/image/large' },
            { url: 'https://i.scdn.co/image/medium' },
          ],
        },
        external_urls: { spotify: 'https://open.spotify.com/track/track123' },
      },
      context: {
        external_urls: { spotify: 'https://open.spotify.com/playlist/context123' },
      },
    },
    { played_at: '', track: { id: 'ignored' } },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'spotify-play:2026-10-07T12:34:56.000Z:track123');
  assert.equal(items[0].source, 'spotify');
  assert.equal(items[0].title, 'A Different Road');
  assert.deepEqual(items[0].artists, ['Artist One', 'Artist Two']);
  assert.equal(items[0].album, 'Album Name');
  assert.equal(items[0].albumId, 'album123');
  assert.equal(items[0].artwork, 'https://i.scdn.co/image/medium');
  assert.equal(items[0].spotifyUrl, 'https://open.spotify.com/track/track123');
});
