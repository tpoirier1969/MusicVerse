const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
const STORAGE_KEY = 'musicverse.spotify.pkce';
const TOKEN_KEY = 'musicverse.spotify.token';

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

export function getSpotifyToken() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    if (!parsed?.access_token || !parsed?.expires_at || Date.now() >= parsed.expires_at) return null;
    return parsed.access_token;
  } catch {
    return null;
  }
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
    scope: 'playlist-modify-private playlist-modify-public',
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
  if (!token) throw new Error('Connect Spotify before exporting a playlist.');
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
    throw new Error(`Spotify request failed (${response.status}): ${message.slice(0, 180)}`);
  }
  return response.status === 204 ? null : response.json();
}

export async function exportPlaylistToSpotify({ name, description, tracks, isPublic = false }) {
  const profile = await spotifyFetch('/me');
  const playlist = await spotifyFetch(`/users/${encodeURIComponent(profile.id)}/playlists`, {
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

export function spotifyTrackUri(url) {
  const match = String(url || '').match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/i);
  return match ? `spotify:track:${match[1]}` : '';
}
