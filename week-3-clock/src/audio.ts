import * as Tone from "tone";

// #region Types / Consts
/** How often the chord changes in seconds */
const CHORD_INTERVAL_SECONDS = 15;
export const C_MAJOR_SCALE = [
	"C3",
	"D3",
	"E3",
	"F3",
	"G3",
	"A3",
	"B3",
	"C4",
	"D4",
	"E4",
	"F4",
];
const CHORDS = [
	["E4", "A3", "G3", "C3"], // Am7
	["E4", "A3", "F3", "C3"], // Fmaj7
	["E4", "G3", "D3", "C3"], // Cadd9
	["F4", "G3", "D3", "C3"], // Dm11
];
let reverb: Tone.Reverb | undefined;

type Voice = {
	trigger: (note: string) => void;
};

let voice: Voice | undefined;
// #endregion

/** Which chord is currently active, cycling every "CHORD_INTERVAL_SECONDS" seconds */
const currentChord = (): string[] => {
	const cycle = Math.floor(Date.now() / 1000 / CHORD_INTERVAL_SECONDS);
	return CHORDS[cycle % CHORDS.length];
};

/** Shared decay tail every voice rings into, so notes fade instead of cutting off dry */
const getReverb = (): Tone.Reverb => {
	if (!reverb) {
		reverb = new Tone.Reverb({ decay: 10, wet: 0.65 }).toDestination();
	}
	return reverb;
};

/** Builds the tone that rings when a marble hits a peg */
const buildToneVoice = (): Voice => {
	const synth = new Tone.PolySynth(Tone.Synth, {
		oscillator: { type: "triangle" },
		envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 1.4 },
		volume: -10,
	}).connect(getReverb());
	return {
		trigger: (note) => {
			synth.triggerAttackRelease(note, 0.4);
		},
	};
};

/** The shared voice every collision rings on; built lazily since it must happen after Tone starts up */
const getVoice = (): Voice => {
	if (!voice) {
		voice = buildToneVoice();
	}
	return voice;
};

/** Rings a note at "noteIndex"'s degree of the current chord, or "clashNote" if given */
export const playNote = (noteIndex: number, clashNote: string | undefined) => {
	getVoice().trigger(clashNote ?? currentChord()[noteIndex]);
};

