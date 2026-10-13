import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../supabase/migrations/20261013_musicverse_catalog_v1.sql', import.meta.url),
  'utf8',
);

test('Yellowdawg catalog migration exposes the resources used by the app', () => {
  for (const name of [
    'musicverse_cover_albums_v',
    'musicverse_album_details_v',
    'musicverse_crazy_covers_v',
    'musicverse_soundtrail_instruments_v',
    'musicverse_soundtrail_v',
    'musicverse_import_catalog_v1',
  ]) {
    assert.match(migration, new RegExp('\\b' + name + '\\b'));
  }
});

test('catalog importer is protected and non-destructive', () => {
  assert.match(
    migration,
    /revoke all on function public\.musicverse_import_catalog_v1\(jsonb\) from public, anon, authenticated;/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.musicverse_import_catalog_v1\(jsonb\) to service_role;/i,
  );

  const functionBody = migration
    .split('create or replace function public.musicverse_import_catalog_v1(payload jsonb)')[1]
    .split('revoke all on function public.musicverse_import_catalog_v1(jsonb)')[0];

  assert.doesNotMatch(functionBody, /\bdelete\s+from\b/i);
  assert.doesNotMatch(functionBody, /\btruncate\b/i);
  assert.doesNotMatch(functionBody, /\bdrop\s+table\b/i);
});

test('recording identity can converge on Spotify without depending on display text', () => {
  assert.match(migration, /musicverse_catalog_recording_aliases/);
  assert.match(migration, /where spotify_track_id = p_spotify_track_id/i);
  assert.doesNotMatch(
    migration,
    /where\s+lower\(title\).*lower\(artist\)/i,
  );
});
