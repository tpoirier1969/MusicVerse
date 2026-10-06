function cleanList(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))];
}

export function mergeCoverAlbums(albums, details) {
  const byId = new Map((Array.isArray(details) ? details : []).map((detail) => [detail.albumId, detail]));
  return (Array.isArray(albums) ? albums : []).map((album) => ({
    ...album,
    detail: byId.get(album.id) || null,
  }));
}

export function getAlbumOriginalArtists(album) {
  return cleanList([
    ...(album?.detail?.originalArtists || []),
    ...(album?.detail?.tracks || []).map((track) => track.originalArtist),
  ]);
}

export function getAlbumOriginalGenres(album) {
  return cleanList([
    ...(album?.detail?.originalGenres || []),
    ...(album?.detail?.tracks || []).map((track) => track.originalGenre),
  ]);
}

export function getAlbumFacetValues(album, field) {
  if (!album) return [];
  switch (field) {
    case 'coverArtist':
      return cleanList([album.artist]);
    case 'coverGenre':
      return cleanList([album.genre]);
    case 'originalArtist':
      return getAlbumOriginalArtists(album);
    case 'originalGenre':
      return getAlbumOriginalGenres(album);
    default:
      return [];
  }
}

export function filterCoverAlbums(albums, filters = {}, searchText = '') {
  const query = String(searchText || '').trim().toLowerCase();
  return (Array.isArray(albums) ? albums : []).filter((album) => {
    for (const field of ['coverArtist', 'originalArtist', 'coverGenre', 'originalGenre']) {
      const selected = String(filters[field] || '').trim();
      if (selected && !getAlbumFacetValues(album, field).includes(selected)) return false;
    }

    if (!query) return true;
    const detail = album.detail || {};
    const haystack = [
      album.album,
      album.artist,
      album.genre,
      album.approach,
      album.why,
      ...getAlbumOriginalArtists(album),
      ...getAlbumOriginalGenres(album),
      ...(detail.notes || []),
      ...(detail.tracks || []).flatMap((track) => [
        track.title,
        track.originalArtist,
        track.originalGenre,
        ...(track.musicians || []).flatMap((musician) => [musician.name, ...(musician.roles || [])]),
      ]),
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

export function getFacetOptions(albums, filters, field, searchText = '') {
  const reducedFilters = { ...filters, [field]: '' };
  const filtered = filterCoverAlbums(albums, reducedFilters, searchText);
  return cleanList(filtered.flatMap((album) => getAlbumFacetValues(album, field)))
    .sort((a, b) => a.localeCompare(b));
}

export function formatDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total < 0) return '—';
  const rounded = Math.round(total);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function getCoverAlbumById(albums, albumId) {
  return (Array.isArray(albums) ? albums : []).find((album) => album.id === albumId) || null;
}
