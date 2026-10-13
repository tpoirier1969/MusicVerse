-- Hide obsolete SoundTrail style relationships without deleting historical catalog data.
-- A style is exposed only when at least one recording currently uses that instrument/genre relationship.

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
        and exists (
          select 1
          from public.musicverse_recording_instruments ri
          where ri.instrument_id = ig.instrument_id
            and ri.genre_id = ig.genre_id
        )
    ),
    '[]'::jsonb
  ) as genres,
  i.sort_order,
  i.importance,
  i.research_sources,
  i.research_standard_version
from public.musicverse_instruments i;

grant select on public.musicverse_soundtrail_instruments_v to anon, authenticated;

comment on view public.musicverse_soundtrail_instruments_v is
  'SoundTrail instruments with only currently used instrument/genre relationships exposed to the app; obsolete relationships remain preserved in base tables.';
