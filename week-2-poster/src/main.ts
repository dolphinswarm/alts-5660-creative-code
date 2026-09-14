import { Application, Container } from "pixi.js";
import { PALETTES } from "./data.js";
import { randomInteger } from "./utils.js";
import * as poster from "./poster.js";
import * as audio from "./audio.js";
import { generateClip } from "./music.js";

const main = document.querySelector("main");
if (!main) {
	throw new Error("main element not found");
}

const app = new Application();
await app.init({
	width: poster.POSTER_WIDTH,
	height: poster.POSTER_HEIGHT,
	background: "#000000",
	antialias: true,
	resolution: 1,
});
main.appendChild(app.canvas);

const posterLayer = new Container();
app.stage.addChild(posterLayer);

await poster.loadAssets();

let currentPlan = poster.generatePosterPlan();
let paletteIndex = randomInteger(0, PALETTES.length - 1);
let currentSprites: poster.ReactiveSprites = {};

/** Redraws the poster layer from "currentPlan"/"paletteIndex", stopping any playing audio first */
const drawPoster = () => {
	audio.stopClip();
	currentSprites = poster.renderPoster(
		posterLayer,
		currentPlan,
		PALETTES[paletteIndex],
	);
};

/** New bands, new venue, new layout, new palette */
const regenerate = () => {
	currentPlan = poster.generatePosterPlan();
	paletteIndex = randomInteger(0, PALETTES.length - 1);
	drawPoster();
};

/** Same poster, new song - stickers just stop pulsing for any role the new song drops */
const regenerateAudio = () => {
	audio.stopClip();
	currentPlan = { ...currentPlan, midiClip: generateClip() };
};

drawPoster();

posterLayer.eventMode = "static";
posterLayer.cursor = "pointer";
// Toggle playback
posterLayer.on("pointertap", () => {
	if (audio.isPlaying()) {
		audio.stopClip();
		return;
	}
	void audio.playClip(currentPlan.midiClip, (role) =>
		poster.pulseRole(currentSprites, role),
	);
});

app.ticker.add((ticker) => poster.tickPulses(ticker.deltaMS / 1000)); // <- PixiJS animation frames

document
	.getElementById("regenerate-btn")
	?.addEventListener("click", regenerate);
document
	.getElementById("regenerate-audio-btn")
	?.addEventListener("click", regenerateAudio);
document.getElementById("swap-colors-btn")?.addEventListener("click", () => {
	paletteIndex = (paletteIndex + 1) % PALETTES.length;
	drawPoster();
});
document.getElementById("export-btn")?.addEventListener("click", () => {
	app.renderer.extract.download({
		target: posterLayer,
		filename: `${currentPlan.headliner
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")}-poster.png`,
	});
});

