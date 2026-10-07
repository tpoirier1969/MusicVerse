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

export function getCoverAlbumRatio(album) {
  if (!album) return null;

  const coverTrackCount = Number(album.coverTrackCount);
  const totalTrackCount = Number(album.totalTrackCount);
  if (Number.isFinite(coverTrackCount) && Number.isFinite(totalTrackCount) && totalTrackCount > 0) {
    return coverTrackCount / totalTrackCount;
  }

  const tracks = album.detail?.tracks || [];
  if (tracks.length && tracks.every((track) => typeof track.isCover === 'boolean')) {
    return tracks.filter((track) => track.isCover).length / tracks.length;
  }

  return null;
}

export function isCoverAlbumEligible(album) {
  if (!album) return false;
  if (album.coverAlbumIntent === true) return true;

  const ratio = getCoverAlbumRatio(album);
  if (ratio !== null) return ratio >= 0.9;

  if (album.coverAlbumIntent === false) return false;

  // Existing curated records remain eligible until research proves otherwise.
  return true;
}

export function getAlbumArtwork(album) {
  return String(album?.detail?.artwork || album?.artwork || '').trim();
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

export function getAlbumSearchMatches(album, searchText = '') {
  const query = String(searchText || '').trim().toLowerCase();
  if (!album || !query) return { albumMatched: false, trackMatches: [] };

  const detail = album.detail || {};
  const albumHaystack = [
    album.album,
    album.artist,
    album.genre,
    album.approach,
    album.why,
    ...getAlbumOriginalArtists(album),
    ...getAlbumOriginalGenres(album),
    ...(detail.notes || []),
    ...(detail.personnel || []).flatMap((person) => [person.name, ...(person.roles || [])]),
  ].filter(Boolean).join(' ').toLowerCase();

  const trackMatches = (detail.tracks || []).filter((track) => [
    track.title,
    track.originalArtist,
    track.originalGenre,
    ...(track.musicians || []).flatMap((musician) => [musician.name, ...(musician.roles || [])]),
  ].filter(Boolean).join(' ').toLowerCase().includes(query));

  return {
    albumMatched: albumHaystack.includes(query),
    trackMatches,
  };
}

export function filterCoverAlbums(albums, filters = {}, searchText = '') {
  const query = String(searchText || '').trim().toLowerCase();
  return (Array.isArray(albums) ? albums : []).filter((album) => {
    if (!isCoverAlbumEligible(album)) return false;
    for (const field of ['coverArtist', 'originalArtist', 'coverGenre', 'originalGenre']) {
      const selected = String(filters[field] || '').trim();
      if (selected && !getAlbumFacetValues(album, field).includes(selected)) return false;
    }

    if (!query) return true;
    const matches = getAlbumSearchMatches(album, query);
    return matches.albumMatched || matches.trackMatches.length > 0;
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
