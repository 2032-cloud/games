# 2032 games data

Source of truth for console/game metadata used by [2032](https://2032.cloud). Merges to `main` are synced to the live database by [`.github/workflows/sync.yml`](.github/workflows/sync.yml), which runs [`sync.mjs`](sync.mjs).

## Layout

```
consoles/
  <console-slug>/
    console.json
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
}
```

## Optional files

- `icon.png` / `box_art.png` - served directly; a game without one just falls back to a placeholder.
- `process.js` - extracts info (playtime, completion, currency, etc.) from an uploaded save. Takes the save file's bytes as a `Uint8Array` and returns whatever data it finds. **No imports/requires** everything must be self-contained. Data is read-only. (WIP)
- _might expand later adding console assets and such_
