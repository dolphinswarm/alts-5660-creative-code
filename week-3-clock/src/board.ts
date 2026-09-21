import * as Matter from "matter-js";
import { Container, Graphics } from "pixi.js";
import { C_MAJOR_SCALE } from "./audio.js";

// #region Types / Consts
export const WIDTH = 600;
export const HEIGHT = 700;

const FIELD_TOP_Y = 160;
const FIELD_BOTTOM_Y = 560;

const GRID_ROWS = 6;
const GRID_COLS = 7;
/** The max distance from a peg's cell center that the peg can be randomy placed */
const CELL_JITTER = 0.7;

const PEG_RADIUS = 9;
/** The horizontal margin from the edge of the peg field to the first and last peg columns */
const PEG_FIELD_MARGIN_X = 30;

const ACTIVE_COLOR = "#5ad1d1";
const INACTIVE_COLOR = "#2a2f38";

const WALL_THICKNESS = 40;

export type Peg = {
	body: Matter.Body;
	graphic: Graphics;
	isActive: boolean;
	/** How much the peg is currently glowing, from 0 (off) to 1 (full brightness) */
	glow: number;
	glowColor: string;
	noteIndex: number;
	offNote: string | undefined;
};
type PegPosition = { x: number; y: number };

const pegByBody = new Map<Matter.Body, Peg>();
//#endregion

/** Redraws a peg's body and, while it's still glowing, its fading neon halo */
const drawPeg = (peg: Peg) => {
	peg.graphic.clear();

	// Halo
	if (peg.glow > 0) {
		const growth = 1 - peg.glow;
		peg.graphic
			.circle(0, 0, PEG_RADIUS + growth * 20)
			.fill({ color: peg.glowColor, alpha: peg.glow * 0.8 });
	}

	// Peg body
	peg.graphic
		.circle(0, 0, PEG_RADIUS)
		.fill(peg.isActive ? ACTIVE_COLOR : INACTIVE_COLOR);

	// Glow overlay
	if (peg.glow > 0) {
		peg.graphic
			.circle(0, 0, PEG_RADIUS)
			.fill({ color: peg.glowColor, alpha: peg.glow });
	}
};

/** Builds a peg at the specified position */
const buildPeg = (
	world: Matter.World,
	layer: Container,
	position: PegPosition,
): Peg => {
	const body = Matter.Bodies.circle(position.x, position.y, PEG_RADIUS, {
		isStatic: true,
		restitution: 0.6,
		label: "peg",
	});
	Matter.Composite.add(world, body);

	const graphic = new Graphics();
	graphic.position.set(body.position.x, body.position.y);
	graphic.eventMode = "static";
	graphic.cursor = "pointer";
	layer.addChild(graphic);

	const peg: Peg = {
		body,
		graphic,
		isActive: true,
		glow: 0,
		glowColor: ACTIVE_COLOR,
		noteIndex: Math.floor(Math.random() * 4), // <- Chords have at most 4 notes
		offNote:
			Math.random() < 0.15
				? C_MAJOR_SCALE[
						Math.floor(Math.random() * C_MAJOR_SCALE.length)
					]
				: undefined,
	};
	drawPeg(peg);
	pegByBody.set(body, peg);

	// Clicking a peg toggles it on/off
	graphic.on("pointertap", () => {
		peg.isActive = !peg.isActive;
		peg.body.isSensor = !peg.isActive;
		drawPeg(peg);
	});

	return peg;
};

/** Builds a peg locked exactly under each chute, plus a randomized scattered grid, and draws them on "layer" */
export const buildPegs = (
	world: Matter.World,
	layer: Container,
	chuteXPositions: number[], // <- The x-positions of the chutes
): Peg[] => {
	const cellWidth = (WIDTH - 2 * PEG_FIELD_MARGIN_X) / GRID_COLS;
	const cellHeight = (FIELD_BOTTOM_Y - FIELD_TOP_Y) / GRID_ROWS;

	const positions = Array.from(
		{ length: GRID_ROWS * GRID_COLS },
		(_, index) => {
			const col = index % GRID_COLS;
			const row = Math.floor(index / GRID_COLS);

			// Top row has a peg directly under each chute, so marbles can hit a peg immediately after dropping
			if (row === 0 && col % 2 === 0) {
				return { x: chuteXPositions[col / 2], y: FIELD_TOP_Y };
			}

			const cx = PEG_FIELD_MARGIN_X + (col + 0.5) * cellWidth;
			const cy = FIELD_TOP_Y + (row + 0.5) * cellHeight;
			return {
				x: cx + (Math.random() - 0.5) * cellWidth * CELL_JITTER,
				y: cy + (Math.random() - 0.5) * cellHeight * CELL_JITTER,
			};
		},
	);

	return positions.map((position) => buildPeg(world, layer, position));
};

/** When a marble hits a peg, trigger the peg's glow and return the note to play */
export const hitPeg = (
	body: Matter.Body,
	color: string,
): { noteIndex: number; offNote: string | undefined } | undefined => {
	const peg = pegByBody.get(body);
	if (!peg || !peg.isActive) {
		return undefined;
	}
	peg.glow = 1;
	peg.glowColor = color;
	drawPeg(peg);
	return { noteIndex: peg.noteIndex, offNote: peg.offNote };
};

/** Decays every currently-glowing peg's halo a bit further, redrawing only those that changed */
export const updatePegGlow = (pegs: Peg[], deltaMS: number) => {
	const decayFactor = 0.5 ** (deltaMS / 200); // half as bright every 200ms
	pegs.forEach((peg) => {
		if (peg.glow <= 0) {
			return;
		}
		peg.glow = Math.max(peg.glow * decayFactor, 0);
		drawPeg(peg);
	});
};

/** Invisible bounds so marbles stay in frame instead of flying off the sides */
export const buildSideWalls = (): Matter.Body[] => [
	Matter.Bodies.rectangle(
		-WALL_THICKNESS / 2,
		HEIGHT / 2,
		WALL_THICKNESS,
		HEIGHT * 2,
		{
			isStatic: true,
			restitution: 1,
			label: "wall",
		},
	),
	Matter.Bodies.rectangle(
		WIDTH + WALL_THICKNESS / 2,
		HEIGHT / 2,
		WALL_THICKNESS,
		HEIGHT * 2,
		{
			isStatic: true,
			restitution: 1,
			label: "wall",
		},
	),
];

