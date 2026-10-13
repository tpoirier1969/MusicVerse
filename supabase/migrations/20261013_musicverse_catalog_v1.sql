-- MusicVerse catalog synchronization support for Yellowdawg.
-- This migration AUGMENTS the existing normalized musicverse_* schema.
-- It is non-destructive: no catalog rows are deleted.

create table if not exists public.musicverse_recording_aliases (
  alias_id text primary key,
  recording_id uuid not null references public.musicverse_recordings(id) on delete cascade,
  alias_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists musicverse_recording_aliases_recording_idx
  on public.musicverse_recording_aliases (recording_id);

create unique index if not exists musicverse_recording_instruments_recording_instrument_uidx
  on public.musicverse_recording_instruments (recording_id, instrument_id);

alter table public.musicverse_recording_aliases enable row level security;

drop policy if exists musicverse_recording_aliases_public_read on public.musicverse_recording_aliases;
create policy musicverse_recording_aliases_public_read
on public.musicverse_recording_aliases
for select to anon, authenticated
using (true);

-- Preserve every pre-existing recording legacy id as an alias.
insert into public.musicverse_recording_aliases (alias_id, recording_id, alias_type)
select legacy_id, id, 'legacy_import'
from public.musicverse_recordings
where legacy_id is not null and legacy_id <> ''
on conflict (alias_id) do update
set recording_id = excluded.recording_id,
    updated_at = now();

-- Album track IDs are context-specific and should survive recording reuse.
insert into public.musicverse_recording_aliases (alias_id, recording_id, alias_type)
select legacy_track_id, recording_id, 'album_track'
from public.musicverse_album_recordings
where legacy_track_id is not null and legacy_track_id <> ''
on conflict (alias_id) do update
set recording_id = excluded.recording_id,
    alias_type = excluded.alias_type,
    updated_at = now();

-- Current Crazy Covers rows predate the permanent crazy-cover-#### IDs.
-- Catalog order is stable in the source snapshot, so seed those aliases once.
insert into public.musicverse_recording_aliases (alias_id, recording_id, alias_type)
select
  'crazy-cover-' || lpad(catalog_order::text, 4, '0'),
  recording_id,
  'crazy_cover'
from public.musicverse_crazy_covers
where catalog_order is not null
on conflict (alias_id) do update
set recording_id = excluded.recording_id,
    alias_type = excluded.alias_type,
    updated_at = now();

-- SoundTrail already has stable recording IDs, but make them contextual aliases
-- so a recording can later appear elsewhere without losing its SoundTrail identity.
insert into public.musicverse_recording_aliases (alias_id, recording_id, alias_type)
select distinct r.legacy_id, r.id, 'soundtrail'
from public.musicverse_recordings r
join public.musicverse_recording_instruments ri on ri.recording_id = r.id
where r.legacy_id like 'soundtrail-recording-%'
on conflict (alias_id) do update
set recording_id = excluded.recording_id,
    alias_type = excluded.alias_type,
    updated_at = now();

create or replace function public.musicverse_slug(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_value,'')), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.musicverse_upsert_artist(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_name),'') = '' then
    return null;
  end if;

  select id into v_id
  from public.musicverse_artists
  where lower(name) = lower(trim(p_name))
  limit 1;

  if v_id is null then
    begin
      insert into public.musicverse_artists (name)
      values (trim(p_name))
      returning id into v_id;
    exception when unique_violation then
      select id into v_id
      from public.musicverse_artists
      where lower(name) = lower(trim(p_name))
      limit 1;
    end;
  end if;

  return v_id;
end;
$$;

create or replace function public.musicverse_upsert_genre(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_slug text;
begin
  if coalesce(trim(p_name),'') = '' then
    return null;
  end if;

  v_slug := public.musicverse_slug(p_name);
  if v_slug = '' then
    return null;
  end if;

  select id into v_id
  from public.musicverse_genres
  where slug = v_slug
  limit 1;

  if v_id is null then
    insert into public.musicverse_genres (name, slug)
    values (trim(p_name), v_slug)
    on conflict (slug) do update set
      name = excluded.name,
      updated_at = now()
    returning id into v_id;
  else
    update public.musicverse_genres
    set name = trim(p_name), updated_at = now()
    where id = v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.musicverse_resolve_recording(
  p_alias_id text,
  p_alias_type text,
  p_title text,
  p_artist text,
  p_source_artist text,
  p_duration_seconds numeric,
  p_is_cover boolean,
  p_spotify_url text,
  p_spotify_track_id text,
  p_artwork_url text,
  p_region text,
  p_why text,
  p_start_here boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recording_id uuid;
  v_artist_id uuid;
  v_source_artist_id uuid;
  v_song_id uuid;
begin
  select recording_id into v_recording_id
  from public.musicverse_recording_aliases
  where alias_id = p_alias_id;

  if v_recording_id is null then
    select id into v_recording_id
    from public.musicverse_recordings
    where legacy_id = p_alias_id
    limit 1;
  end if;

  if v_recording_id is null and coalesce(p_spotify_track_id,'') <> '' then
    select id into v_recording_id
    from public.musicverse_recordings
    where spotify_track_id = p_spotify_track_id
    limit 1;
  end if;

  v_artist_id := public.musicverse_upsert_artist(p_artist);
  v_source_artist_id := public.musicverse_upsert_artist(p_source_artist);

  if v_recording_id is not null then
    select song_id into v_song_id
    from public.musicverse_recordings
    where id = v_recording_id;
  end if;

  if v_song_id is null and coalesce(trim(p_title),'') <> '' then
    select id into v_song_id
    from public.musicverse_songs
    where lower(title) = lower(trim(p_title))
      and reference_artist_id is not distinct from v_source_artist_id
    order by created_at
    limit 1;

    if v_song_id is null then
      insert into public.musicverse_songs (title, reference_artist_id)
      values (trim(p_title), v_source_artist_id)
      returning id into v_song_id;
    end if;
  elsif v_song_id is not null then
    update public.musicverse_songs
    set title = case when coalesce(trim(p_title),'') <> '' then trim(p_title) else title end,
        reference_artist_id = coalesce(v_source_artist_id, reference_artist_id),
        updated_at = now()
    where id = v_song_id;
  end if;

  if v_recording_id is null then
    insert into public.musicverse_recordings (
      legacy_id, song_id, primary_artist_id, title, duration_seconds,
      artwork_url, spotify_track_id, spotify_url, region, why, start_here, is_cover
    )
    values (
      case when p_alias_type in ('album_track','soundtrail') then p_alias_id else null end,
      v_song_id, v_artist_id, coalesce(nullif(trim(p_title),''),'Unknown'),
      p_duration_seconds, nullif(p_artwork_url,''), nullif(p_spotify_track_id,''),
      nullif(p_spotify_url,''), nullif(p_region,''), nullif(p_why,''),
      coalesce(p_start_here,false), p_is_cover
    )
    returning id into v_recording_id;
  else
    update public.musicverse_recordings
    set song_id = coalesce(v_song_id, song_id),
        primary_artist_id = coalesce(v_artist_id, primary_artist_id),
        title = case when coalesce(trim(p_title),'') <> '' then trim(p_title) else title end,
        duration_seconds = coalesce(p_duration_seconds, duration_seconds),
        artwork_url = case when coalesce(p_artwork_url,'') <> '' then p_artwork_url else artwork_url end,
        spotify_track_id = coalesce(nullif(p_spotify_track_id,''), spotify_track_id),
        spotify_url = case when coalesce(p_spotify_url,'') <> '' then p_spotify_url else spotify_url end,
        region = case when coalesce(p_region,'') <> '' then p_region else region end,
        why = case when coalesce(p_why,'') <> '' then p_why else why end,
        start_here = coalesce(p_start_here, start_here),
        is_cover = coalesce(p_is_cover, is_cover),
        updated_at = now()
    where id = v_recording_id;
  end if;

  insert into public.musicverse_recording_aliases (alias_id, recording_id, alias_type)
  values (p_alias_id, v_recording_id, p_alias_type)
  on conflict (alias_id) do update
  set recording_id = excluded.recording_id,
      alias_type = excluded.alias_type,
      updated_at = now();

  return v_recording_id;
end;
$$;

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
  v_person jsonb;
  v_source jsonb;
  v_crazy jsonb;
  v_instrument jsonb;
  v_genre jsonb;
  v_sound jsonb;
  v_instrument_slug text;
  v_album_id uuid;
  v_recording_id uuid;
  v_artist_id uuid;
  v_genre_id uuid;
  v_instrument_id uuid;
  v_source_artist text;
  v_fingerprint text := coalesce(payload->>'sourceFingerprint','');
  v_album_count integer := 0;
  v_track_count integer := 0;
  v_crazy_count integer := 0;
  v_sound_count integer := 0;
begin
  if v_fingerprint = '' then
    raise exception 'MusicVerse catalog import requires sourceFingerprint';
  end if;

  for v_album in
    select value from jsonb_array_elements(coalesce(payload->'albums','[]'::jsonb))
  loop
    v_detail := v_album->'detail';
    v_artist_id := public.musicverse_upsert_artist(v_album->>'artist');

    insert into public.musicverse_albums (
      legacy_id, primary_artist_id, title, album_kind, release_date, release_date_text,
      artwork_url, spotify_album_id, spotify_url, catalog_rank, start_here,
      cover_album_intent, cover_track_count, total_track_count, cover_album_eligible,
      approach, why, catalog_note, notes, updated_at
    )
    values (
      v_album->>'legacyId', v_artist_id, coalesce(v_album->>'title',''),
      'cover_album',
      case
        when coalesce(v_detail->>'releaseDate','') ~ '^\d{4}-\d{2}-\d{2}$'
        then (v_detail->>'releaseDate')::date
        else null
      end,
      nullif(v_detail->>'releaseDate',''),
      nullif(v_detail->>'artwork',''),
      nullif(v_album->>'spotifyAlbumId',''),
      nullif(v_album->>'spotifyUrl',''),
      nullif(v_album->>'catalogRank','')::integer,
      coalesce((v_album->>'startHere')::boolean,false),
      case when v_album ? 'coverAlbumIntent' and jsonb_typeof(v_album->'coverAlbumIntent') <> 'null'
        then (v_album->>'coverAlbumIntent')::boolean else null end,
      nullif(v_album->>'coverTrackCount','')::integer,
      nullif(v_album->>'totalTrackCount','')::integer,
      case
        when v_album ? 'coverAlbumIntent'
          and jsonb_typeof(v_album->'coverAlbumIntent') <> 'null'
          and (v_album->>'coverAlbumIntent')::boolean = true then true
        when nullif(v_album->>'totalTrackCount','')::numeric > 0
          and nullif(v_album->>'coverTrackCount','')::numeric is not null
          then (v_album->>'coverTrackCount')::numeric / (v_album->>'totalTrackCount')::numeric >= 0.9
        when v_album ? 'coverAlbumIntent'
          and jsonb_typeof(v_album->'coverAlbumIntent') <> 'null'
          and (v_album->>'coverAlbumIntent')::boolean = false then false
        else true
      end,
      nullif(v_album->>'approach',''),
      nullif(v_album->>'why',''),
      nullif(v_album->>'catalogNote',''),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_detail->'notes','[]'::jsonb))), '{}'::text[]),
      now()
    )
    on conflict (legacy_id) do update set
      primary_artist_id = excluded.primary_artist_id,
      title = excluded.title,
      album_kind = excluded.album_kind,
      release_date = excluded.release_date,
      release_date_text = excluded.release_date_text,
      artwork_url = excluded.artwork_url,
      spotify_album_id = excluded.spotify_album_id,
      spotify_url = excluded.spotify_url,
      catalog_rank = excluded.catalog_rank,
      start_here = excluded.start_here,
      cover_album_intent = excluded.cover_album_intent,
      cover_track_count = excluded.cover_track_count,
      total_track_count = excluded.total_track_count,
      cover_album_eligible = excluded.cover_album_eligible,
      approach = excluded.approach,
      why = excluded.why,
      catalog_note = excluded.catalog_note,
      notes = excluded.notes,
      updated_at = now()
    returning id into v_album_id;

    if coalesce(v_album->>'coverGenre','') <> '' then
      v_genre_id := public.musicverse_upsert_genre(v_album->>'coverGenre');
      insert into public.musicverse_album_genres (album_id, genre_id, context)
      values (v_album_id, v_genre_id, 'cover')
      on conflict do nothing;
    end if;

    if v_detail is not null and jsonb_typeof(v_detail) = 'object' then
      for v_genre in
        select value from jsonb_array_elements_text(coalesce(v_detail->'originalGenres','[]'::jsonb))
      loop
        v_genre_id := public.musicverse_upsert_genre(trim(both '"' from v_genre::text));
        if v_genre_id is not null then
          insert into public.musicverse_album_genres (album_id, genre_id, context)
          values (v_album_id, v_genre_id, 'original')
          on conflict do nothing;
        end if;
      end loop;

      for v_person in
        select value from jsonb_array_elements(coalesce(v_detail->'personnel','[]'::jsonb))
      loop
        v_artist_id := public.musicverse_upsert_artist(v_person->>'name');
        if v_artist_id is not null then
          insert into public.musicverse_album_personnel (album_id, artist_id, roles)
          values (
            v_album_id,
            v_artist_id,
            coalesce(array(select jsonb_array_elements_text(coalesce(v_person->'roles','[]'::jsonb))), '{}'::text[])
          )
          on conflict (album_id, artist_id) do update
          set roles = excluded.roles;
        end if;
      end loop;

      for v_source in
        select value from jsonb_array_elements(coalesce(v_detail->'sources','[]'::jsonb))
      loop
        if coalesce(v_source->>'url','') <> '' and not exists (
          select 1 from public.musicverse_album_sources
          where album_id = v_album_id
            and url = v_source->>'url'
        ) then
          insert into public.musicverse_album_sources (album_id, label, url)
          values (
            v_album_id,
            coalesce(nullif(v_source->>'label',''),'Source'),
            v_source->>'url'
          );
        end if;
      end loop;

      for v_track in
        select value from jsonb_array_elements(coalesce(v_detail->'tracks','[]'::jsonb))
      loop
        v_source_artist := coalesce(v_track->>'originalArtist','');
        v_recording_id := public.musicverse_resolve_recording(
          v_track->>'legacyId',
          'album_track',
          v_track->>'title',
          v_album->>'artist',
          v_source_artist,
          nullif(v_track->>'durationSeconds','')::numeric,
          case when v_track ? 'isCover' and jsonb_typeof(v_track->'isCover') <> 'null'
            then (v_track->>'isCover')::boolean else null end,
          v_track->>'spotifyUrl',
          v_track->>'spotifyTrackId',
          v_track->>'artwork',
          '',
          '',
          false
        );

        insert into public.musicverse_album_recordings (
          album_id, recording_id, disc_number, track_number, legacy_track_id
        )
        values (
          v_album_id, v_recording_id, 1,
          (v_track->>'number')::integer,
          v_track->>'legacyId'
        )
        on conflict (album_id, recording_id) do update
        set disc_number = excluded.disc_number,
            track_number = excluded.track_number,
            legacy_track_id = excluded.legacy_track_id;

        if coalesce(v_track->>'originalGenre','') <> '' then
          v_genre_id := public.musicverse_upsert_genre(v_track->>'originalGenre');
          insert into public.musicverse_recording_genres (recording_id, genre_id, context)
          values (v_recording_id, v_genre_id, 'original')
          on conflict do nothing;
        end if;

        for v_person in
          select value from jsonb_array_elements(coalesce(v_track->'musicians','[]'::jsonb))
        loop
          v_artist_id := public.musicverse_upsert_artist(v_person->>'name');
          if v_artist_id is not null then
            insert into public.musicverse_recording_personnel (recording_id, artist_id, roles)
            values (
              v_recording_id,
              v_artist_id,
              coalesce(array(select jsonb_array_elements_text(coalesce(v_person->'roles','[]'::jsonb))), '{}'::text[])
            )
            on conflict (recording_id, artist_id) do update
            set roles = excluded.roles;
          end if;
        end loop;

        v_track_count := v_track_count + 1;
      end loop;
    end if;

    v_album_count := v_album_count + 1;
  end loop;

  for v_crazy in
    select value from jsonb_array_elements(coalesce(payload->'crazyCovers','[]'::jsonb))
  loop
    v_recording_id := public.musicverse_resolve_recording(
      v_crazy->>'legacyId',
      'crazy_cover',
      v_crazy->>'song',
      v_crazy->>'coverArtist',
      v_crazy->>'sourceArtist',
      null,
      true,
      v_crazy->>'spotifyUrl',
      v_crazy->>'spotifyTrackId',
      v_crazy->>'artwork',
      '',
      v_crazy->>'why',
      false
    );

    v_genre_id := public.musicverse_upsert_genre(v_crazy->>'style');

    insert into public.musicverse_crazy_covers (
      recording_id, style_genre_id, wildness, standout, catalog_order
    )
    values (
      v_recording_id,
      v_genre_id,
      nullif(v_crazy->>'wildness','')::integer,
      coalesce((v_crazy->>'standout')::boolean,false),
      (v_crazy->>'catalogOrder')::integer
    )
    on conflict (recording_id) do update set
      style_genre_id = excluded.style_genre_id,
      wildness = excluded.wildness,
      standout = excluded.standout,
      catalog_order = excluded.catalog_order;

    v_crazy_count := v_crazy_count + 1;
  end loop;

  for v_instrument in
    select value from jsonb_array_elements(coalesce(payload#>'{soundTrail,instruments}','[]'::jsonb))
  loop
    insert into public.musicverse_instruments (slug, name, description, sort_order, updated_at)
    values (
      v_instrument->>'id',
      coalesce(v_instrument->>'label',''),
      nullif(v_instrument->>'description',''),
      (v_instrument->>'sortOrder')::integer,
      now()
    )
    on conflict (slug) do update set
      name = excluded.name,
      description = excluded.description,
      sort_order = excluded.sort_order,
      updated_at = now()
    returning id into v_instrument_id;

    for v_genre in
      select value from jsonb_array_elements(coalesce(v_instrument->'genres','[]'::jsonb))
    loop
      v_genre_id := public.musicverse_upsert_genre(v_genre->>'name');
      if v_genre_id is not null then
        insert into public.musicverse_instrument_genres (instrument_id, genre_id, about)
        values (v_instrument_id, v_genre_id, coalesce(v_genre->>'about',''))
        on conflict (instrument_id, genre_id) do update
        set about = excluded.about;
      end if;
    end loop;
  end loop;

  for v_sound in
    select value from jsonb_array_elements(coalesce(payload#>'{soundTrail,recordings}','[]'::jsonb))
  loop
    v_recording_id := public.musicverse_resolve_recording(
      v_sound->>'legacyId',
      'soundtrail',
      v_sound->>'track',
      v_sound->>'artist',
      '',
      null,
      null,
      v_sound->>'spotifyUrl',
      v_sound->>'spotifyTrackId',
      v_sound->>'artwork',
      v_sound->>'region',
      '',
      coalesce((v_sound->>'startHere')::boolean,false)
    );

    for v_instrument_slug in
      select value from jsonb_array_elements_text(coalesce(v_sound->'instruments','[]'::jsonb))
    loop
      select id into v_instrument_id
      from public.musicverse_instruments
      where slug = v_instrument_slug
      limit 1;

      v_genre_id := public.musicverse_upsert_genre(
        coalesce(v_sound#>>array['genresByInstrument',v_instrument_slug],'')
      );

      if v_instrument_id is not null and v_genre_id is not null then
        insert into public.musicverse_recording_instruments (
          recording_id, instrument_id, genre_id, note, catalog_order
        )
        values (
          v_recording_id,
          v_instrument_id,
          v_genre_id,
          nullif(v_sound#>>array['instrumentNotes',v_instrument_slug],''),
          (v_sound->>'catalogOrder')::integer
        )
        on conflict (recording_id, instrument_id) do update set
          genre_id = excluded.genre_id,
          note = excluded.note,
          catalog_order = excluded.catalog_order;
      end if;
    end loop;

    v_sound_count := v_sound_count + 1;
  end loop;

  if not exists (
    select 1 from public.musicverse_import_runs
    where source_name = 'musicverse_catalog_sync'
      and source_ref = v_fingerprint
  ) then
    insert into public.musicverse_import_runs (
      source_name, source_ref, counts, notes
    )
    values (
      'musicverse_catalog_sync',
      v_fingerprint,
      jsonb_build_object(
        'albums', v_album_count,
        'albumTracks', v_track_count,
        'crazyCovers', v_crazy_count,
        'soundTrailRecordings', v_sound_count
      ),
      'Repeat-safe catalog sync'
    );
  end if;

  return jsonb_build_object(
    'sourceFingerprint', v_fingerprint,
    'albums', v_album_count,
    'albumTracks', v_track_count,
    'crazyCovers', v_crazy_count,
    'soundTrailRecordings', v_sound_count
  );
end;
$$;

revoke all on function public.musicverse_import_catalog_v1(jsonb)
from public, anon, authenticated;
grant execute on function public.musicverse_import_catalog_v1(jsonb)
to service_role;

revoke all on function public.musicverse_resolve_recording(
  text,text,text,text,text,numeric,boolean,text,text,text,text,text,boolean
) from public, anon, authenticated;
grant execute on function public.musicverse_resolve_recording(
  text,text,text,text,text,numeric,boolean,text,text,text,text,text,boolean
) to service_role;

revoke all on function public.musicverse_upsert_artist(text)
from public, anon, authenticated;
grant execute on function public.musicverse_upsert_artist(text)
to service_role;

revoke all on function public.musicverse_upsert_genre(text)
from public, anon, authenticated;
grant execute on function public.musicverse_upsert_genre(text)
to service_role;

-- Keep the existing Crazy Covers view contract but expose the new stable alias.
create or replace view public.musicverse_crazy_covers_v
with (security_invoker = true)
as
select
  r.id as recording_id,
  coalesce(alias.alias_id, r.legacy_id) as legacy_id,
  s.title as song,
  src.name as source_artist,
  perf.name as cover_artist,
  g.name as style,
  cc.wildness,
  cc.standout,
  r.why,
  r.artwork_url,
  r.spotify_track_id,
  r.spotify_url,
  cc.catalog_order
from public.musicverse_crazy_covers cc
join public.musicverse_recordings r on r.id = cc.recording_id
left join public.musicverse_artists perf on perf.id = r.primary_artist_id
left join public.musicverse_songs s on s.id = r.song_id
left join public.musicverse_artists src on src.id = s.reference_artist_id
left join public.musicverse_genres g on g.id = cc.style_genre_id
left join public.musicverse_recording_aliases alias
  on alias.recording_id = r.id
 and alias.alias_type = 'crazy_cover';

-- Keep the existing SoundTrail view contract but prefer the contextual alias.
create or replace view public.musicverse_soundtrail_v
with (security_invoker = true)
as
select
  r.id as recording_id,
  coalesce(alias.alias_id, r.legacy_id) as legacy_id,
  perf.name as artist,
  r.title as track,
  r.region,
  r.start_here,
  ins.slug as instrument_slug,
  ins.name as instrument,
  g.name as genre,
  ig.about as instrument_genre_about,
  ri.note as instrument_note,
  r.artwork_url,
  r.spotify_track_id,
  r.spotify_url,
  ins.sort_order as instrument_sort_order,
  ri.catalog_order
from public.musicverse_recording_instruments ri
join public.musicverse_recordings r on r.id = ri.recording_id
left join public.musicverse_artists perf on perf.id = r.primary_artist_id
join public.musicverse_instruments ins on ins.id = ri.instrument_id
join public.musicverse_genres g on g.id = ri.genre_id
left join public.musicverse_instrument_genres ig
  on ig.instrument_id = ri.instrument_id
 and ig.genre_id = ri.genre_id
left join public.musicverse_recording_aliases alias
  on alias.recording_id = r.id
 and alias.alias_type = 'soundtrail';

grant select on public.musicverse_recording_aliases to anon, authenticated;
grant select on public.musicverse_crazy_covers_v to anon, authenticated;
grant select on public.musicverse_soundtrail_v to anon, authenticated;

comment on function public.musicverse_import_catalog_v1(jsonb) is
  'Repeat-safe MusicVerse catalog sync for the existing Yellowdawg normalized schema. Upserts stable identities and never deletes omitted catalog rows.';
