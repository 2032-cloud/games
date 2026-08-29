import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";

const REPO = import.meta.dirname;
const ROOT = path.join(REPO, "consoles");
const SYNC_URL = process.env.SYNC_URL;
const STATE_URL = `${SYNC_URL}/state`;
const AUTH = { Authorization: `Bearer ${process.env.GAMES_SYNC_SECRET}` };

// Injected for any game.json that omits "description". Keep in step with
// 2032's src/worker/sync.ts PLACEHOLDER_DESCRIPTION.
const PLACEHOLDER_DESCRIPTION = "No description yet.";

// Max games per POST. The whole catalog in one request timed the worker out;
// chunking keeps each request a small, independently-retryable unit of work.
const CHUNK_GAMES = 150;

// --- git helpers (repo is checked out with full history) ---------------------

function git(...args) {
	return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
}
function gitOk(...args) {
	try {
		execFileSync("git", args, { cwd: REPO, stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

// --- fs helpers ------------------------------------------------------------------

async function exists(p) {
	try {
		await stat(p);
		return true;
	} catch {
		return false;
	}
}

async function hashFile(p) {
	if (!(await exists(p))) return null;
	return createHash("sha256").update(await readFile(p)).digest("hex");
}

async function loadArt(p) {
	if (!(await exists(p))) return null;
	const content = await readFile(p);
	return { hash: createHash("sha256").update(content).digest("hex"), data_base64: content.toString("base64") };
}

async function listGameSlugs(consoleSlug) {
	const gamesDir = path.join(ROOT, consoleSlug, "games");
	return (await exists(gamesDir)) ? readdir(gamesDir) : [];
}

async function loadConsoleMeta(slug) {
	const dir = path.join(ROOT, slug);
	const meta = JSON.parse(await readFile(path.join(dir, "console.json"), "utf8"));
	return {
		slug,
		name: meta.name,
		description: meta.description,
		valid_save_sizes: meta.valid_save_sizes,
		icon: await loadArt(path.join(dir, "icon.png")),
		box_art: await loadArt(path.join(dir, "box_art.png")),
	};
}

async function loadGame(consoleSlug, gameSlug) {
	const gameDir = path.join(ROOT, consoleSlug, "games", gameSlug);
	const gameMeta = JSON.parse(await readFile(path.join(gameDir, "game.json"), "utf8"));
	// game.json carries one ordered "titles" list; titles[0] is the
	// canonical/display name, the rest are alternate/localized titles.
	const titles = Array.isArray(gameMeta.titles) ? gameMeta.titles : [];
	return {
		slug: gameSlug,
		description: gameMeta.description ?? PLACEHOLDER_DESCRIPTION,
		processing_script_hash: await hashFile(path.join(gameDir, "process.js")),
		igdb_id: gameMeta.igdb_id ?? null,
		igdb_skip: gameMeta.igdb_skip ?? false,
		titles,
		native_region: gameMeta.native_region ?? null,
		icon: await loadArt(path.join(gameDir, "icon.png")),
		box_art: await loadArt(path.join(gameDir, "box_art.png")),
	};
}

/** sha256 of a game's synced inputs -- art as hashes, not blobs, so it's stable and small. */
function gameContentHash(game) {
	return createHash("sha256")
		.update(
			JSON.stringify({
				slug: game.slug,
				description: game.description,
				processing_script_hash: game.processing_script_hash,
				igdb_id: game.igdb_id,
				igdb_skip: game.igdb_skip,
				titles: game.titles,
				native_region: game.native_region,
				icon_hash: game.icon?.hash ?? null,
				box_art_hash: game.box_art?.hash ?? null,
			}),
		)
		.digest("hex");
}

// --- scope resolution ---------------------------------------------------------

/** Changed paths under consoles/ -> which consoles' metadata changed + which games changed. */
function parseChangedFiles(lines) {
	const gamesByConsole = new Map();
	const consoleMetaChanged = new Set();
	for (const line of lines.split("\n")) {
		const rel = line.trim();
		if (!rel) continue;
		const m = /^consoles\/([^/]+)\/(.+)$/.exec(rel);
		if (!m) continue;
		const [, consoleSlug, rest] = m;
		const game = /^games\/([^/]+)\//.exec(rest);
		if (game) {
			if (!gamesByConsole.has(consoleSlug)) gamesByConsole.set(consoleSlug, new Set());
			gamesByConsole.get(consoleSlug).add(game[1]);
		} else {
			consoleMetaChanged.add(consoleSlug);
		}
	}
	return { gamesByConsole, consoleMetaChanged };
}

async function fullScope() {
	const scope = [];
	for (const slug of await readdir(ROOT)) {
		scope.push({ slug, gameSlugs: await listGameSlugs(slug), metaChanged: true });
	}
	return scope;
}

async function partialScope(baseSha) {
	const changed = git("diff", "--name-only", "--diff-filter=ACMR", baseSha, "HEAD", "--", "consoles/");
	const { gamesByConsole, consoleMetaChanged } = parseChangedFiles(changed);
	const scope = [];
	for (const slug of new Set([...consoleMetaChanged, ...gamesByConsole.keys()])) {
		if (!(await exists(path.join(ROOT, slug, "console.json")))) continue; // console removed
		const changedGames = gamesByConsole.get(slug);
		let gameSlugs = [];
		if (changedGames) {
			const present = new Set(await listGameSlugs(slug));
			gameSlugs = [...changedGames].filter((g) => present.has(g)); // drop deleted game.json
		}
		scope.push({ slug, gameSlugs, metaChanged: consoleMetaChanged.has(slug) });
	}
	return scope;
}

async function computeDeletions(baseSha) {
	const gone = git("diff", "--name-only", "--diff-filter=D", baseSha, "HEAD", "--", "consoles/");
	const out = [];
	for (const line of gone.split("\n")) {
		const m = /^consoles\/([^/]+)\/games\/([^/]+)\/game\.json$/.exec(line.trim());
		if (!m) continue;
		if (await exists(path.join(ROOT, m[1], "games", m[2], "game.json"))) continue; // re-added
		out.push({ console_slug: m[1], game_slug: m[2] });
	}
	return out;
}

// --- http -------------------------------------------------------------------

async function getState() {
	try {
		const res = await fetch(STATE_URL, { headers: AUTH });
		if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
		const s = await res.json();
		return { baseSha: s.last_synced_sha ?? null, gameHashes: s.game_hashes ?? {} };
	} catch (e) {
		console.warn(`Could not read sync state (${e}); falling back to a full sync.`);
		return { baseSha: null, gameHashes: {} };
	}
}

async function post(payload) {
	let res;
	try {
		res = await fetch(SYNC_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json", ...AUTH },
			body: JSON.stringify(payload),
		});
	} catch (e) {
		console.error(`Sync request failed: ${e}`);
		process.exit(1);
	}
	if (!res.ok) {
		console.error(`Sync failed: ${res.status} ${await res.text()}`);
		process.exit(1);
	}
	return res.json();
}

// --- run --------------------------------------------------------------------

const HEAD = git("rev-parse", "HEAD");
const { baseSha, gameHashes } = await getState();

const baseUsable =
	!!baseSha &&
	gitOk("cat-file", "-e", `${baseSha}^{commit}`) &&
	gitOk("merge-base", "--is-ancestor", baseSha, "HEAD");

const forceFull =
	!!process.env.SYNC_FORCE_FULL ||
	!baseUsable ||
	git("log", "--format=%B", `${baseSha}..HEAD`).includes("[full-sync]");

const mode = forceFull ? "full" : "partial";
const scope = forceFull ? await fullScope() : await partialScope(baseSha);
const deletedGames = baseUsable ? await computeDeletions(baseSha) : [];

console.log(
	`Sync mode=${mode} (base ${baseUsable ? baseSha.slice(0, 8) : "none"} -> ${HEAD.slice(0, 8)}): ` +
		`${scope.length} console(s), ${deletedGames.length} deletion(s)`,
);

// Emit POSTs of at most CHUNK_GAMES games. Each chunk repeats the full console
// metadata for the consoles it touches -- a cheap, idempotent upsert. Games
// whose content hash already matches the backend are skipped entirely.
let pending = [];
let pendingGames = 0;
let chunks = 0;
let sent = 0;
let skipped = 0;

async function flush() {
	if (pending.length === 0) return;
	chunks++;
	const result = await post({ mode, consoles: pending });
	console.log(`  chunk ${chunks}: ${pending.length} block(s), ${pendingGames} game(s) -> ${JSON.stringify(result.synced ?? result)}`);
	pending = [];
	pendingGames = 0;
}

for (const { slug, gameSlugs, metaChanged } of scope) {
	const meta = await loadConsoleMeta(slug);

	const changedGames = [];
	for (const gameSlug of gameSlugs) {
		const game = await loadGame(slug, gameSlug);
		const hash = gameContentHash(game);
		if (gameHashes[`${slug}/${gameSlug}`] === hash) {
			skipped++;
			continue;
		}
		game.content_hash = hash;
		changedGames.push(game);
	}

	if (changedGames.length === 0) {
		if (metaChanged) {
			pending.push({ ...meta, games: [] });
			if (pending.length >= 25) await flush();
		}
		continue;
	}

	for (let i = 0; i < changedGames.length; i += CHUNK_GAMES) {
		const games = changedGames.slice(i, i + CHUNK_GAMES);
		pending.push({ ...meta, games });
		pendingGames += games.length;
		sent += games.length;
		if (pendingGames >= CHUNK_GAMES) await flush();
	}
}
await flush();

// Final request: no data, but it carries the run-level bookkeeping and only
// runs once every chunk has landed -- deletions, the commit we got to (so the
// next run diffs from here), and a nudge to the IGDB resolver.
await post({ mode, consoles: [], finalize: true, deleted_games: deletedGames, synced_sha: HEAD });

console.log(
	`Sync complete: ${sent} game(s) sent, ${skipped} unchanged, ${deletedGames.length} deleted, ` +
		`${chunks} chunk(s). Backend advanced to ${HEAD.slice(0, 8)}.`,
);
