import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../supabase/migrations/20261013_musicverse_catalog_v1.sql', import.meta.url),
  'utf8',
);

test('Yellowdawg migration augments the existing MusicVerse schema', () => {
  for (const name of [
    'musicverse_recording_aliases',
    'musicverse_import_catalog_v1',
    'musicverse_resolve_recording',
    'musicverse_crazy_covers_v',
    'musicverse_soundtrail_v',
  ]) {
    assert.match(migration, new RegExp('\\b' + name + '\\b'));
  }

  assert.doesNotMatch(migration, /create table if not exists public\.musicverse_catalog_albums/i);
  assert.doesNotMatch(migration, /create table if not exists public\.musicverse_catalog_recordings/i);
});

test('catalog importer is service-role protected and non-destructive', () => {
  assert.match(
    migration,
    /revoke all on function public\.musicverse_import_catalog_v1\(jsonb\)[\s\S]*from public, anon, authenticated;/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.musicverse_import_catalog_v1\(jsonb\)[\s\S]*to service_role;/i,
  );

  const functionBody = migration
    .split('create or replace function public.musicverse_import_catalog_v1(payload jsonb)')[1]
    .split('revoke all on function public.musicverse_import_catalog_v1(jsonb)')[0];

  assert.doesNotMatch(functionBody, /\bdelete\s+from\b/i);
  assert.doesNotMatch(functionBody, /\btruncate\b/i);
  assert.doesNotMatch(functionBody, /\bdrop\s+table\b/i);
});

test('recording identity uses stable aliases and Spotify IDs rather than display text', () => {
  assert.match(migration, /musicverse_recording_aliases/);
  assert.match(migration, /where spotify_track_id = p_spotify_track_id/i);
  assert.match(migration, /crazy-cover-' \|\| lpad\(catalog_order::text, 4, '0'\)/i);
});

test('Crazy Covers and SoundTrail views prefer contextual stable aliases', () => {
  assert.match(migration, /alias\.alias_type = 'crazy_cover'/i);
  assert.match(migration, /alias\.alias_type = 'soundtrail'/i);
  assert.match(migration, /coalesce\(alias\.alias_id, r\.legacy_id\) as legacy_id/i);
});
