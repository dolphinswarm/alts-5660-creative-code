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
	options: [...flags, { label: noneLabel, matches: (squirrel) => !flags.some((flag) => flag.matches(squirrel)) }],
});

/**
 * A squirrel passes a group if it matches any checked option. Everything
 * starts checked, so every squirrel is shown.
 */
const FILTER_GROUPS: FilterGroup[] = [
	{
		label: "Fur",
		options: [
			{ label: "Gray", matches: (squirrel) => squirrel.furColor === "Gray" },
			{ label: "Cinnamon", matches: (squirrel) => squirrel.furColor === "Cinnamon" },
			{ label: "Black", matches: (squirrel) => squirrel.furColor === "Black" },
		],
	},
	{
		label: "Shift",
		options: [
			{ label: "AM", matches: (squirrel) => squirrel.shift === "AM" },
			{ label: "PM", matches: (squirrel) => squirrel.shift === "PM" },
		],
	},
	{
		label: "Where",
		options: [
			{ label: "On the ground", matches: (squirrel) => squirrel.location === "Ground Plane" },
			{ label: "Up a tree", matches: (squirrel) => squirrel.location === "Above Ground" },
		],
	},
	flagGroup(
		"Actions",
		[
			{ label: "Running", matches: (squirrel) => squirrel.activities.running },
			{ label: "Chasing", matches: (squirrel) => squirrel.activities.chasing },
			{ label: "Climbing", matches: (squirrel) => squirrel.activities.climbing },
			{ label: "Eating", matches: (squirrel) => squirrel.activities.eating },
			{ label: "Foraging", matches: (squirrel) => squirrel.activities.foraging },
			{ label: "Approaching people", matches: (squirrel) => squirrel.humans.approaches },
		],
		"None of these",
	),
	flagGroup(
		<>
			Sounds <SoundsLink />
		</>,
		[
			{ label: <GlossaryTerm term="kuks" />, matches: (squirrel) => squirrel.sounds.kuks },
			{ label: <GlossaryTerm term="quaas" />, matches: (squirrel) => squirrel.sounds.quaas },
			{ label: <GlossaryTerm term="moans" />, matches: (squirrel) => squirrel.sounds.moans },
		],
		"Silent",
	),
	flagGroup(
		"Tail",
		[
			{ label: <GlossaryTerm term="flags" />, matches: (squirrel) => squirrel.tail.flags },
			{ label: <GlossaryTerm term="twitches" />, matches: (squirrel) => squirrel.tail.twitches },
		],
		"Still",
	),
];

/** Which boxes are checked, by group then option. */
type FilterChecks = boolean[][];

export const DEFAULT_FILTER_CHECKS: FilterChecks = FILTER_GROUPS.map((group) => group.options.map(() => true));

/** A test for whether a squirrel passes the filters checked in "checks". */
export const matchesFilters = (checks: FilterChecks) => {
	const checkedByGroup = FILTER_GROUPS.map((group, groupIndex) =>
		group.options.filter((_, optionIndex) => checks[groupIndex][optionIndex]),
	);
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

	const toggle = (groupIndex: number, optionIndex: number) => {
		const next = checks.map((groupChecks) => [...groupChecks]);
		next[groupIndex][optionIndex] = !next[groupIndex][optionIndex];
		onChange(next);
	};

	return (
		<>
			{FILTER_GROUPS.map((group, groupIndex) => (
				<fieldset key={groupIndex}>
					<legend>{group.label}</legend>
					{group.options.map((option, optionIndex) => (
						<label key={optionIndex}>
							<input
								type="checkbox"
								checked={checks[groupIndex][optionIndex]}
								onChange={() => toggle(groupIndex, optionIndex)}
							/>{" "}
							{option.label} <span className="count">{counts[groupIndex][optionIndex]}</span>
						</label>
					))}
				</fieldset>
			))}
		</>
	);
};
