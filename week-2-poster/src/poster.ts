import {
	Assets,
	Container,
	Graphics,
	Sprite,
	Text,
	Texture,
	type TextStyleOptions,
} from "pixi.js";
import pluralize from "pluralize";
import { adjectives, animals, colors, names } from "unique-names-generator";
import {
	BAND_PRESET_NAMES,
	VENUES,
	ICONS,
	SCENE_IMAGES,
	AGE_RESTRICTIONS,
	HEADLINER_FONTS,
	SUPPORT_FONTS,
	VENUE_FONTS,
	ACCENT_FONTS,
	WEEKDAYS,
	MONTHS,
} from "./data.js";
import type { Palette, PosterFont } from "./data.js";
import { generateClip, activeReactiveRoles } from "./music.js";
import type { ReactiveRole, MidiClip } from "./music.js";
import {
	randomFloat,
	randomInteger,
	randomChoice,
	sampleUnique,
	degToRad,
	capitalize,
	stepsUntil,
} from "./utils.js";

//#region Types / Consts
export const POSTER_WIDTH = 1800;
export const POSTER_HEIGHT = 2700;
const TORN_EDGE_JAG_RATIO = 0.035;

// Support acts are generated from unique-names-generator's pools, not curated, so they never repeat
const THE_CHANCE = 0.5;
const OF_CHANCE = 0.15;
const POSSESSIVE_CHANCE = 0.15;
const COLOR_NOUN_CHANCE = 0.3;
const COLOR_MODIFIER_CHANCE = 0.4;
const NAME_AS_NOUN_CHANCE = 0.4;

// Icon pool randomly handed out to every reactive role except guitar (drum-kit pieces + bass)
const RANDOM_ICON_POOL = ["img/drum-set.png", ...ICONS];
// Guitar is the only role with a fixed, on-the-nose icon
const GUITAR_ICON_PATH = "img/electric-guitar.png";

// "Centerpiece" is a big anchor shape behind everything, while stamps are more scattered/numerous
const CENTERPIECE_SHAPES = [
	"star",
	"target",
	"blob",
	"burst",
	"image",
] as const;
export type CenterpieceShape = (typeof CENTERPIECE_SHAPES)[number];

const STAMP_SHAPES = ["star", "ring", "x", "bolt", "spark", "scratch"] as const;
export type StampShape = (typeof STAMP_SHAPES)[number];

type GridRow = { top: number; bottom: number };

const GRID: Record<string, GridRow> = {
	headliner: { top: 0.05, bottom: 0.42 },
	support: { top: 0.45, bottom: 0.64 },
	venue: { top: 0.68, bottom: 0.77 },
	details: { top: 0.79, bottom: 0.94 },
};

export type PosterBlock = {
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	colorIndex: number;
};

export type PosterStamp = {
	x: number;
	y: number;
	size: number;
	rotation: number;
	colorIndex: number;
	shape: StampShape;
	role: ReactiveRole;
};

export type PosterIcon = {
	imagePath: string;
	x: number;
	y: number;
	size: number;
	rotation: number;
	colorIndex: number;
	role: ReactiveRole;
};

export type PosterFonts = {
	headliner: PosterFont;
	support: PosterFont;
	venue: PosterFont;
	details: PosterFont;
};

export type PosterBlocks = {
	headliner: PosterBlock;
	support: PosterBlock;
	details: PosterBlock;
};

export type PosterCenterpiece = {
	variant: CenterpieceShape;
	imagePath?: string;
	x: number;
	y: number;
	size: number;
	rotation: number;
	/** Random active reactive role this shape reacts to */
	role?: ReactiveRole;
};

/** A poster's full content + layout; colors aren't baked in, just "colorIndex", so a plan replays against any palette */
export type PosterPlan = {
	headliner: string;
	supportActs: string[];
	venueLine: string;
	detailsLine: string;
	blocks: PosterBlocks;
	centerpiece: PosterCenterpiece;
	fonts: PosterFonts;
	headlinerRotation: number;
	headlinerMisprintOffset: { x: number; y: number };
	supportRotations: number[];
	stamps: PosterStamp[];
	iconAccents: PosterIcon[];
	/** Locked in at generation time */
	midiClip: MidiClip;
};

/** One sticker image plus one stamp shape, per reactive role */
type ReactiveVisual = { iconPath: string; stampShape: StampShape };

/** One display object worth pulsing, plus the scale it settles back to */
export type PulseTarget = { node: Container; baseScale: number };

/** Every sticker/stamp/wildcard tied to one reactive role */
export type ReactiveSprites = Partial<Record<ReactiveRole, PulseTarget[]>>;

type ActivePulse = PulseTarget & {
	elapsed: number;
	duration: number;
	peak: number;
};
//#endregion

//#region Asset loading
/** Loads every icon and font before anything else */
export const loadAssets = async (): Promise<void> => {
	await Assets.load([...RANDOM_ICON_POOL, ...SCENE_IMAGES, GUITAR_ICON_PATH]);
	await Promise.all(
		[
			...HEADLINER_FONTS,
			...SUPPORT_FONTS,
			...VENUE_FONTS,
			...ACCENT_FONTS,
		].map((font) =>
			document.fonts.load(
				`${font.style === "italic" ? "italic " : ""}${font.weight} 100px ${font.family}`,
			),
		),
	);
	await document.fonts.ready;
};
//#endregion

//#region Support act name generation
/** Prefixes "The " and pluralizes, or leaves the phrase alone */
const withThe = (phrase: string, useThe: boolean) =>
	useThe ? `The ${pluralize(phrase)}` : phrase;

/** A capitalized color or animal, your pick */
const colorOrAnimalNoun = () =>
	capitalize(
		Math.random() < COLOR_NOUN_CHANCE
			? randomChoice(colors)
			: randomChoice(animals),
	);

/** A capitalized proper name from the generic pool */
const properName = () => capitalize(randomChoice(names));

/** Support-act name from a randomized word pool + connector + optional "The" */
const generateSupportName = (): string => {
	const useThe = Math.random() < THE_CHANCE;
	const connectorRoll = Math.random();

	if (connectorRoll < OF_CHANCE) {
		return `${withThe(colorOrAnimalNoun(), useThe)} of ${properName()}`;
	}

	if (connectorRoll < OF_CHANCE + POSSESSIVE_CHANCE) {
		return `${properName()}'s ${colorOrAnimalNoun()}`;
	}

	const modifier = capitalize(
		Math.random() < COLOR_MODIFIER_CHANCE
			? randomChoice(colors)
			: randomChoice(adjectives),
	);
	const noun = capitalize(
		Math.random() < NAME_AS_NOUN_CHANCE
			? randomChoice(names)
			: randomChoice(animals),
	);
	return withThe(`${modifier} ${noun}`, useThe);
};
//#endregion

//#region Reactive visual assignment
/** Fresh stamp shape + icon image for each active reactive role */
const buildReactiveVisuals = (
	activeRoles: ReactiveRole[],
): Record<ReactiveRole, ReactiveVisual> => {
	const stampShapes = sampleUnique(STAMP_SHAPES, activeRoles.length);
	const randomIconRoles = activeRoles.filter(
		(role): role is Exclude<ReactiveRole, "guitar"> => role !== "guitar",
	);
	const randomIcons = sampleUnique(RANDOM_ICON_POOL, randomIconRoles.length);
	const randomIconOf = new Map(
		randomIconRoles.map((role, index) => [role, randomIcons[index]]),
	);

	const visuals = {} as Record<ReactiveRole, ReactiveVisual>;
	activeRoles.forEach((role, index) => {
		visuals[role] = {
			stampShape: stampShapes[index],
			iconPath:
				role === "guitar" ? GUITAR_ICON_PATH : randomIconOf.get(role)!,
		};
	});
	return visuals;
};

/** One icon sticker tied to "role", randomly placed */
const buildReactiveIcon = (
	role: ReactiveRole,
	visuals: Record<ReactiveRole, ReactiveVisual>,
): PosterIcon => ({
	x: randomFloat(140, POSTER_WIDTH - 140),
	y: randomFloat(POSTER_HEIGHT * 0.05, POSTER_HEIGHT * 0.95),
	size: randomFloat(150, 330),
	rotation: jitterDeg(15),
	colorIndex: randomInteger(0, 2),
	imagePath: visuals[role].iconPath,
	role,
});

/** One stamp tied to "role", randomly placed */
const buildReactiveStamp = (
	role: ReactiveRole,
	visuals: Record<ReactiveRole, ReactiveVisual>,
): PosterStamp => ({
	x: randomFloat(60, POSTER_WIDTH - 60),
	y: randomFloat(60, POSTER_HEIGHT - 60),
	size: randomFloat(20, 46),
	rotation: degToRad(randomFloat(0, 360)),
	colorIndex: randomInteger(0, 2),
	shape: visuals[role].stampShape,
	role,
});
//#endregion

//#region Plan generation
/** A show date 3-90 days out, formatted like "FRI JUN 6" */
const formatFlyerDate = () => {
	const date = new Date();
	date.setDate(date.getDate() + randomInteger(3, 90));
	return `${WEEKDAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${date.getDate()}`;
};

/** Vertical midpoint of "row", in poster pixels */
const rowCenterY = (row: GridRow) =>
	((row.top + row.bottom) / 2) * POSTER_HEIGHT;

/** Tiny rotation randomized symmetrically around 0, in radians */
const jitterDeg = (maxAbsDeg: number) =>
	degToRad(randomFloat(-maxAbsDeg, maxAbsDeg));

/** One "build(role)" per active role, plus a random extra count of randomly-chosen active roles */
const withRandomExtras = <T>(
	activeRoles: ReactiveRole[],
	build: (role: ReactiveRole) => T,
	extraCountRange: [min: number, max: number],
): T[] => [
	...activeRoles.map(build),
	...Array.from({ length: randomInteger(...extraCountRange) }, () =>
		build(randomChoice(activeRoles)),
	),
];

/** One randomized color block, sized and placed within "row" */
const buildBlock = (row: GridRow, colorIndex: number): PosterBlock => {
	const rowHeight = (row.bottom - row.top) * POSTER_HEIGHT;
	return {
		x: POSTER_WIDTH / 2 + randomFloat(-80, 80),
		y: rowCenterY(row) + randomFloat(-40, 40),
		width: randomFloat(POSTER_WIDTH * 0.68, POSTER_WIDTH * 0.95),
		height: randomFloat(rowHeight * 0.75, rowHeight * 1.1),
		rotation: jitterDeg(6), // Pixi wants radians
		colorIndex,
	};
};

/** Rolls up a whole new poster's content and layout from scratch */
export const generatePosterPlan = (): PosterPlan => {
	const headliner = randomChoice(BAND_PRESET_NAMES);
	const supportActs = Array.from(
		{ length: randomInteger(1, 3) },
		generateSupportName,
	);
	const venue = randomChoice(VENUES);
	const doorsHour = randomInteger(6, 8);
	const showHour = doorsHour + (randomInteger(0, 1) === 0 ? 0.5 : 1);
	const price =
		randomInteger(1, 4) === 4
			? "Free Event"
			: `$${randomChoice([5, 10, 15, 20, 25, 30, 35, 40, 45, 50])}`;

	const blocks = {
		headliner: buildBlock(GRID.headliner, 0),
		support: buildBlock(GRID.support, 1),
		details: buildBlock(GRID.details, 2),
	};

	// Locked in once so replay always matches what's actually playing
	const midiClip = generateClip();
	const activeRoles = activeReactiveRoles(midiClip);
	const visuals = buildReactiveVisuals(activeRoles);
	const wildcardRole = randomChoice(activeRoles);

	// Red Rocks always gets itself as its centerpiece
	const isRedRocks = venue.name === "Red Rocks Amphitheatre";
	const centerpieceShape: CenterpieceShape = isRedRocks
		? "image"
		: randomChoice(CENTERPIECE_SHAPES);

	return {
		headliner,
		supportActs,
		venueLine: `AT ${venue.name.toUpperCase()}, ${venue.city.toUpperCase()}, CO`,
		detailsLine: `${formatFlyerDate()}  //  DOORS ${doorsHour}:00 PM  //  SHOW ${showHour}:00 PM  //  ${price}  //  ${randomChoice(AGE_RESTRICTIONS)}`,
		blocks,
		fonts: {
			headliner: randomChoice(HEADLINER_FONTS),
			support: randomChoice(SUPPORT_FONTS),
			venue: randomChoice(VENUE_FONTS),
			details: randomChoice(ACCENT_FONTS),
		},
		centerpiece: {
			variant: centerpieceShape,
			imagePath:
				centerpieceShape === "image"
					? isRedRocks
						? "img/red-rocks.png"
						: randomChoice(SCENE_IMAGES)
					: undefined,
			x: POSTER_WIDTH / 2 + randomFloat(-250, 250),
			y: rowCenterY(GRID.headliner) + randomFloat(-120, 120),
			size: randomFloat(320, 480),
			rotation:
				centerpieceShape === "image"
					? jitterDeg(15)
					: degToRad(randomFloat(0, 360)),
			role: wildcardRole,
		},
		headlinerRotation: jitterDeg(5),
		headlinerMisprintOffset: {
			x: randomFloat(6, 16),
			y: randomFloat(6, 16),
		},
		supportRotations: supportActs.map(() => jitterDeg(4)),
		stamps: withRandomExtras(
			activeRoles,
			(role) => buildReactiveStamp(role, visuals),
			[4, 7],
		),
		iconAccents: withRandomExtras(
			activeRoles,
			(role) => buildReactiveIcon(role, visuals),
			[2, 4],
		),
		midiClip,
	};
};
//#endregion

//#region Reactive pulses
// Keyed by node, so restarting a pulse is just a Map overwrite
const activePulses = new Map<Container, ActivePulse>();

/** Scales "target" up to "peak"x, then eases back down over "duration" seconds */
const pulse = (target: PulseTarget, peak = 1.35, duration = 0.16) => {
	activePulses.set(target.node, { ...target, elapsed: 0, duration, peak });
};

/** Pulses every sticker/stamp/wildcard tied to "role" */
export const pulseRole = (sprites: ReactiveSprites, role: ReactiveRole) => {
	sprites[role]?.forEach((target) => pulse(target));
};

/** Advances every in-flight pulse; call once per Pixi ticker frame */
export const tickPulses = (deltaSeconds: number) => {
	activePulses.forEach((activePulse, node) => {
		activePulse.elapsed += deltaSeconds;
		const progress = Math.min(
			1,
			activePulse.elapsed / activePulse.duration,
		);
		node.scale.set(
			activePulse.baseScale *
				(activePulse.peak - (activePulse.peak - 1) * progress),
		);
		if (progress >= 1) {
			activePulses.delete(node);
		}
	});
};
//#endregion

//#region Shape drawing
/** Palette color by index, wrapping around */
const paletteColor = (palette: Palette, colorIndex: number): string =>
	palette.colors[colorIndex % palette.colors.length];

/** A rectangle with a jagged torn-paper edge, centered on (0, 0) */
const drawTornRect = (
	width: number,
	height: number,
	color: string,
	alpha = 1,
) => {
	const jag = Math.min(width, height) * TORN_EDGE_JAG_RATIO;
	const stepsPerEdge = 5;

	const edgePoints = (x1: number, y1: number, x2: number, y2: number) =>
		Array.from({ length: stepsPerEdge }, (_, stepIndex) => {
			const fraction = stepIndex / stepsPerEdge;
			return [
				x1 + (x2 - x1) * fraction + randomFloat(-jag, jag),
				y1 + (y2 - y1) * fraction + randomFloat(-jag, jag),
			];
		}).flat();

	const halfWidth = width / 2;
	const halfHeight = height / 2;
	const points = [
		...edgePoints(-halfWidth, -halfHeight, halfWidth, -halfHeight),
		...edgePoints(halfWidth, -halfHeight, halfWidth, halfHeight),
		...edgePoints(halfWidth, halfHeight, -halfWidth, halfHeight),
		...edgePoints(-halfWidth, halfHeight, -halfWidth, -halfHeight),
	];

	return new Graphics().poly(points, true).fill({ color, alpha });
};

/** Grid of jittered dots, faking a cheap halftone texture */
const drawHalftoneTexture = (color: string, alpha = 0.06, spacing = 46) => {
	const graphics = new Graphics();
	stepsUntil(POSTER_HEIGHT, spacing).forEach((y) =>
		stepsUntil(POSTER_WIDTH, spacing).forEach((x) =>
			graphics.circle(
				x + randomFloat(-6, 6),
				y + randomFloat(-6, 6),
				randomFloat(2, 6),
			),
		),
	);
	return graphics.fill({ color, alpha });
};

/** A tinted copy of a loaded icon/scene image, scaled to "targetSize", anchored center */
const drawImageSprite = (
	imagePath: string,
	targetSize: number,
	tintColor: string,
) => {
	const texture = Assets.get<Texture>(imagePath);
	const sprite = new Sprite(texture);
	sprite.anchor.set(0.5);
	sprite.tint = tintColor;
	sprite.scale.set(targetSize / Math.max(texture.width, texture.height));
	return sprite;
};

/** Positions and rotates a display object around its own center */
const place = <T extends Container>(
	display: T,
	x: number,
	y: number,
	rotation: number,
): T => {
	display.position.set(x, y);
	display.rotation = rotation;
	return display;
};

/** Draws a poster's centerpiece shape (star/target/burst/blob/image) */
const drawCenterpiece = (shape: PosterCenterpiece, palette: Palette) => {
	const [primaryColor, secondaryColor, tertiaryColor] = palette.colors;
	let display: Container;

	switch (shape.variant) {
		case "star": {
			const graphics = new Graphics();
			graphics
				.star(0, 0, 7, shape.size / 2, shape.size / 4)
				.fill(primaryColor);
			display = graphics;
			break;
		}

		case "target": {
			// Largest-to-smallest so each ring peeks through the one before it
			const graphics = new Graphics();
			const ringColors = [
				primaryColor,
				palette.background,
				secondaryColor,
				palette.background,
			];
			[1, 0.72, 0.42, 0.18].forEach((scale, ringIndex) => {
				graphics
					.circle(0, 0, (shape.size / 2) * scale)
					.fill(ringColors[ringIndex]);
			});
			display = graphics;
			break;
		}

		case "burst": {
			const spikes = 14;
			const points = Array.from(
				{ length: spikes * 2 },
				(_, spikeIndex) => {
					const angle = (spikeIndex / (spikes * 2)) * Math.PI * 2;
					const radius =
						(shape.size / 2) * (spikeIndex % 2 === 0 ? 1 : 0.55);
					return [Math.cos(angle) * radius, Math.sin(angle) * radius];
				},
			).flat();
			display = new Graphics().poly(points, true).fill(secondaryColor);
			break;
		}

		case "blob": {
			const spikes = 10;
			const points = Array.from({ length: spikes }, (_, spikeIndex) => {
				const angle = (spikeIndex / spikes) * Math.PI * 2;
				const radius = (shape.size / 2) * randomFloat(0.7, 1);
				return [Math.cos(angle) * radius, Math.sin(angle) * radius];
			}).flat();
			display = new Graphics().poly(points, true).fill(tertiaryColor);
			break;
		}

		case "image":
			display = drawImageSprite(
				shape.imagePath ?? "",
				shape.size,
				secondaryColor,
			);
			break;
	}

	return place(display, shape.x, shape.y, shape.rotation);
};

/** Draws one abstract stamp mark (star/ring/x/bolt/spark/scratch) */
const drawStamp = (stamp: PosterStamp, palette: Palette) => {
	const color = paletteColor(palette, stamp.colorIndex);
	const graphics = new Graphics();
	const radius = stamp.size / 2;

	switch (stamp.shape) {
		case "star":
			graphics.star(0, 0, 5, radius, radius / 2).fill(color);
			break;
		case "ring":
			graphics
				.circle(0, 0, radius)
				.stroke({ width: stamp.size * 0.18, color });
			break;
		case "x":
			graphics
				.moveTo(-radius, -radius)
				.lineTo(radius, radius)
				.moveTo(radius, -radius)
				.lineTo(-radius, radius)
				.stroke({ width: stamp.size * 0.2, color });
			break;
		case "bolt":
			graphics
				.moveTo(-radius * 0.2, -radius)
				.lineTo(radius * 0.3, -radius * 0.15)
				.lineTo(-radius * 0.15, 0)
				.lineTo(radius * 0.2, radius)
				.stroke({ width: stamp.size * 0.16, color });
			break;
		case "spark":
			// 6-ray scribbled asterisk
			Array.from(
				{ length: 6 },
				(_, rayIndex) => (rayIndex / 6) * Math.PI * 2,
			).forEach((angle) =>
				graphics
					.moveTo(0, 0)
					.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius),
			);
			graphics.stroke({ width: stamp.size * 0.14, color });
			break;
		case "scratch":
			// Three parallel diagonal slashes
			[-radius * 0.5, 0, radius * 0.5].forEach((offsetX) =>
				graphics
					.moveTo(offsetX - radius * 0.25, -radius)
					.lineTo(offsetX + radius * 0.25, radius),
			);
			graphics.stroke({ width: stamp.size * 0.1, color });
			break;
	}

	return place(graphics, stamp.x, stamp.y, stamp.rotation);
};

//#endregion

//#region Text building
/** Shrinks "displayObject" down till it fits "maxWidth" */
const shrinkToFit = (
	displayObject: { width: number; scale: { set: (value: number) => void } },
	maxWidth: number,
) => {
	if (displayObject.width > maxWidth) {
		displayObject.scale.set(maxWidth / displayObject.width);
	}
};

/** Spreads a "PosterFont" into Pixi's TextStyle fontFamily/fontWeight/fontStyle */
const fontStyleOf = (font: PosterFont) => ({
	fontFamily: font.family,
	fontWeight: font.weight,
	fontStyle: font.style,
});

/** Black or off-white, whichever reads on "hexColor" */
const readableInk = (hexColor: string) => {
	const hex = hexColor.replace("#", "");
	const red = parseInt(hex.slice(0, 2), 16);
	const green = parseInt(hex.slice(2, 4), 16);
	const blue = parseInt(hex.slice(4, 6), 16);
	const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
	return brightness > 140 ? "#111111" : "#f5f5f5";
};

/** Draws the headliner name with a misregistered "misprint" copy behind it */
const buildHeadlinerText = (
	plan: PosterPlan,
	palette: Palette,
	block: PosterBlock,
) => {
	const ink = readableInk(paletteColor(palette, block.colorIndex));
	const text = plan.headliner.toUpperCase();
	const fontSize = Math.min(200, Math.max(90, 2600 / text.length));
	const style: TextStyleOptions = {
		...fontStyleOf(plan.fonts.headliner),
		fontSize,
		align: "center",
		letterSpacing: 2,
		// Long preset names wrap onto multiple lines instead of shrinking down tiny
		wordWrap: true,
		wordWrapWidth: block.width * 0.9,
		breakWords: false,
	};

	const container = new Container();

	// Offset, semi-transparent copy simulating a misprinted flyer
	const misprint = new Text({
		text,
		style: { ...style, fill: palette.colors[1] },
	});
	misprint.anchor.set(0.5);
	misprint.alpha = 0.65;
	misprint.position.set(
		plan.headlinerMisprintOffset.x,
		plan.headlinerMisprintOffset.y,
	);
	container.addChild(misprint);

	const main = new Text({ text, style: { ...style, fill: ink } });
	main.anchor.set(0.5);
	container.addChild(main);

	// Scale the whole container (not just "main") so the misprint offset stays proportional
	shrinkToFit(container, block.width * 0.9);
	if (container.height > block.height * 0.85) {
		container.scale.set(
			container.scale.x * ((block.height * 0.85) / container.height),
		);
	}

	container.position.set(block.x, block.y);
	container.rotation = plan.headlinerRotation;
	return container;
};

/** Draws the "WITH:" label and every support act's name within "block" */
const buildSupportActsText = (
	plan: PosterPlan,
	palette: Palette,
	block: PosterBlock,
) => {
	const container = new Container();
	if (plan.supportActs.length === 0) {
		return container;
	}

	const ink = readableInk(paletteColor(palette, block.colorIndex));
	const maxTextWidth = block.width * 0.9;
	// Inset from the block edges to clear the torn edge's max wobble
	const edgeInset = Math.min(block.width, block.height) * TORN_EDGE_JAG_RATIO;
	const rowTop = block.y - block.height / 2 + edgeInset;
	const rowBottom = block.y + block.height / 2 - edgeInset;
	const lineHeight = (rowBottom - rowTop) / (plan.supportActs.length + 1);

	const withLabel = new Text({
		text: "WITH:",
		style: {
			...fontStyleOf(plan.fonts.support),
			fontSize: 44,
			fill: ink,
			letterSpacing: 6,
		},
	});
	withLabel.anchor.set(0.5, 0);
	shrinkToFit(withLabel, maxTextWidth);
	withLabel.position.set(block.x, rowTop);
	container.addChild(withLabel);

	plan.supportActs.forEach((name, index) => {
		const line = new Text({
			text: name.toUpperCase(),
			style: {
				...fontStyleOf(plan.fonts.support),
				fontSize: 62,
				fill: ink,
			},
		});
		line.anchor.set(0.5);
		shrinkToFit(line, maxTextWidth);
		line.position.set(block.x, rowTop + lineHeight * (index + 1.4));
		line.rotation = plan.supportRotations[index];
		container.addChild(line);
	});

	return container;
};

/** Draws the venue/city line */
const buildVenueText = (plan: PosterPlan, palette: Palette) => {
	const text = new Text({
		text: plan.venueLine,
		style: {
			...fontStyleOf(plan.fonts.venue),
			fontSize: 56,
			fill: palette.colors[0],
		},
	});
	text.anchor.set(0.5);
	text.position.set(POSTER_WIDTH / 2, rowCenterY(GRID.venue));
	return text;
};

/** Draws the date/doors/price/age-restriction details line */
const buildDetailsText = (
	plan: PosterPlan,
	palette: Palette,
	block: PosterBlock,
) => {
	const text = new Text({
		text: plan.detailsLine,
		style: {
			...fontStyleOf(plan.fonts.details),
			fontSize: 52,
			fill: readableInk(paletteColor(palette, block.colorIndex)),
		},
	});
	text.anchor.set(0.5);
	shrinkToFit(text, block.width * 0.9);
	text.position.set(block.x, block.y);
	return text;
};
//#endregion

//#region Render
/** Draws "plan" into "layer" with "palette"; returns pulse targets grouped by reactive role */
export const renderPoster = (
	layer: Container,
	plan: PosterPlan,
	palette: Palette,
): ReactiveSprites => {
	layer.removeChildren();
	const reactive: ReactiveSprites = {};
	/** Adds "target" to "reactive[role]", creating the array if needed */
	const registerReactive = (role: ReactiveRole, target: PulseTarget) => {
		(reactive[role] ??= []).push(target);
	};

	layer.addChild(
		new Graphics()
			.rect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)
			.fill(palette.background),
	);
	layer.addChild(drawHalftoneTexture(palette.colors[0]));

	// Centerpiece sits behind everything else
	const centerpiece = drawCenterpiece(plan.centerpiece, palette);
	layer.addChild(centerpiece);
	if (plan.centerpiece.role) {
		registerReactive(plan.centerpiece.role, {
			node: centerpiece,
			baseScale: centerpiece.scale.x || 1,
		});
	}

	Object.values(plan.blocks).forEach((block) => {
		const torn = drawTornRect(
			block.width,
			block.height,
			paletteColor(palette, block.colorIndex),
			0.85,
		);
		layer.addChild(place(torn, block.x, block.y, block.rotation));
	});

	// Icons/stamps go on before the text, so they never bury the copy
	plan.iconAccents.forEach((icon) => {
		const color = paletteColor(palette, icon.colorIndex);
		const sprite = place(
			drawImageSprite(icon.imagePath, icon.size, color),
			icon.x,
			icon.y,
			icon.rotation,
		);
		layer.addChild(sprite);
		registerReactive(icon.role, {
			node: sprite,
			baseScale: sprite.scale.x,
		});
	});
	plan.stamps.forEach((stamp) => {
		const graphic = drawStamp(stamp, palette);
		layer.addChild(graphic);
		registerReactive(stamp.role, { node: graphic, baseScale: 1 });
	});

	layer.addChild(buildHeadlinerText(plan, palette, plan.blocks.headliner));
	layer.addChild(buildSupportActsText(plan, palette, plan.blocks.support));
	layer.addChild(buildVenueText(plan, palette));
	layer.addChild(buildDetailsText(plan, palette, plan.blocks.details));

	return reactive;
};
//#endregion

