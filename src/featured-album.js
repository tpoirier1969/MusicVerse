const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_LISTENING_DAYS = 7;
const REPEAT_GUARD_DAYS = 14;

function parseDate(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function featuredAlbumDateKey(date = new Date()) {
  const value = parseDate(date) || new Date();
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function listeningStatsForAlbums(albums, spotifyHistory) {
  const stats = new Map((albums || []).map((album) => [album.id, { playCount: 0, lastPlayedAt: null }]));

  for (const play of spotifyHistory || []) {
    const playAlbumId = String(play.albumId || '').trim();
    const playAlbumName = normalize(play.album);
    const playArtists = (play.artists || []).map(normalize).filter(Boolean);
    const playedAt = parseDate(play.playedAt);

    for (const album of albums || []) {
      const spotifyIdMatched = playAlbumId && album.spotifyAlbumId && playAlbumId === album.spotifyAlbumId;
      const nameMatched = playAlbumName && playAlbumName === normalize(album.album);
      const artistMatched = !playArtists.length || playArtists.includes(normalize(album.artist));
      if (!spotifyIdMatched && !(nameMatched && artistMatched)) continue;

      const stat = stats.get(album.id);
      stat.playCount += 1;
      if (playedAt && (!stat.lastPlayedAt || playedAt > stat.lastPlayedAt)) stat.lastPlayedAt = playedAt;
    }
  }

  return stats;
}

function addedRecentlyBonus(album, now) {
  const addedAt = parseDate(album.addedAt);
  if (!addedAt) return 0;
  const ageDays = Math.max(0, (now.getTime() - addedAt.getTime()) / DAY_MS);
  if (ageDays <= 14) return 16;
  if (ageDays <= 45) return 10;
  if (ageDays <= 90) return 4;
  return 0;
}

function listeningBonus(stat, now) {
  if (!stat) return 0;

  if (stat.lastPlayedAt) {
    const ageDays = (now.getTime() - stat.lastPlayedAt.getTime()) / DAY_MS;
    if (ageDays < RECENT_LISTENING_DAYS) return -18;
  }

  if (!stat.playCount) return 0;
  return Math.min(14, Math.log2(stat.playCount + 1) * 4);
}

function candidatePool(albums) {
  const useful = (albums || []).filter((album) => album?.id && (album.startHere || album.detail?.tracks?.length));
  return useful.length ? useful : (albums || []).filter((album) => album?.id);
}

function repeatGuard(pool, history, todayKey) {
  const poolIds = new Set(pool.map((album) => album.id));
  const previous = (history || [])
    .filter((entry) => entry?.date && entry.date !== todayKey && poolIds.has(entry.albumId))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const seen = new Set(previous.map((entry) => entry.albumId));
  if (seen.size < pool.length) return seen;

  const guardDate = new Date(`${todayKey}T12:00:00`);
  guardDate.setDate(guardDate.getDate() - REPEAT_GUARD_DAYS);
  return new Set(previous
    .filter((entry) => {
      const date = parseDate(`${entry.date}T12:00:00`);
      return date && date >= guardDate;
    })
    .map((entry) => entry.albumId));
}

function albumScore(album, { now, dateKey, listeningStats }) {
  let score = 10;
  if (album.startHere) score += 4;
  if (album.detail?.tracks?.length) score += 3;
  score += addedRecentlyBonus(album, now);
  score += listeningBonus(listeningStats.get(album.id), now);

  const rank = Number(album.rank);
  if (Number.isFinite(rank) && rank > 0) score += Math.max(0, 2 - (rank - 1) / 50);

  score += (stableHash(`${dateKey}:${album.id}`) % 3000) / 1000;
  return score;
}

export function selectFeaturedCoverAlbum(albums, options = {}) {
  const pool = candidatePool(albums);
  if (!pool.length) return null;

  const now = parseDate(options.now) || new Date();
  const dateKey = featuredAlbumDateKey(now);
  const history = Array.isArray(options.history) ? options.history : [];

  const fixed = history.find((entry) => entry?.date === dateKey && entry.albumId);
  if (fixed) {
    const existing = pool.find((album) => album.id === fixed.albumId);
    if (existing) return existing;
  }

  const guardedIds = repeatGuard(pool, history, dateKey);
  const unguarded = pool.filter((album) => !guardedIds.has(album.id));
  const choices = unguarded.length ? unguarded : pool;

  const listeningStats = listeningStatsForAlbums(pool, options.spotifyHistory || []);

  return [...choices]
    .sort((a, b) => albumScore(b, { now, dateKey, listeningStats })
      - albumScore(a, { now, dateKey, listeningStats }))[0] || null;
}

export const FEATURED_ALBUM_RULES = Object.freeze({
  recentListeningDays: RECENT_LISTENING_DAYS,
  repeatGuardDays: REPEAT_GUARD_DAYS,
});
