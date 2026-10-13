-- MusicVerse personal data is for permanent signed-in users only.
-- Yellowdawg may keep anonymous auth enabled for sibling apps.

do $$
declare
  t text;
begin
  foreach t in array array[
    'musicverse_user_playlists',
    'musicverse_user_playlist_items',
    'musicverse_user_saved_items',
    'musicverse_user_listening_events',
    'musicverse_user_references',
    'musicverse_user_feature_history'
  ]
  loop
    execute format('drop policy if exists musicverse_permanent_user_only on public.%I', t);
    execute format(
      'create policy musicverse_permanent_user_only on public.%I as restrictive for all to authenticated using (coalesce((select (auth.jwt()->>''is_anonymous'')::boolean), false) is false) with check (coalesce((select (auth.jwt()->>''is_anonymous'')::boolean), false) is false)',
      t
    );
  end loop;
end
$$;
