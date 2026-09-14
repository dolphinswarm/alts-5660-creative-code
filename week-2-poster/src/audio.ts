import * as Tone from "tone";
import { CLIP_BARS, reactiveRoleOfDrumEvent } from "./music.js";
import type {
	DrumEvent,
	ReactiveRole,
	MidiClip,
	PitchedEvent,
	Instruments,
} from "./music.js";

//#region Types / Consts
type NoteCallback = (role: ReactiveRole) => void;
// Drum hits get Players; guitar/bass need pitch changes, so they get Samplers
// https://tonejs.github.io/docs/r13/Player
// https://tonejs.github.io/docs/r13/Sampler
type Voices = Record<
	"kick" | "snare" | "crash" | "openHat" | "closedHat",
	Tone.Player
> &
	Record<Instruments, Tone.Sampler>;

const AUDIO_BASE = "audio/";
const GUITAR_BASE_NOTE = "Eb3";
const BASS_BASE_NOTE = "C2";

const DRUM_VOICE_KEY: Record<
	DrumEvent["drum"],
	"kick" | "snare" | "crash" | "openHat" | "closedHat"
> = {
	kick: "kick",
	snare: "snare",
	crash: "crash",
	openhat: "openHat",
	closedhat: "closedHat",
};

let voicesReady: Promise<Voices> | undefined; // <- Ensures that all the samples are loaded
//#endregion

/** The shared Player/Sampler set, built the first time we need to play a song (aka, lazily-loaded) */
const loadVoices = (): Promise<Voices> => {
	if (!voicesReady) {
		voicesReady = (async () => {
			const voices: Voices = {
				kick: new Tone.Player(`${AUDIO_BASE}kick.mp3`).toDestination(),
				snare: new Tone.Player(
					`${AUDIO_BASE}snare.mp3`,
				).toDestination(),
				crash: new Tone.Player(
					`${AUDIO_BASE}crash.mp3`,
				).toDestination(),
				openHat: new Tone.Player(
					`${AUDIO_BASE}open-hat.mp3`,
				).toDestination(),
				closedHat: new Tone.Player(
					`${AUDIO_BASE}closed-hat.mp3`,
				).toDestination(),
				guitar: new Tone.Sampler({
					urls: { [GUITAR_BASE_NOTE]: `${AUDIO_BASE}guitar.mp3` },
				}).toDestination(),
				bass: new Tone.Sampler({
					urls: { [BASS_BASE_NOTE]: `${AUDIO_BASE}bass.mp3` },
				}).toDestination(),
			};
			await Tone.loaded();
			return voices;
		})();
	}
	return voicesReady;
};
//#endregion

//#region Playback
let activeParts: Tone.Part[] = [];

export const isPlaying = () => activeParts.length > 0;

/** Stops and resets the audio player */
export const stopClip = () => {
	activeParts.forEach((part) => part.dispose());
	activeParts = [];

	const transport = Tone.getTransport();
	transport.stop();
	transport.cancel();
	transport.seconds = 0;
};

/** Schedules a drum track as a Tone.Part */
const scheduleDrums = (
	events: DrumEvent[],
	onNote: NoteCallback,
	voices: Voices,
) => {
	const part = new Tone.Part((time, event) => {
		voices[DRUM_VOICE_KEY[event.drum]].start(time);
		Tone.getDraw().schedule(
			() => onNote(reactiveRoleOfDrumEvent(event.drum)),
			time,
		);
	}, events).start(0);
	activeParts.push(part);
};

/** Schedules a guitar/bass track as a Tone.Part */
const schedulePitched = (
	role: Instruments,
	sampler: Tone.Sampler,
	events: PitchedEvent[],
	onNote: NoteCallback,
) => {
	const part = new Tone.Part((time, event) => {
		sampler.triggerAttackRelease(event.note, event.duration, time);
		Tone.getDraw().schedule(() => onNote(role), time);
	}, events).start(0);
	activeParts.push(part);
};

/** Plays "clip" on loop, firing "onNote" for every scheduled note */
export const playClip = async (clip: MidiClip, onNote: NoteCallback) => {
	await Tone.start();
	const voices = await loadVoices();
	stopClip();

	const transport = Tone.getTransport();
	transport.bpm.value = clip.tempo;

	if (clip.tracks.drums) {
		scheduleDrums(clip.tracks.drums, onNote, voices);
	}
	if (clip.tracks.guitar) {
		schedulePitched("guitar", voices.guitar, clip.tracks.guitar, onNote);
	}
	if (clip.tracks.bass) {
		schedulePitched("bass", voices.bass, clip.tracks.bass, onNote);
	}

	const loopEnd = `${CLIP_BARS}m`;
	activeParts.forEach((part) => {
		part.loop = true;
		part.loopEnd = loopEnd;
	});

	transport.start();
};
//#endregion

