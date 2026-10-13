import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../supabase/migrations/20261013201000_soundtrail_hide_orphan_styles_v1.sql', import.meta.url),
  'utf8',
);

test('SoundTrail runtime view hides orphaned styles without deleting catalog history', () => {
  assert.match(migration, /create or replace view public\.musicverse_soundtrail_instruments_v/i);
  assert.match(migration, /exists\s*\([\s\S]*musicverse_recording_instruments/i);
  assert.match(migration, /ri\.instrument_id = ig\.instrument_id/i);
  assert.match(migration, /ri\.genre_id = ig\.genre_id/i);
  assert.doesNotMatch(migration, /delete from/i);
  assert.doesNotMatch(migration, /drop table/i);
});
