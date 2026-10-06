import './styles.css';
import { loadMusicData } from './data.js';
import {
  addTrackToPlaylist,
  createPlaylist,
  getListeningLog,
  getPlaylists,
  isFavorite,
  markListened,
  removeTrackFromPlaylist,
  toggleFavorite,
} from './store.js';
import {
  beginSpotifyLogin,
  exportPlaylistToSpotify,
  finishSpotifyLoginFromUrl,
  getSpotifyToken,
  spotifyConfigured,
  spotifyResourceUri,
  spotifyTrackUri,
} from './spotify.js';

const app = document.querySelector('#app');
let data = { coverAlbums: [], crazyCovers: [], accordionMusic: [] };
let activeCoverTab = 'start';
let searchText = '';
let toastTimer = null;

const moduleMeta = {
  home: { label: 'Home', icon: '⌂' },
  coververse: { label: 'CoverVerse', img: '/assets/vinyl.svg' },
  instruments: { label: 'InstrumentVerse', img: '/assets/accordion.svg' },
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
    <input data-search-input type="search" value="${esc(searchText)}" placeholder="Search songs, artists, albums, playlists, or tabs…" aria-label="Search MusicVerse">
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

function albumSpotifyUrl(album) {
  return album.spotify || '';
}

function recentAlbumCard(album, index) {
  const label = album.album || album.title || 'Untitled';
  const artist = album.artist || 'Unknown artist';
  const backgrounds = ['/assets/roadscape.svg','/assets/vinyl.svg','/assets/guitar.svg','/assets/mug.svg','/assets/library.svg'];
  return `<article class="recent-card">
    <button class="recent-art" data-open-url="${esc(albumSpotifyUrl(album))}" style="--recent-image:url('${backgrounds[index % backgrounds.length]}')" aria-label="Open ${esc(label)} in Spotify"></button>
    <div class="recent-meta"><strong>${esc(label)}</strong><span>${esc(artist)}</span><small>${esc(album.genre || 'Album')}</small></div>
  </article>`;
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

    <section class="module-ribbon" aria-label="MusicVerse modules">
      ${moduleWorld('coververse','CoverVerse','Crazy covers, full cover albums, and fresh takes on familiar songs.','/assets/vinyl.svg','world-rust')}
      ${moduleWorld('instruments','InstrumentVerse','Explore instruments through styles, traditions, players, and recordings.','/assets/accordion.svg','world-gold')}
      ${moduleWorld('playlists','Playlists','Build collections for moods, moments, and long roads.','/assets/van.svg','world-sage')}
      ${moduleWorld('tabs','Tabs & Chords','Keep the tabs, chords, and references you actually use.','/assets/guitar.svg','world-gold')}
      ${moduleWorld('log','Listening Log','Track what you hear and rediscover the good stuff later.','/assets/mug.svg','world-teal')}
      ${moduleWorld('library','Library','Your saved songs, albums, playlists, links, and more.','/assets/library.svg','world-clay')}
    </section>

    <section class="content-wave recent-section">
      <div class="section-heading"><div><span class="eyebrow">FRESH SOUNDS</span><h2>Recently Added</h2><p>Current discoveries from the catalog you’ve already built.</p></div><a href="#/coververse">See all →</a></div>
      <div class="recent-grid">${albums.map(recentAlbumCard).join('')}</div>
    </section>

    <section class="content-wave playlists-preview">
      <div class="section-heading"><div><span class="eyebrow">TAKE THE SCENIC ROUTE</span><h2>Curated Playlists</h2><p>Build here, then send the finished list to Spotify.</p></div><a class="spotify-pill" href="#/playlists">● Build playlists and send to Spotify →</a></div>
      <div class="playlist-strip">
        ${['Open Road','Morning Coffee','After Dark','Acoustic Detours','Jazz Backroads'].map((name,i)=>`<a href="#/playlists" class="playlist-teaser teaser-${i+1}"><span class="play-badge">▶</span><strong>${name}</strong><small>${[42,28,36,31,54][i]} songs</small></a>`).join('')}
      </div>
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
  return `<section class="featured-album organic-panel">
    <div class="featured-art" aria-hidden="true"><img src="/assets/roadscape.svg" alt=""><span class="record-peek"><img src="/assets/vinyl.svg" alt=""></span></div>
    <div class="featured-copy">
      <span class="eyebrow">FEATURED COVER ALBUM</span>
      <h2>${esc(album.album || 'Different Skies')}</h2>
      <h3>${esc(album.artist || 'Various Artists')}</h3>
      <p>${esc(album.why || 'Familiar songs, new horizons. A set of covers chosen because the arrangements actually change how the songs feel.')}</p>
      <div class="action-row">
        <button class="primary-action" data-open-url="${esc(spotifyUrl)}">▶ Open Album</button>
        <button class="secondary-action" data-build-album>☷ Build Playlist</button>
        <button class="secondary-action" data-open-url="${esc(spotifyUrl)}">● Open in Spotify</button>
      </div>
      <div class="album-meta">${esc(album.genre || 'Cover Album')} · ${esc(album.approach || 'Reinterpretation')}</div>
    </div>
    <div class="featured-note">some songs<br>just travel<br>better</div>
  </section>`;
}

function crazyRows(items) {
  return `<div class="track-list">${items.map((track) => {
    const id = `cover:${track.sourceArtist}:${track.song}:${track.coverArtist}`;
    return `<article class="track-row">
      <button class="round-play" data-open-url="${esc(track.spotify)}" data-listened="${esc(id)}" aria-label="Open ${esc(track.song)}">▶</button>
      <div class="track-main"><strong>${esc(track.song)}</strong><span>${esc(track.coverArtist)}</span></div>
      <div class="track-original"><small>Originally by</small><span>${esc(track.sourceArtist)}</span></div>
      <span class="style-pill">${esc(track.style)}</span>
      <button class="icon-btn${isFavorite(id)?' is-favorite':''}" data-favorite="${esc(id)}" title="Favorite">♥</button>
      <button class="icon-btn" data-add-track='${esc(JSON.stringify({id,title:track.song,artist:track.coverArtist,originalArtist:track.sourceArtist,spotifyUrl:track.spotify,spotifyUri:spotifyTrackUri(track.spotify)}))}' title="Add to playlist">＋</button>
    </article>`;
  }).join('')}</div>`;
}

function coverAlbumsGrid() {
  const items = data.coverAlbums.filter((album) => {
    const haystack = `${album.artist} ${album.album} ${album.genre} ${album.approach}`.toLowerCase();
    return !searchText || haystack.includes(searchText.toLowerCase());
  });
  return `<div class="album-grid">${items.slice(0, 60).map((album, index) => `<article class="album-card">
    <div class="album-card-art" style="--album-bg:url('${index % 2 ? '/assets/vinyl.svg' : '/assets/roadscape.svg'}')"></div>
    <div><span class="eyebrow">${esc(album.genre)}</span><h3>${esc(album.album)}</h3><p>${esc(album.artist)}</p><small>${esc(album.approach)}</small></div>
    <button class="round-arrow" data-open-url="${esc(album.spotify)}" aria-label="Open on Spotify">→</button>
  </article>`).join('')}</div>`;
}

function accordionGrid() {
  return `<div class="album-grid compact-grid">${data.accordionMusic.slice(0, 80).map((item, index)=>`<article class="album-card">
    <div class="album-card-art" style="--album-bg:url('${index % 3 === 0 ? '/assets/van.svg' : '/assets/guitar.svg'}')"></div>
    <div><span class="eyebrow">${esc(item.style)}</span><h3>${esc(item.track)}</h3><p>${esc(item.artist)}</p><small>${esc(item.region)}</small></div>
    <button class="round-arrow" data-open-url="${esc(item.spotify)}" aria-label="Open on Spotify">→</button>
  </article>`).join('')}</div>`;
}

function coververseBody() {
  if (activeCoverTab === 'albums') return `<section class="module-content"><div class="section-heading"><div><h2>Cover Albums</h2><p>${data.coverAlbums.length} albums in the current catalog.</p></div></div>${coverAlbumsGrid()}</section>`;
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

function coververseView() {
  return shell(`<section class="module-hero cover-hero page-wave"><div><span class="eyebrow">COVERVERSE</span><h1>CoverVerse</h1><p>Fresh takes on familiar songs.</p>${heroSearch()}</div><div class="small-roadtrip"></div></section>${coverSubnav()}${coververseBody()}`);
}

function instrumentView() {
  return shell(`<section class="module-hero instrument-hero page-wave"><div><span class="eyebrow">INSTRUMENTVERSE</span><h1>InstrumentVerse</h1><p>Follow instruments across styles, traditions, players, and recordings.</p>${heroSearch()}</div><div class="small-roadtrip instrument-trip"></div></section><section class="module-content instrument-content"><div class="section-heading instrument-heading"><div><span class="eyebrow">FIRST INSTRUMENT</span><h2>Accordion</h2><p>Explore how the accordion changes character across regions, genres, ensembles, and players.</p></div><img class="instrument-feature-icon" src="/assets/accordion.svg" alt="" aria-hidden="true"></div>${accordionGrid()}</section>`);
}

function playlistTrackRow(track, playlistId) {
  return `<div class="playlist-track"><span class="playlist-track-dot">●</span><div><strong>${esc(track.title)}</strong><small>${esc(track.artist)}${track.originalArtist ? ` · originally ${esc(track.originalArtist)}` : ''}</small></div><button data-remove-track="${esc(playlistId)}|${esc(track.id)}">×</button></div>`;
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

function logView() {
  const log = Object.entries(getListeningLog()).sort((a,b)=>String(b[1]).localeCompare(String(a[1]))).slice(0,50);
  return shell(`<section class="module-hero page-wave"><div><span class="eyebrow">LISTENING LOG</span><h1>Remember what landed.</h1><p>A quiet trail of the songs and versions you actually opened.</p></div><div class="small-roadtrip coffee-trip"></div></section><section class="coming organic-panel"><h2>Recent listening</h2>${log.length ? `<div class="log-list">${log.map(([id,at])=>`<div><span>${esc(id.replace('cover:','').replaceAll(':',' · '))}</span><small>${new Date(at).toLocaleString()}</small></div>`).join('')}</div>` : '<p>No listening history yet. Open a few covers and this starts filling itself.</p>'}</section>`);
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
    case 'log': app.innerHTML = logView(); break;
    case 'library': app.innerHTML = libraryView(); break;
    default: app.innerHTML = homeView(); break;
  }
}

function openSpotifyUrl(url, listenedId = '') {
  if (!url) return showToast('Spotify link is not available for this item yet.');
  if (listenedId) markListened(listenedId);

  const appUri = spotifyResourceUri(url);
  if (!appUri) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  let fallbackTimer = null;
  const onVisibilityChange = () => {
    if (document.hidden) cleanup();
  };
  const cleanup = () => {
    if (fallbackTimer) window.clearTimeout(fallbackTimer);
    fallbackTimer = null;
    window.removeEventListener('blur', cleanup);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };

  window.addEventListener('blur', cleanup, { once: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  fallbackTimer = window.setTimeout(() => {
    cleanup();
    window.open(url, '_blank', 'noopener,noreferrer');
  }, 1800);

  window.location.href = appUri;
}

function addTrackDialog(track) {
  const playlists = getPlaylists();
  if (!playlists.length) {
    const created = createPlaylist('Open Road');
    addTrackToPlaylist(created.id, track);
    showToast(`Added “${track.title}” to Open Road.`);
    return;
  }
  const selected = playlists[0];
  addTrackToPlaylist(selected.id, track);
  showToast(`Added “${track.title}” to ${selected.name}.`);
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

  const buildAlbum = event.target.closest('[data-build-album]');
  if (buildAlbum) {
    location.hash = '#/playlists';
    showToast('Use ＋ beside individual covers to build the playlist you want.');
  }
});

document.addEventListener('submit', (event) => {
  if (event.target.matches('[data-search-form]')) {
    event.preventDefault();
    searchText = new FormData(event.target).get('q') || event.target.querySelector('input')?.value || '';
    const input = event.target.querySelector('input');
    searchText = String(input?.value || '').trim();
    if (searchText && route() === 'home') location.hash = '#/coververse';
    activeCoverTab = searchText ? 'crazy' : activeCoverTab;
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
