import { existsSync, createReadStream } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const MIME_TYPES: Record<string, string> = { ".css": "text/css", ".js": "text/javascript" };

// Once deployed, this page really does sit one level under style.css and
// shared/back-button.js, so the ../ references in index.html are correct -
// but "vite dev" serves this project's own folder AS the site root, and a
// browser can't request above an origin's root (../style.css from "/"
// normalizes to just "/style.css"), so those two files 404 in dev even
// though the exact same relative paths work fine once actually deployed.
// This middleware serves just those two paths from their real repo-root
// locations so "npm run dev" matches production instead of looking broken.
const serveSharedAssets: Plugin = {
	name: "serve-shared-assets",
	configureServer(server) {
		server.middlewares.use((req, res, next) => {
			const url = req.url?.split("?")[0] ?? "";
			if (url !== "/style.css" && url !== "/shared/back-button.js") {
				next();
				return;
			}
			const filePath = resolve(REPO_ROOT, url.slice(1));
			if (!existsSync(filePath)) {
				next();
				return;
			}
			res.setHeader("Content-Type", MIME_TYPES[extname(filePath)] ?? "application/octet-stream");
			createReadStream(filePath).pipe(res);
		});
	},
};

// Vite's HTML pipeline tries to resolve every <link rel="stylesheet"> as a
// CSS module within its project root, and silently drops the tag when that
// fails - which it always will here, since style.css is a click up at the
// repo root, shared with every other week. Re-adding the tag after Vite's
// own pass (order: "post") is the standard escape hatch for "just leave this
// URL alone." Runs in both dev and build since transformIndexHtml covers both.
//
// Inserted right after <head> opens (not before </head>) so it stays FIRST
// in the cascade - this page's own inline <style> override (e.g. the 2:3
// aspect-ratio for this poster vs. style.css's default 16:9) must still win
// a same-specificity tie, same as it did in the original hand-written HTML.
const keepSharedStylesheet: Plugin = {
	name: "keep-shared-stylesheet",
	transformIndexHtml: {
		order: "post",
		handler: (html) => html.replace("<head>", '<head>\n\t\t<link rel="stylesheet" href="../style.css" />'),
	},
};

export default defineConfig({
	// Relative asset URLs - this page can be deployed under any subpath
	// (e.g. GitHub Pages' /<repo>/week-2-poster/) without knowing it in advance.
	base: "./",
	server: {
		fs: {
			// This page pulls in the repo-root style.css and shared/back-button.js,
			// both outside this project's own folder.
			allow: [".."],
		},
	},
	plugins: [keepSharedStylesheet, serveSharedAssets],
});
