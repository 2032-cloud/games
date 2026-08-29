# games

Source of truth for the console/game catalog behind [2032](https://2032.cloud).
Layout, `console.json`, and `game.json` are documented in [`README.md`](README.md);
read it before changing any data file.

- One directory per game under `consoles/<console-slug>/games/<game-slug>/`, each
  with a `game.json`. Slugs are lowercase kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`).
- `game.json` carries an ordered `titles` list (`titles[0]` is the display
  title), `native_region`, and optional `description` / `igdb_id` / `igdb_skip`.
- Merges to `main` sync to the live DB via
  [`.github/workflows/sync.yml`](.github/workflows/sync.yml) running
  [`sync.mjs`](sync.mjs). Keep `sync.mjs`'s payload in step with 2032's
  `src/worker/sync.ts` (`validateGame`).
- Per-console scratch tooling (`list.py`, `parse_raw.py`, `build_games.py`,
  `raw.html`) is gitignored — it regenerates `game.json` files, it is not the
  source of truth once a file is committed and hand-edited.

## Commits

Match the existing history (and 2032's):

- One short line, no body unless a change genuinely needs explaining.
- Lowercase, past tense, plain description of what changed
  (`added native_region to game.json`, `fixed IGDB game mapping for Mother 3`).
- No `type:` prefix (no `feat:` / `fix:` / `chore:`), no trailing period.
- Describe the change, not the file list.
