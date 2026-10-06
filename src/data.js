import { mergeCoverAlbums } from './cover-catalog.js';

const DATA_BASE = '/data';

async function readJson(name) {
  const response = await fetch(`${DATA_BASE}/${name}.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load ${name}.`);
  return response.json();
}

export async function loadMusicData() {
  const [coverAlbums, coverAlbumDetails, crazyCovers, accordionMusic] = await Promise.all([
    readJson('cover-albums'),
    readJson('cover-album-details'),
    readJson('crazy-covers'),
    readJson('accordion-music'),
  ]);
  return {
    coverAlbums: mergeCoverAlbums(coverAlbums, coverAlbumDetails),
    crazyCovers,
    accordionMusic,
  };
}
