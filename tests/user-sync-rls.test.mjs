import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../supabase/migrations/20261013_musicverse_permanent_user_rls_v1.sql', import.meta.url),
  'utf8',
);

test('personal MusicVerse tables reject anonymous Supabase users at the database layer', () => {
  for (const table of [
    'musicverse_user_playlists',
    'musicverse_user_playlist_items',
    'musicverse_user_saved_items',
    'musicverse_user_listening_events',
    'musicverse_user_references',
    'musicverse_user_feature_history',
  ]) {
    assert.match(migration, new RegExp(table));
  }

  assert.match(migration, /as restrictive for all to authenticated/i);
  assert.match(migration, /is_anonymous/i);
  assert.doesNotMatch(migration, /drop table/i);
  assert.doesNotMatch(migration, /delete from/i);
});
