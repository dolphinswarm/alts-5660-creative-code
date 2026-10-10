import * as THREE from "three";
import { WGS84_ELLIPSOID } from "3d-tiles-renderer";
import type { Herd } from "./herd.js";

// Roughly the middle of Central Park - becomes the scene's origin, with +Y up
// and units in meters.
export const PARK_CENTER = { lat: 40.7824, lon: -73.9654 };

// How far past the park's edges (meters) the camera may go, and how high,
// relative to the height that fits the whole park on screen.
const CAMERA_BOUNDS_MARGIN = 300;
const CAMERA_MAX_HEIGHT_SCALE = 1.25;
// Roughly the height getOverviewPose() picks for the whole park.
const PLACEHOLDER_HEIGHT = 4500;

/**
 * The park as a rectangle fitted to the squirrels: its long axis (pointing
 * north), the direction across it, and its half length and width in meters.
 * Plus which way is true north and east in the scene.
 */
export type ParkFrame = {
	center: THREE.Vector3;
	axis: THREE.Vector3;
	across: THREE.Vector3;
	halfLength: number;
	halfWidth: number;
	north: THREE.Vector3;
	east: THREE.Vector3;
};

const ecef = new THREE.Vector3();

/**
 * Lat/long -> this scene's coordinates. Done in float64 on the CPU (Earth-
 * centered coordinates are millions of meters, too big for GPU float32) and
 * only the small, park-relative result is stored for rendering.
 */
export const latLonToScene = (tiles: THREE.Object3D, lat: number, lon: number) => {
	WGS84_ELLIPSOID.getCartographicToPosition(lat * THREE.MathUtils.DEG2RAD, lon * THREE.MathUtils.DEG2RAD, 0, ecef);
	return ecef.applyMatrix4(tiles.matrixWorld);
};

/** Fits a ParkFrame to the squirrels' ellipsoid positions. */
export const computeParkFrame = (herd: Herd, tiles: THREE.Object3D): ParkFrame => {
	const points = Array.from({ length: herd.count }, (_, index) => ({
		x: herd.basePositions[index * 3],
		z: herd.basePositions[index * 3 + 2],
	}));
	const centroidX = points.reduce((sum, point) => sum + point.x, 0) / herd.count;
	const centroidZ = points.reduce((sum, point) => sum + point.z, 0) / herd.count;
	const offsets = points.map((point) => ({ offsetX: point.x - centroidX, offsetZ: point.z - centroidZ }));
	// The park's long axis is the principal axis of the squirrels' positions.
	const spreadX = offsets.reduce((sum, { offsetX }) => sum + offsetX * offsetX, 0);
	const spreadZ = offsets.reduce((sum, { offsetZ }) => sum + offsetZ * offsetZ, 0);
	const spreadXZ = offsets.reduce((sum, { offsetX, offsetZ }) => sum + offsetX * offsetZ, 0);
	const angle = 0.5 * Math.atan2(2 * spreadXZ, spreadX - spreadZ);
	const axis = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
	const north = latLonToScene(tiles, PARK_CENTER.lat + 0.01, PARK_CENTER.lon).clone();
	north.sub(latLonToScene(tiles, PARK_CENTER.lat, PARK_CENTER.lon)).setY(0).normalize();
	if (axis.dot(north) < 0) {
		axis.negate();
	}
	const across = new THREE.Vector3(-axis.z, 0, axis.x);

	// Each squirrel's position along and across the park.
	const alongs = offsets.map(({ offsetX, offsetZ }) => offsetX * axis.x + offsetZ * axis.z);
	const acrosses = offsets.map(({ offsetX, offsetZ }) => offsetX * across.x + offsetZ * across.z);
	const [minAlong, maxAlong] = [Math.min(...alongs), Math.max(...alongs)];
	const [minAcross, maxAcross] = [Math.min(...acrosses), Math.max(...acrosses)];
	return {
		center: new THREE.Vector3(centroidX, 0, centroidZ)
			.addScaledVector(axis, (minAlong + maxAlong) / 2)
			.addScaledVector(across, (minAcross + maxAcross) / 2),
		axis,
		across,
		halfLength: (maxAlong - minAlong) / 2,
		halfWidth: (maxAcross - minAcross) / 2,
		north,
		east: north.clone().cross(new THREE.Vector3(0, 1, 0)),
	};
};

/**
 * How high a straight-down, north-up camera has to be to fit the whole park
 * on screen.
 */
const getOverviewHeight = (park: ParkFrame, camera: THREE.PerspectiveCamera) => {
	const { axis, across, halfLength, halfWidth, north, east } = park;
	// Half the park's extent east-west and north-south (it runs ~29° east of north).
	const halfEast = halfLength * Math.abs(axis.dot(east)) + halfWidth * Math.abs(across.dot(east));
	const halfNorth = halfLength * Math.abs(axis.dot(north)) + halfWidth * Math.abs(across.dot(north));
	const halfFovTan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
	return 1.1 * Math.max(halfEast / (halfFovTan * camera.aspect), halfNorth / halfFovTan);
};

/** A straight-down view of the whole park with north at the top, like a map. */
export const getOverviewPose = (park: ParkFrame, camera: THREE.PerspectiveCamera) => {
	const position = park.center.clone().setY(getOverviewHeight(park, camera));
	// lookAt's "up" becomes the top of the screen.
	const rotation = new THREE.Quaternion().setFromRotationMatrix(
		new THREE.Matrix4().lookAt(position, park.center, park.north),
	);
	return { position, rotation };
};

/**
 * Close to the overview, for before the squirrels (which it's fitted to) have
 * loaded - so the tiles that stream in meanwhile are mostly ones it'll use.
 * ReorientationPlugin puts north at +Z.
 */
export const getPlaceholderPose = () => {
	const position = new THREE.Vector3(0, PLACEHOLDER_HEIGHT, 0);
	const rotation = new THREE.Quaternion().setFromRotationMatrix(
		new THREE.Matrix4().lookAt(position, new THREE.Vector3(), new THREE.Vector3(0, 0, 1)),
	);
	return { position, rotation };
};

const cameraMove = new THREE.Vector3();

/**
 * Keeps the camera over the park (plus CAMERA_BOUNDS_MARGIN) and below CAMERA_MAX_HEIGHT_SCALE.
 *
 * @param previous Where the camera was before the controls moved it this frame.
 */
export const clampCameraToPark = (park: ParkFrame, camera: THREE.PerspectiveCamera, previous: THREE.Vector3) => {
	// Past the ceiling, back up along this frame's move rather than just
	// dropping y - otherwise zooming out (along a slanted ray) slides sideways.
	const ceiling = getOverviewHeight(park, camera) * CAMERA_MAX_HEIGHT_SCALE;
	const rise = camera.position.y - previous.y;
	if (camera.position.y > ceiling && rise > 0) {
		const fraction = Math.max(0, (ceiling - previous.y) / rise);
		camera.position.lerpVectors(previous, cameraMove.copy(camera.position), fraction);
	}
	camera.position.y = Math.min(camera.position.y, ceiling);

	const { center, axis, across, halfLength, halfWidth } = park;
	const offsetX = camera.position.x - center.x;
	const offsetZ = camera.position.z - center.z;
	const along = THREE.MathUtils.clamp(
		offsetX * axis.x + offsetZ * axis.z,
		-halfLength - CAMERA_BOUNDS_MARGIN,
		halfLength + CAMERA_BOUNDS_MARGIN,
	);
	const sideways = THREE.MathUtils.clamp(
		offsetX * across.x + offsetZ * across.z,
		-halfWidth - CAMERA_BOUNDS_MARGIN,
		halfWidth + CAMERA_BOUNDS_MARGIN,
	);
	camera.position.x = center.x + axis.x * along + across.x * sideways;
	camera.position.z = center.z + axis.z * along + across.z * sideways;
};
