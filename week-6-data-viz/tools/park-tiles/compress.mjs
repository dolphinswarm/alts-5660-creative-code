/**
 * Draco-compresses build.py's tiles from .cache/raw/ into public/park/.
 *
 *     node tools/park-tiles/compress.mjs
 */
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { draco } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";

const RAW_DIR = fileURLToPath(new URL(".cache/raw/", import.meta.url));
const OUT_DIR = fileURLToPath(new URL("../../public/park/", import.meta.url));
const CONCURRENCY = 8;

const io = new NodeIO()
	.registerExtensions(ALL_EXTENSIONS)
	.registerDependencies({ "draco3d.encoder": await draco3d.createEncoderModule() });

const names = (await readdir(`${RAW_DIR}tiles`)).filter((name) => name.endsWith(".glb"));
await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(`${OUT_DIR}tiles`, { recursive: true });
await copyFile(`${RAW_DIR}tileset.json`, `${OUT_DIR}tileset.json`);

const compress = async (name) => {
	const document = await io.read(`${RAW_DIR}tiles/${name}`);
	await document.transform(draco({ method: "edgebreaker", quantizePosition: 14, quantizeTexcoord: 12 }));
	await io.write(`${OUT_DIR}tiles/${name}`, document);
};

const queue = [...names];
const workers = Array.from({ length: CONCURRENCY }, async () => {
	while (queue.length > 0) {
		await compress(queue.pop());
	}
});
await Promise.all(workers);
console.log(`Compressed ${names.length} tiles into ${OUT_DIR}`);
