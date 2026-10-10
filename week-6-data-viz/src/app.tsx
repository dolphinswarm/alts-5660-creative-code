import * as React from "react";
import { Canvas } from "@react-three/fiber";
import { loadSquirrelCensus, type SquirrelCensus } from "./data.js";
import { getShownSquirrels } from "./map/herd.js";
import { SquirrelMap, type SquirrelMapHandle } from "./map/squirrel-map.js";
import { DEFAULT_FILTER_CHECKS, matchesFilters, SquirrelFilters } from "./squirrel-filters.js";
import { SquirrelInfo } from "./squirrel-info.js";
import { loadSquirrelModel, type SquirrelModel } from "./squirrel-model.js";
import { Tooltip } from "./tooltip.js";

type SquirrelData = {
	census: SquirrelCensus;
	model: SquirrelModel;
};

const loadSquirrelData = async (): Promise<SquirrelData> => {
	const [census, model] = await Promise.all([loadSquirrelCensus(), loadSquirrelModel("assets/low_poly_squirrel.glb")]);
	return { census, model };
};

const App = () => {
	const [data, setData] = React.useState<SquirrelData | null>(null);
	const [tilesFailed, setTilesFailed] = React.useState(false);
	const [attribution, setAttribution] = React.useState("");
	const [checks, setChecks] = React.useState(DEFAULT_FILTER_CHECKS);
	// An object, so picking the squirrel that's already selected still counts as a change.
	const [selection, setSelection] = React.useState({ index: -1 });
	const map = React.useRef<SquirrelMapHandle>(null);
	const infoContent = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		let cancelled = false;
		loadSquirrelData().then((loaded) => {
			if (!cancelled) setData(loaded);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const squirrels = data?.census.squirrels;
	const { shown, shownCount } = React.useMemo(() => {
		const matches = matchesFilters(checks);
		const shown = Uint8Array.from(squirrels ?? [], (squirrel) => (matches(squirrel) ? 1 : 0));
		return { shown, shownCount: shown.reduce((sum, s) => sum + s, 0) };
	}, [squirrels, checks]);

	// A squirrel the filters just hid can't stay selected.
	const selected = selection.index;
	if (selected >= 0 && !shown[selected]) {
		setSelection({ index: -1 });
	}

	const handleSelect = React.useCallback((index: number) => setSelection({ index }), []);
	const handleTilesError = React.useCallback(() => setTilesFailed(true), []);

	// Every selection opens the panel scrolled to the top.
	React.useLayoutEffect(() => {
		if (infoContent.current) infoContent.current.scrollTop = 0;
	}, [selection]);

	const flyToRandomSquirrel = () => {
		const indices = getShownSquirrels(shown);
		if (indices.length > 0) {
			map.current?.focusSquirrel(indices[Math.floor(Math.random() * indices.length)]);
		}
	};

	const squirrel = squirrels && selected >= 0 ? squirrels[selected] : null;
	let status = "";
	if (tilesFailed) {
		status = "Couldn't load Google 3D tiles - check the API key.";
	} else if (!data) {
		status = "Loading squirrels...";
	}

	// The canvas comes first so the overlays, all positioned, stack above it.
	return (
		<>
			<main>
				<Canvas flat dpr={window.devicePixelRatio} camera={{ fov: 50, near: 1, far: 20000 }}>
					<SquirrelMap
						ref={map}
						census={data?.census ?? null}
						model={data?.model ?? null}
						shown={shown}
						selected={selected}
						onSelect={handleSelect}
						onAttribution={setAttribution}
						onTilesError={handleTilesError}
					/>
				</Canvas>
				{status ? <p id="status">{status}</p> : null}
				<p id="controls-help">Drag: move · Scroll: zoom · Right-drag: rotate · Click a squirrel: fly to it</p>
				<aside id="squirrel-info" hidden={!squirrel}>
					<button id="squirrel-info-close" aria-label="Close" onClick={() => handleSelect(-1)}>
						&times;
					</button>
					<div id="squirrel-info-content" ref={infoContent}>
						{squirrel ? (
							<SquirrelInfo squirrel={squirrel} session={data?.census.sessions.get(squirrel.sessionKey)} />
						) : null}
					</div>
				</aside>
				<p id="attribution">{attribution}</p>
			</main>

			<form id="filters">
				<div id="filter-groups">
					{squirrels ? <SquirrelFilters squirrels={squirrels} checks={checks} onChange={setChecks} /> : null}
				</div>
				<div id="filter-summary">
					<button type="button" onClick={() => map.current?.showPark()}>
						Show the whole park
					</button>
					<button type="button" onClick={flyToRandomSquirrel}>
						Fly to a random squirrel
					</button>
					{squirrels ? (
						<span>
							Showing {shownCount.toLocaleString()} of {squirrels.length.toLocaleString()} squirrels
						</span>
					) : null}
				</div>
			</form>

			<Tooltip />
		</>
	);
};

export default App;
