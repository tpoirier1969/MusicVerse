-- MusicVerse catalog foundation for the shared personal Yellowdawg Supabase project.
-- All objects are namespaced musicverse_ so they cannot collide with sibling apps.
-- This migration is intentionally non-destructive.

create extension if not exists pgcrypto;

create table if not exists public.musicverse_catalog_imports (
  source_fingerprint text primary key,
  schema_version integer not null,
  summary jsonb not null default '{}'::jsonb,
  applied_at timestamptz not null default now()
);

create table if not exists public.musicverse_catalog_albums (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  catalog_rank integer,
  start_here boolean not null default false,
  artist text not null default '',
  album text not null default '',
  cover_genres text[] not null default '{}',
  original_genres text[] not null default '{}',
  release_date date,
  artwork_url text not null default '',
  spotify_url text not null default '',
  spotify_album_id text,
  cover_album_intent boolean,
  cover_track_count integer,
  total_track_count integer,
  approach text not null default '',
  why text not null default '',
  catalog_note text not null default '',
  notes jsonb not null default '[]'::jsonb,
  personnel jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint musicverse_catalog_albums_cover_counts_check
    check (
      (cover_track_count is null or cover_track_count >= 0)
      and (total_track_count is null or total_track_count >= 0)
      and (cover_track_count is null or total_track_count is null or cover_track_count <= total_track_count)
    )
);

create unique index if not exists musicverse_catalog_albums_spotify_album_id_uidx
  on public.musicverse_catalog_albums (spotify_album_id)
  where spotify_album_id is not null and spotify_album_id <> '';

create index if not exists musicverse_catalog_albums_rank_idx
  on public.musicverse_catalog_albums (catalog_rank);

create table if not exists public.musicverse_catalog_recordings (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  artist text not null default '',
  duration_seconds numeric(12,3),
  original_artist text not null default '',
  original_genre text,
  is_cover boolean,
  spotify_url text not null default '',
  spotify_track_id text,
  artwork_url text not null default '',
  style text not null default '',
  region text not null default '',
  wildness integer,
  standout boolean not null default false,
  why text not null default '',
  catalog_order integer,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists musicverse_catalog_recordings_spotify_track_id_uidx
  on public.musicverse_catalog_recordings (spotify_track_id)
  where spotify_track_id is not null and spotify_track_id <> '';

create index if not exists musicverse_catalog_recordings_title_idx
  on public.musicverse_catalog_recordings (lower(title));

create table if not exists public.musicverse_catalog_recording_aliases (
  legacy_id text primary key,
  recording_id uuid not null references public.musicverse_catalog_recordings(id) on delete cascade,
  alias_type text not null,
  created_at timestamptz not null default now(),
  constraint musicverse_catalog_recording_aliases_type_check
    check (alias_type in ('album_track','crazy_cover','soundtrail'))
);

create index if not exists musicverse_catalog_recording_aliases_recording_idx
  on public.musicverse_catalog_recording_aliases (recording_id);

create table if not exists public.musicverse_catalog_album_tracks (
  album_id uuid not null references public.musicverse_catalog_albums(id) on delete cascade,
  recording_id uuid not null references public.musicverse_catalog_recordings(id) on delete cascade,
  track_number integer not null,
  musicians jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (album_id, recording_id),
  constraint musicverse_catalog_album_tracks_number_check check (track_number > 0)
);

create unique index if not exists musicverse_catalog_album_tracks_position_uidx
  on public.musicverse_catalog_album_tracks (album_id, track_number);

create index if not exists musicverse_catalog_album_tracks_recording_idx
  on public.musicverse_catalog_album_tracks (recording_id);

create table if not exists public.musicverse_catalog_crazy_covers (
  recording_id uuid primary key references public.musicverse_catalog_recordings(id) on delete cascade,
  source_artist text not null default '',
  song text not null default '',
  cover_artist text not null default '',
  catalog_order integer not null,
  updated_at timestamptz not null default now()
);

create index if not exists musicverse_catalog_crazy_covers_order_idx
  on public.musicverse_catalog_crazy_covers (catalog_order);

create table if not exists public.musicverse_catalog_instruments (
  slug text primary key,
  label text not null,
  description text not null default '',
  sort_order integer not null,
  genres jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.musicverse_catalog_soundtrail_links (
  recording_id uuid not null references public.musicverse_catalog_recordings(id) on delete cascade,
  instrument_slug text not null references public.musicverse_catalog_instruments(slug) on delete cascade,
  genre text not null default '',
  instrument_note text not null default '',
  start_here boolean not null default false,
  catalog_order integer not null,
  updated_at timestamptz not null default now(),
  primary key (recording_id, instrument_slug)
);

create index if not exists musicverse_catalog_soundtrail_instrument_idx
  on public.musicverse_catalog_soundtrail_links (instrument_slug, catalog_order);

alter table public.musicverse_catalog_imports enable row level security;
alter table public.musicverse_catalog_albums enable row level security;
alter table public.musicverse_catalog_recordings enable row level security;
alter table public.musicverse_catalog_recording_aliases enable row level security;
alter table public.musicverse_catalog_album_tracks enable row level security;
alter table public.musicverse_catalog_crazy_covers enable row level security;
alter table public.musicverse_catalog_instruments enable row level security;
alter table public.musicverse_catalog_soundtrail_links enable row level security;

drop policy if exists musicverse_catalog_imports_public_read on public.musicverse_catalog_imports;
create policy musicverse_catalog_imports_public_read
on public.musicverse_catalog_imports for select to anon, authenticated using (true);

drop policy if exists musicverse_catalog_albums_public_read on public.musicverse_catalog_albums;
create policy musicverse_catalog_albums_public_read
on public.musicverse_catalog_albums for select to anon, authenticated using (true);

drop policy if exists musicverse_catalog_recordings_public_read on public.musicverse_catalog_recordings;
create policy musicverse_catalog_recordings_public_read
on public.musicverse_catalog_recordings for select to anon, authenticated using (true);

drop policy if exists musicverse_catalog_recording_aliases_public_read on public.musicverse_catalog_recording_aliases;
create policy musicverse_catalog_recording_aliases_public_read
on public.musicverse_catalog_recording_aliases for select to anon, authenticated using (true);

drop policy if exists musicverse_catalog_album_tracks_public_read on public.musicverse_catalog_album_tracks;
create policy musicverse_catalog_album_tracks_public_read
on public.musicverse_catalog_album_tracks for select to anon, authenticated using (true);

drop policy if exists musicverse_catalog_crazy_covers_public_read on public.musicverse_catalog_crazy_covers;
create policy musicverse_catalog_crazy_covers_public_read
on public.musicverse_catalog_crazy_covers for select to anon, authenticated using (true);

drop policy if exists musicverse_catalog_instruments_public_read on public.musicverse_catalog_instruments;
create policy musicverse_catalog_instruments_public_read
on public.musicverse_catalog_instruments for select to anon, authenticated using (true);

drop policy if exists musicverse_catalog_soundtrail_links_public_read on public.musicverse_catalog_soundtrail_links;
create policy musicverse_catalog_soundtrail_links_public_read
on public.musicverse_catalog_soundtrail_links for select to anon, authenticated using (true);

create or replace function public.musicverse_catalog_resolve_recording(
  p_legacy_id text,
  p_alias_type text,
  p_title text,
  p_artist text,
  p_duration_seconds numeric,
  p_original_artist text,
  p_original_genre text,
  p_is_cover boolean,
  p_spotify_url text,
  p_spotify_track_id text,
  p_artwork_url text,
  p_style text,
  p_region text,
  p_wildness integer,
  p_standout boolean,
  p_why text,
  p_catalog_order integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recording_id uuid;
begin
  select recording_id
    into v_recording_id
  from public.musicverse_catalog_recording_aliases
  where legacy_id = p_legacy_id;

  if v_recording_id is null and coalesce(p_spotify_track_id, '') <> '' then
    select id
      into v_recording_id
    from public.musicverse_catalog_recordings
    where spotify_track_id = p_spotify_track_id
    limit 1;
  end if;

  if v_recording_id is null then
    insert into public.musicverse_catalog_recordings (
      title, artist, duration_seconds, original_artist, original_genre, is_cover,
      spotify_url, spotify_track_id, artwork_url, style, region, wildness,
      standout, why, catalog_order
    )
    values (
      coalesce(p_title,''), coalesce(p_artist,''), p_duration_seconds,
      coalesce(p_original_artist,''), p_original_genre, p_is_cover,
      coalesce(p_spotify_url,''), nullif(p_spotify_track_id,''),
      coalesce(p_artwork_url,''), coalesce(p_style,''), coalesce(p_region,''),
      p_wildness, coalesce(p_standout,false), coalesce(p_why,''), p_catalog_order
    )
    returning id into v_recording_id;
  else
    update public.musicverse_catalog_recordings
       set title = case when coalesce(p_title,'') <> '' then p_title else title end,
           artist = case when coalesce(p_artist,'') <> '' then p_artist else artist end,
           duration_seconds = coalesce(p_duration_seconds, duration_seconds),
           original_artist = case when coalesce(p_original_artist,'') <> '' then p_original_artist else original_artist end,
           original_genre = coalesce(p_original_genre, original_genre),
           is_cover = coalesce(p_is_cover, is_cover),
           spotify_url = case when coalesce(p_spotify_url,'') <> '' then p_spotify_url else spotify_url end,
           spotify_track_id = coalesce(nullif(p_spotify_track_id,''), spotify_track_id),
           artwork_url = case when coalesce(p_artwork_url,'') <> '' then p_artwork_url else artwork_url end,
           style = case when coalesce(p_style,'') <> '' then p_style else style end,
           region = case when coalesce(p_region,'') <> '' then p_region else region end,
           wildness = coalesce(p_wildness, wildness),
           standout = coalesce(p_standout, standout),
           why = case when coalesce(p_why,'') <> '' then p_why else why end,
           catalog_order = coalesce(p_catalog_order, catalog_order),
           updated_at = now()
     where id = v_recording_id;
  end if;

  insert into public.musicverse_catalog_recording_aliases (legacy_id, recording_id, alias_type)
  values (p_legacy_id, v_recording_id, p_alias_type)
  on conflict (legacy_id) do update
    set recording_id = excluded.recording_id,
        alias_type = excluded.alias_type;

  return v_recording_id;
end;
$$;

revoke all on function public.musicverse_catalog_resolve_recording(
  text,text,text,text,numeric,text,text,boolean,text,text,text,text,text,integer,boolean,text,integer
) from public, anon, authenticated;
grant execute on function public.musicverse_catalog_resolve_recording(
  text,text,text,text,numeric,text,text,boolean,text,text,text,text,text,integer,boolean,text,integer
) to service_role;

create or replace function public.musicverse_import_catalog_v1(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_album jsonb;
  v_detail jsonb;
  v_track jsonb;
  v_crazy jsonb;
  v_instrument jsonb;
  v_sound jsonb;
  v_album_id uuid;
  v_recording_id uuid;
  v_fingerprint text := coalesce(payload->>'sourceFingerprint','');
  v_schema_version integer := coalesce((payload->>'schemaVersion')::integer, 1);
  v_album_count integer := 0;
  v_track_count integer := 0;
  v_crazy_count integer := 0;
  v_sound_count integer := 0;
begin
  if v_fingerprint = '' then
    raise exception 'MusicVerse catalog import requires sourceFingerprint';
  end if;

  for v_album in select value from jsonb_array_elements(coalesce(payload->'albums','[]'::jsonb))
  loop
    v_detail := v_album->'detail';

    insert into public.musicverse_catalog_albums (
      legacy_id, catalog_rank, start_here, artist, album, cover_genres,
      original_genres, release_date, artwork_url, spotify_url, spotify_album_id,
      cover_album_intent, cover_track_count, total_track_count, approach, why,
      catalog_note, notes, personnel, sources, updated_at
    )
    values (
      v_album->>'legacyId',
      nullif(v_album->>'catalogRank','')::integer,
      coalesce((v_album->>'startHere')::boolean,false),
      coalesce(v_album->>'artist',''),
      coalesce(v_album->>'title',''),
      case when coalesce(v_album->>'coverGenre','') = '' then '{}'::text[] else array[v_album->>'coverGenre'] end,
      coalesce(array(select jsonb_array_elements_text(coalesce(v_detail->'originalGenres','[]'::jsonb))), '{}'::text[]),
      nullif(v_detail->>'releaseDate','')::date,
      coalesce(v_detail->>'artwork',''),
      coalesce(v_album->>'spotifyUrl',''),
      nullif(v_album->>'spotifyAlbumId',''),
      case when v_album ? 'coverAlbumIntent' and jsonb_typeof(v_album->'coverAlbumIntent') <> 'null' then (v_album->>'coverAlbumIntent')::boolean else null end,
      nullif(v_album->>'coverTrackCount','')::integer,
      nullif(v_album->>'totalTrackCount','')::integer,
      coalesce(v_album->>'approach',''),
      coalesce(v_album->>'why',''),
      coalesce(v_album->>'catalogNote',''),
      coalesce(v_detail->'notes','[]'::jsonb),
      coalesce(v_detail->'personnel','[]'::jsonb),
      coalesce(v_detail->'sources','[]'::jsonb),
      now()
    )
    on conflict (legacy_id) do update set
      catalog_rank = excluded.catalog_rank,
      start_here = excluded.start_here,
      artist = excluded.artist,
      album = excluded.album,
      cover_genres = excluded.cover_genres,
      original_genres = excluded.original_genres,
      release_date = excluded.release_date,
      artwork_url = excluded.artwork_url,
      spotify_url = excluded.spotify_url,
      spotify_album_id = excluded.spotify_album_id,
      cover_album_intent = excluded.cover_album_intent,
      cover_track_count = excluded.cover_track_count,
      total_track_count = excluded.total_track_count,
      approach = excluded.approach,
      why = excluded.why,
      catalog_note = excluded.catalog_note,
      notes = excluded.notes,
      personnel = excluded.personnel,
      sources = excluded.sources,
      updated_at = now()
    returning id into v_album_id;

    v_album_count := v_album_count + 1;

    if v_detail is not null and jsonb_typeof(v_detail) = 'object' then
      for v_track in select value from jsonb_array_elements(coalesce(v_detail->'tracks','[]'::jsonb))
      loop
        v_recording_id := public.musicverse_catalog_resolve_recording(
          v_track->>'legacyId',
          'album_track',
          v_track->>'title',
          v_album->>'artist',
          nullif(v_track->>'durationSeconds','')::numeric,
          v_track->>'originalArtist',
          v_track->>'originalGenre',
          case when v_track ? 'isCover' and jsonb_typeof(v_track->'isCover') <> 'null' then (v_track->>'isCover')::boolean else null end,
          v_track->>'spotifyUrl',
          v_track->>'spotifyTrackId',
          v_track->>'artwork',
          '',
          '',
          null,
          false,
          '',
          null
        );

        insert into public.musicverse_catalog_album_tracks (
          album_id, recording_id, track_number, musicians, updated_at
        )
        values (
          v_album_id,
          v_recording_id,
          (v_track->>'number')::integer,
          coalesce(v_track->'musicians','[]'::jsonb),
          now()
        )
        on conflict (album_id, recording_id) do update set
          track_number = excluded.track_number,
          musicians = excluded.musicians,
          updated_at = now();

        v_track_count := v_track_count + 1;
      end loop;
    end if;
  end loop;

  for v_crazy in select value from jsonb_array_elements(coalesce(payload->'crazyCovers','[]'::jsonb))
  loop
    v_recording_id := public.musicverse_catalog_resolve_recording(
      v_crazy->>'legacyId',
      'crazy_cover',
      v_crazy->>'song',
      v_crazy->>'coverArtist',
      null,
      v_crazy->>'sourceArtist',
      null,
      true,
      v_crazy->>'spotifyUrl',
      v_crazy->>'spotifyTrackId',
      v_crazy->>'artwork',
      v_crazy->>'style',
      '',
      nullif(v_crazy->>'wildness','')::integer,
      coalesce((v_crazy->>'standout')::boolean,false),
      v_crazy->>'why',
      nullif(v_crazy->>'catalogOrder','')::integer
    );

    insert into public.musicverse_catalog_crazy_covers (
      recording_id, source_artist, song, cover_artist, catalog_order, updated_at
    )
    values (
      v_recording_id,
      coalesce(v_crazy->>'sourceArtist',''),
      coalesce(v_crazy->>'song',''),
      coalesce(v_crazy->>'coverArtist',''),
      (v_crazy->>'catalogOrder')::integer,
      now()
    )
    on conflict (recording_id) do update set
      source_artist = excluded.source_artist,
      song = excluded.song,
      cover_artist = excluded.cover_artist,
      catalog_order = excluded.catalog_order,
      updated_at = now();

    v_crazy_count := v_crazy_count + 1;
  end loop;

  for v_instrument in select value from jsonb_array_elements(coalesce(payload#>'{soundTrail,instruments}','[]'::jsonb))
  loop
    insert into public.musicverse_catalog_instruments (
      slug, label, description, sort_order, genres, updated_at
    )
    values (
      v_instrument->>'id',
      coalesce(v_instrument->>'label',''),
      coalesce(v_instrument->>'description',''),
      (v_instrument->>'sortOrder')::integer,
      coalesce(v_instrument->'genres','[]'::jsonb),
      now()
    )
    on conflict (slug) do update set
      label = excluded.label,
      description = excluded.description,
      sort_order = excluded.sort_order,
      genres = excluded.genres,
      updated_at = now();
  end loop;

  for v_sound in select value from jsonb_array_elements(coalesce(payload#>'{soundTrail,recordings}','[]'::jsonb))
  loop
    v_recording_id := public.musicverse_catalog_resolve_recording(
      v_sound->>'legacyId',
      'soundtrail',
      v_sound->>'track',
      v_sound->>'artist',
      null,
      '',
      null,
      null,
      v_sound->>'spotifyUrl',
      v_sound->>'spotifyTrackId',
      v_sound->>'artwork',
      '',
      v_sound->>'region',
      null,
      false,
      '',
      nullif(v_sound->>'catalogOrder','')::integer
    );

    insert into public.musicverse_catalog_soundtrail_links (
      recording_id, instrument_slug, genre, instrument_note, start_here,
      catalog_order, updated_at
    )
    select
      v_recording_id,
      instrument_slug,
      coalesce(v_sound#>>array['genresByInstrument',instrument_slug],''),
      coalesce(v_sound#>>array['instrumentNotes',instrument_slug],''),
      coalesce((v_sound->>'startHere')::boolean,false),
      (v_sound->>'catalogOrder')::integer,
      now()
    from jsonb_array_elements_text(coalesce(v_sound->'instruments','[]'::jsonb)) as instrument_slug
    on conflict (recording_id, instrument_slug) do update set
      genre = excluded.genre,
      instrument_note = excluded.instrument_note,
      start_here = excluded.start_here,
      catalog_order = excluded.catalog_order,
      updated_at = now();

    v_sound_count := v_sound_count + 1;
  end loop;

  insert into public.musicverse_catalog_imports (
    source_fingerprint, schema_version, summary, applied_at
  )
  values (
    v_fingerprint,
    v_schema_version,
    jsonb_build_object(
      'albums', v_album_count,
      'albumTracks', v_track_count,
      'crazyCovers', v_crazy_count,
      'soundTrailRecordings', v_sound_count
    ),
    now()
  )
  on conflict (source_fingerprint) do update set
    schema_version = excluded.schema_version,
    summary = excluded.summary,
    applied_at = excluded.applied_at;

  return jsonb_build_object(
    'sourceFingerprint', v_fingerprint,
    'albums', v_album_count,
    'albumTracks', v_track_count,
    'crazyCovers', v_crazy_count,
    'soundTrailRecordings', v_sound_count
  );
end;
$$;

revoke all on function public.musicverse_import_catalog_v1(jsonb) from public, anon, authenticated;
grant execute on function public.musicverse_import_catalog_v1(jsonb) to service_role;

create or replace view public.musicverse_cover_albums_v
with (security_invoker = true)
as
select
  a.id,
  a.legacy_id,
  a.album,
  a.artist,
  a.cover_genres,
  a.original_genres,
  a.release_date,
  a.artwork_url,
  a.spotify_album_id,
  a.spotify_url,
  a.catalog_rank,
  a.start_here,
  a.cover_album_intent,
  a.cover_track_count,
  a.total_track_count,
  a.approach,
  a.why,
  a.catalog_note,
  a.imported_at as added_at
from public.musicverse_catalog_albums a;

create or replace view public.musicverse_album_details_v
with (security_invoker = true)
as
select
  a.legacy_id as album_id,
  a.release_date,
  a.artwork_url as artwork,
  coalesce(
    array(
      select distinct r.original_artist
      from public.musicverse_catalog_album_tracks at2
      join public.musicverse_catalog_recordings r on r.id = at2.recording_id
      where at2.album_id = a.id and coalesce(r.original_artist,'') <> ''
      order by r.original_artist
    ),
    '{}'::text[]
  ) as original_artists,
  a.original_genres,
  a.notes,
  a.personnel,
  a.sources,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', alias.legacy_id,
        'recordingUuid', r.id,
        'number', at.track_number,
        'title', r.title,
        'durationSeconds', r.duration_seconds,
        'originalArtist', r.original_artist,
        'originalGenre', r.original_genre,
        'isCover', r.is_cover,
        'spotify', r.spotify_url,
        'spotifyUri', case when coalesce(r.spotify_track_id,'') <> '' then 'spotify:track:' || r.spotify_track_id else '' end,
        'artwork', r.artwork_url,
        'musicians', at.musicians
      )
      order by at.track_number
    ) filter (where r.id is not null),
    '[]'::jsonb
  ) as tracks
from public.musicverse_catalog_albums a
left join public.musicverse_catalog_album_tracks at on at.album_id = a.id
left join public.musicverse_catalog_recordings r on r.id = at.recording_id
left join public.musicverse_catalog_recording_aliases alias
  on alias.recording_id = r.id and alias.alias_type = 'album_track'
group by a.id;

create or replace view public.musicverse_crazy_covers_v
with (security_invoker = true)
as
select
  r.id as recording_id,
  alias.legacy_id,
  c.source_artist,
  c.song,
  c.cover_artist,
  r.style,
  r.wildness,
  r.standout,
  r.why,
  r.artwork_url,
  r.spotify_url,
  c.catalog_order
from public.musicverse_catalog_crazy_covers c
join public.musicverse_catalog_recordings r on r.id = c.recording_id
left join public.musicverse_catalog_recording_aliases alias
  on alias.recording_id = r.id and alias.alias_type = 'crazy_cover';

create or replace view public.musicverse_soundtrail_instruments_v
with (security_invoker = true)
as
select
  i.slug as id,
  i.label,
  i.description,
  i.genres,
  i.sort_order
from public.musicverse_catalog_instruments i;

create or replace view public.musicverse_soundtrail_v
with (security_invoker = true)
as
select
  r.id as recording_id,
  alias.legacy_id,
  r.artist,
  r.title as track,
  r.region,
  l.start_here,
  l.instrument_slug,
  l.genre,
  l.instrument_note,
  r.spotify_url,
  r.artwork_url,
  l.catalog_order
from public.musicverse_catalog_soundtrail_links l
join public.musicverse_catalog_recordings r on r.id = l.recording_id
left join public.musicverse_catalog_recording_aliases alias
  on alias.recording_id = r.id and alias.alias_type = 'soundtrail';

grant select on public.musicverse_cover_albums_v to anon, authenticated;
grant select on public.musicverse_album_details_v to anon, authenticated;
grant select on public.musicverse_crazy_covers_v to anon, authenticated;
grant select on public.musicverse_soundtrail_instruments_v to anon, authenticated;
grant select on public.musicverse_soundtrail_v to anon, authenticated;

comment on function public.musicverse_import_catalog_v1(jsonb) is
  'Repeat-safe MusicVerse catalog import. Upserts stable IDs and does not delete catalog rows omitted from a later payload.';
