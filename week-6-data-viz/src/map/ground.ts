import * as THREE from "three";
import type { Herd } from "./herd.js";

// Rays start above the tallest buildings. Hits far below the ellipsoid are
// coarse globe-scale tiles, not real ground.
const GROUND_PROBE_Y = 2000;
const MIN_GROUND_Y = -100;

// Meters the camera stays above the ground (not treetops), checked only below CAMERA_GROUND_CHECK_HEIGHT.
const CAMERA_GROUND_CLEARANCE = 1;
const CAMERA_GROUND_CHECK_HEIGHT = 300;

const SNAP_BUDGET_MS = 3;

const raycaster = new THREE.Raycaster();
const rayOrigin = new THREE.Vector3();
const down = new THREE.Vector3(0, -1, 0);
const squirrelPosition = new THREE.Vector3();

type Surface = { top: number; bottom: number; bottomError: number };

/** Highest and lowest loaded tile surfaces at (sceneX, sceneZ), or null if none yet. */
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
 * Snaps queued squirrels to the ground, up to SNAP_BUDGET_MS per frame. After the first
 * snap they only move for tiles at least as detailed, so coarse tiles can't lift them.
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
