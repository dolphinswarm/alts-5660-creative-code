/** Random float between min and max */
export const randomFloat = (min: number, max: number) =>
	Math.random() * (max - min) + min;

/** Random whole number between min and max, inclusive */
export const randomInteger = (min: number, max: number) =>
	Math.floor(randomFloat(min, max + 1));

/** Random item from a list */
export const randomChoice = <T>(items: readonly T[]): T =>
	items[randomInteger(0, items.length - 1)];

/** Grabs "count" items from a list, no repeats */
export const sampleUnique = <T>(items: readonly T[], count: number): T[] => {
	const pool = [...items];
	const picked: T[] = [];
	while (picked.length < count && pool.length > 0) {
		picked.push(pool.splice(randomInteger(0, pool.length - 1), 1)[0]);
	}
	return picked;
};

/** Degrees to radians, since PixiJS wants radians */
export const degToRad = (deg: number) => (deg * Math.PI) / 180;

/** Values from "start" up to "limit", spaced by "step" */
export const stepsUntil = (limit: number, step: number, start = step / 2) => {
	const count = Math.max(0, Math.ceil((limit - start) / step));
	return Array.from({ length: count }, (_, i) => start + i * step);
};

/** Capitalizes the first letter */
export const capitalize = (word: string) =>
	word.charAt(0).toUpperCase() + word.slice(1);
