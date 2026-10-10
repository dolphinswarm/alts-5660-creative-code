import * as THREE from "three";
import { probeSurfaceAt } from "./ground.js";
import { type Herd, SQUIRREL_LENGTH_METERS } from "./herd.js";

// Where flying to a squirrel ends up: this far away, tilted this far from straight down.
const FLY_TO_DISTANCE = 12;
const FLY_TO_TILT = THREE.MathUtils.degToRad(30);

export type Pose = { position: THREE.Vector3; rotation: THREE.Quaternion };

export type Flight = {
	from: THREE.Vector3;
	to: THREE.Vector3;
	fromRotation: THREE.Quaternion;
	toRotation: THREE.Quaternion;
	/** How far above the straight line the camera rises mid-flight */
	arcHeight: number;
	/** Seconds */
	duration: number;
	/** Seconds */
	elapsed: number;
};

/** A glide from the camera's current pose to "destination", arcing up over the park on longer trips. */
export const createFlight = (camera: THREE.Camera, destination: Pose): Flight => {
	const distance = camera.position.distanceTo(destination.position);
	return {
		from: camera.position.clone(),
		to: destination.position,
		fromRotation: camera.quaternion.clone(),
		toRotation: destination.rotation,
		arcHeight: Math.min(distance * 0.3, 300),
		duration: THREE.MathUtils.clamp(0.6 + distance / 1500, 0.6, 2.5),
		elapsed: 0,
	};
};

/** Moves the camera "delta" seconds along "flight", returning true once it's landed. */
export const stepFlight = (flight: Flight, camera: THREE.Camera, delta: number) => {
	flight.elapsed += delta;
	const progress = Math.min(flight.elapsed / flight.duration, 1);
	const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
	camera.position.lerpVectors(flight.from, flight.to, eased);
	camera.position.y += Math.sin(Math.PI * eased) * flight.arcHeight;
	camera.quaternion.slerpQuaternions(flight.fromRotation, flight.toRotation, eased);
	return progress === 1;
};

/** A view down at squirrel "index" that keeps the camera's heading, so it doesn't spin. */
export const getSquirrelViewPose = (
	herd: Herd,
	index: number,
	camera: THREE.Camera,
	tiles: THREE.Object3D,
	cameraRadius: number,
): Pose => {
	// Its real-size middle - from afar it's drawn much bigger than it is.
	const target = new THREE.Vector3().fromArray(herd.positions, index * 3);
	target.y += SQUIRREL_LENGTH_METERS * herd.model.height * 0.5;

	const heading = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0);
	if (heading.lengthSq() < 1e-4) {
		// Looking straight down, so "ahead" is the top of the screen.
		heading.set(0, 1, 0).applyQuaternion(camera.quaternion).setY(0);
	}
	heading.normalize();
	const position = target
		.clone()
		.addScaledVector(heading, -FLY_TO_DISTANCE * Math.sin(FLY_TO_TILT))
		.setY(target.y + FLY_TO_DISTANCE * Math.cos(FLY_TO_TILT));
	// Stay above the treetops - the x-ray pass shows the squirrel through them.
	const surface = probeSurfaceAt(tiles, position.x, position.z);
	if (surface) {
		position.y = Math.max(position.y, surface.top + cameraRadius);
	}
	return {
		position,
		rotation: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(position, target, camera.up)),
	};
};
