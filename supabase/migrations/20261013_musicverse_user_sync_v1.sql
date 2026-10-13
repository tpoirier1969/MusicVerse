-- MusicVerse personal-library sync support.
-- Additive only. The existing musicverse_user_* tables remain canonical.

alter table public.musicverse_user_playlist_items
  add column if not exists source_item_key text,
  add column if not exists original_artist_snapshot text,
  add column if not exists spotify_url text,
  add column if not exists spotify_uri text,
  add column if not exists artwork_url text;

create unique index if not exists musicverse_user_playlist_items_source_uidx
  on public.musicverse_user_playlist_items (playlist_id, user_id, source_item_key)
  where source_item_key is not null and source_item_key <> '';

alter table public.musicverse_user_saved_items
  add column if not exists source_item_key text;

create unique index if not exists musicverse_user_saved_items_source_uidx
  on public.musicverse_user_saved_items (user_id, source_item_key)
  where source_item_key is not null and source_item_key <> '';

alter table public.musicverse_user_listening_events
  add column if not exists source_event_key text,
  add column if not exists source_item_key text;

update public.musicverse_user_listening_events
set source_event_key = spotify_event_key
where source = 'spotify'
  and source_event_key is null
  and spotify_event_key is not null;

create unique index if not exists musicverse_user_listening_events_source_event_uidx
  on public.musicverse_user_listening_events (user_id, source, source_event_key)
  where source_event_key is not null and source_event_key <> '';

alter table public.musicverse_user_references
  add column if not exists instrument_id uuid references public.musicverse_instruments(id) on delete set null;

create index if not exists musicverse_user_references_instrument_idx
  on public.musicverse_user_references (instrument_id);

comment on column public.musicverse_user_playlist_items.source_item_key is
  'Stable MusicVerse/browser track identity used for repeat-safe cross-device playlist sync.';
comment on column public.musicverse_user_saved_items.source_item_key is
  'Stable MusicVerse/browser identity for the saved album, recording, playlist, or reference.';
comment on column public.musicverse_user_listening_events.source_event_key is
  'Repeat-safe event identity. Spotify plays use the imported Spotify event key; MusicVerse activity uses a stable MusicVerse event key.';
comment on column public.musicverse_user_listening_events.source_item_key is
  'Stable MusicVerse item identity when one exists.';
