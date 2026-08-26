# 2032 games data

Source of truth for console/game metadata used by [2032](https://2032.cloud). Merges to `main` are synced to the live database by [`.github/workflows/sync.yml`](.github/workflows/sync.yml), which runs [`sync.mjs`](sync.mjs).

## Layout

```
consoles/
  <console-slug>/
    console.json
    box_art.png     (required -- this console's fallback box art, see below)
    icon.png        (optional -- this console's fallback icon, see below)
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
  "valid_save_sizes": [8192, 32768, 65536, 131072],
}
```

- `valid_save_sizes` - raw save sizes (in bytes) this console's cartridges actually produce. Used to flag suspicious uploads

## `game.json`

```jsonc
{
  "name": "Mother 3",
  "description": "One or two sentences.",
  "igdb_id": 2155, // optional - exact IGDB game id, see below
  "igdb_skip": false, // optional - true for anything that'll never be on IGDB (romhacks, custom games)
}
```

- `igdb_id` - the exact numeric id of this game on [IGDB](https://www.igdb.com/). When set, the sync job resolves this exact game for cover art instead of guessing. Find it via IGDB's site URL (`igdb.com/games/<slug>`) or their API's search
- `igdb_skip` - set `true` to opt this game out of IGDB matching entirely (default is an automatic name search when `igdb_id` isn't set). Use this for romhacks and anything else that'll never have a real IGDB listing, so sync doesn't waste a request looking for one every time. Leave both fields out for a normal game you just haven't looked up an id for yet - it'll still get a best-effort auto-match

## Required files

- `box_art.png` (600x800), directly under a `consoles/<console-slug>/` folder, alongside `console.json` - every console needs its own box art. It's this console's fallback: used for any of its games that don't have their own box art, and for custom (unlinked) game entries users create themselves, which have no curated listing to attach art to at all. This is a content convention, not something sync enforces -- a console still missing one just serves the generated placeholder below in the meantime rather than breaking sync

## Optional files

- `icon.png` (256x256) / `box_art.png` (600x800), under a `games/<game-slug>/` folder - served directly for that game. A game without one falls back to IGDB cover art (via `igdb_id`/auto-match above) for box art only, then the console's box art above
- `icon.png` (256x256), directly under a `consoles/<console-slug>/` folder - this console's fallback icon, same idea as its box art above but not required -- IGDB has no square-icon equivalent to fall back to first, so a missing one just means a plainer icon slot until someone adds it
- `process.js` - extracts info (playtime, completion, currency, etc.) from an uploaded save. Takes the save file's bytes as a `Uint8Array` and returns whatever data it finds. **No imports/requires** everything must be self-contained. Data is read-only. (WIP)

If nothing at all resolves for a slot (console box art missing, no IGDB match, etc.) the API serves a generated placeholder image instead -- the art endpoint never returns nothing.
