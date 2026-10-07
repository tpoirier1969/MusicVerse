# MusicVerse

Personal music discovery, listening, playlist, cover-song, and chord/tab workspace.

MusicVerse is a standalone Lazy Acres Suite app. CoverVerse is one module inside MusicVerse.
## Data source

MusicVerse uses the shared Supabase project as the authoritative remote catalog. All MusicVerse database objects are namespaced with `musicverse_` so they do not collide with other apps in the shared database. The bundled files in `public/data/` remain a read-only fallback for catalog availability; they are not a competing writable source of truth.

User-specific playlists, favorites, references, listening events, and featured-album history have dedicated `musicverse_user_*` tables with RLS, but the browser app continues to use local storage for personal state until Supabase authentication is wired.
