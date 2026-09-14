import type { TextStyleFontWeight, TextStyleFontStyle } from "pixi.js";

// A bunch of band names that I've saved from conversations I've had
// where someone says something and I say "that'd be a good band name"
export const BAND_PRESET_NAMES = [
	"Two Lanes, No Signal",
	"Soggy Bread",
	"Nasty Cluttered Disease Hovel",
	"Pissrat and the Potstickers",
	"Balanced Butter and Brine",
	"Bad News on the Boat Front",
	"Opium Barons",
	"Charcoyles on my Cathedrals",
	"Anarchy of Faith",
	"Incarcerated Fungi",
	"Emergency Eye Wash Station",
	"Just Dogs and Liquor",
	"Fridge Pisser",
	"Five Eyes",
	"Snotty for Winslow",
	"Grenade Launcher in the Swimming Pool",
	"Styrofoam and Chopsticks",
	"Gatorade and Penjamin",
	"The Dark Satanic Mills",
];

export type Venue = { name: string; city: string };

// Real venues along Colorado's Front Range (most of which I've been to - flexing!)
export const VENUES: Venue[] = [
	{ name: "Hi-Dive", city: "Denver" },
	{ name: "Larimer Lounge", city: "Denver" },
	{ name: "Lion's Lair", city: "Denver" },
	{ name: "Globe Hall", city: "Denver" },
	{ name: "Lost Lake", city: "Denver" },
	{ name: "Seventh Circle Music Collective", city: "Denver" },
	{ name: "Mutiny Information Cafe", city: "Denver" },
	{ name: "The Bluebird Theater", city: "Denver" },
	{ name: "Ogden Theatre", city: "Denver" },
	{ name: "Cervantes' Masterpiece Ballroom", city: "Denver" },
	{ name: "Marquis Theater", city: "Denver" },
	{ name: "Skylark Lounge", city: "Denver" },
	{ name: "Gothic Theatre", city: "Englewood" },
	{ name: "Fox Theatre", city: "Boulder" },
	{ name: "Boulder Theater", city: "Boulder" },
	{ name: "The Velvet Elk Lounge", city: "Boulder" },
	{ name: "Aggie Theatre", city: "Fort Collins" },
	{ name: "Washington's", city: "Fort Collins" },
	{ name: "The Coast", city: "Fort Collins" },
	{ name: "Moxi Theater", city: "Greeley" },
	{ name: "The Caribou Room", city: "Nederland" },
	{ name: "Red Rocks Amphitheatre", city: "Morrison" },
	{ name: "Dillon Amphitheater", city: "Dillon" },
	{ name: "Ford Amphitheater", city: "Colorado Springs" },
	{ name: "The Black Sheep", city: "Colorado Springs" },
	{ name: "Lulu's Downstairs", city: "Manitou Springs" },
];

// Randomly assigned to drum hits (kick/snare/crash/hihat) and bass; see RANDOM_ICON_POOL in poster.ts
export const ICONS = [
	"img/punk.png",
	"img/mic.png",
	"img/the-horns.png",
	"img/stage.png",
	"img/mountain.png",
	"img/chucks.png",
	"img/dead.png",
];

export const SCENE_IMAGES = [
	"img/band.png",
	"img/canyon.png",
	"img/red-rocks.png",
	"img/mountain-forest.png",
];

export type Palette = {
	background: string;
	colors: string[];
};

export const PALETTES: Palette[] = [
	{ background: "#1a0a0a", colors: ["#ff2d95", "#f4e04d", "#00e5ff"] },
	{ background: "#0d0d0d", colors: ["#39ff14", "#ff3131", "#fefefe"] },
	{ background: "#f4ecd8", colors: ["#111111", "#ff5e00", "#0033ff"] },
	{ background: "#120026", colors: ["#b026ff", "#00ffd5", "#ff2079"] },
	{ background: "#111111", colors: ["#e63946", "#f1faee", "#ffb703"] },
];

export type PosterFont = {
	family: string;
	weight: TextStyleFontWeight;
	style: TextStyleFontStyle;
};

export const HEADLINER_FONTS: PosterFont[] = [
	{
		family: "Impact, Arial Black, sans-serif",
		weight: "400",
		style: "normal",
	},
	{
		family: "Space Grotesk, Arial Black, sans-serif",
		weight: "700",
		style: "normal",
	},
	{
		family: "Space Grotesk, Arial Black, sans-serif",
		weight: "300",
		style: "normal",
	},
	{ family: "Cabin, Arial, sans-serif", weight: "700", style: "normal" },
	{ family: "Cabin, Arial, sans-serif", weight: "700", style: "italic" },
	{ family: "Indie Flower, cursive", weight: "400", style: "normal" },
	{ family: "Archivo, sans-serif", weight: "900", style: "normal" },
	{ family: "Anton, sans-serif", weight: "400", style: "normal" },
	{ family: "Bebas Neue, sans-serif", weight: "400", style: "normal" },
	{ family: "Special Elite, monospace", weight: "400", style: "normal" },
	{ family: "Nosifer, sans-serif", weight: "400", style: "normal" },
	{ family: "Monoton, sans-serif", weight: "400", style: "normal" },
	{ family: "Allerta Stencil, sans-serif", weight: "400", style: "normal" },
	{ family: "Jim Nightshade, cursive", weight: "400", style: "normal" },
	{ family: "Kenia, sans-serif", weight: "400", style: "normal" },
	{ family: "Luckiest Guy, sans-serif", weight: "400", style: "normal" },
	{ family: "Danfo, serif", weight: "400", style: "normal" },
	{ family: "Nabla, sans-serif", weight: "400", style: "normal" },
];

export const SUPPORT_FONTS: PosterFont[] = [
	{
		family: "Arial Black, Arial, sans-serif",
		weight: "400",
		style: "normal",
	},
	{
		family: "Space Grotesk, Arial Black, sans-serif",
		weight: "500",
		style: "normal",
	},
	{
		family: "Space Grotesk, Arial Black, sans-serif",
		weight: "600",
		style: "normal",
	},
	{ family: "Cabin, Arial, sans-serif", weight: "600", style: "normal" },
	{ family: "Archivo, sans-serif", weight: "600", style: "normal" },
	{ family: "Bebas Neue, sans-serif", weight: "400", style: "normal" },
	{ family: "Quantico, sans-serif", weight: "700", style: "normal" },
];

export const VENUE_FONTS: PosterFont[] = [
	{ family: "Georgia, serif", weight: "400", style: "normal" },
	{ family: "Georgia, serif", weight: "400", style: "italic" },
	{ family: "Cabin, Arial, sans-serif", weight: "500", style: "italic" },
	{
		family: "Space Grotesk, Arial Black, sans-serif",
		weight: "400",
		style: "normal",
	},
	{ family: "Archivo, sans-serif", weight: "400", style: "normal" },
	{ family: "Special Elite, monospace", weight: "400", style: "normal" },
];

export const ACCENT_FONTS: PosterFont[] = [
	{ family: "Courier New, monospace", weight: "400", style: "normal" },
	{ family: "Courier New, monospace", weight: "700", style: "normal" },
	{ family: "Indie Flower, cursive", weight: "400", style: "normal" },
	{ family: "Cabin, Arial, sans-serif", weight: "600", style: "normal" },
	{ family: "Special Elite, monospace", weight: "400", style: "normal" },
	{ family: "Quantico, sans-serif", weight: "700", style: "normal" },
];

export const AGE_RESTRICTIONS = ["ALL AGES", "18+", "21+"];
export const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
export const MONTHS = [
	"JAN",
	"FEB",
	"MAR",
	"APR",
	"MAY",
	"JUN",
	"JUL",
	"AUG",
	"SEP",
	"OCT",
	"NOV",
	"DEC",
];

