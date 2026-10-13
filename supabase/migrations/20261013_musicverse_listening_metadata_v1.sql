-- Preserve enough Spotify listening metadata for cross-device MusicVerse history.

alter table public.musicverse_user_listening_events
  add column if not exists spotify_album_id text,
  add column if not exists spotify_url text,
  add column if not exists artwork_url text,
  add column if not exists context_url text,
  add column if not exists artists_snapshot text[] not null default '{}';

comment on column public.musicverse_user_listening_events.artists_snapshot is
  'All credited artist names captured with the listening event for cross-device display.';
