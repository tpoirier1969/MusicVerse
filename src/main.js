import './styles.css';
import { loadMusicData } from './data.js';
import {
  filterCoverAlbums,
  formatDuration,
  getAlbumArtwork,
  getAlbumOriginalArtists,
  getAlbumOriginalGenres,
  getAlbumSearchMatches,
  getCoverAlbumById,
  getFacetOptions,
} from './cover-catalog.js';
import {
  addTracksToPlaylist,
  createPlaylist,
  getListeningLog,
  getPlaylists,
  getSpotifyListeningHistory,
  mergeSpotifyListeningHistory,
  isFavorite,
  markListened,
  removeTrackFromPlaylist,
  toggleFavorite,
} from './store.js';
import {
  beginSpotifyLogin,
  exportPlaylistToSpotify,
  fetchRecentlyPlayed,
  finishSpotifyLoginFromUrl,
  getSpotifyToken,
  spotifyConfigured,
  spotifyHasScope,
  spotifyResourceUri,
  spotifyTrackUri,
} from './spotify.js';

const app = document.querySelector('#app');
let data = { coverAlbums: [], crazyCovers: [], accordionMusic: [] };
let activeCoverTab = 'start';
let searchText = '';
let coverAlbumSearchText = '';
let coverAlbumViewMode = 'grid';
let coverAlbumFilters = { coverArtist: '', originalArtist: '', coverGenre: '', originalGenre: '' };
let toastTimer = null;
let pendingPlaylistTracks = [];
let spotifyLogLoading = false;
let spotifyLogAttempted = false;
let spotifyLogError = '';

const moduleMeta = {
  home: { label: 'Home', icon: '⌂' },
  coververse: { label: 'CoverVerse', img: '/assets/vinyl.svg' },
  instruments: { label: 'SoundTrail', img: '/assets/accordion.svg' },
  playlists: { label: 'Playlists', img: '/assets/van.svg' },
  tabs: { label: 'Tabs & Chords', img: '/assets/guitar.svg' },
  log: { label: 'Listening Log', img: '/assets/mug.svg' },
  library: { label: 'Library', img: '/assets/library.svg' },
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function route() {
  const value = (location.hash || '#/home').replace(/^#\/?/, '').split('?')[0];
  return Object.keys(moduleMeta).includes(value) ? value : 'home';
}

function hashParams() {
  const raw = String(location.hash || '').split('?')[1] || '';
  return new URLSearchParams(raw);
}

function activeAlbumId() {
  return hashParams().get('album') || '';
}
function showToast(message) {
  let node = document.querySelector('.toast');
  if (!node) {
    node = document.createElement('div');
    node.className = 'toast';
    document.body.append(node);
  }
  node.textContent = message;
  node.classList.add('toast-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('toast-show'), 3200);
}

function navItem(slug) {
  const meta = moduleMeta[slug];
  const selected = route() === slug;
  const visual = meta.img
    ? `<img src="${meta.img}" alt="" aria-hidden="true">`
    : `<span class="nav-home-icon" aria-hidden="true">${meta.icon}</span>`;
  return `<a class="nav-orb${selected ? ' is-active' : ''}" href="#/${slug}" aria-current="${selected ? 'page' : 'false'}">
    <span class="nav-orb-visual">${visual}</span><span class="nav-orb-label">${esc(meta.label)}</span>
  </a>`;
}

function shell(content) {
  return `<div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="#/home" aria-label="MusicVerse home">
        <span class="brand-mark"><span class="brand-peak"></span><span class="brand-sun"></span></span>
        <span class="brand-name">MusicVerse</span>
        <span class="brand-tag">music fuels brighter roads</span>
      </a>
      <nav class="orb-nav" aria-label="MusicVerse modules">
        ${['home','coververse','instruments','playlists','tabs','log','library'].map(navItem).join('')}
      </nav>
      <div class="sidebar-landscape" aria-hidden="true"></div>
    </aside>
    <main class="main-canvas">${content}</main>
    <nav class="mobile-nav" aria-label="Mobile navigation">
      ${['home','coververse','instruments','playlists','library'].map((slug) => {
        const meta = moduleMeta[slug];
        return `<a href="#/${slug}" class="mobile-nav-link${route() === slug ? ' is-active' : ''}"><span>${slug === 'home' ? '⌂' : '●'}</span>${esc(meta.label.replace('CoverVerse','Covers'))}</a>`;
      }).join('')}
    </nav>
  </div>`;
}

function heroSearch() {
  return `<form class="hero-search" data-search-form>
    <span aria-hidden="true">⌕</span>
    <input data-search-input type="search" value="${esc(searchText)}" placeholder="Search tracks, albums, cover/original artists, or genres…" aria-label="Search MusicVerse">
    <button type="submit">Search</button>
  </form>`;
}

function moduleWorld(slug, title, text, img, className = '') {
  return `<a class="module-world ${className}" href="#/${slug}">
    <div class="module-world-art" style="--module-image:url('${img}')"></div>
    <div class="module-world-copy"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>
    <span class="round-arrow" aria-hidden="true">→</span>
  </a>`;
}

function recentAlbumCard(album, index) {
  const label = album.album || album.title || 'Untitled';
  const artist = album.artist || 'Unknown artist';
  const artwork = getAlbumArtwork(album);
  const backgrounds = ['/assets/roadscape.svg','/assets/vinyl.svg','/assets/guitar.svg','/assets/mug.svg','/assets/library.svg'];
  const art = artwork
    ? `<span class="recent-art"><img src="${esc(artwork)}" alt=""></span>`
    : `<span class="recent-art" style="--recent-image:url('${backgrounds[index % backgrounds.length]}')"></span>`;
  return `<a class="recent-card" href="#/coververse?album=${encodeURIComponent(album.id)}&tab=albums" aria-label="View ${esc(label)} in MusicVerse">
    ${art}
    <span class="recent-meta"><strong>${esc(label)}</strong><span>${esc(artist)}</span><small>${esc(album.genre || 'Album')}</small></span>
  </a>`;
}

function homePlaylistPreview() {
  const playlists = getPlaylists().slice(0, 5);
  if (!playlists.length) {
    return `<div class="home-playlist-empty"><strong>No playlists yet.</strong><span>Build one from CoverVerse tracks, then it will appear here.</span><a href="#/playlists">Create a playlist →</a></div>`;
  }

  return `<div class="playlist-strip">${playlists.map((playlist) => `<a href="#/playlists" class="playlist-teaser">
    <span class="play-badge">▶</span><strong>${esc(playlist.name)}</strong><small>${playlist.tracks.length} ${playlist.tracks.length === 1 ? 'track' : 'tracks'}</small>
  </a>`).join('')}</div>`;
}

function homeView() {
  const albums = data.coverAlbums.slice(0, 6);
  return shell(`
    <section class="home-hero page-wave">
      <div class="hero-copy">
        <div class="eyebrow">MUSIC BRINGS US CLOSER</div>
        <h1>Discover your<br><span>music world</span></h1>
        <p class="hero-subtitle">Songs. Covers. Playlists. Tabs. Stories. All in one place.</p>
        ${heroSearch()}
      </div>
      <div class="roadtrip-hero" aria-label="Scenic road trip illustration">
        <div class="roadtrip-note">same songs<br>new journeys</div>
      </div>
    </section>


    <section class="content-wave recent-section">
      <div class="section-heading"><div><span class="eyebrow">FRESH SOUNDS</span><h2>Recently Added</h2><p>Current discoveries from the catalog you’ve already built.</p></div><a href="#/coververse">See all →</a></div>
      <div class="recent-grid">${albums.map(recentAlbumCard).join('')}</div>
    </section>

    <section class="content-wave playlists-preview">
      <div class="section-heading"><div><span class="eyebrow">TAKE THE SCENIC ROUTE</span><h2>Your Playlists</h2><p>Build here, then send the finished list to Spotify.</p></div><a class="spotify-pill" href="#/playlists">● Build playlists and send to Spotify →</a></div>
      ${homePlaylistPreview()}
    </section>
  `);
}

function coverSubnav() {
  const items = [
    ['start','Start Here','Begin your journey','/assets/van.svg'],
    ['albums','Cover Albums','Full collections','/assets/vinyl.svg'],
    ['crazy','Crazy Covers','Unexpected takes','/assets/guitar.svg'],
  ];
  return `<div class="cover-subnav">${items.map(([id,title,sub,img]) => `<button class="cover-subnav-item${activeCoverTab===id?' is-active':''}" data-cover-tab="${id}"><span class="cover-subnav-art" style="--sub-image:url('${img}')"></span><span><strong>${title}</strong><small>${sub}</small></span><b>→</b></button>`).join('')}</div>`;
}

function featuredAlbum() {
  const album = data.coverAlbums.find((item) => item.startHere) || data.coverAlbums[0] || {};
  const spotifyUrl = album.spotify || '';
  const artwork = getAlbumArtwork(album);
  return `<section class="featured-album organic-panel">
    <div class="featured-art${artwork ? ' has-art' : ''}" aria-hidden="true"><img src="${esc(artwork || '/assets/roadscape.svg')}" alt=""><span class="record-peek"><img src="/assets/vinyl.svg" alt=""></span></div>
    <div class="featured-copy">
      <span class="eyebrow">FEATURED COVER ALBUM</span>
      <h2>${esc(album.album || 'Different Skies')}</h2>
      <h3>${esc(album.artist || 'Various Artists')}</h3>
      <p>${esc(album.why || 'Familiar songs, new horizons. A set of covers chosen because the arrangements actually change how the songs feel.')}</p>
      <div class="action-row">
        <a class="primary-action" href="#/coververse?album=${encodeURIComponent(album.id)}&tab=albums">View Album</a>
        <button class="secondary-action" data-add-album-tracks="${esc(album.id)}"${album.detail?.tracks?.length ? '' : ' disabled'}>＋ Add album tracks</button>
        <button class="secondary-action" data-open-url="${esc(spotifyUrl)}">● Open in Spotify app</button>
      </div>
      <div class="album-meta">${esc(album.genre || 'Cover Album')} · ${esc(album.approach || 'Reinterpretation')}</div>
    </div>
    <div class="featured-note">some songs<br>just travel<br>better</div>
  </section>`;
}

function crazyRows(items) {
  return `<div class="track-list">${items.map((track) => {
    const id = `cover:${track.sourceArtist}:${track.song}:${track.coverArtist}`;
    const artwork = String(track.artwork || '').trim();
    return `<article class="track-row">
      <button class="round-play track-art-play${artwork ? ' has-art' : ''}" ${artwork ? `style="--track-art:url('${esc(artwork)}')"` : ''} data-open-url="${esc(track.spotify)}" data-listened="${esc(id)}" aria-label="Open ${esc(track.song)}"><span aria-hidden="true">▶</span></button>
      <div class="track-main"><strong>${esc(track.song)}</strong><span>${esc(track.coverArtist)}</span></div>
      <div class="track-original"><small>Originally by</small><span>${esc(track.sourceArtist)}</span></div>
      <span class="style-pill">${esc(track.style)}</span>
      <button class="icon-btn${isFavorite(id)?' is-favorite':''}" data-favorite="${esc(id)}" title="Favorite">♥</button>
      <button class="icon-btn" data-add-track='${esc(JSON.stringify({id,title:track.song,artist:track.coverArtist,originalArtist:track.sourceArtist,spotifyUrl:track.spotify,spotifyUri:spotifyTrackUri(track.spotify),artwork:track.artwork || ''}))}' title="Add to playlist">＋</button>
    </article>`;
  }).join('')}</div>`;
}

function albumFilterSelect(field, label, options) {
  const selected = coverAlbumFilters[field] || '';
  const optionHtml = options.map((value) => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(value)}</option>`).join('');
  return `<label class="album-filter"><span>${esc(label)}</span><select data-album-filter="${esc(field)}"><option value="">Any</option>${optionHtml}</select></label>`;
}

function albumDetailHref(albumId) {
  const params = new URLSearchParams({ album: albumId, tab: 'albums' });
  if (coverAlbumSearchText) params.set('q', coverAlbumSearchText);
  return `#/coververse?${params.toString()}`;
}

function albumSearchHitSummary(album) {
  if (!coverAlbumSearchText) return '';
  const matches = getAlbumSearchMatches(album, coverAlbumSearchText);
  if (!matches.trackMatches.length) return '';
  const visible = matches.trackMatches.slice(0, 3).map((track) => track.title);
  const extra = matches.trackMatches.length - visible.length;
  return `<span class="album-search-hits"><b>Track ${matches.trackMatches.length === 1 ? 'match' : 'matches'}:</b> ${esc(visible.join(', '))}${extra > 0 ? ` +${extra} more` : ''}</span>`;
}

function coverAlbumBrowser() {
  const items = filterCoverAlbums(data.coverAlbums, coverAlbumFilters, coverAlbumSearchText);
  const facets = {
    coverArtist: getFacetOptions(data.coverAlbums, coverAlbumFilters, 'coverArtist', coverAlbumSearchText),
    originalArtist: getFacetOptions(data.coverAlbums, coverAlbumFilters, 'originalArtist', coverAlbumSearchText),
    coverGenre: getFacetOptions(data.coverAlbums, coverAlbumFilters, 'coverGenre', coverAlbumSearchText),
    originalGenre: getFacetOptions(data.coverAlbums, coverAlbumFilters, 'originalGenre', coverAlbumSearchText),
  };

  const controls = `<div class="album-browser-controls organic-panel">
    <form class="album-search-form" data-album-search-form>
      <label><span>Search albums & tracks</span><div><input name="albumSearch" type="search" value="${esc(coverAlbumSearchText)}" placeholder="Track, album, cover/original artist, genre, musician…"><button type="submit">Search</button></div></label>
    </form>
    <div class="album-filter-grid">
      ${albumFilterSelect('coverArtist','Cover artist',facets.coverArtist)}
      ${albumFilterSelect('originalArtist','Original artist',facets.originalArtist)}
      ${albumFilterSelect('coverGenre','Cover genre',facets.coverGenre)}
      ${albumFilterSelect('originalGenre','Original genre',facets.originalGenre)}
    </div>
    <div class="album-browser-footer"><span><strong>${items.length}</strong> of ${data.coverAlbums.length} albums</span><div class="album-view-toggle" role="group" aria-label="Album view"><button type="button" data-album-view="grid" class="${coverAlbumViewMode === 'grid' ? 'is-active' : ''}">Grid</button><button type="button" data-album-view="list" class="${coverAlbumViewMode === 'list' ? 'is-active' : ''}">List</button></div><button type="button" class="filter-reset" data-album-filter-reset>Clear filters</button></div>
  </div>`;

  if (!items.length) return `${controls}<div class="empty-browser organic-panel"><h3>No albums match those filters.</h3><p>Clear a filter or broaden the search.</p></div>`;
  return `${controls}${coverAlbumViewMode === 'list' ? coverAlbumsList(items) : coverAlbumsGrid(items)}`;
}

function coverAlbumsGrid(items) {
  return `<div class="album-grid album-grid-browser">${items.map((album, index) => {
    const artwork = getAlbumArtwork(album);
    const fallback = index % 2 ? '/assets/vinyl.svg' : '/assets/roadscape.svg';
    return `<a class="album-card album-card-link" href="${albumDetailHref(album.id)}">
    <div class="album-card-art${artwork ? ' has-art' : ''}" style="--album-bg:url('${esc(artwork || fallback)}')"></div>
    <div><span class="eyebrow">${esc(album.genre || 'Unknown genre')}</span><h3>${esc(album.album)}</h3><p>${esc(album.artist)}</p><small>${esc(album.approach || '')}</small>${albumSearchHitSummary(album)}</div>
    <span class="round-arrow" aria-hidden="true">→</span>
  </a>`;
  }).join('')}</div>`;
}

function coverAlbumsList(items) {
  return `<div class="album-list-view"><div class="album-list-head"><span>Album</span><span>Cover artist</span><span>Cover genre</span><span>Original artist</span><span>Original genre</span></div>${items.map((album) => {
    const originals = getAlbumOriginalArtists(album);
    const originalGenres = getAlbumOriginalGenres(album);
    const artwork = getAlbumArtwork(album);
    return `<a class="album-list-row" href="${albumDetailHref(album.id)}"><span class="album-list-title"><span class="album-list-art">${artwork ? `<img src="${esc(artwork)}" alt="">` : '<span aria-hidden="true">♪</span>'}</span><span><strong>${esc(album.album)}</strong>${albumSearchHitSummary(album)}</span></span><span>${esc(album.artist)}</span><span>${esc(album.genre || '—')}</span><span>${esc(originals.join(', ') || '—')}</span><span>${esc(originalGenres.join(', ') || '—')}</span></a>`;
  }).join('')}</div>`;
}
function accordionGrid() {
  return `<div class="album-grid compact-grid">${data.accordionMusic.slice(0, 80).map((item, index)=>`<article class="album-card">
    <div class="album-card-art" style="--album-bg:url('${index % 3 === 0 ? '/assets/van.svg' : '/assets/guitar.svg'}')"></div>
    <div><span class="eyebrow">${esc(item.style)}</span><h3>${esc(item.track)}</h3><p>${esc(item.artist)}</p><small>${esc(item.region)}</small></div>
    <button class="round-arrow" data-open-url="${esc(item.spotify)}" aria-label="Open on Spotify">→</button>
  </article>`).join('')}</div>`;
}

function coververseBody() {
  if (activeCoverTab === 'albums') return `<section class="module-content"><div class="section-heading"><div><h2>Cover Albums</h2><p>Browse the catalog by artist, source material, and genre.</p></div></div>${coverAlbumBrowser()}</section>`;
  if (activeCoverTab === 'crazy') return `<section class="module-content"><div class="section-heading"><div><h2>Crazy Covers</h2><p>Interpretation first. Karaoke need not apply.</p></div><span>${data.crazyCovers.length} recordings</span></div>${crazyRows(data.crazyCovers.filter((track)=>!searchText || `${track.sourceArtist} ${track.song} ${track.coverArtist} ${track.style}`.toLowerCase().includes(searchText.toLowerCase())).slice(0,100))}</section>`;
  return `
    ${featuredAlbum()}
    <section class="cover-lower">
      <div class="organic-panel track-panel"><div class="section-heading"><div><h2>Recent Finds</h2><p>Wild covers from the existing catalog.</p></div><button data-cover-tab="crazy">See all →</button></div>${crazyRows(data.crazyCovers.filter((x)=>x.standout).slice(0,7))}</div>
      <aside class="organic-panel why-panel"><span class="compass">✣</span><h2>Why this matters</h2><p>MusicVerse is built around discovery rather than filing. CoverVerse gives you the familiar song as a landmark, then lets you wander outward through interpretation, genre, player, album and arrangement.</p><div class="why-badges"><span>Fresh perspectives</span><span>Road-trip listening</span><span>Wild arrangements</span></div></aside>
    </section>
    <section class="explore-more"><h2>Explore more in MusicVerse</h2><div>${moduleWorld('tabs','Tabs & Chords','Save playing references.','/assets/guitar.svg')}${moduleWorld('log','Listening Log','Track what sticks.','/assets/mug.svg')}${moduleWorld('playlists','Playlists','Build your own journeys.','/assets/van.svg')}</div></section>
  </>`;
}

function musicianSummary(musicians = []) {
  if (!musicians.length) return '—';
  return musicians.map((musician) => `${musician.name}${musician.roles?.length ? ` (${musician.roles.join(', ')})` : ''}`).join('; ');
}

function albumTrackPlaylistItem(album, track) {
  return {
    id: track.id,
    title: track.title,
    artist: album.artist,
    originalArtist: track.originalArtist || '',
    spotifyUrl: track.spotify || '',
    spotifyUri: track.spotifyUri || spotifyTrackUri(track.spotify),
    artwork: track.artwork || getAlbumArtwork(album),
  };
}

function coverAlbumDetailView(album) {
  if (!album) return shell(`<section class="module-content"><a class="back-link" href="#/coververse?tab=albums">← Cover Albums</a><div class="coming organic-panel"><h2>Album not found</h2><p>This MusicVerse album ID does not exist.</p></div></section>`);
  const detail = album.detail || {};
  const tracks = detail.tracks || [];
  const originals = getAlbumOriginalArtists(album);
  const originalGenres = getAlbumOriginalGenres(album);
  const artwork = getAlbumArtwork(album) || '/assets/roadscape.svg';
  const notes = detail.notes || [];
  const personnel = detail.personnel || [];
  const detailSearchText = hashParams().get('q') || '';
  const detailSearchMatches = getAlbumSearchMatches(album, detailSearchText);
  const matchingTrackIds = new Set(detailSearchMatches.trackMatches.map((track) => track.id));

  return shell(`<section class="album-detail-hero">
    <a class="back-link" href="#/coververse?tab=albums">← Cover Albums</a>
    <div class="album-detail-hero-grid">
      <img class="album-detail-art" src="${esc(artwork)}" alt="${esc(album.album)} cover artwork">
      <div class="album-detail-copy"><span class="eyebrow">COVER ALBUM</span><h1>${esc(album.album)}</h1><h2>${esc(album.artist)}</h2><p>${esc(album.why || album.approach || '')}</p>
        <div class="detail-meta"><span><b>Cover genre</b>${esc(album.genre || 'Unknown')}</span><span><b>Original artist</b>${esc(originals.join(', ') || 'Not yet cataloged')}</span><span><b>Original genre</b>${esc(originalGenres.join(', ') || 'Not yet cataloged')}</span>${detail.releaseDate ? `<span><b>Released</b>${esc(detail.releaseDate)}</span>` : ''}</div>
        <div class="action-row"><button class="primary-action" data-open-url="${esc(album.spotify || '')}">▶ Open album in Spotify app</button>${tracks.length ? `<button class="secondary-action" data-add-album-tracks="${esc(album.id)}">＋ Add album tracks</button>` : ''}</div>
      </div>
    </div>
  </section>
  <section class="album-detail-body">
    <div class="album-notes organic-panel"><div><span class="eyebrow">WHY IT'S HERE</span><h2>Album notes</h2>${notes.length ? notes.map((note) => `<p>${esc(note)}</p>`).join('') : `<p>${esc(album.approach || 'Additional notes have not been added yet.')}</p>`}</div>${personnel.length ? `<div><span class="eyebrow">PERSONNEL</span><h3>Musicians</h3><ul>${personnel.map((person) => `<li><strong>${esc(person.name)}</strong><span>${esc((person.roles || []).join(', '))}</span></li>`).join('')}</ul></div>` : ''}</div>
    <div class="track-table-wrap organic-panel"><div class="section-heading"><div><span class="eyebrow">TRACKS</span><h2>Track listing</h2><p>${tracks.length ? `${tracks.length} verified tracks` : 'Track details have not been added for this album yet.'}</p>${detailSearchText ? `<span class="detail-search-note">Search: “${esc(detailSearchText)}” · ${matchingTrackIds.size} matching ${matchingTrackIds.size === 1 ? 'track' : 'tracks'}</span>` : ''}</div></div>
      ${tracks.length ? `<div class="album-track-table"><div class="album-track-head"><span>#</span><span>Track</span><span>Original artist</span><span>Length</span><span>Musicians</span><span>Actions</span></div>${tracks.map((track) => `<div class="album-track-row${matchingTrackIds.has(track.id) ? ' is-search-hit' : ''}"><span>${esc(track.number)}</span><div class="album-track-title"><span class="album-track-art"><img src="${esc(track.artwork || artwork)}" alt=""></span><span><strong>${esc(track.title)}</strong>${matchingTrackIds.has(track.id) ? '<em class="track-match-label">Search match</em>' : ''}${track.originalGenre ? `<small>${esc(track.originalGenre)}</small>` : ''}</span></div><span>${track.isCover === false ? '<em class="original-track-label">Original</em>' : esc(track.originalArtist || '—')}</span><span>${formatDuration(track.durationSeconds)}</span><span class="track-musicians">${esc(musicianSummary(track.musicians || []))}</span><span class="track-actions"><button data-add-track='${esc(JSON.stringify(albumTrackPlaylistItem(album, track)))}'>＋ Playlist</button><button data-open-url="${esc(track.spotify || '')}" data-listened="${esc(track.id)}"${track.spotify ? '' : ' disabled'}>▶ Play</button><button data-open-url="${esc(track.spotify || '')}"${track.spotify ? '' : ' disabled'}>Spotify ↗</button></span></div>`).join('')}</div>` : '<div class="empty-track-data">No verified track-level data has been added yet. MusicVerse leaves it blank rather than guessing.</div>'}
    </div>
  </section>`);
}
function coververseView() {
  const albumId = activeAlbumId();
  if (albumId) return coverAlbumDetailView(getCoverAlbumById(data.coverAlbums, albumId));
  const requestedTab = hashParams().get('tab');
  if (['start','albums','crazy'].includes(requestedTab)) activeCoverTab = requestedTab;
  return shell(`<section class="module-hero cover-hero page-wave"><div><span class="eyebrow">COVERVERSE</span><h1>CoverVerse</h1><p>Fresh takes on familiar songs.</p>${heroSearch()}</div><div class="small-roadtrip"></div></section>${coverSubnav()}${coververseBody()}`);
}

function instrumentView() {
  return shell(`<section class="module-hero instrument-hero page-wave"><div><span class="eyebrow">SOUNDTRAIL</span><h1>SoundTrail</h1><p>Follow instruments across styles, traditions, players, and recordings.</p>${heroSearch()}</div><div class="small-roadtrip instrument-trip"></div></section><section class="module-content instrument-content"><div class="section-heading instrument-heading"><div><span class="eyebrow">FIRST INSTRUMENT</span><h2>Accordion</h2><p>Explore how the accordion changes character across regions, genres, ensembles, and players.</p></div><img class="instrument-feature-icon" src="/assets/accordion.svg" alt="" aria-hidden="true"></div>${accordionGrid()}</section>`);
}

function playlistTrackRow(track, playlistId) {
  return `<div class="playlist-track"><span class="playlist-track-art">${track.artwork ? `<img src="${esc(track.artwork)}" alt="">` : '<span aria-hidden="true">♪</span>'}</span><div><strong>${esc(track.title)}</strong><small>${esc(track.artist)}${track.originalArtist ? ` · originally ${esc(track.originalArtist)}` : ''}</small></div><button data-remove-track="${esc(playlistId)}|${esc(track.id)}">×</button></div>`;
}

function playlistsView() {
  const playlists = getPlaylists();
  return shell(`<section class="module-hero page-wave"><div><span class="eyebrow">PLAYLISTS</span><h1>Build the route.</h1><p>Make the list here. Send it to Spotify when it’s ready.</p></div><div class="small-roadtrip"></div></section>
    <section class="playlist-workspace">
      <div class="playlist-toolbar organic-panel"><div><h2>Your playlists</h2><p>Stored locally for now; Supabase sync comes next.</p></div><form data-new-playlist><input name="name" placeholder="New playlist name"><button class="primary-action">Create</button></form></div>
      <div class="playlist-columns">${playlists.map((playlist)=>`<article class="playlist-builder organic-panel" data-playlist="${esc(playlist.id)}"><div class="playlist-builder-head"><div><span class="eyebrow">${playlist.tracks.length} TRACKS</span><h2>${esc(playlist.name)}</h2><p>${esc(playlist.description || 'A MusicVerse playlist')}</p></div><button class="spotify-export" data-export-playlist="${esc(playlist.id)}">● ${getSpotifyToken() ? 'Send to Spotify' : 'Connect Spotify'}</button></div><div class="playlist-track-list">${playlist.tracks.length ? playlist.tracks.map((track)=>playlistTrackRow(track,playlist.id)).join('') : '<p class="empty-state">Add tracks from CoverVerse using the ＋ buttons.</p>'}</div></article>`).join('')}</div>
    </section>`);
}

function tabsView() {
  return shell(`<section class="module-hero page-wave"><div><span class="eyebrow">TABS & CHORDS</span><h1>Keep the useful versions.</h1><p>Favorite chord sheets, tabs, tunings, capo notes, and playing references will live here.</p></div><div class="small-roadtrip guitar-trip"></div></section><section class="coming organic-panel"><h2>First module expansion</h2><p>This is deliberately scaffolded, not fake-filled. The next data layer can store links to your preferred tab/chord pages, notes, tuning, capo, difficulty, instrument and song relationships.</p></section>`);
}

function spotifyListeningRows(items) {
  return `<div class="spotify-history-list">${items.map((item) => `<article class="spotify-history-row">
    <div class="spotify-history-art">${item.artwork ? `<img src="${esc(item.artwork)}" alt="">` : '<span aria-hidden="true">♪</span>'}</div>
    <div class="spotify-history-main"><strong>${esc(item.title)}</strong><span>${esc(item.artists.join(', ') || 'Unknown artist')}</span><small>${esc(item.album || 'Unknown album')}</small></div>
    <time datetime="${esc(item.playedAt)}">${esc(new Date(item.playedAt).toLocaleString())}</time>
    <button class="secondary-action" data-open-url="${esc(item.spotifyUrl)}"${item.spotifyUrl ? '' : ' disabled'}>Open in Spotify</button>
  </article>`).join('')}</div>`;
}

function musicVerseOpenRows() {
  const log = Object.entries(getListeningLog()).sort((a,b)=>String(b[1]).localeCompare(String(a[1]))).slice(0,25);
  if (!log.length) return '<p class="log-empty-note">No MusicVerse-open history yet.</p>';
  return `<div class="log-list">${log.map(([id,at])=>`<div><span>${esc(id.replace('cover:','').replaceAll(':',' · '))}</span><small>${new Date(at).toLocaleString()}</small></div>`).join('')}</div>`;
}

function logView() {
  const spotifyHistory = getSpotifyListeningHistory();
  const connected = Boolean(getSpotifyToken());
  const canReadHistory = spotifyHasScope('user-read-recently-played');

  let spotifyBody = '';
  if (!spotifyConfigured()) {
    spotifyBody = '<div class="spotify-log-message"><h3>Spotify connection is not configured yet.</h3><p>MusicVerse needs its Spotify client ID in the deployment settings before it can read your listening history.</p></div>';
  } else if (!connected) {
    spotifyBody = '<div class="spotify-log-message"><h3>Connect Spotify to make this useful.</h3><p>Once connected, MusicVerse can pull your recently played Spotify tracks instead of treating clicks inside MusicVerse as listening.</p><button class="primary-action" data-connect-spotify-log>Connect Spotify</button></div>';
  } else if (!canReadHistory) {
    spotifyBody = '<div class="spotify-log-message"><h3>Spotify needs one more permission.</h3><p>Your existing MusicVerse Spotify connection predates listening-history access. Reconnect once to grant read access to recently played tracks.</p><button class="primary-action" data-connect-spotify-log>Reconnect Spotify</button></div>';
  } else if (spotifyLogLoading && !spotifyHistory.length) {
    spotifyBody = '<div class="spotify-log-message"><p>Loading recent Spotify listening…</p></div>';
  } else {
    spotifyBody = `${spotifyLogError ? `<div class="spotify-log-warning">${esc(spotifyLogError)}</div>` : ''}<div class="spotify-log-toolbar"><span>${spotifyHistory.length ? `${spotifyHistory.length} Spotify plays saved in MusicVerse` : 'No Spotify plays have been imported yet.'}</span><button class="secondary-action" data-refresh-spotify-log>${spotifyLogLoading ? 'Refreshing…' : 'Refresh Spotify history'}</button></div>${spotifyHistory.length ? spotifyListeningRows(spotifyHistory) : ''}`;
  }

  return shell(`<section class="module-hero page-wave"><div><span class="eyebrow">LISTENING LOG</span><h1>What you actually played.</h1><p>Spotify history first. MusicVerse clicks stay separate.</p></div><div class="small-roadtrip coffee-trip"></div></section>
    <section class="listening-workspace">
      <section class="organic-panel spotify-log-panel">
        <div class="section-heading"><div><span class="eyebrow">SPOTIFY HISTORY</span><h2>Recently played</h2><p>Spotify supplies the most recent plays; MusicVerse keeps the imported history so it can build over time.</p></div></div>
        ${spotifyBody}
      </section>
      <section class="organic-panel local-open-panel">
        <div class="section-heading"><div><span class="eyebrow">MUSICVERSE ACTIVITY</span><h2>Opened from MusicVerse</h2><p>This is not counted as listening. It is simply a record of tracks you launched from this app.</p></div></div>
        ${musicVerseOpenRows()}
      </section>
    </section>`);
}

async function loadSpotifyListeningHistory({ force = false } = {}) {
  if (spotifyLogLoading || !getSpotifyToken() || !spotifyHasScope('user-read-recently-played')) return;
  if (spotifyLogAttempted && !force) return;

  spotifyLogLoading = true;
  spotifyLogAttempted = true;
  spotifyLogError = '';
  if (route() === 'log') render();

  try {
    const items = await fetchRecentlyPlayed(50);
    mergeSpotifyListeningHistory(items);
  } catch (error) {
    console.warn(error);
    spotifyLogError = error?.status === 403
      ? 'Spotify denied listening-history access. Reconnect Spotify and grant the requested permission.'
      : 'Spotify listening history could not be refreshed right now.';
  } finally {
    spotifyLogLoading = false;
    if (route() === 'log') render();
  }
}

function libraryView() {
  return shell(`<section class="module-hero page-wave"><div><span class="eyebrow">LIBRARY</span><h1>Your music shelf.</h1><p>Favorites, albums, playlists, tabs and saved references will converge here.</p></div><div class="small-roadtrip library-trip"></div></section><section class="coming organic-panel"><h2>Library foundation</h2><p>Favorites already work locally inside CoverVerse. Once the MusicVerse Supabase project is connected, this becomes your synced desktop/phone library.</p></section>`);
}

function render() {
  switch (route()) {
    case 'coververse': app.innerHTML = coververseView(); break;
    case 'instruments': app.innerHTML = instrumentView(); break;
    case 'playlists': app.innerHTML = playlistsView(); break;
    case 'tabs': app.innerHTML = tabsView(); break;
    case 'log':
      app.innerHTML = logView();
      if (!spotifyLogAttempted && getSpotifyToken() && spotifyHasScope('user-read-recently-played')) void loadSpotifyListeningHistory();
      break;
    case 'library': app.innerHTML = libraryView(); break;
    default: app.innerHTML = homeView(); break;
  }
}

function openSpotifyUrl(url, listenedId = '') {
  if (!url) return showToast('Spotify link is not available for this item yet.');
  if (listenedId) markListened(listenedId);

  const appUri = spotifyResourceUri(url);
  if (appUri) {
    window.location.href = appUri;
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

function closePlaylistPicker() {
  const dialog = document.querySelector('[data-playlist-picker]');
  if (dialog) {
    dialog.close();
    dialog.remove();
  }
  pendingPlaylistTracks = [];
}

function openPlaylistPicker(tracks) {
  pendingPlaylistTracks = (Array.isArray(tracks) ? tracks : [tracks]).filter((track) => track?.id);
  if (!pendingPlaylistTracks.length) return showToast('No playlist-ready tracks are available for this item.');

  document.querySelector('[data-playlist-picker]')?.remove();
  const playlists = getPlaylists();
  const dialog = document.createElement('dialog');
  dialog.className = 'playlist-picker-dialog';
  dialog.dataset.playlistPicker = '';
  dialog.innerHTML = `<div class="playlist-picker-head"><div><span class="eyebrow">ADD TO PLAYLIST</span><h2>${pendingPlaylistTracks.length === 1 ? esc(pendingPlaylistTracks[0].title) : `${pendingPlaylistTracks.length} tracks`}</h2></div><button type="button" data-playlist-picker-close aria-label="Close">×</button></div>
    <div class="playlist-picker-options">${playlists.length ? playlists.map((playlist) => `<button type="button" data-playlist-choice="${esc(playlist.id)}"><strong>${esc(playlist.name)}</strong><span>${playlist.tracks.length} ${playlist.tracks.length === 1 ? 'track' : 'tracks'}</span></button>`).join('') : '<p>No playlists yet. Create one below and these tracks will be added to it.</p>'}</div>
    <form class="playlist-picker-new" data-playlist-picker-new><input name="name" placeholder="New playlist name" required><button class="primary-action">Create & add</button></form>`;
  document.body.append(dialog);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closePlaylistPicker();
  });
  dialog.showModal();
}

function addTrackDialog(track) {
  openPlaylistPicker([track]);
}

async function handleExport(playlistId) {
  const playlist = getPlaylists().find((item)=>item.id===playlistId);
  if (!playlist) return;
  if (!spotifyConfigured()) {
    showToast('Spotify export is wired, but the Spotify client ID still needs to be added to the Cloudflare build settings.');
    return;
  }
  if (!getSpotifyToken()) {
    await beginSpotifyLogin('#/playlists');
    return;
  }
  if (!playlist.tracks.some((track)=>track.spotifyUri)) {
    showToast('This playlist does not yet contain Spotify-track links.');
    return;
  }
  const exported = await exportPlaylistToSpotify({
    name: playlist.name,
    description: 'Built in MusicVerse',
    tracks: playlist.tracks,
  });
  showToast(`Sent “${playlist.name}” to Spotify.`);
  if (exported?.external_urls?.spotify) openSpotifyUrl(exported.external_urls.spotify);
}

window.addEventListener('hashchange', render);
window.addEventListener('musicverse:store-change', render);

document.addEventListener('click', async (event) => {
  const coverTab = event.target.closest('[data-cover-tab]');
  if (coverTab) {
    activeCoverTab = coverTab.dataset.coverTab;
    if (route() !== 'coververse') location.hash = '#/coververse'; else render();
    return;
  }

  const connectSpotifyLog = event.target.closest('[data-connect-spotify-log]');
  if (connectSpotifyLog) {
    try { await beginSpotifyLogin('#/log'); }
    catch (error) { showToast(error.message); }
    return;
  }

  const refreshSpotifyLog = event.target.closest('[data-refresh-spotify-log]');
  if (refreshSpotifyLog) {
    void loadSpotifyListeningHistory({ force: true });
    return;
  }

  const albumView = event.target.closest('[data-album-view]');
  if (albumView) {
    coverAlbumViewMode = albumView.dataset.albumView === 'list' ? 'list' : 'grid';
    render();
    return;
  }

  const resetAlbumFilters = event.target.closest('[data-album-filter-reset]');
  if (resetAlbumFilters) {
    coverAlbumFilters = { coverArtist: '', originalArtist: '', coverGenre: '', originalGenre: '' };
    coverAlbumSearchText = '';
    render();
    return;
  }
  const playlistChoice = event.target.closest('[data-playlist-choice]');
  if (playlistChoice) {
    const playlist = getPlaylists().find((item) => item.id === playlistChoice.dataset.playlistChoice);
    if (playlist) {
      addTracksToPlaylist(playlist.id, pendingPlaylistTracks);
      showToast(`Added ${pendingPlaylistTracks.length === 1 ? `“${pendingPlaylistTracks[0].title}”` : `${pendingPlaylistTracks.length} tracks`} to ${playlist.name}.`);
    }
    closePlaylistPicker();
    return;
  }

  const pickerClose = event.target.closest('[data-playlist-picker-close]');
  if (pickerClose) {
    closePlaylistPicker();
    return;
  }

  const addAlbum = event.target.closest('[data-add-album-tracks]');
  if (addAlbum) {
    const album = getCoverAlbumById(data.coverAlbums, addAlbum.dataset.addAlbumTracks);
    const tracks = (album?.detail?.tracks || []).map((track) => albumTrackPlaylistItem(album, track));
    openPlaylistPicker(tracks);
    return;
  }

  const open = event.target.closest('[data-open-url]');
  if (open) {
    openSpotifyUrl(open.dataset.openUrl, open.dataset.listened || '');
    return;
  }

  const favorite = event.target.closest('[data-favorite]');
  if (favorite) {
    toggleFavorite(favorite.dataset.favorite);
    render();
    return;
  }

  const add = event.target.closest('[data-add-track]');
  if (add) {
    addTrackDialog(JSON.parse(add.dataset.addTrack));
    return;
  }

  const remove = event.target.closest('[data-remove-track]');
  if (remove) {
    const [playlistId, trackId] = remove.dataset.removeTrack.split('|');
    removeTrackFromPlaylist(playlistId, trackId);
    return;
  }

  const exportButton = event.target.closest('[data-export-playlist]');
  if (exportButton) {
    try { await handleExport(exportButton.dataset.exportPlaylist); }
    catch (error) { showToast(error.message); }
  }

});

document.addEventListener('change', (event) => {
  const filter = event.target.closest('[data-album-filter]');
  if (!filter) return;
  coverAlbumFilters = { ...coverAlbumFilters, [filter.dataset.albumFilter]: filter.value };
  render();
});
document.addEventListener('submit', (event) => {
  if (event.target.matches('[data-playlist-picker-new]')) {
    event.preventDefault();
    const name = String(new FormData(event.target).get('name') || '').trim();
    if (!name) return;
    const created = createPlaylist(name);
    addTracksToPlaylist(created.id, pendingPlaylistTracks);
    showToast(`Created “${created.name}” and added ${pendingPlaylistTracks.length === 1 ? '1 track' : `${pendingPlaylistTracks.length} tracks`}.`);
    closePlaylistPicker();
    return;
  }

  if (event.target.matches('[data-album-search-form]')) {
    event.preventDefault();
    coverAlbumSearchText = String(new FormData(event.target).get('albumSearch') || '').trim();
    render();
    return;
  }
  if (event.target.matches('[data-search-form]')) {
    event.preventDefault();
    const input = event.target.querySelector('input');
    searchText = String(input?.value || '').trim();

    if (searchText && ['home', 'coververse'].includes(route())) {
      coverAlbumSearchText = searchText;
      activeCoverTab = 'albums';
      const targetHash = '#/coververse?tab=albums';
      if (location.hash !== targetHash) location.hash = targetHash;
      else render();
      return;
    }

    render();
  }
  if (event.target.matches('[data-new-playlist]')) {
    event.preventDefault();
    const form = new FormData(event.target);
    const name = String(form.get('name') || '').trim();
    if (!name) return;
    createPlaylist(name);
    event.target.reset();
  }
});

async function boot() {
  try { await finishSpotifyLoginFromUrl(); } catch (error) { console.warn(error); showToast(error.message); }
  try {
    data = await loadMusicData();
  } catch (error) {
    console.error(error);
    showToast('The seed music catalog could not be loaded.');
  }
  render();
}

boot();
