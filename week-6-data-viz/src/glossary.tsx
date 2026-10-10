/**
 * What the census's squirrel jargon means. Definitions are from the dataset's
 * column descriptions on NYC Open Data; "sounds like" descriptions are from
 * https://northernwoodlands.org/outside_story/article/squirrel-talk
 */
const GLOSSARY = {
	kuks: {
		label: "Kuks",
		definition:
			"A chirpy call used for a variety of reasons. Sounds like the bark of a very, very small dog.",
	},
	quaas: {
		label: "Quaas",
		definition:
			"A longer call that can mean a ground predator (like a dog) is nearby. Sounds like a raspy meow.",
	},
	moans: {
		label: "Moans",
		definition:
			"A high-pitched call that can mean an air predator (like a hawk) is nearby. A clear tone that quickly rises and slowly falls, like a sad person moaning.",
	},
	flags: {
		label: "Flagging",
		definition:
			"Whipping the tail around, as if scribbling in the air with it, to look bigger and confuse rivals or predators.",
	},
	twitches: {
		label: "Twitching",
		definition:
			"A wave running through the tail, like a breakdancer doing the arm wave. Often a sign of interest or curiosity.",
	},
};

type GlossaryKey = keyof typeof GLOSSARY;

export const isGlossaryKey = (key: string): key is GlossaryKey => key in GLOSSARY;

type GlossaryTermProps = {
	term: GlossaryKey;
};

/** A term followed by an info icon that shows its definition (see tooltip.tsx). */
export const GlossaryTerm = ({ term }: GlossaryTermProps) => {
	const { label, definition } = GLOSSARY[term];
	return (
		<>
			{label}
			<span className="info-tip" tabIndex={0} role="note" aria-label={`${label}: ${definition}`} data-tip={definition}>
				i
			</span>
		</>
	);
};

// "Squirrel Animal Sounds | Squirrel Sounds Meanings" by Cool Nature Sounds.
const SOUNDS_VIDEO_URL = "https://www.youtube.com/watch?v=-aRGf37iihI";

/** A link to a video of squirrels making the census's calls, which opens in a new tab. */
export const SoundsLink = () => (
	<a
		className="sounds-link"
		href={SOUNDS_VIDEO_URL}
		target="_blank"
		rel="noopener"
		aria-label="Hear them - a video of squirrel sounds on YouTube (opens in a new tab)"
	>
		▶ Hear them
	</a>
);
