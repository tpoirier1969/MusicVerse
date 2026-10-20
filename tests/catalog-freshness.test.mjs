import test from 'node:test';
import assert from 'node:assert/strict';
import { getCatalogFreshnessIssues } from '../src/data.js';

function catalog(overrides = {}) {
  return {
    coverAlbums: [{ id: 'cover-album-0001' }],
    crazyCovers: [{ id: 'crazy-cover-0001' }],
    soundTrail: {
      instruments: [{
        id: 'accordion',
        researchStandardVersion: 2,
        genres: [{ name: 'Cajun' }, { name: 'Chamamé' }],
      }],
      recordings: [
        { id: 'soundtrail-recording-0001' },
        { id: 'soundtrail-recording-0002' },
      ],
    },
    ...overrides,
  };
}

test('fresh Supabase catalog satisfies all bundled stable IDs', () => {
  assert.deepEqual(getCatalogFreshnessIssues(catalog(), catalog()), []);
});

test('missing bundled SoundTrail recordings marks Supabase stale', () => {
  const remote = catalog({
    soundTrail: {
      instruments: catalog().soundTrail.instruments,
      recordings: [{ id: 'soundtrail-recording-0001' }],
    },
  });

  const issues = getCatalogFreshnessIssues(remote, catalog());
  assert.ok(issues.some((issue) =>
    issue.includes('soundTrail.recordings:missing:soundtrail-recording-0002')));
});

test('missing bundled SoundTrail styles marks Supabase stale', () => {
  const remote = catalog({
    soundTrail: {
      instruments: [{
        id: 'accordion',
        researchStandardVersion: 2,
        genres: [{ name: 'Cajun' }],
      }],
      recordings: catalog().soundTrail.recordings,
    },
  });

  const issues = getCatalogFreshnessIssues(remote, catalog());
  assert.ok(issues.some((issue) => issue.includes('soundTrail.genres:accordion:missing:Chamamé')));
});

test('newer Supabase extras do not force bundled fallback', () => {
  const remote = catalog({
    soundTrail: {
      instruments: catalog().soundTrail.instruments,
      recordings: [
        ...catalog().soundTrail.recordings,
        { id: 'soundtrail-recording-0003' },
      ],
    },
  });

  assert.deepEqual(getCatalogFreshnessIssues(remote, catalog()), []);
});
