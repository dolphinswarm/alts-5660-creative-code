import { Container, Graphics, Text } from "pixi.js";
import { WIDTH } from "./board.js";

// #region Types / Consts
export type Chute = {
	x: number;
	intervalSeconds: number;
	color: string;
	/** The last tick index that this chute spawned a marble on, so we only spawn once per interval */
	lastTick: number;
};

/** The horizontal margin from the edge of the canvas to the first and last chute */
const CHUTE_MARGIN_X = 70;

const CHUTES: { intervalSeconds: number; color: string }[] = [
	{ intervalSeconds: 1, color: "#ffffff" },
	{ intervalSeconds: 2, color: "#ffb347" },
	{ intervalSeconds: 4, color: "#ff5fa0" },
	{ intervalSeconds: 8, color: "#8fe388" },
];

export const SPAWN_Y = 40;
const CHUTE_WIDTH = 34;
const CHUTE_BOTTOM_Y = SPAWN_Y + 8;
//#endregion

/** Draws a chute (a rectangle with the 1s interval on it) */
const drawChute = (layer: Container, chute: Chute) => {
	const marker = new Graphics()
		.rect(chute.x - CHUTE_WIDTH / 2, 0, CHUTE_WIDTH, CHUTE_BOTTOM_Y)
		.fill(chute.color);
	layer.addChild(marker);

	const label = new Text({
		text: `${chute.intervalSeconds}s`,
		style: {
			fill: "#000000",
			fontSize: 14,
			fontFamily: "Quantico, sans-serif",
		},
	});
	label.anchor.set(0.5, 0);
	label.position.set(chute.x, 10);
	layer.addChild(label);
};

/** Builds the chute objects and draws them on the layer */
export const buildChutes = (layer: Container): Chute[] => {
	const nowSec = Date.now() / 1000;
	return CHUTES.map((def, index) => {
		const xPos =
			CHUTE_MARGIN_X +
			(index * (WIDTH - 2 * CHUTE_MARGIN_X)) / (CHUTES.length - 1);
		const chute: Chute = {
			x: xPos,
			intervalSeconds: def.intervalSeconds,
			color: def.color,
			lastTick: Math.floor(nowSec / def.intervalSeconds),
		};
		drawChute(layer, chute);
		return chute;
	});
};

