import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../supabase/migrations/20261013195500_soundtrail_research_standard_v1.sql', import.meta.url),
  'utf8',
);

test('SoundTrail research migration is additive and service-role protected', () => {
  assert.match(migration, /add column if not exists importance text/i);
  assert.match(migration, /add column if not exists research_sources jsonb/i);
  assert.match(migration, /add column if not exists research_standard_version integer/i);
  assert.match(migration, /musicverse_import_soundtrail_research_v1/i);
  assert.match(migration, /grant execute on function public\.musicverse_import_soundtrail_research_v1\(jsonb\)[\s\S]*to service_role/i);
  assert.doesNotMatch(migration, /drop table/i);
  assert.doesNotMatch(migration, /delete from/i);
});

test('SoundTrail instrument view exposes research metadata', () => {
  assert.match(migration, /i\.importance/i);
  assert.match(migration, /i\.research_sources/i);
  assert.match(migration, /i\.research_standard_version/i);
  assert.match(migration, /'researchSources', ig\.research_sources/i);
});
