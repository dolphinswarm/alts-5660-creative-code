import { randomChoice, randomInteger } from "./utils.js";

//#region Types / Consts
type Drums = "kick" | "snare" | "crash" | "openhat" | "closedhat";
export type Instruments = "guitar" | "bass";

type TimedEvent = { time: string };
export type DrumEvent = TimedEvent & { drum: Drums };
export type PitchedEvent = TimedEvent & { note: string; duration: string };
type ScaleStep = Omit<PitchedEvent, "note"> & { semitone: number };
type Step = number | null;

export type MidiClip = {
	tempo: number;
	tracks: { drums?: DrumEvent[] } & Partial<
		Record<Instruments, PitchedEvent[]>
	>;
};

export const CLIP_BARS = 4;
const STEPS_PER_CLIP = CLIP_BARS * 8; // 8 eighth-note steps per bar

// Every reactive role, drums (hihat combines open/closed) then instruments
const ALL_REACTIVE_ROLES = [
	"kick",
	"snare",
	"crash",
	"hihat",
	"guitar",
	"bass",
] as const;
export type ReactiveRole = (typeof ALL_REACTIVE_ROLES)[number];

const DRUM_EVENT_REACTIVE_ROLE: Record<Drums, ReactiveRole> = {
	kick: "kick",
	snare: "snare",
	crash: "crash",
	openhat: "hihat",
	closedhat: "hihat",
};

const MIN_TEMPO = 90;
const MAX_TEMPO = 170;

// Full octave of shifts, centered on 0
const MIN_KEY_SHIFT = -6;
const MAX_KEY_SHIFT = 5;

const PITCH_CLASS: Record<string, number> = {
	C: 0,
	D: 2,
	E: 4,
	F: 5,
	G: 7,
	A: 9,
	B: 11,
};
const SHARP_NAMES = [
	"C",
	"C#",
	"D",
	"D#",
	"E",
	"F",
	"F#",
	"G",
	"G#",
	"A",
	"A#",
	"B",
];

const GUITAR_ANCHOR = "C3";
const BASS_ANCHOR = "C2";
//#endregion

//#region Patterns
/** Eighth-note step index -> Tone's bar:beat:sixteenth notation */
const stepToBarBeatSixteenth = (step: number): string => {
	const bar = Math.floor(step / 8);
	const beat = Math.floor((step % 8) / 2);
	const sixteenth = (step % 2) * 2;
	return `${bar}:${beat}:${sixteenth}`;
};

/** Plops "drum" down on every step index in "steps" */
const drumSteps = (drum: DrumEvent["drum"], steps: number[]): DrumEvent[] =>
	steps.map((step) => ({ time: stepToBarBeatSixteenth(step), drum }));

/** Builds a melody from a pattern */
const melody = (pattern: Step[], duration: string): ScaleStep[] =>
	everyStep()
		.filter((step) => pattern[step % pattern.length] !== null)
		.map((step) => ({
			time: stepToBarBeatSixteenth(step),
			semitone: pattern[step % pattern.length] as number,
			duration,
		}));

/** Every step in the clip, optionally starting partway in */
const everyStep = (offset = 0) =>
	Array.from({ length: STEPS_PER_CLIP - offset }, (_, i) => offset + i);

/** Shifts a pattern by "amount" semitones */
const transposePattern = (pattern: Step[], amount: number): Step[] =>
	pattern.map((step) => (step === null ? null : step + amount));

const ROCK_PROGRESSION: Step[] = [0, 3, 5, 7].flatMap(
	(step) => Array(8).fill(step) as Step[],
);
const RIFF_1: Step[] = [0, 0, -2, 0, null, null, null, -2];
const RIFF_2: Step[] = [0, 3, 5, 7, null, null, 5, 3];
const OFFBEAT: Step[] = [null, null, 0, null, null, null, 0, null]; // ska/reggae off-beat stab

const STANDARD_BACKBEAT: DrumEvent[] = [
	...drumSteps("snare", [4, 12, 20, 28]),
	...drumSteps("crash", [0, 16]),
	...drumSteps("openhat", [15, 31]),
	...drumSteps(
		"closedhat",
		everyStep(1).filter((s) => s % 16 !== 15 && s !== 16),
	),
];

const DRUM_PATTERNS: DrumEvent[][] = [
	[...drumSteps("kick", [0, 4, 8, 12, 16, 20, 24, 28]), ...STANDARD_BACKBEAT],
	[...drumSteps("kick", [0, 8, 16, 24]), ...STANDARD_BACKBEAT],
	[
		...drumSteps("kick", [3, 6, 8, 11, 14, 19, 22, 27, 30]),
		...drumSteps("snare", [4, 12, 20, 25, 26, 28, 29, 31]),
		...drumSteps("crash", [0, 16]),
		...drumSteps("openhat", [22]),
		...drumSteps("closedhat", [2, 4, 6, 8, 10, 12, 14, 18, 20]),
	],
	[
		...drumSteps(
			"kick",
			everyStep().filter((step) => step % 2 === 0),
		),
		...drumSteps(
			"snare",
			everyStep().filter((step) => step % 2 === 1),
		),
		...drumSteps("crash", [0, 16]),
	],
	[
		...drumSteps("kick", [0, 5, 8, 13, 16, 21, 24]),
		...drumSteps(
			"snare",
			[2, 6, 7, 10, 14, 15, 18, 22, 23, 26, 27, 28, 29, 30, 31],
		),
		...drumSteps("crash", [0]),
		...drumSteps("openhat", [15]),
		...drumSteps("closedhat", [1, 3, 4, 9, 11, 12, 17, 19, 20]),
	],
];

const GUITAR_PATTERNS: ScaleStep[][] = [
	melody([0, null, 0, null, 3, null, 5, null], "8n"),
	melody(OFFBEAT, "16n"),
	melody([0, 3, 3, 0], "4n"),
	melody(ROCK_PROGRESSION, "8n"),
	melody(RIFF_1, "8n"),
	melody(RIFF_2, "8n"),
];

const BASS_PATTERNS: ScaleStep[][] = [
	melody([0, null, null, null, null, 0, null, null], "4n"),
	melody(OFFBEAT, "8n"),
	melody([0, null, null, null, null, null, null, -2], "2n"),
	melody(ROCK_PROGRESSION, "8n"),
	melody(
		[
			...RIFF_1,
			...RIFF_1,
			...transposePattern(RIFF_1, 5),
			...transposePattern(RIFF_1, 5),
		],
		"8n",
	),
	melody(RIFF_2, "4n"),
];
//#endregion

//#region Reactive roles
/** Which reactive role a drum hit should pulse */
export const reactiveRoleOfDrumEvent = (drum: Drums): ReactiveRole =>
	DRUM_EVENT_REACTIVE_ROLE[drum];

/** Every reactive role actually present in "clip" */
export const activeReactiveRoles = (clip: MidiClip): ReactiveRole[] => {
	const present = new Set<ReactiveRole>();
	clip.tracks.drums?.forEach((event) =>
		present.add(reactiveRoleOfDrumEvent(event.drum)),
	);
	if (clip.tracks.guitar) {
		present.add("guitar");
	}
	if (clip.tracks.bass) {
		present.add("bass");
	}
	return ALL_REACTIVE_ROLES.filter((role) => present.has(role));
};
//#endregion

//#region Clips
/** Shifts a note name (e.g. "Eb3") by "semitones", respelled with sharps */
const transposeNote = (note: string, semitones: number): string => {
	const match = note.match(/^([A-G])(#|b)?(-?\d+)$/);
	if (!match) {
		throw new Error(`Not a note: ${note}`);
	}
	const [, letter, accidental, octaveStr] = match;
	const accidentalOffset =
		accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
	const absoluteSemitone =
		parseInt(octaveStr, 10) * 12 +
		PITCH_CLASS[letter] +
		accidentalOffset +
		semitones;
	const octave = Math.floor(absoluteSemitone / 12);
	const pitchClass = ((absoluteSemitone % 12) + 12) % 12;
	return `${SHARP_NAMES[pitchClass]}${octave}`;
};

/** Turns a pattern's semitone offsets into real note names */
const resolveNotes = (
	pattern: ScaleStep[],
	anchor: string,
	keyShift: number,
): PitchedEvent[] =>
	pattern.map(({ time, semitone, duration }) => ({
		time,
		duration,
		note: transposeNote(anchor, semitone + keyShift),
	}));

/** Generates a random clip: key and tracks*/
export const generateClip = (): MidiClip => {
	const keyShift = randomInteger(MIN_KEY_SHIFT, MAX_KEY_SHIFT);
	return {
		tempo: randomInteger(MIN_TEMPO, MAX_TEMPO),
		tracks: {
			drums: randomChoice(DRUM_PATTERNS),
			guitar: resolveNotes(
				randomChoice(GUITAR_PATTERNS),
				GUITAR_ANCHOR,
				keyShift,
			),
			bass: resolveNotes(
				randomChoice(BASS_PATTERNS),
				BASS_ANCHOR,
				keyShift,
			),
		},
	};
};
//#endregion

