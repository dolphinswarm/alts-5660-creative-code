import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export type SquirrelModelPart = {
	/** Baked into model space (see loadSquirrelModel) */
	geometry: THREE.BufferGeometry;
	material: THREE.Material;
	/** Which per-instance fur tint this part takes, if any */
	tint: "fur" | "furDark" | null;
};

export type SquirrelModel = {
	parts: SquirrelModelPart[];
	/** Model-space height, as a fraction of its length (1) */
	height: number;
};

/**
 * Loads the squirrel .glb and flattens it into plain geometry + material pairs
 * ready for InstancedMesh: every node transform is baked in, and the whole
 * model is normalized so it's 1 unit long, centered over the origin, with its
 * feet at y = 0.
 *
 * Parts are tinted by fur color based on their original material: the
 * largest part (the body) takes the fur color directly, and any part that was
 * darker than the body takes a darker shade of it. Everything else (eyes,
 * etc.) keeps its own color.
 */
export const loadSquirrelModel = async (url: string): Promise<SquirrelModel> => {
	const gltf = await new GLTFLoader().loadAsync(url);
	gltf.scene.updateMatrixWorld(true);

	const meshes: THREE.Mesh[] = [];
	gltf.scene.traverse((object) => {
		if (object instanceof THREE.Mesh) {
			meshes.push(object);
		}
	});

	const geometries = meshes.map((mesh) => mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));

	const bounds = new THREE.Box3();
	geometries.forEach((geometry) => {
		geometry.computeBoundingBox();
		bounds.union(geometry.boundingBox!);
	});
	const size = bounds.getSize(new THREE.Vector3());
	const length = Math.max(size.x, size.z);
	const center = bounds.getCenter(new THREE.Vector3());
	const normalize = new THREE.Matrix4()
		.makeScale(1 / length, 1 / length, 1 / length)
		.multiply(new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
	geometries.forEach((geometry) => geometry.applyMatrix4(normalize));

	const vertexCounts = geometries.map((geometry) => geometry.attributes.position.count);
	const bodyIndex = vertexCounts.indexOf(Math.max(...vertexCounts));
	const luminance = (material: THREE.Material | THREE.Material[]) =>
		material instanceof THREE.MeshStandardMaterial ? material.color.getHSL({ h: 0, s: 0, l: 0 }).l : 1;
	const bodyLuminance = luminance(meshes[bodyIndex].material);

	return {
		height: size.y / length,
		parts: meshes.map((mesh, index) => {
			const material = (mesh.material as THREE.MeshStandardMaterial).clone();
			let tint: SquirrelModelPart["tint"] = null;
			if (index === bodyIndex) {
				tint = "fur";
			} else if (luminance(material) < bodyLuminance) {
				tint = "furDark";
			}
			if (tint) {
				// Instance colors multiply with the material color, so start from white.
				material.color.set(0xffffff);
			}
			return { geometry: geometries[index], material, tint };
		}),
	};
};
