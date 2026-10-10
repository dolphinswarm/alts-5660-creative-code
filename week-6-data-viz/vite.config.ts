import { existsSync, createReadStream } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const MIME_TYPES: Record<string, string> = { ".css": "text/css", ".js": "text/javascript" };

// "vite dev" serves this folder as the site root, so ../style.css and
// ../shared/back-button.js would 404 - serve them from the repo root instead.
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

// Vite drops <link rel="stylesheet"> tags outside its root, so re-add it after
// Vite's pass - first in <head>, so this page's own <style> wins ties.
const keepSharedStylesheet: Plugin = {
	name: "keep-shared-stylesheet",
	transformIndexHtml: {
		order: "post",
		handler: (html) => html.replace("<head>", '<head>\n\t\t<link rel="stylesheet" href="../style.css" />'),
	},
};

export default defineConfig({
	// Exposes GOOGLE_API_KEY from .env.
	envPrefix: ["VITE_", "GOOGLE_"],
	// Relative asset URLs, so it works under any Pages subpath.
	base: "./",
	server: {
		fs: {
			// For the repo-root style.css and shared/back-button.js.
			allow: [".."],
		},
	},
	plugins: [react(), keepSharedStylesheet, serveSharedAssets],
});
