import * as React from "react";
import type { Session, Squirrel } from "./data.js";
import { GlossaryTerm, isGlossaryKey, SoundsLink } from "./glossary.js";

const formatDate = (date: Date) =>
	date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

const ACTION_LABELS = { running: "Running", chasing: "Chasing", climbing: "Climbing", eating: "Eating", foraging: "Foraging" };
const HUMAN_LABELS = { approaches: "Approached", indifferent: "Indifferent", runsFrom: "Ran away" };

const listFormat = new Intl.ListFormat("en", { type: "conjunction" });

/** Labels of the true flags, e.g. { running: true, eating: false } -> ["Running"]. */
const trueFlags = (flags: Record<string, boolean>, labels: Record<string, string>) =>
	Object.entries(flags)
		.filter(([, value]) => value)
		.map(([key]) => labels[key] ?? key);

type RowProps = {
	label: string;
	value: string | string[] | null | undefined;
	/** The census taker's own words */
	note?: string;
};

/** One "Label: value" row, skipped if empty. */
const Row = ({ label, value, note }: RowProps) => {
	const text = Array.isArray(value) ? value.join(", ") : value;
	return text || note ? (
		<>
			<dt>{label}</dt>
			<dd>
				{text}
				{note ? <q className="note">{note}</q> : null}
			</dd>
		</>
	) : null;
};

type GlossaryRowProps = {
	label: string;
	flags: Record<string, boolean>;
	children?: React.ReactNode;
};

/** Like Row, but each true flag is a glossary term. Skipped if none are true. */
const GlossaryRow = ({ label, flags, children }: GlossaryRowProps) => {
	const terms = Object.entries(flags).flatMap(([key, value]) => (value && isGlossaryKey(key) ? [key] : []));
	return terms.length ? (
		<>
			<dt>{label}</dt>
			<dd>
				{terms.map((term, termIndex) => (
					<React.Fragment key={term}>
						{termIndex > 0 ? ", " : null}
						<GlossaryTerm term={term} />
					</React.Fragment>
				))}{" "}
				{children}
			</dd>
		</>
	) : null;
};

type Props = {
	squirrel: Squirrel;
	session: Session | undefined;
};

/** One squirrel's info panel, plus its hectare's survey for that shift. */
export const SquirrelInfo = ({ squirrel, session }: Props) => {
	// e.g. "Black, Cinnamon, White" -> "Gray with black, cinnamon, and white highlights"
	const highlights = squirrel.highlightColor ? squirrel.highlightColor.toLowerCase().split(", ") : [];
	const fur = highlights.length
		? `${squirrel.furColor} with ${listFormat.format(highlights)} highlights`
		: squirrel.furColor;
	let where = "On the ground";
	if (squirrel.location === "Above Ground") {
		where = squirrel.aboveGroundFeet ? `Up a tree (~${squirrel.aboveGroundFeet} ft)` : "Up a tree";
	}

	const stories = session?.stories.filter((story) => story.text) ?? [];

	return (
		<>
			<h2>Squirrel {squirrel.id}</h2>
			<p className="subtitle">
				{formatDate(squirrel.date)} · {squirrel.shift} · Hectare {squirrel.hectare}
			</p>
			<dl>
				<Row label="Age" value={squirrel.age === "?" ? "Unknown" : squirrel.age} />
				<Row label="Fur" value={fur} />
				<Row label="Where" value={where} />
				<Row
					label="Actions"
					value={trueFlags(squirrel.activities, ACTION_LABELS)}
					note={squirrel.otherActivities}
				/>
				<GlossaryRow label="Sounds" flags={squirrel.sounds}>
					<SoundsLink />
				</GlossaryRow>
				<GlossaryRow label="Tail" flags={squirrel.tail} />
				<Row
					label="Around people"
					value={trueFlags(squirrel.humans, HUMAN_LABELS)}
					note={squirrel.otherInteractions}
				/>
			</dl>
			{session?.survey ? (
				<>
					<h3>That shift in {squirrel.hectare}</h3>
					<dl>
						<Row label="Weather" value={session.survey.weather} />
						<Row label="Conditions" value={session.survey.conditions} />
						<Row label="Litter" value={session.survey.litter} />
						<Row label="Other animals" value={session.survey.otherAnimals} />
						<Row label="Squirrels seen" value={String(session.squirrels.length)} />
					</dl>
				</>
			) : null}
			{stories.map((story, storyIndex) => (
				<blockquote key={storyIndex}>
					{story.text}
					{story.topics.length > 0 ? <footer>{story.topics.join(" · ")}</footer> : null}
				</blockquote>
			))}
		</>
	);
};
