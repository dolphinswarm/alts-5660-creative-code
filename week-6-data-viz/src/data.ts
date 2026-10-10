import { csvParse } from "d3-dsv";

//#region Types

type Shift = "AM" | "PM";

/** One squirrel sighting (one row of squirrels.csv). */
export type Squirrel = {
	/** "Unique Squirrel ID", e.g. "37F-PM-1014-03" */
	id: string;
	/** e.g. "37F" */
	hectare: string;
	shift: Shift;
	date: Date;
	/** `${hectare}|${shift}|${date}` - see sessionKey() */
	sessionKey: string;
	/** "X" */
	lon: number;
	/** "Y" */
	lat: number;
	/** "Adult" | "Juvenile" | "?" | "" */
	age: string;
	/** "Gray" | "Cinnamon" | "Black" */
	furColor: string;
	highlightColor: string;
	/** "Ground Plane" | "Above Ground" */
	location: string;
	/** "Above Ground Sighter Measurement" */
	aboveGroundFeet: number | null;
	/** running, chasing, climbing, eating, foraging */
	activities: Record<string, boolean>;
	/** kuks, quaas, moans */
	sounds: Record<string, boolean>;
	/** flags, twitches */
	tail: Record<string, boolean>;
	/** approaches, indifferent, runsFrom */
	humans: Record<string, boolean>;
	otherActivities: string;
	otherInteractions: string;
};

/** One census taker's survey of one hectare for one shift (one row of hectare.csv). */
type Survey = {
	/** e.g. "54º F, overcast" */
	weather: string;
	/** "None" | "Some" | "Abundant" | "" */
	litter: string;
	otherAnimals: string;
	/** "Calm" | "Busy" | ... */
	conditions: string;
};

/** One census story/note (one row of stories.csv). */
type Story = {
	text: string;
	topics: string[];
};

/**
 * Everything that happened in one hectare during one shift on one day.
 * This is the "join" of all three CSVs.
 */
export type Session = {
	/** null for the few sessions with no hectare.csv row */
	survey: Survey | null;
	squirrels: Squirrel[];
	stories: Story[];
};

export type SquirrelCensus = {
	squirrels: Squirrel[];
	/** Keyed by sessionKey() */
	sessions: Map<string, Session>;
};

type Row = Record<string, string>;
//#endregion

//#region Parsing helpers

/**
 * The census writes dates as MMDDYYYY, e.g. "10142018".
 */
const parseDate = (raw: string) =>
	new Date(+raw.slice(4, 8), +raw.slice(0, 2) - 1, +raw.slice(2, 4));

const parseBool = (raw: string | undefined) => raw?.toLowerCase() === "true";

const parseNumber = (raw: string | undefined) => {
	const n = parseFloat(raw ?? "");
	return Number.isFinite(n) ? n : null;
};

/**
 * The column that ties all three files together. A "session" is one hectare,
 * surveyed during one shift (AM/PM), on one day.
 */
const sessionKey =(row: Row) => `${row.Hectare}|${row.Shift}|${row.Date}`;

const loadCsv = async (url: string) => {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to load ${url}: ${response.status}`);
	}
	return csvParse(await response.text());
};
//#endregion

//#region Row converters

const toSquirrel = (row: Row): Squirrel => ({
	id: row["Unique Squirrel ID"],
	hectare: row.Hectare,
	shift: row.Shift as Shift,
	date: parseDate(row.Date),
	sessionKey: sessionKey(row),
	lon: +row.X,
	lat: +row.Y,
	age: row.Age,
	furColor: row["Primary Fur Color"],
	highlightColor: row["Highlight Fur Color"],
	location: row.Location,
	aboveGroundFeet: parseNumber(row["Above Ground Sighter Measurement"]),
	activities: {
		running: parseBool(row.Running),
		chasing: parseBool(row.Chasing),
		climbing: parseBool(row.Climbing),
		eating: parseBool(row.Eating),
		foraging: parseBool(row.Foraging),
	},
	sounds: {
		kuks: parseBool(row.Kuks),
		quaas: parseBool(row.Quaas),
		moans: parseBool(row.Moans),
	},
	tail: {
		flags: parseBool(row["Tail flags"]),
		twitches: parseBool(row["Tail twitches"]),
	},
	humans: {
		approaches: parseBool(row.Approaches),
		indifferent: parseBool(row.Indifferent),
		runsFrom: parseBool(row["Runs from"]),
	},
	otherActivities: row["Other Activities"] ?? "",
	otherInteractions: row["Other Interactions"] ?? "",
});

const toSurvey = (row: Row): Survey => ({
	weather: row["Sighter Observed Weather Data"] ?? "",
	litter: row.Litter ?? "",
	otherAnimals: row["Other Animal Sightings"] ?? "",
	conditions: row["Hectare Conditions"] ?? "",
});

const STORY_TOPIC_PREFIX = "Story Topic: ";

const toStory = (row: Row): Story => ({
	text: row["Note Squirrel & Park Stories"] ?? "",
	topics: Object.keys(row)
		.filter((col) => col.startsWith(STORY_TOPIC_PREFIX) && parseBool(row[col]))
		.map((col) => col.slice(STORY_TOPIC_PREFIX.length)),
});
//#endregion

/**
 * Loads all three CSVs and joins them by session (hectare + shift + date).
 *
 * Note: stories.csv covers ~190 sessions that have no hectare.csv row (often
 * "no squirrels seen" visits), and 9 squirrels in 09I have no hectare.csv row
 * either - those sessions are still created, just with `survey: null`.
 *
 * Squirrels with no recorded fur color or location are left out entirely.
 */
export const loadSquirrelCensus = async (): Promise<SquirrelCensus> => {
	const [hectareRows, squirrelRows, storyRows] = await Promise.all([
		loadCsv("data/hectare.csv"),
		loadCsv("data/squirrels.csv"),
		loadCsv("data/stories.csv"),
	]);

	const sessions = new Map<string, Session>();

	const getSession = (row: Row) => {
		const key = sessionKey(row);
		let session = sessions.get(key);
		if (!session) {
			session = { survey: null, squirrels: [], stories: [] };
			sessions.set(key, session);
		}
		return session;
	};

	hectareRows.forEach((row) => {
		getSession(row).survey = toSurvey(row);
	});

	const squirrels = squirrelRows
		.filter((row) => row["Primary Fur Color"] && row.Location)
		.map((row) => {
			const squirrel = toSquirrel(row);
			getSession(row).squirrels.push(squirrel);
			return squirrel;
		});

	storyRows.forEach((row) => getSession(row).stories.push(toStory(row)));

	return { squirrels, sessions };
};
