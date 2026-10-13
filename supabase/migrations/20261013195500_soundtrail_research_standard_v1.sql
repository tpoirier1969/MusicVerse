-- SoundTrail research metadata standard.
-- Additive: preserves the existing normalized catalog and all recording identities.

alter table public.musicverse_instruments
  add column if not exists importance text,
  add column if not exists research_sources jsonb not null default '[]'::jsonb,
  add column if not exists research_standard_version integer not null default 0;

alter table public.musicverse_instrument_genres
  add column if not exists research_sources jsonb not null default '[]'::jsonb;

create or replace function public.musicverse_import_soundtrail_research_v1(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_instrument jsonb;
  v_genre jsonb;
  v_instrument_id uuid;
  v_genre_id uuid;
  v_instrument_count integer := 0;
  v_genre_count integer := 0;
begin
  for v_instrument in
    select value
    from jsonb_array_elements(coalesce(payload#>'{soundTrail,instruments}','[]'::jsonb))
  loop
    select id into v_instrument_id
    from public.musicverse_instruments
    where slug = v_instrument->>'id'
    limit 1;

    if v_instrument_id is null then
      raise exception 'SoundTrail research sync could not find instrument %; run the catalog import first.',
        v_instrument->>'id';
    end if;

    update public.musicverse_instruments
    set importance = nullif(v_instrument->>'importance',''),
        research_sources = coalesce(v_instrument->'researchSources','[]'::jsonb),
        research_standard_version = coalesce(nullif(v_instrument->>'researchStandardVersion','')::integer, 0),
        updated_at = now()
    where id = v_instrument_id;

    v_instrument_count := v_instrument_count + 1;

    for v_genre in
      select value
      from jsonb_array_elements(coalesce(v_instrument->'genres','[]'::jsonb))
    loop
      v_genre_id := public.musicverse_upsert_genre(v_genre->>'name');
      if v_genre_id is null then
        raise exception 'SoundTrail research sync found a genre without a valid name for instrument %.',
          v_instrument->>'id';
      end if;

      insert into public.musicverse_instrument_genres (
        instrument_id, genre_id, about, research_sources
      )
      values (
        v_instrument_id,
        v_genre_id,
        coalesce(v_genre->>'about',''),
        coalesce(v_genre->'researchSources','[]'::jsonb)
      )
      on conflict (instrument_id, genre_id) do update
      set about = excluded.about,
          research_sources = excluded.research_sources;

      v_genre_count := v_genre_count + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'instruments', v_instrument_count,
    'instrumentGenres', v_genre_count
  );
end;
$$;

revoke all on function public.musicverse_import_soundtrail_research_v1(jsonb)
from public, anon, authenticated;
grant execute on function public.musicverse_import_soundtrail_research_v1(jsonb)
to service_role;

create or replace view public.musicverse_soundtrail_instruments_v
with (security_invoker = true)
as
select
  i.slug as id,
  i.name as label,
  i.description,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'name', g.name,
          'about', ig.about,
          'researchSources', ig.research_sources
        )
        order by g.name
      )
      from public.musicverse_instrument_genres ig
      join public.musicverse_genres g on g.id = ig.genre_id
      where ig.instrument_id = i.id
    ),
    '[]'::jsonb
  ) as genres,
  i.sort_order,
  i.importance,
  i.research_sources,
  i.research_standard_version
from public.musicverse_instruments i;

grant select on public.musicverse_soundtrail_instruments_v to anon, authenticated;

comment on function public.musicverse_import_soundtrail_research_v1(jsonb) is
  'Imports SoundTrail instrument importance, research provenance, and per-style research metadata after the repeat-safe catalog import.';
