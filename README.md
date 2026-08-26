# 2032 games data

Source of truth for console/game metadata used by [2032](https://2032.cloud). Merges to `main` sync to the live database via [`.github/workflows/sync.yml`](.github/workflows/sync.yml), which runs [`sync.mjs`](sync.mjs).

## Layout

```
consoles/
  <console-slug>/
    console.json
    box_art.png     (required -- console fallback art)
    icon.png        (optional -- console fallback icon)
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
  "valid_save_sizes": [8192, 32768, 65536, 131072]
}
```

- `valid_save_sizes` - raw save sizes in bytes. Used to flag suspicious uploads

## `game.json`

```jsonc
{
  "name": "Mother 3",
  "description": "One or two sentences.",
  "igdb_id": 2155,     // optional - exact IGDB game id
  "igdb_skip": false   // optional - never attempt an IGDB match
}
```

- `igdb_id` - numeric id of this game on [IGDB](https://www.igdb.com/). When set, sync resolves this exact game for cover art. Find it via `igdb.com/games/<slug>` or IGDB's API search
- `igdb_skip` - set `true` to skip IGDB matching (e.g. romhacks). Leave both fields out for an automatic name-match attempt

## Required files

- `box_art.png` (600x800), under `consoles/<console-slug>/` - the console's fallback art, used by any of its games without their own, and by custom (unlinked) games. Not enforced by sync -- a missing one just serves the placeholder below

## Optional files

- `icon.png` (256x256) / `box_art.png` (600x800), under `games/<game-slug>/` - falls back to IGDB cover art (box art only) then the console's art
- `icon.png` (256x256), under `consoles/<console-slug>/` - console fallback icon (no IGDB equivalent for icons)
- `process.js` - extracts info (playtime, completion, currency, etc.) from an uploaded save. Takes the save's bytes as a `Uint8Array`, returns whatever it finds. No imports/requires, self-contained, read-only. (WIP)

If nothing resolves for an art slot, the API serves a generated placeholder -- it never returns nothing.
