import * as React from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { DRACO_GLTF_CONFIG, DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { EnvironmentControls, TilesPlugin, TilesRenderer } from "3d-tiles-renderer/r3f";
import type {
	EnvironmentControls as EnvironmentControlsImpl,
	TilesRenderer as TilesRendererImpl,
} from "3d-tiles-renderer/three";
import {
	GoogleCloudAuthPlugin,
	GLTFExtensionsPlugin,
	ReorientationPlugin,
	TileCompressionPlugin,
	TilesFadePlugin,
} from "3d-tiles-renderer/plugins";
import type { SquirrelCensus } from "../data.js";
import type { SquirrelModel } from "../squirrel-model.js";
import { createFlight, type Flight, getSquirrelViewPose, type Pose, stepFlight } from "./flight.js";
import { keepCameraAboveGround, queueSquirrelSnaps } from "./ground.js";
import { createHerd, pickSquirrel, placeHerd } from "./herd.js";
import {
	clampCameraToPark,
	computeParkFrame,
	getOverviewPose,
	getPlaceholderPose,
	latLonToScene,
	PARK_CENTER,
	type ParkFrame,
} from "./park.js";
import { SelectedPin, SquirrelHerd } from "./squirrel-herd.js";

// Google Map Tiles API key - https://developers.google.com/maps/documentation/tile/3d-tiles
// Vite inlines it at build time - locally from this folder's gitignored .env,
// and in the deploy workflow from a GitHub secret. It ships to the browser
// either way, so restrict it (in Google Cloud Console) to HTTP referrers for
// localhost and your GitHub Pages site.
const GOOGLE_API_KEY: string | undefined = import.meta.env.GOOGLE_API_KEY;
if (!GOOGLE_API_KEY) {
	throw new Error("GOOGLE_API_KEY missing from .env");
}

// How far the camera may tilt away from looking straight down. Keeping it
// steep means it never looks out at the horizon (and loads far fewer tiles).
const MAX_CAMERA_TILT = THREE.MathUtils.degToRad(45);
// A click that moves less than this (in screen pixels) isn't a drag.
const CLICK_MAX_MOVE_PX = 5;

// useFrame priorities, lowest first. The controls wrapper updates at -1 and
// the tiles at 0 - anything above 0 would take over rendering.
const FLIGHT_PRIORITY = -2;
const CAMERA_LIMITS_PRIORITY = -0.5;

// The glTF-only decoder build, bundled by Vite from three's own copy.
const dracoLoader = new DRACOLoader().setDecoderPath(DRACO_GLTF_CONFIG);

// Module-level so they're the same objects every render - TilesPlugin re-creates
// its plugin (losing e.g. the Google session) whenever "args" changes, compared
// only one level deep.
const GOOGLE_AUTH_ARGS: ConstructorParameters<typeof GoogleCloudAuthPlugin> = [
	{ apiToken: GOOGLE_API_KEY, autoRefreshToken: true },
];
const GLTF_ARGS: ConstructorParameters<typeof GLTFExtensionsPlugin> = [{ dracoLoader }];
const REORIENTATION_ARGS: ConstructorParameters<typeof ReorientationPlugin> = [
	{ lat: PARK_CENTER.lat * THREE.MathUtils.DEG2RAD, lon: PARK_CENTER.lon * THREE.MathUtils.DEG2RAD },
];

export type SquirrelMapHandle = {
	/** Selects squirrel "index" and flies to it. */
	focusSquirrel: (index: number) => void;
	showPark: () => void;
};

type Props = {
	/** Null while loading - the tiles start streaming in meanwhile. */
	census: SquirrelCensus | null;
	model: SquirrelModel | null;
	/** 1 per squirrel that passes the filters */
	shown: Uint8Array;
	selected: number;
	/** -1 to deselect */
	onSelect: (index: number) => void;
	/** Google requires its data attributions to be shown alongside the tiles. */
	onAttribution: (text: string) => void;
	onTilesError: () => void;
	ref?: React.Ref<SquirrelMapHandle>;
};

/** Central Park in Google's photorealistic 3D tiles, with every squirrel from the census on it. */
export const SquirrelMap = ({ census, model, shown, selected, onSelect, onAttribution, onTilesError, ref }: Props) => {
	const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
	const canvas = useThree((state) => state.gl.domElement);
	const herd = React.useMemo(() => (census && model ? createHerd(census, model) : null), [census, model]);
	const tiles = React.useRef<TilesRendererImpl>(null);
	const controls = React.useRef<EnvironmentControlsImpl>(null);
	const park = React.useRef<ParkFrame | null>(null);
	const flight = React.useRef<Flight | null>(null);
	const cameraBeforeControls = React.useMemo(() => new THREE.Vector3(), []);

	React.useLayoutEffect(() => {
		const { position, rotation } = getPlaceholderPose();
		camera.position.copy(position);
		camera.quaternion.copy(rotation);
	}, [camera]);

	React.useEffect(() => {
		if (!herd) {
			return;
		}
		herd.shown.set(shown);
		herd.dirty = true;
	}, [herd, shown]);

	//#region Flights
	/** Glides the camera to "pose", with the controls paused for the trip. */
	const flyTo = React.useCallback(
		(pose: Pose) => {
			flight.current = createFlight(camera, pose);
			if (controls.current) controls.current.enabled = false;
		},
		[camera],
	);
	const endFlight = React.useCallback(() => {
		flight.current = null;
		if (controls.current) controls.current.enabled = true;
	}, []);

	const focusSquirrel = React.useCallback(
		(index: number) => {
			if (!herd?.placed || !tiles.current || !controls.current) {
				return;
			}
			onSelect(index);
			flyTo(getSquirrelViewPose(herd, index, camera, tiles.current.group, controls.current.cameraRadius));
		},
		[herd, camera, onSelect, flyTo],
	);
	const showPark = React.useCallback(() => {
		if (park.current) flyTo(getOverviewPose(park.current, camera));
	}, [camera, flyTo]);
	React.useImperativeHandle(ref, () => ({ focusSquirrel, showPark }), [focusSquirrel, showPark]);
	//#endregion

	//#region Frame loop
	useFrame((_, delta) => {
		// Clamped so a backgrounded tab doesn't jump on return.
		if (flight.current && stepFlight(flight.current, camera, Math.min(delta, 0.1))) {
			endFlight();
		}
		cameraBeforeControls.copy(camera.position);
	}, FLIGHT_PRIORITY);

	useFrame(() => {
		const group = tiles.current?.group;
		if (!group) {
			return;
		}
		// Waits a frame after the root tileset loads rather than listening for it,
		// so ReorientationPlugin has always moved the globe into place first.
		if (herd && census && !herd.placed && tiles.current?.root) {
			group.updateMatrixWorld(true);
			placeHerd(herd, census, (lat, lon) => latLonToScene(group, lat, lon));
			park.current = computeParkFrame(herd, group);
			const overview = getOverviewPose(park.current, camera);
			camera.position.copy(overview.position);
			camera.quaternion.copy(overview.rotation);
			// The tiles under the overview may have all loaded already, with no
			// "tiles-load-end" still to come.
			queueSquirrelSnaps(herd, camera);
		}
		if (park.current && !flight.current) {
			clampCameraToPark(park.current, camera, cameraBeforeControls);
		}
		keepCameraAboveGround(camera, group);
		camera.updateMatrixWorld();
	}, CAMERA_LIMITS_PRIORITY);
	//#endregion

	//#region Picking
	React.useEffect(() => {
		if (!herd) {
			return;
		}
		let pressing = false;
		let pressStart = { x: 0, y: 0 };
		const isDrag = (event: MouseEvent) =>
			Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > CLICK_MAX_MOVE_PX;
		const onPointerDown = (event: PointerEvent) => {
			pressing = event.button === 0;
			pressStart = { x: event.clientX, y: event.clientY };
		};
		const onPointerUp = (event: PointerEvent) => {
			const wasPressing = pressing;
			pressing = false;
			if (!wasPressing || isDrag(event)) {
				return;
			}
			const index = pickSquirrel(herd, camera, canvas, event.clientX, event.clientY);
			if (index >= 0) {
				focusSquirrel(index);
			} else {
				onSelect(-1);
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.code === "Escape") onSelect(-1);
		};
		const onPointerMove = (event: PointerEvent) => {
			if (event.buttons === 0) {
				canvas.style.cursor = pickSquirrel(herd, camera, canvas, event.clientX, event.clientY) >= 0 ? "pointer" : "grab";
			} else {
				canvas.style.cursor = "grabbing";
			}
		};
		// Grabbing the map mid-flight hands control straight back. Capture phase so
		// this runs before the controls' own listeners, which ignore input while paused.
		const onGrab = () => flight.current && endFlight();
		canvas.addEventListener("pointerdown", onPointerDown);
		canvas.addEventListener("pointerup", onPointerUp);
		canvas.addEventListener("keydown", onKeyDown);
		canvas.addEventListener("pointermove", onPointerMove);
		canvas.addEventListener("pointerdown", onGrab, { capture: true, passive: true });
		canvas.addEventListener("wheel", onGrab, { capture: true, passive: true });
		return () => {
			canvas.removeEventListener("pointerdown", onPointerDown);
			canvas.removeEventListener("pointerup", onPointerUp);
			canvas.removeEventListener("keydown", onKeyDown);
			canvas.removeEventListener("pointermove", onPointerMove);
			canvas.removeEventListener("pointerdown", onGrab, { capture: true });
			canvas.removeEventListener("wheel", onGrab, { capture: true });
		};
	}, [canvas, camera, herd, focusSquirrel, onSelect, endFlight]);
	//#endregion

	// Stable, since TilesRenderer re-adds its listeners whenever these change.
	const handleTilesLoadEnd = React.useCallback(() => {
		if (!tiles.current) {
			return;
		}
		const attributions: { type: string; value: string }[] = [];
		tiles.current.getAttributions(attributions);
		onAttribution(
			attributions
				.filter((attribution) => attribution.type === "string")
				.map((attribution) => attribution.value)
				.join(" "),
		);
		if (herd?.placed) {
			queueSquirrelSnaps(herd, camera);
		}
	}, [herd, camera, onAttribution]);

	// Single tiles failing (they log themselves) leave the map usable - only
	// the root tileset failing, "tile" null, means there's no map at all.
	const handleLoadError = React.useCallback(
		(event: { tile: object | null; error: Error }) => {
			if (event.tile) {
				return;
			}
			console.error("3D tiles failed to load:", event.error);
			onTilesError();
		},
		[onTilesError],
	);

	return (
		<>
			<color attach="background" args={[0x151c1f]} />
			{/* Google's tiles are unlit, so these only affect the squirrels. */}
			<hemisphereLight args={[0xdde8ff, 0x3a4a2a, 1.5]} />
			<directionalLight position={[-1, 2, 1]} intensity={2} />

			{/* https://github.com/NASA-AMMOS/3DTilesRendererJS */}
			<TilesRenderer ref={tiles} onTilesLoadEnd={handleTilesLoadEnd} onLoadError={handleLoadError}>
				<TilesPlugin plugin={GoogleCloudAuthPlugin} args={GOOGLE_AUTH_ARGS} />
				<TilesPlugin plugin={TileCompressionPlugin} />
				<TilesPlugin plugin={TilesFadePlugin} />
				<TilesPlugin plugin={GLTFExtensionsPlugin} args={GLTF_ARGS} />
				{/* Moves/rotates the whole globe so PARK_CENTER sits at (0, 0, 0) with +Y up. */}
				<TilesPlugin plugin={ReorientationPlugin} args={REORIENTATION_ARGS} />
			</TilesRenderer>

			{/*
			 * Map-style controls for 3D tiles: drag pans, scroll zooms toward the cursor,
			 * right-drag (or Shift-drag) rotates. Their built-in collision keeps the camera
			 * above the *highest* surface (usually treetops), which shoves it up whenever a
			 * rotation swings under a canopy, so keepCameraAboveGround() replaces it.
			 * maxAltitude is, despite the name, measured from straight down.
			 */}
			<EnvironmentControls
				ref={controls}
				enableDamping
				minDistance={3}
				maxDistance={5000}
				cameraRadius={3}
				adjustHeight={false}
				maxAltitude={MAX_CAMERA_TILT}
			/>

			{herd ? (
				<>
					<SquirrelHerd herd={herd} tiles={tiles} />
					<SelectedPin herd={herd} selected={selected} />
				</>
			) : null}
		</>
	);
};
