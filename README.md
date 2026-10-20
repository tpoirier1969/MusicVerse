# MusicVerse

Personal music discovery, listening, playlist, cover-song, and chord/tab workspace.

MusicVerse is a standalone Lazy Acres Suite app. CoverVerse is one module inside MusicVerse.
## Data source

MusicVerse uses the shared Supabase project as the authoritative remote catalog. All MusicVerse database objects are namespaced with `musicverse_` so they do not collide with other apps in the shared database. The bundled files in `public/data/` remain a read-only fallback for catalog availability; they are not a competing writable source of truth.

User-specific playlists, favorites, references, listening events, and featured-album history have dedicated `musicverse_user_*` tables with RLS, but the browser app continues to use local storage for personal state until Supabase authentication is wired.

## Catalog sync

The bundled JSON files remain the recoverable source snapshot while the Supabase catalog is authoritative at runtime. Catalog updates use a repeat-safe sync bundle keyed by permanent MusicVerse IDs.

- `npm run catalog:dry-run` validates the local catalog and prints counts plus a deterministic source fingerprint. It performs no network writes.
- `npm run catalog:audit` compares stable album, Crazy Covers, and SoundTrail IDs against the configured Supabase read views.
- `npm run catalog:apply` sends the validated bundle to the protected `musicverse_import_catalog_v1` RPC. It requires `MUSICVERSE_SUPABASE_SERVICE_ROLE_KEY`; that key must never be committed or exposed to browser code.
- Catalog writes refuse to run unless the Supabase project ref matches `wntakzfoprthwggkidyq` (or an explicitly configured `MUSICVERSE_SUPABASE_EXPECTED_PROJECT_REF`).
- The Yellowdawg sync migration lives in `supabase/migrations/20261013_musicverse_catalog_v1.sql`. It augments the existing normalized `musicverse_*` schema with stable recording aliases and the protected import RPC; it does not create a second catalog or delete sibling-app data.
- The importer was verified against the full catalog by running the same GitHub snapshot twice. The second pass produced no row-count changes.

Crazy Covers now carries permanent `crazy-cover-####` IDs so corrections to song or artist display text do not create a new record identity.

## Personal library sync

MusicVerse personal state uses Yellowdawg Supabase tables prefixed `musicverse_user_`. Once a permanent email account is signed in, Yellowdawg is the writable source of truth and browser storage becomes the local cache/offline recovery layer.

The first authenticated sync merges existing browser data with remote data before writing either side. Later syncs push locally changed domains before pulling the current remote state. Signing into a different permanent account on the same browser archives the previous local cache before loading the new account.

Synced domains currently include playlists and playlist items, Crazy Covers favorites, Spotify listening history, MusicVerse-open history, daily featured-album history, and Tabs & Chords references. Anonymous Supabase sessions are rejected by both the browser sync layer and restrictive RLS policies.

Passwordless email sign-in uses Supabase Magic Links. The deployed MusicVerse origin must be included in Yellowdawg Auth URL Configuration as an allowed redirect URL. No service-role credential is used by or exposed to browser code.

## SoundTrail research standard

SoundTrail instruments are research objects, not empty category shells. Adding a new instrument requires research-standard version 2 before the catalog will validate:

- explain why the instrument matters musically and historically, with public research sources;
- map the instrument across significant styles and traditions without inventing genres merely to hit a quota;
- explain what the instrument actually does in every listed style;
- include at least two verified Spotify track examples for every listed style, each with an instrument-specific note explaining what to listen for;
- target three track examples when the research is strong enough to support them; Accordion currently goes one step further and requires three verified tracks for every listed style;
- verify artist/recording relationships from public sources and verify Spotify matches separately; a missing Spotify match stays blank rather than being guessed;
- prefer different artists, eras, or approaches when they make the comparison more useful, but allow two strong examples from the same specialist rather than padding a style with a weak match; avoid duplicate recordings simply because one performance illustrates more than one relationship.

TinyFish is the default broad-web research pass for a new instrument. Research findings are corroborated before they become catalog facts. The catalog sync rejects instruments missing importance, provenance, style explanations, or recording coverage, and then syncs the research metadata to Yellowdawg after the core catalog import.

