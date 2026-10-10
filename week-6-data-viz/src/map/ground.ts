import * as THREE from "three";
import type { Herd } from "./herd.js";

// The scene's origin is on the WGS84 ellipsoid, and the park's ground is within
// a few tens of meters of it. Rays start well above the tallest buildings,
// and hits far below are Google's coarse globe-scale tiles (whose flat faces
// cut kilometers under the surface) rather than real ground.
const GROUND_PROBE_Y = 2000;
const MIN_GROUND_Y = -100;

// The camera stays at least this far (meters) above the ground - but can pass
// through treetops and roofs. Above CAMERA_GROUND_CHECK_HEIGHT it can't be near
// the ground, so the (raycast) check is skipped.
const CAMERA_GROUND_CLEARANCE = 1;
const CAMERA_GROUND_CHECK_HEIGHT = 300;

const SNAP_BUDGET_MS = 3;

const raycaster = new THREE.Raycaster();
const rayOrigin = new THREE.Vector3();
const down = new THREE.Vector3(0, -1, 0);
const squirrelPosition = new THREE.Vector3();

type Surface = { top: number; bottom: number; bottomError: number };

/**
 * The loaded tile surfaces at (sceneX, sceneZ): the highest (treetops, roofs) and the
 * lowest (usually the ground under them), plus the geometric error of the
 * tile the lowest came from. Null if nothing believable has loaded there yet.
 */
export const probeSurfaceAt = (tiles: THREE.Object3D, sceneX: number, sceneZ: number): Surface | null => {
	raycaster.set(rayOrigin.set(sceneX, GROUND_PROBE_Y, sceneZ), down);
	const hits = raycaster.intersectObject(tiles, true).filter((hit) => hit.point.y > MIN_GROUND_Y);
	if (hits.length === 0) {
		return null;
	}
	const bottom = hits[hits.length - 1];
	return {
		top: hits[0].point.y,
		bottom: bottom.point.y,
		bottomError: bottom.object.userData.tile?.geometricError ?? Infinity,
	};
};

/** Starts a new snapping pass over every squirrel, nearest the camera first. */
export const queueSquirrelSnaps = (herd: Herd, camera: THREE.Camera) => {
	const distancesSq = Array.from({ length: herd.count }, (_, index) =>
		camera.position.distanceToSquared(squirrelPosition.fromArray(herd.positions, index * 3)),
	);
	herd.snapQueue = Array.from(distancesSq.keys()).sort((first, second) => distancesSq[second] - distancesSq[first]);
};

/**
 * Drops squirrels onto the ground under them in Google's tiles. Raycasting
 * against the tile meshes is expensive, so this works through the snap queue
 * a few at a time, spending at most SNAP_BUDGET_MS per frame.
 *
 * A squirrel's first snap is to whatever tiles are loaded under it, even the
 * coarse blobs far from the camera that sit above the real ground - better
 * than buried under them. After that it only moves for equally or more
 * detailed tiles, so swapping back to coarse tiles as you move away doesn't
 * lift it off the ground it already found.
 */
export const snapSomeSquirrelsToGround = (herd: Herd, tiles: THREE.Object3D) => {
	const start = performance.now();
	while (herd.snapQueue.length > 0 && performance.now() - start < SNAP_BUDGET_MS) {
		const index = herd.snapQueue.pop()!;
		const surface = probeSurfaceAt(tiles, herd.basePositions[index * 3], herd.basePositions[index * 3 + 2]);
		if (!surface || surface.bottomError > herd.groundError[index]) {
			continue;
		}
		herd.groundError[index] = surface.bottomError;
		// Climbed heights are from the ground, but never above the treetops.
		const target = Math.min(surface.bottom + herd.climbHeights[index], surface.top);
		if (Math.abs(target - herd.positions[index * 3 + 1]) > 0.01) {
			herd.positions[index * 3 + 1] = target;
			herd.dirty = true;
		}
	}
};

/** Keeps the camera CAMERA_GROUND_CLEARANCE above the lowest tile surface under it. */
export const keepCameraAboveGround = (camera: THREE.Camera, tiles: THREE.Object3D) => {
	if (camera.position.y > CAMERA_GROUND_CHECK_HEIGHT) {
		return;
	}
	const surface = probeSurfaceAt(tiles, camera.position.x, camera.position.z);
	if (surface) {
		camera.position.y = Math.max(camera.position.y, surface.bottom + CAMERA_GROUND_CLEARANCE);
	}
};
