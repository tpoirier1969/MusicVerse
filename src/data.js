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

export async function loadMusicData() {
  try {
    return await loadSupabaseCatalog();
  } catch (error) {
    console.warn('Supabase catalog unavailable; using bundled fallback.', error);
    return loadBundledMusicData();
  }
}
