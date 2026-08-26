import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "consoles");

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
	const content = await readFile(p);
	return createHash("sha256").update(content).digest("hex");
}

async function loadArt(p) {
	if (!(await exists(p))) return null;
	const content = await readFile(p);
	return { hash: createHash("sha256").update(content).digest("hex"), data_base64: content.toString("base64") };
}

async function loadConsole(slug) {
	const dir = path.join(ROOT, slug);
	const meta = JSON.parse(await readFile(path.join(dir, "console.json"), "utf8"));

	const gamesDir = path.join(dir, "games");
	const gameSlugs = (await exists(gamesDir)) ? await readdir(gamesDir) : [];

	const games = await Promise.all(
		gameSlugs.map(async (gameSlug) => {
			const gameDir = path.join(gamesDir, gameSlug);
			const gameMeta = JSON.parse(await readFile(path.join(gameDir, "game.json"), "utf8"));
			return {
				slug: gameSlug,
				name: gameMeta.name,
				description: gameMeta.description,
				processing_script_hash: await hashFile(path.join(gameDir, "process.js")),
				igdb_id: gameMeta.igdb_id ?? null,
				igdb_skip: gameMeta.igdb_skip ?? false,
				icon: await loadArt(path.join(gameDir, "icon.png")),
				box_art: await loadArt(path.join(gameDir, "box_art.png")),
			};
		}),
	);

	return {
		slug,
		name: meta.name,
		description: meta.description,
		valid_save_sizes: meta.valid_save_sizes,
		games,
		icon: await loadArt(path.join(dir, "icon.png")),
		box_art: await loadArt(path.join(dir, "box_art.png")),
	};
}

const consoleSlugs = await readdir(ROOT);
const consoles = await Promise.all(consoleSlugs.map(loadConsole));

const res = await fetch(process.env.SYNC_URL, {
	method: "POST",
	headers: {
		"Content-Type": "application/json",
		Authorization: `Bearer ${process.env.GAMES_SYNC_SECRET}`,
	},
	body: JSON.stringify({ consoles }),
});

if (!res.ok) {
	console.error(`Sync failed: ${res.status} ${await res.text()}`);
	process.exit(1);
}

console.log(await res.json());
