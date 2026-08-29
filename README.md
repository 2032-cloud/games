# 2032 games data

Source of truth for console/game metadata used by [2032](https://2032.cloud). Merges to `main` sync to the live database via [`.github/workflows/sync.yml`](.github/workflows/sync.yml), which runs [`sync.mjs`](sync.mjs). Only the consoles/games changed in a push are re-synced; put `[full-sync]` in a commit message to force a full re-sync.

## Layout

```
consoles/
  <console-slug>/
    console.json
    box_art.png     (required -- console fallback art)
    icon.png        (required -- console fallback icon)
    games/
      <game-slug>/
        game.json
        icon.png    (optional)
        box_art.png (optional)
        process.js  (optional)
```

Slugs must be lowercase kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`).

## `console.json`

```jsonc
{
  "name": "Game Boy Advance",
  "description": "One or two sentences.",
  "valid_save_sizes": [512, 8192, 32768, 65536, 131072],
}
```

- `valid_save_sizes` - raw save sizes in bytes. Used to flag suspicious uploads

## `game.json`

```jsonc
{
  "titles": [
    // required - every title this game is known by, most canonical first
    { "name": "マザー3", "region": "JPN", "language": "ja" },
    { "name": "Mother 3", "language": "en" },
  ],
  "native_region": "JPN", // optional - region the game shipped in first
  "description": "One or two sentences.", // optional - sync injects a placeholder when omitted
  "igdb_id": 2155, // optional - exact IGDB game id
  "igdb_skip": false, // optional - never attempt an IGDB match
}
```

- `titles` - every name this game is known by, in one ordered list. Used for search matching (the site's fuzzy search indexes them) and "also known as" display. Not separate catalog entries and not tied to save compatibility - one `game.json` still describes one game, and it's on the user to pair the right ROM with their save.
  - `titles[0]` is the **canonical / display title**. Generated files order the list by region priority `USA` -> `EUR` -> `JPN` -> `AUS` -> `KOR` -> untagged (the same priority the slug is derived from); reorder by hand to force a different display title.
  - Each entry:
    - `name` (required) - the title
    - `region` (optional) - [No-Intro](https://no-intro.org/)-style code(s): `USA`, `EUR`, `JPN`, `KOR`, `CHN`, `AUS`, `WLD`, or comma-joined like `JPN,USA`. Free-form, use what matches the release
    - `language` (optional) - BCP 47 tag (`ja`, `ja-Latn`, `de`) when it says something `region` doesn't
- `native_region` - single No-Intro-style code for the region the game released in first (generated from the earliest per-region release date). A consumer after a specific region's title can fall back to the `native_region` one when its preference isn't listed
- `description` - one or two sentences. Optional: when omitted, `sync.mjs` fills in a shared placeholder (`PLACEHOLDER_DESCRIPTION`), so unwritten descriptions can be restyled in one place
- `igdb_id` - numeric id of this game on [IGDB](https://www.igdb.com/). When set, sync resolves this exact game for cover art. Find it via `igdb.com/games/<slug>` or IGDB's API search
- `igdb_skip` - set `true` to skip IGDB matching (e.g. romhacks). Leave both fields out for an automatic name-match attempt

## Required files

- `box_art.png` (600x800), under `consoles/<console-slug>/` - the console's fallback art, used by any of its games without their own, and by custom (unlinked) games. Not enforced by sync -- a missing one just serves the placeholder below
- `icon.png` (256x256) / `box_art.png` (600x800), under `games/<game-slug>/` - falls back to IGDB cover art (box art only) then the console's art

## Optional files

- `icon.png` (256x256), under `consoles/<console-slug>/` - console fallback icon (no IGDB equivalent for icons)
- `process.js` - extracts info (playtime, completion, currency, etc.) from an uploaded save. Takes the save's bytes as a `Uint8Array`, returns whatever it finds. No imports/requires, self-contained, read-only. (WIP)

If nothing resolves for an art slot, the API serves a generated placeholder -- it never returns nothing.
