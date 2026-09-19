import { Application, Container } from "pixi.js";
import * as Matter from "matter-js";
import * as Tone from "tone";
import {
	WIDTH,
	HEIGHT,
	buildPegs,
	buildSideWalls,
	hitPeg,
	updatePegGlow,
} from "./board.js";
import { buildChutes, SPAWN_Y } from "./chutes.js";
import {
	spawnMarble,
	syncMarble,
	removeMarble,
	chuteIndexOf,
	kickOffWall,
	type Marble,
} from "./marbles.js";
import { playNote } from "./audio.js";

// #region PixiJS / ToneJS/ MatterJS Setup
const main = document.querySelector("main");
if (!main) {
	throw new Error("main element not found");
}

const app = new Application();
await app.init({
	width: WIDTH,
	height: HEIGHT,
	background: "#0a0a12",
	antialias: true,
	resolution: 1,
});
main.appendChild(app.canvas);

const boardLayer = new Container();
const marblesLayer = new Container();
const chutesLayer = new Container();
app.stage.addChild(boardLayer, marblesLayer, chutesLayer);

let marbles: Marble[] = [];
let started = false;

app.stage.eventMode = "static";
app.stage.cursor = "pointer";
app.stage.hitArea = app.screen;
app.stage.on("pointertap", () => {
	if (started) {
		return;
	}
	started = true;
	void Tone.start();
});

const physics = Matter.Engine.create();
physics.gravity.y = 0.25;
Matter.Composite.add(physics.world, buildSideWalls());
const chutes = buildChutes(chutesLayer);
const pegs = buildPegs(
	physics.world,
	boardLayer,
	chutes.map((chute) => chute.x),
);
// #endregion

//#region App Events
Matter.Events.on(physics, "collisionStart", ({ pairs }) => {
	pairs.forEach(({ bodyA, bodyB }) => {
		const bodies = [bodyA, bodyB];
		const marble = bodies.find((body) => body.label === "marble");
		if (!marble) {
			return;
		}

		const wall = bodies.find((body) => body.label === "wall");
		if (wall) {
			kickOffWall(marble);
			return;
		}

		const peg = bodies.find((body) => body.label === "peg");
		if (!peg) {
			return;
		}

		const chuteIndex = chuteIndexOf(marble);
		if (chuteIndex === undefined) {
			return;
		}

		const hit = hitPeg(peg, chutes[chuteIndex].color);
		if (!hit) {
			return;
		}

		playNote(hit.noteIndex, hit.offNote);
	});
});

app.ticker.add((ticker) => {
	// If not clicked, don't start the simulation yet
	if (!started) {
		return;
	}

	// Update the physics and marbles
	Matter.Engine.update(physics, Math.min(ticker.deltaMS, 16)); // <- Cap frames to 60fps so physics doesn't explode if the tab is in the background
	marbles.forEach(syncMarble);
	updatePegGlow(pegs, ticker.deltaMS);
	marbles = marbles.filter((marble) => {
		const isOutOfBounds = marble.body.position.y > HEIGHT + 40;
		if (isOutOfBounds) {
			removeMarble(physics.world, marblesLayer, marble);
		}
		return !isOutOfBounds;
	});

	const nowSec = Date.now() / 1000;
	chutes.forEach((chute, index) => {
		// Only spawn a marble if the current tick is different than the last tick we spawned on
		const tick = Math.floor(nowSec / chute.intervalSeconds);
		if (tick === chute.lastTick) {
			return;
		}
		chute.lastTick = tick;

		marbles.push(
			spawnMarble(
				physics.world,
				marblesLayer,
				{ x: chute.x, y: SPAWN_Y },
				index,
				chute.color,
			),
		);
	});
});
// #endregion

