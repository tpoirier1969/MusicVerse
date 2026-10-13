import { readFile } from 'node:fs/promises';
import { buildCatalogBundle, validateCatalogBundle, assertExpectedProject } from './catalog-sync-lib.mjs';
import { musicVerseSupabaseConfig } from '../src/supabase-catalog.js';

const EXPECTED_PROJECT_REF = process.env.MUSICVERSE_SUPABASE_EXPECTED_PROJECT_REF || 'wntakzfoprthwggkidyq';

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
}

async function loadBundle() {
  const [albums, details, crazyCovers, soundTrail] = await Promise.all([
    readJson('../public/data/cover-albums.json'),
    readJson('../public/data/cover-album-details.json'),
    readJson('../public/data/crazy-covers.json'),
    readJson('../public/data/soundtrail.json'),
  ]);
  const bundle = buildCatalogBundle({ albums, details, crazyCovers, soundTrail });
  return { bundle, summary: validateCatalogBundle(bundle) };
}

async function selectRows(baseUrl, publishableKey, resource, params = {}) {
  const endpoint = new URL(`${baseUrl.replace(/\/$/, '')}/rest/v1/${resource}`);
  endpoint.searchParams.set('select', params.select || '*');
  if (params.limit) endpoint.searchParams.set('limit', String(params.limit));
  if (params.order) endpoint.searchParams.set('order', params.order);

  const response = await fetch(endpoint, {
    headers: { apikey: publishableKey, Accept: 'application/json' },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Supabase audit request failed for ${resource} (${response.status})${body ? `: ${body}` : ''}`);
  }
  return response.json();
}

async function auditRemote(bundle) {
  const { url, publishableKey } = musicVerseSupabaseConfig();
  assertExpectedProject(url, EXPECTED_PROJECT_REF);

  const [albumRows, crazyRows, soundRows] = await Promise.all([
    selectRows(url, publishableKey, 'musicverse_cover_albums_v', { select: 'legacy_id', limit: 2000 }),
    selectRows(url, publishableKey, 'musicverse_crazy_covers_v', { select: 'legacy_id,recording_id', limit: 2000 }),
    selectRows(url, publishableKey, 'musicverse_soundtrail_v', { select: 'legacy_id', limit: 2000 }),
  ]);

  const localAlbums = new Set(bundle.albums.map((item) => item.legacyId));
  const remoteAlbums = new Set((albumRows || []).map((item) => item.legacy_id).filter(Boolean));
  const localCrazy = new Set(bundle.crazyCovers.map((item) => item.legacyId));
  const remoteCrazy = new Set((crazyRows || []).map((item) => item.legacy_id).filter(Boolean));
  const localSound = new Set(bundle.soundTrail.recordings.map((item) => item.legacyId));
  const remoteSound = new Set((soundRows || []).map((item) => item.legacy_id).filter(Boolean));

  return {
    projectRef: EXPECTED_PROJECT_REF,
    albums: {
      local: localAlbums.size,
      remote: remoteAlbums.size,
      missingRemote: [...localAlbums].filter((id) => !remoteAlbums.has(id)),
      extraRemote: [...remoteAlbums].filter((id) => !localAlbums.has(id)),
    },
    crazyCovers: {
      local: localCrazy.size,
      remote: remoteCrazy.size,
      missingRemote: [...localCrazy].filter((id) => !remoteCrazy.has(id)),
      extraRemote: [...remoteCrazy].filter((id) => !localCrazy.has(id)),
    },
    soundTrail: {
      local: localSound.size,
      remote: remoteSound.size,
      missingRemote: [...localSound].filter((id) => !remoteSound.has(id)),
      extraRemote: [...remoteSound].filter((id) => !localSound.has(id)),
    },
  };
}

async function applyBundle(bundle) {
  const { url } = musicVerseSupabaseConfig();
  assertExpectedProject(url, EXPECTED_PROJECT_REF);

  const serviceRoleKey = String(process.env.MUSICVERSE_SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!serviceRoleKey) {
    throw new Error('MUSICVERSE_SUPABASE_SERVICE_ROLE_KEY is required for --apply. Never put this key in browser code or commit it to GitHub.');
  }

  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/rpc/musicverse_import_catalog_v1`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ payload: bundle }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Catalog import failed (${response.status})${body ? `: ${body}` : ''}`);
  }

  return response.json().catch(() => ({}));
}

const args = new Set(process.argv.slice(2));
const mode = args.has('--apply') ? 'apply' : args.has('--audit') ? 'audit' : 'dry-run';
const { bundle, summary } = await loadBundle();

if (mode === 'dry-run') {
  console.log(JSON.stringify({ mode, summary }, null, 2));
} else if (mode === 'audit') {
  const remote = await auditRemote(bundle);
  console.log(JSON.stringify({ mode, summary, remote }, null, 2));
} else {
  const result = await applyBundle(bundle);
  console.log(JSON.stringify({ mode, summary, result }, null, 2));
}
