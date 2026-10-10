import * as React from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { TilesRenderer } from "3d-tiles-renderer/three";
import type { SquirrelModelPart } from "../squirrel-model.js";
import { snapSomeSquirrelsToGround } from "./ground.js";
import { getSquirrelCenter, type Herd, updateHerdInstances } from "./herd.js";

// Rings around squirrels are never smaller than this across (CSS pixels).
const MARKER_MIN_SIZE_PX = 18;
const XRAY_RENDER_ORDER = 1;
const SQUIRREL_RENDER_ORDER = 2;

// The controls raycast the whole scene, so the squirrels opt out.
const noRaycast = () => {};

const MARKER_VERTEX_SHADER = /* glsl */ `
	attribute float squirrelScale;
	attribute vec3 furColor;
	uniform float modelHeight;
	uniform float minSize;
	uniform float pixelRatio;
	uniform float viewportHeight;
	varying vec3 vColor;
	varying float vSize;
	varying float vAlpha;

	void main() {
		vec3 center = position + vec3(0.0, squirrelScale * modelHeight * 0.5, 0.0);
		vec4 mvPosition = modelViewMatrix * vec4(center, 1.0);
		gl_Position = projectionMatrix * mvPosition;
		float distance = -mvPosition.z;
		// The squirrel's on-screen length, in device pixels.
		float squirrelPx = squirrelScale * projectionMatrix[1][1] * 0.5 * viewportHeight / distance;
		vSize = squirrelScale > 0.0 ? max(minSize * pixelRatio, squirrelPx * 1.6) : 0.0;
		gl_PointSize = vSize;
		vColor = furColor;
		// Fainter from high up, gone once the squirrel fills the screen.
		vAlpha = mix(1.0, 0.4, smoothstep(300.0, 2000.0, distance))
			* (1.0 - smoothstep(150.0, 300.0, squirrelPx / pixelRatio));
	}
`;

const MARKER_FRAGMENT_SHADER = /* glsl */ `
	uniform float pixelRatio;
	varying vec3 vColor;
	varying float vSize;
	varying float vAlpha;

	void main() {
		// Device pixels in from the ring's outer edge.
		float inset = (1.0 - length(gl_PointCoord - 0.5) * 2.0) * 0.5 * vSize;
		float width = 4.0 * pixelRatio;
		if (inset < 0.0 || inset > width) discard;
		// A fur-colored band between thin outlines - light ones for dark fur.
		vec3 outline = dot(vColor, vec3(0.299, 0.587, 0.114)) < 0.1 ? vec3(1.0) : vec3(0.0);
		float band = step(pixelRatio, inset) * step(inset, width - pixelRatio);
		gl_FragColor = vec4(mix(outline, vColor, band), vAlpha * clamp(inset, 0.0, 1.0) * clamp(width - inset, 0.0, 1.0));
		#include <colorspace_fragment>
	}
`;

/** Points an InstancedMesh at the herd's shared buffers - a ref, since R3F props would copy them. */
const shareInstances = (herd: Herd, tint: SquirrelModelPart["tint"]) => (mesh: THREE.InstancedMesh | null) => {
	if (mesh) {
		mesh.instanceMatrix = herd.matrices;
		mesh.instanceColor = tint ? herd.tints[tint] : null;
	}
};

type SquirrelHerdProps = {
	herd: Herd;
	tiles: React.RefObject<TilesRenderer | null>;
};

/** Every squirrel: an InstancedMesh per model part, x-ray silhouettes, and rings. */
export const SquirrelHerd = ({ herd, tiles }: SquirrelHerdProps) => {
	const group = React.useRef<THREE.Group>(null);

	// Only draws where a squirrel is hidden, so ones under trees show through. Drawn
	// before the squirrels so their own bodies don't count, which means blending by hand.
	const xrayMaterial = React.useMemo(
		() =>
			new THREE.MeshBasicMaterial({
				opacity: 0.45,
				blending: THREE.CustomBlending,
				blendSrc: THREE.SrcAlphaFactor,
				blendDst: THREE.OneMinusSrcAlphaFactor,
				depthWrite: false,
				depthFunc: THREE.GreaterDepth,
			}),
		[],
	);
	React.useEffect(() => () => xrayMaterial.dispose(), [xrayMaterial]);

	const markerUniforms = React.useMemo(
		() => ({
			modelHeight: { value: herd.model.height },
			minSize: { value: MARKER_MIN_SIZE_PX },
			pixelRatio: { value: 1 },
			viewportHeight: { value: 1 },
		}),
		[herd],
	);
	// One stable ref per part, so re-renders don't detach and reattach them.
	const partRefs = React.useMemo(() => herd.model.parts.map((part) => shareInstances(herd, part.tint)), [herd]);

	useFrame(({ camera, gl: renderer }) => {
		if (tiles.current) {
			snapSomeSquirrelsToGround(herd, tiles.current.group);
		}
		updateHerdInstances(herd, camera);
		markerUniforms.pixelRatio.value = renderer.getPixelRatio();
		markerUniforms.viewportHeight.value = renderer.domElement.height;
		if (group.current) {
			group.current.visible = herd.placed;
		}
	});

	// dispose={null} - the model outlives this component.
	return (
		<group ref={group}>
			{herd.model.parts.map((part, partIndex) => (
				<React.Fragment key={partIndex}>
					<instancedMesh
						ref={partRefs[partIndex]}
						args={[part.geometry, part.material, herd.count]}
						frustumCulled={false}
						raycast={noRaycast}
						renderOrder={SQUIRREL_RENDER_ORDER}
						dispose={null}
					/>
					{part.tint ? (
						<instancedMesh
							ref={partRefs[partIndex]}
							args={[part.geometry, xrayMaterial, herd.count]}
							frustumCulled={false}
							raycast={noRaycast}
							renderOrder={XRAY_RENDER_ORDER}
							dispose={null}
						/>
					) : null}
				</React.Fragment>
			))}
			{/* Always on top, at a constant thickness */}
			<points frustumCulled={false} raycast={noRaycast} renderOrder={1}>
				<bufferGeometry>
					{Object.entries(herd.markerAttributes).map(([name, attribute]) => (
						<primitive key={name} attach={`attributes-${name}`} object={attribute} />
					))}
				</bufferGeometry>
				<shaderMaterial
					uniforms={markerUniforms}
					vertexShader={MARKER_VERTEX_SHADER}
					fragmentShader={MARKER_FRAGMENT_SHADER}
					transparent
					depthTest={false}
					depthWrite={false}
				/>
			</points>
		</group>
	);
};

const pinPosition = new THREE.Vector3();

type SelectedPinProps = {
	herd: Herd;
	selected: number;
};

/** A pin above the selected squirrel, in the page's "--highlight" color. */
export const SelectedPin = ({ herd, selected }: SelectedPinProps) => {
	const position = React.useMemo(() => new THREE.BufferAttribute(new Float32Array(3), 3), []);
	const color = React.useMemo(
		() => getComputedStyle(document.documentElement).getPropertyValue("--highlight").trim() || "#e07b39",
		[],
	);

	useFrame(() => {
		if (selected < 0) {
			return;
		}
		getSquirrelCenter(herd, selected, pinPosition);
		pinPosition.y += herd.scales[selected] * herd.model.height;
		position.setXYZ(0, pinPosition.x, pinPosition.y, pinPosition.z);
		position.needsUpdate = true;
	});

	// After the squirrels (it's in the same opaque list), so none draw over it.
	return (
		<points
			visible={selected >= 0}
			frustumCulled={false}
			raycast={noRaycast}
			renderOrder={SQUIRREL_RENDER_ORDER + 1}
		>
			<bufferGeometry>
				<primitive attach="attributes-position" object={position} />
			</bufferGeometry>
			<pointsMaterial size={14} sizeAttenuation={false} color={color} depthTest={false} />
		</points>
	);
};
