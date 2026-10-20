import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../supabase/migrations/20261020_soundtrail_learning_metadata_v1.sql', import.meta.url),
  'utf8',
);

test('SoundTrail learning migration is additive and preserves catalog identities', () => {
  assert.match(migration, /alter table public\.musicverse_instruments/i);
  assert.match(migration, /alter table public\.musicverse_instrument_genres/i);
  assert.match(migration, /listen_for text/i);
  assert.match(migration, /common_setup text/i);
  assert.match(migration, /learning_focus text/i);
  assert.match(migration, /example_policy jsonb/i);
  assert.match(migration, /learning_notes jsonb/i);
  assert.doesNotMatch(migration, /drop table/i);
  assert.doesNotMatch(migration, /delete from/i);
  assert.doesNotMatch(migration, /truncate/i);
});

test('SoundTrail research RPC persists and returns learner metadata', () => {
  assert.match(migration, /musicverse_import_soundtrail_research_v1/i);
  assert.match(migration, /v_genre->>'listenFor'/);
  assert.match(migration, /v_genre->>'commonSetup'/);
  assert.match(migration, /v_genre->>'learningFocus'/);
  assert.match(migration, /'listenFor', ig\.listen_for/);
  assert.match(migration, /'commonSetup', ig\.common_setup/);
  assert.match(migration, /'learningFocus', ig\.learning_focus/);
});
