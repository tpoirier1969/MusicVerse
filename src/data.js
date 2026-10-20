import { isCoverAlbumEligible, mergeCoverAlbums } from './cover-catalog.js';
import { loadSupabaseCatalog } from './supabase-catalog.js';

const DATA_BASE = '/data';

async function readJson(name) {
  const response = await fetch(`${DATA_BASE}/${name}.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load ${name}.`);
  return response.json();
}

export async function loadAppVersion() {
  const response = await fetch('/version.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load application version.');
  const payload = await response.json();
  return String(payload?.version || '').trim();
}

async function loadBundledMusicData() {
  const [coverAlbums, coverAlbumDetails, crazyCovers, soundTrail] = await Promise.all([
    readJson('cover-albums'),
    readJson('cover-album-details'),
    readJson('crazy-covers'),
    readJson('soundtrail'),
  ]);
  const mergedCoverAlbums = mergeCoverAlbums(coverAlbums, coverAlbumDetails);
  return {
    coverAlbums: mergedCoverAlbums.filter(isCoverAlbumEligible),
    crazyCovers,
    soundTrail,
    catalogSource: 'bundled-fallback',
  };
}

function stableIds(items) {
  return new Set((Array.isArray(items) ? items : []).map((item) => item?.id).filter(Boolean));
}

function missingIds(expected, actual) {
  const actualIds = stableIds(actual);
  return [...stableIds(expected)].filter((id) => !actualIds.has(id));
}

export function getCatalogFreshnessIssues(remote, bundled) {
  if (!remote || !bundled) return ['catalog-unavailable'];

  const issues = [];
  const comparisons = [
    ['coverAlbums', bundled.coverAlbums, remote.coverAlbums],
    ['crazyCovers', bundled.crazyCovers, remote.crazyCovers],
    ['soundTrail.instruments', bundled.soundTrail?.instruments, remote.soundTrail?.instruments],
    ['soundTrail.recordings', bundled.soundTrail?.recordings, remote.soundTrail?.recordings],
  ];

  for (const [label, expected, actual] of comparisons) {
    const missing = missingIds(expected, actual);
    if (missing.length) issues.push(`${label}:missing:${missing.join(',')}`);
  }

  const remoteInstruments = new Map(
    (remote.soundTrail?.instruments || []).map((instrument) => [instrument.id, instrument]),
  );
  for (const instrument of bundled.soundTrail?.instruments || []) {
    const remoteInstrument = remoteInstruments.get(instrument.id);
    if (!remoteInstrument) continue;

    const remoteGenres = new Set((remoteInstrument.genres || []).map((genre) => genre?.name).filter(Boolean));
    const missingGenres = (instrument.genres || [])
      .map((genre) => genre?.name)
      .filter((name) => name && !remoteGenres.has(name));
    if (missingGenres.length) {
      issues.push(`soundTrail.genres:${instrument.id}:missing:${missingGenres.join(',')}`);
    }

    if (
      Number(instrument.researchStandardVersion || 0)
      > Number(remoteInstrument.researchStandardVersion || 0)
    ) {
      issues.push(`soundTrail.researchStandardVersion:${instrument.id}`);
    }
  }

  return issues;
}

export async function loadMusicData() {
  const [remoteResult, bundledResult] = await Promise.allSettled([
    loadSupabaseCatalog(),
    loadBundledMusicData(),
  ]);

  if (remoteResult.status === 'fulfilled' && bundledResult.status === 'fulfilled') {
    const freshnessIssues = getCatalogFreshnessIssues(remoteResult.value, bundledResult.value);
    if (!freshnessIssues.length) return remoteResult.value;

    console.warn(
      'Supabase catalog is older than the bundled MusicVerse catalog; using bundled data for this session.',
      freshnessIssues,
    );
    return {
      ...bundledResult.value,
      catalogSource: 'bundled-stale-supabase',
      catalogFreshnessIssues: freshnessIssues,
    };
  }

  if (remoteResult.status === 'fulfilled') return remoteResult.value;

  if (bundledResult.status === 'fulfilled') {
    console.warn('Supabase catalog unavailable; using bundled fallback.', remoteResult.reason);
    return bundledResult.value;
  }

  throw remoteResult.reason || bundledResult.reason || new Error('The MusicVerse catalog could not be loaded.');
}
