import * as React from "react";
import type { Squirrel } from "./data.js";
import { GlossaryTerm, SoundsLink } from "./glossary.js";

type FilterOption = {
	label: React.ReactNode;
	matches: (squirrel: Squirrel) => boolean;
};

type FilterGroup = {
	label: React.ReactNode;
	options: FilterOption[];
};

/**
 * A group of yes/no flags, which a squirrel can have several of or none,
 * plus a last option for the squirrels with none of them.
 */
const flagGroup = (label: React.ReactNode, flags: FilterOption[], noneLabel: string): FilterGroup => ({
	label,
	options: [...flags, { label: noneLabel, matches: (s) => !flags.some((flag) => flag.matches(s)) }],
});

/**
 * A squirrel passes a group if it matches any checked option. Everything
 * starts checked, so every squirrel is shown.
 */
const FILTER_GROUPS: FilterGroup[] = [
	{
		label: "Fur",
		options: [
			{ label: "Gray", matches: (s) => s.furColor === "Gray" },
			{ label: "Cinnamon", matches: (s) => s.furColor === "Cinnamon" },
			{ label: "Black", matches: (s) => s.furColor === "Black" },
		],
	},
	{
		label: "Shift",
		options: [
			{ label: "AM", matches: (s) => s.shift === "AM" },
			{ label: "PM", matches: (s) => s.shift === "PM" },
		],
	},
	{
		label: "Where",
		options: [
			{ label: "On the ground", matches: (s) => s.location === "Ground Plane" },
			{ label: "Up a tree", matches: (s) => s.location === "Above Ground" },
		],
	},
	flagGroup(
		"Actions",
		[
			{ label: "Running", matches: (s) => s.activities.running },
			{ label: "Chasing", matches: (s) => s.activities.chasing },
			{ label: "Climbing", matches: (s) => s.activities.climbing },
			{ label: "Eating", matches: (s) => s.activities.eating },
			{ label: "Foraging", matches: (s) => s.activities.foraging },
			{ label: "Approaching people", matches: (s) => s.humans.approaches },
		],
		"None of these",
	),
	flagGroup(
		<>
			Sounds <SoundsLink />
		</>,
		[
			{ label: <GlossaryTerm term="kuks" />, matches: (s) => s.sounds.kuks },
			{ label: <GlossaryTerm term="quaas" />, matches: (s) => s.sounds.quaas },
			{ label: <GlossaryTerm term="moans" />, matches: (s) => s.sounds.moans },
		],
		"Silent",
	),
	flagGroup(
		"Tail",
		[
			{ label: <GlossaryTerm term="flags" />, matches: (s) => s.tail.flags },
			{ label: <GlossaryTerm term="twitches" />, matches: (s) => s.tail.twitches },
		],
		"Still",
	),
];

/** Which boxes are checked, by group then option. */
type FilterChecks = boolean[][];

export const DEFAULT_FILTER_CHECKS: FilterChecks = FILTER_GROUPS.map((group) => group.options.map(() => true));

/** A test for whether a squirrel passes the filters checked in "checks". */
export const matchesFilters = (checks: FilterChecks) => {
	const checkedByGroup = FILTER_GROUPS.map((group, g) => group.options.filter((_, o) => checks[g][o]));
	return (squirrel: Squirrel) =>
		checkedByGroup.every((checked) => checked.some((option) => option.matches(squirrel)));
};

type Props = {
	squirrels: Squirrel[];
	checks: FilterChecks;
	onChange: (checks: FilterChecks) => void;
};

/** The filter checkboxes, with how many squirrels each matches. */
export const SquirrelFilters = ({ squirrels, checks, onChange }: Props) => {
	const counts = React.useMemo(
		() =>
			FILTER_GROUPS.map((group) =>
				group.options.map((option) => squirrels.filter(option.matches).length.toLocaleString()),
			),
		[squirrels],
	);

	const toggle = (g: number, o: number) =>
		onChange(checks.map((group, gi) => (gi === g ? group.map((checked, oi) => (oi === o ? !checked : checked)) : group)));

	return (
		<>
			{FILTER_GROUPS.map((group, g) => (
				<fieldset key={g}>
					<legend>{group.label}</legend>
					{group.options.map((option, o) => (
						<label key={o}>
							<input type="checkbox" checked={checks[g][o]} onChange={() => toggle(g, o)} /> {option.label}{" "}
							<span className="count">{counts[g][o]}</span>
						</label>
					))}
				</fieldset>
			))}
		</>
	);
};
