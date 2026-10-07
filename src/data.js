import { isCoverAlbumEligible, mergeCoverAlbums } from './cover-catalog.js';

const DATA_BASE = '/data';

export const SOUNDTRAIL_INSTRUMENTS = [
  {
    id: 'accordion',
    label: 'Accordion',
    dataKey: 'accordionMusic',
    description: 'Explore how the accordion changes character across regions, genres, ensembles, and players.',
  },
  {
    id: 'clarinet',
    label: 'Clarinet',
    dataKey: null,
    description: 'Follow clarinet sounds from jazz and classical playing to folk and regional traditions.',
  },
  {
    id: 'pedal-steel-guitar',
    label: 'Pedal Steel Guitar',
    dataKey: null,
    description: 'Trace pedal steel beyond country into ambient, rock, experimental, and roots music.',
  },
  {
    id: 'cello',
    label: 'Cello',
    dataKey: null,
    description: 'Explore cello across classical, chamber, folk, rock, jazz, and unconventional arrangements.',
  },
  {
    id: 'sitar',
    label: 'Sitar',
    dataKey: null,
    description: 'Follow sitar through Indian classical traditions, fusion, film music, and cross-genre recordings.',
  },
  {
    id: 'double-bass',
    label: 'Double Bass',
    dataKey: null,
    description: 'Explore double bass as both foundation and lead voice across jazz, classical, folk, and roots music.',
  },
  {
    id: 'tabla',
    label: 'Tabla',
    dataKey: null,
    description: 'Trace tabla through Indian classical music, fusion, accompaniment, and rhythm-centered recordings.',
  },
];

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

export async function loadMusicData() {
  const [coverAlbums, coverAlbumDetails, crazyCovers, accordionMusic] = await Promise.all([
    readJson('cover-albums'),
    readJson('cover-album-details'),
    readJson('crazy-covers'),
    readJson('accordion-music'),
  ]);
  const mergedCoverAlbums = mergeCoverAlbums(coverAlbums, coverAlbumDetails);
  return {
    coverAlbums: mergedCoverAlbums.filter(isCoverAlbumEligible),
    crazyCovers,
    accordionMusic,
  };
}
