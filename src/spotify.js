const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
const STORAGE_KEY = 'musicverse.spotify.pkce';
const TOKEN_KEY = 'musicverse.spotify.token';
const SPOTIFY_SCOPES = [
  'playlist-modify-private',
  'playlist-modify-public',
  'user-read-recently-played',
];

function getConfig() {
  const clientId = String(import.meta.env.VITE_SPOTIFY_CLIENT_ID || '').trim();
  const redirectUri = String(import.meta.env.VITE_SPOTIFY_REDIRECT_URI || `${window.location.origin}${window.location.pathname}`).trim();
  return { clientId, redirectUri };
}

function base64UrlEncode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

function randomVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  return base64UrlEncode(bytes);
}

export function spotifyConfigured() {
  return Boolean(getConfig().clientId);
}

function getStoredSpotifyToken() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    if (!parsed?.access_token || !parsed?.expires_at || Date.now() >= parsed.expires_at) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getSpotifyToken() {
  return getStoredSpotifyToken()?.access_token || null;
}

export function spotifyHasScope(scope) {
  const token = getStoredSpotifyToken();
  if (!token) return false;
  return String(token.scope || '').split(/\s+/).filter(Boolean).includes(scope);
}

export async function beginSpotifyLogin(returnHash = '#/playlists') {
  const { clientId, redirectUri } = getConfig();
  if (!clientId) throw new Error('Spotify export needs a Spotify app client ID first.');
  const verifier = randomVerifier();
  const challenge = base64UrlEncode(await sha256(verifier));
  const state = crypto.randomUUID();
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ verifier, state, returnHash }));
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  });
  window.location.assign(`${SPOTIFY_AUTH_URL}?${params}`);
}

export async function finishSpotifyLoginFromUrl() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code) return false;

  const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
  if (!saved?.verifier || !saved?.state || saved.state !== state) throw new Error('Spotify login state did not match.');
  const { clientId, redirectUri } = getConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: saved.verifier,
  });
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error(`Spotify token exchange failed (${response.status}).`);
  const token = await response.json();
  localStorage.setItem(TOKEN_KEY, JSON.stringify({
    ...token,
    expires_at: Date.now() + Number(token.expires_in || 3600) * 1000 - 30_000,
  }));
  sessionStorage.removeItem(STORAGE_KEY);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${saved.returnHash || '#/'}`);
  return true;
}

async function spotifyFetch(path, options = {}) {
  const token = getSpotifyToken();
  if (!token) throw new Error('Connect Spotify before using this feature.');
  const response = await fetch(`${SPOTIFY_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const message = await response.text();
    const error = new Error(`Spotify request failed (${response.status}): ${message.slice(0, 180)}`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

export async function exportPlaylistToSpotify({ name, description, tracks, isPublic = false }) {
  const playlist = await spotifyFetch('/me/playlists', {
    method: 'POST',
    body: JSON.stringify({ name, description, public: isPublic }),
  });
  const uris = tracks.map((track) => track.spotifyUri).filter(Boolean);
  for (let i = 0; i < uris.length; i += 100) {
    await spotifyFetch(`/playlists/${encodeURIComponent(playlist.id)}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
    });
  }
  return playlist;
}

export async function fetchRecentlyPlayed(limit = 50) {
  const requested = Number(limit);
  const safeLimit = Number.isFinite(requested) ? Math.max(1, Math.min(50, Math.round(requested))) : 50;
  const response = await spotifyFetch(`/me/player/recently-played?limit=${safeLimit}`);
  return Array.isArray(response?.items) ? response.items : [];
}

export function spotifyResourceUri(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^spotify:[a-z]+:[A-Za-z0-9]+$/i.test(raw)) return raw;

  try {
    const url = new URL(raw);
    if (!/(^|\.)open\.spotify\.com$/i.test(url.hostname)) return '';
    const [type, id] = url.pathname.split('/').filter(Boolean);
    if (!['track','album','artist','playlist','show','episode'].includes(type) || !id) return '';
    return `spotify:${type}:${id}`;
  } catch {
    return '';
  }
}

export function spotifyTrackUri(url) {
  const uri = spotifyResourceUri(url);
  return uri.startsWith('spotify:track:') ? uri : '';
}
