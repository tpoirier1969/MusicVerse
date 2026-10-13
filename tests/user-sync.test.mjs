import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const syncMigration = await readFile(
  new URL('../supabase/migrations/20261013_musicverse_user_sync_v1.sql', import.meta.url),
  'utf8',
);
const listeningMigration = await readFile(
  new URL('../supabase/migrations/20261013_musicverse_listening_metadata_v1.sql', import.meta.url),
  'utf8',
);
const syncSource = await readFile(new URL('../src/user-sync.js', import.meta.url), 'utf8');

test('personal sync schema preserves stable browser identities', () => {
  assert.match(syncMigration, /source_item_key text/i);
  assert.match(syncMigration, /source_event_key text/i);
  assert.match(syncMigration, /musicverse_user_playlist_items_source_uidx/i);
  assert.match(syncMigration, /musicverse_user_saved_items_source_uidx/i);
  assert.match(syncMigration, /musicverse_user_listening_events_source_event_uidx/i);
});

test('listening sync preserves display metadata without changing listening semantics', () => {
  assert.match(listeningMigration, /artists_snapshot text\[\]/i);
  assert.match(listeningMigration, /spotify_album_id text/i);
  assert.match(listeningMigration, /artwork_url text/i);
  assert.match(syncSource, /source: 'musicverse_play'/);
  assert.match(syncSource, /source: 'spotify'/);
});

test('MusicVerse personal sync targets Yellowdawg through the shared catalog config', () => {
  assert.doesNotMatch(syncSource, /tdepltlnughyfrjqufdg/);
  assert.match(syncSource, /musicVerseSupabaseConfig/);
  assert.match(syncSource, /musicverse_user_playlists/);
  assert.match(syncSource, /musicverse_user_saved_items/);
  assert.match(syncSource, /musicverse_user_listening_events/);
  assert.match(syncSource, /musicverse_user_feature_history/);
  assert.match(syncSource, /musicverse_user_references/);
});

test('account switching archives the local cache before hydrating another account', () => {
  assert.match(syncSource, /archiveLocalSnapshot\(syncState\.userId\)/);
  assert.match(syncSource, /hydrateLocalUserSnapshot\(emptySnapshot\(\)\)/);
});
