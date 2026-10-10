import * as THREE from "three";
import type { SquirrelCensus } from "../data.js";
import type { SquirrelModel } from "../squirrel-model.js";

const FEET_TO_METERS = 0.3048;
// An eastern gray squirrel is ~45cm nose to tail.
export const SQUIRREL_LENGTH_METERS = 0.45;
// Far-off squirrels grow to at least this length per distance (~10px on screen).
const SQUIRREL_MIN_ANGULAR_SIZE = 0.015;
// How close (in screen pixels) a click/hover has to be to a squirrel to pick it.
const PICK_RADIUS_PX = 12;

const FUR_COLORS: Record<string, number> = {
	Gray: 0xbfbfbf,
	Cinnamon: 0xe0702a,
	Black: 0x2b2b2b,
};

/** Every squirrel, as flat arrays the instanced meshes and ring markers read directly. */
export type Herd = {
	count: number;
	model: SquirrelModel;
	/** Feet, in scene coordinates */
	positions: Float32Array;
	/** On the ellipsoid, before snapping */
	basePositions: Float32Array;
	/** Meters up a tree */
	climbHeights: Float32Array;
	/** Current length in meters */
	scales: Float32Array;
	/** Fixed pseudo-random facing */
	yaws: Float32Array;
	/** 1 if it passes the filters, else 0 */
	shown: Uint8Array;
	/** Geometric error of the tile its height came from (lower is more detailed) */
	groundError: Float64Array;
	/** Farthest first, so pop() takes the nearest */
	snapQueue: number[];
	placed: boolean;
	dirty: boolean;
	lastCameraPosition: THREE.Vector3;
	/** Shared by every model part */
	matrices: THREE.InstancedBufferAttribute;
	/** Per-instance fur tints */
	tints: Record<"fur" | "furDark", THREE.InstancedBufferAttribute>;
	/** Over the same arrays */
	markerAttributes: Record<"position" | "squirrelScale" | "furColor", THREE.BufferAttribute>;
};

export const createHerd = (census: SquirrelCensus, model: SquirrelModel): Herd => {
	const count = census.squirrels.length;
	const positions = new Float32Array(count * 3);
	const scales = new Float32Array(count);

	const furColor = new THREE.Color();
	const colors = new Float32Array(count * 3);
	census.squirrels.forEach((squirrel, index) => {
		furColor.setHex(FUR_COLORS[squirrel.furColor] ?? 0xffffff).toArray(colors, index * 3);
	});

	return {
		count,
		model,
		positions,
		basePositions: new Float32Array(count * 3),
		climbHeights: Float32Array.from(census.squirrels, (squirrel) => (squirrel.aboveGroundFeet ?? 0) * FEET_TO_METERS),
		scales,
		yaws: Float32Array.from({ length: count }, (_, index) => (((Math.sin(index * 12.9898) * 43758.5453) % 1) + 1) * Math.PI),
		shown: new Uint8Array(count).fill(1),
		groundError: new Float64Array(count).fill(Infinity),
		snapQueue: [],
		placed: false,
		dirty: false,
		lastCameraPosition: new THREE.Vector3(Infinity, Infinity, Infinity),
		matrices: new THREE.InstancedBufferAttribute(new Float32Array(count * 16), 16).setUsage(THREE.DynamicDrawUsage),
		tints: {
			fur: new THREE.InstancedBufferAttribute(colors, 3),
			furDark: new THREE.InstancedBufferAttribute(colors.map((channel) => channel * 0.55), 3),
		},
		markerAttributes: {
			position: new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
			squirrelScale: new THREE.BufferAttribute(scales, 1).setUsage(THREE.DynamicDrawUsage),
			furColor: new THREE.BufferAttribute(colors, 3),
		},
	};
};

/** Indices of the shown squirrels. */
export const getShownSquirrels = (shown: Uint8Array) =>
	Array.from(shown).flatMap((isShown, index) => (isShown ? [index] : []));

/** Puts every squirrel on the ellipsoid under its lat/long, ready to be snapped to the ground. */
export const placeHerd = (herd: Herd, census: SquirrelCensus, toScene: (lat: number, lon: number) => THREE.Vector3) => {
	census.squirrels.forEach((squirrel, index) => {
		toScene(squirrel.lat, squirrel.lon).toArray(herd.basePositions, index * 3);
	});
	herd.positions.set(herd.basePositions);
	herd.groundError.fill(Infinity);
	herd.placed = true;
	herd.dirty = true;
};

const instanceMatrix = new THREE.Matrix4();
const instancePosition = new THREE.Vector3();
const instanceRotation = new THREE.Quaternion();
const instanceScale = new THREE.Vector3();
const upAxis = new THREE.Vector3(0, 1, 0);

/** Rebuilds the instance matrices - real-sized up close, scaled up from afar, 0 if filtered out. */
export const updateHerdInstances = (herd: Herd, camera: THREE.Camera) => {
	if (!herd.placed) {
		return;
	}
	if (!herd.dirty && camera.position.distanceToSquared(herd.lastCameraPosition) < 0.25) {
		return;
	}
	herd.dirty = false;
	herd.lastCameraPosition.copy(camera.position);

	herd.scales.forEach((_, index) => {
		instancePosition.fromArray(herd.positions, index * 3);
		const length = herd.shown[index]
			? Math.max(SQUIRREL_LENGTH_METERS, camera.position.distanceTo(instancePosition) * SQUIRREL_MIN_ANGULAR_SIZE)
			: 0;
		herd.scales[index] = length;
		instanceRotation.setFromAxisAngle(upAxis, herd.yaws[index]);
		instanceMatrix.compose(instancePosition, instanceRotation, instanceScale.setScalar(length));
		instanceMatrix.toArray(herd.matrices.array, index * 16);
	});
	herd.matrices.needsUpdate = true;
	herd.markerAttributes.position.needsUpdate = true;
	herd.markerAttributes.squirrelScale.needsUpdate = true;
};

/** The middle of squirrel "index"'s body (its position is its feet). */
export const getSquirrelCenter = (herd: Herd, index: number, target: THREE.Vector3) => {
	target.fromArray(herd.positions, index * 3);
	target.y += herd.scales[index] * herd.model.height * 0.5;
	return target;
};

const projected = new THREE.Vector3();
const squirrelCenter = new THREE.Vector3();

/** Index of the squirrel nearest the cursor on screen, or -1 - more forgiving than raycasting. */
export const pickSquirrel = (
	herd: Herd,
	camera: THREE.PerspectiveCamera,
	canvas: HTMLCanvasElement,
	clientX: number,
	clientY: number,
) => {
	if (!herd.placed) {
		return -1;
	}
	const rect = canvas.getBoundingClientRect();
	const cursorX = clientX - rect.left;
	const cursorY = clientY - rect.top;
	// Screen pixels per meter, at 1 meter from the camera.
	const pixelsPerMeter = rect.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
	let best = -1;
	// Distance from the cursor as a fraction of the pick radius - under 1 is a hit.
	let bestScore = 1;
	herd.shown.forEach((isShown, index) => {
		if (!isShown) {
			return;
		}
		getSquirrelCenter(herd, index, squirrelCenter);
		const distance = camera.position.distanceTo(squirrelCenter);
		projected.copy(squirrelCenter).project(camera);
		if (projected.z < -1 || projected.z > 1) {
			return; // behind the camera or past the far plane
		}
		const offsetX = ((projected.x + 1) / 2) * rect.width - cursorX;
		const offsetY = ((1 - projected.y) / 2) * rect.height - cursorY;
		// Close squirrels are big on screen, so they get a bigger target.
		const radius = Math.max(PICK_RADIUS_PX, ((herd.scales[index] * pixelsPerMeter) / distance) * 0.6);
		const score = (offsetX * offsetX + offsetY * offsetY) / (radius * radius);
		if (score < bestScore) {
			bestScore = score;
			best = index;
		}
	});
	return best;
};
