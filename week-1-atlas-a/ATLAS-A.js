// @ts-check
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

//#region Three.js Scaffolding
const main = document.querySelector("main");
if (!main) {
	throw new Error("main element not found");
}

const camera = new THREE.PerspectiveCamera(
	75,
	main.clientWidth / main.clientHeight,
	0.1,
	1000,
);
camera.position.z = 15;

const renderer = new THREE.WebGLRenderer({ antialias: true });
main.appendChild(renderer.domElement);
const resizeRendererToParent = () => {
	const { clientWidth: width, clientHeight: height } = main;
	camera.aspect = width / height;
	camera.updateProjectionMatrix();
	renderer.setSize(width, height);
};
resizeRendererToParent();
new ResizeObserver(resizeRendererToParent).observe(main);

// https://threejs.org/docs/#OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 2;
controls.maxDistance = 10;
controls.minPolarAngle = Math.PI / 4;
controls.maxPolarAngle = (3 * Math.PI) / 4;
controls.target.set(0, 0, 0);
controls.update();

const textureLoader = new THREE.TextureLoader();
const raycaster = new THREE.Raycaster();
let currentSceneIndex = 0;
//#endregion

//#region Helper functions

/**
 * Loads a skybox HRDI image into the scene.
 *
 * @param {string} url
 * @param {() => void} [onLoad] Called once the image has actually loaded.
 */
const loadSkybox = (url, onLoad) => {
	const texture = textureLoader.load(`assets/${url}`, onLoad);
	texture.mapping = THREE.EquirectangularReflectionMapping;
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
};

/**
 * Converts a pointer/mouse event's screen position to normalized device
 * coordinates for the canvas, writing the result into `target`.
 *
 * https://salivity.github.io/three.js/article/convert-2d-ndc-to-3d-coordinates-in-three-js
 *
 * @param {PointerEvent | MouseEvent} event
 * @param {THREE.Vector2} target
 */
const pointerToNDC = (event, target) => {
	const rect = renderer.domElement.getBoundingClientRect();
	return target.set(
		((event.clientX - rect.left) / rect.width) * 2 - 1,
		-((event.clientY - rect.top) / rect.height) * 2 + 1,
	);
};

/**
 * @typedef {(delta: number, elapsed: number) => void} SceneUpdate
 */

/**
 * Creates a letter A in various shapes and colors/materials (dependent on the
 * screen index). Each scene may return a per-frame `update`.
 *
 * @param {{ index: number }} options
 * @returns {{ group: THREE.Group, update?: SceneUpdate }}
 */
const createLetterA = ({ index }) => {
	const group = new THREE.Group();

	/**
	 * @type {SceneUpdate | undefined}
	 * */
	let update;

	switch (index) {
		//#region Scene #1: Meteors in Space
		case 0: {
			const boxPositions = [
				{ x: 2.25, y: -1.5 },
				{ x: -2.25, y: -1.5 },
				{ x: 1.5, y: -0.5 },
				{ x: -1.5, y: -0.5 },
				{ x: 0.75, y: 0.5 },
				{ x: -0.75, y: 0.5 },
				{ x: 0, y: 1.5 },
			];
			const moonTex = textureLoader.load("assets/moon.png");
			moonTex.colorSpace = THREE.SRGBColorSpace;
			const boxMat = new THREE.MeshBasicMaterial({
				color: "#ffffff",
				map: moonTex,
			});
			const boxGeo = new THREE.BoxGeometry();

			const boxes = boxPositions.map(({ x, y }) => {
				const mesh = new THREE.Mesh(boxGeo, boxMat);
				mesh.scale.set(0.9, 0.9, 0.9);
				mesh.position.set(x, y, 0);
				group.add(mesh);
				return { mesh, x, y, phase: Math.random() * Math.PI }; // <- phase offsets the sin "wobble"
			});

			const wobbleAmount = 0.05;
			update = (_delta, elapsed) => {
				boxes.forEach(({ mesh, x, y, phase }) => {
					const time = elapsed + phase;
					mesh.position.set(
						x + Math.sin(time) * wobbleAmount,
						y + Math.sin(time) * wobbleAmount,
						Math.sin(time) * wobbleAmount,
					);
				});
			};

			break;
		}
		//#endregion

		//#region Scene #2: Wireframe
		case 1: {
			const wireframeMat = new THREE.MeshBasicMaterial({
				color: "#52f42e",
			});

			const cylinder = new THREE.LineSegments(
				new THREE.WireframeGeometry(
					new THREE.CylinderGeometry(1, 1, 1, 16),
				),
				wireframeMat,
			);
			cylinder.position.x = -1;
			cylinder.position.y = -1;
			cylinder.rotation.x = Math.PI / 2;
			group.add(cylinder);

			const prismGeo = new THREE.WireframeGeometry(
				new THREE.BoxGeometry(1, 4, 1),
			);
			const shear = new THREE.Matrix4().set(
				1,
				-0.4,
				0,
				0,
				0,
				1,
				0,
				0,
				0,
				0,
				1,
				0,
				0,
				0,
				0,
				1,
			);
			prismGeo.applyMatrix4(shear);
			const prism = new THREE.LineSegments(prismGeo, wireframeMat);
			prism.position.x = 1;
			group.add(prism);

			update = (_delta, elapsed) => {
				wireframeMat.color.setHSL((elapsed * 0.1) % 1, 1, 0.5);
			};

			break;
		}
		//#endregion

		//#region Scene #3: Pyramids
		case 2: {
			const pyramidPositons = [
				{ x: 0, y: 0.5, z: 0 },
				{ x: 0, y: -0.5, z: 1 },
				{ x: -0.87, y: -0.5, z: -0.5 },
				{ x: 0.87, y: -0.5, z: -0.5 },
			];
			const sandstoneTex = textureLoader.load("assets/sandstone.jpg");
			sandstoneTex.colorSpace = THREE.SRGBColorSpace;
			const pyramidMat = new THREE.MeshBasicMaterial({
				color: "#ffffff",
				map: sandstoneTex,
			});

			pyramidPositons.forEach(({ x, y, z }) => {
				const pyramidGeo = new THREE.ConeGeometry(1, 1, 3);
				const pyramidMesh = new THREE.Mesh(pyramidGeo, pyramidMat);
				pyramidMesh.position.set(x, y, z);
				group.add(pyramidMesh);
			});

			break;
		}
		//#endregion

		//#region Scene #4: Metallic
		case 3: {
			const archMat = new THREE.MeshStandardMaterial({
				color: "#c0c0c0",
				metalness: 0.7,
				roughness: 0.25,
			});
			const dullRoughness = 0.25;
			const shinyRoughness = 0.02;

			const pointer = new THREE.Vector2(2, 2);
			renderer.domElement.addEventListener("pointermove", (event) =>
				pointerToNDC(event, pointer),
			);
			renderer.domElement.addEventListener("pointerleave", () =>
				pointer.set(2, 2),
			);

			const squareSize = 0.35;
			const squareProfile = new THREE.Shape();
			squareProfile.moveTo(-squareSize, -squareSize);
			squareProfile.lineTo(squareSize, -squareSize);
			squareProfile.lineTo(squareSize, squareSize);
			squareProfile.lineTo(-squareSize, squareSize);
			squareProfile.closePath();

			// Arch top
			const arcPoints = Array.from({ length: 33 }, (_, i) => {
				const angle = (i / 32) * Math.PI;
				return new THREE.Vector3(
					Math.cos(angle) * 1.2,
					Math.sin(angle) * 1.8,
					0,
				);
			});
			const archPath = new THREE.CatmullRomCurve3(arcPoints);
			const archGeometry = new THREE.ExtrudeGeometry(squareProfile, {
				steps: 64,
				extrudePath: archPath,
				bevelEnabled: false,
			});
			const archMesh = new THREE.Mesh(archGeometry, archMat);
			archMesh.position.y = -0.5;
			group.add(archMesh);

			// Arch bottom
			const archBottomGeo = new THREE.BoxGeometry(2, 0.75, 0.7);
			const archBottomMesh = new THREE.Mesh(archBottomGeo, archMat);
			archBottomMesh.position.y = -0.135;
			group.add(archBottomMesh);

			update = (delta) => {
				raycaster.setFromCamera(pointer, camera);
				const isMouseOver =
					raycaster.intersectObjects(group.children, false).length >
					0;
				archMat.roughness = THREE.MathUtils.damp(
					archMat.roughness,
					isMouseOver ? shinyRoughness : dullRoughness,
					6,
					delta,
				);
				archMat.metalness = THREE.MathUtils.damp(
					archMat.metalness,
					isMouseOver ? 1 : 0.7,
					6,
					delta,
				);
			};

			break;
		}
		//#endregion

		//#region Scene #5: Glowing Shapes
		case 4: {
			const shapePositions = [
				{ x: 0, y: 2 },
				{ x: 2, y: -2 },
				{ x: -2, y: -2 },
			];

			const startShape = new THREE.SphereGeometry(1.5, 32, 16);
			const shapePool = [
				startShape,
				new THREE.BoxGeometry(2.4, 2.4, 2.4),
				new THREE.IcosahedronGeometry(1.7),
				new THREE.TorusGeometry(1.1, 0.5, 20, 40),
				new THREE.ConeGeometry(1.6, 2.8, 4),
			];

			const startColor = "#2979ff";
			const glowColors = [
				startColor,
				"#00e5ff",
				"#ff2d95",
				"#8cff2d",
				"#ffb300",
				"#b026ff",
			];

			/**
			 * @template T
			 * @param {T[]} items
			 * @returns {T}
			 */
			const randomOf = (items) =>
				items[Math.floor(Math.random() * items.length)];

			const meshes = shapePositions.map(({ x, y }) => {
				const mesh = new THREE.Mesh(
					startShape,
					new THREE.MeshStandardMaterial({
						color: startColor,
						emissive: startColor,
						emissiveIntensity: 0.8,
						roughness: 0.4,
					}),
				);
				mesh.position.set(x, y, 0);
				const light = new THREE.PointLight(startColor, 10, 7, 2); // <- Glow is a point light since it's easiest lol
				mesh.add(light);

				mesh.userData.light = light;

				group.add(mesh);
				return mesh;
			});

			// https://threejs.org/manual/#en/picking
			const clickPoint = new THREE.Vector2();
			renderer.domElement.addEventListener("pointerdown", (event) => {
				if (currentSceneIndex !== index) {
					return;
				}

				raycaster.setFromCamera(
					pointerToNDC(event, clickPoint),
					camera,
				);
				const hit = raycaster.intersectObjects(meshes, false)[0];
				if (!hit) {
					return;
				}

				const mesh = /** @type {THREE.Mesh} */ (hit.object);
				const material = /** @type {THREE.MeshStandardMaterial} */ (
					mesh.material
				);

				let nextShape = mesh.geometry;
				while (nextShape === mesh.geometry) {
					nextShape = randomOf(shapePool);
				}
				mesh.geometry = nextShape;

				const nextColor = randomOf(glowColors);
				material.color.set(nextColor);
				material.emissive.set(nextColor);
				mesh.userData.light.color.set(nextColor);
			});

			break;
		}
		//#endregion

		default:
			alert(`{index} doesn't exist, you dun goofed up guvnah`);
	}

	return { group, update };
};

/**
 * Creates a Three.JS scene.
 *
 * @param {{
 *   backgroundColor?: THREE.ColorRepresentation,
 *   skyboxSource?: string,
 *   environmentSource?: string,
 *   index: number,
 * }} options
 * @returns {{ scene: THREE.Scene, update?: SceneUpdate }}
 */
const createScene = ({
	backgroundColor = "#000000",
	skyboxSource,
	environmentSource,
	index,
}) => {
	const scene = new THREE.Scene();
	scene.background = skyboxSource
		? loadSkybox(skyboxSource)
		: new THREE.Color(backgroundColor);
	if (environmentSource) {
		scene.environment = loadSkybox(environmentSource, () => {
			// Run a quick render immediately to prevent the reflection calcs
			// slowing the scene down later when it's first viewed
			renderer.render(scene, camera);
			renderer.render(scenes[currentSceneIndex].scene, camera);
		});
	}

	scene.add(new THREE.AmbientLight("#ffffff", 0.5));

	const light = new THREE.DirectionalLight("#ffffff", 1);
	light.position.set(2, 2, 3);
	scene.add(light);

	const { group, update } = createLetterA({ index });
	scene.add(group);

	return { scene, update };
};

const scenes = [
	{ skyboxSource: "space.jpg" },
	{ backgroundColor: "#000000" },
	{ skyboxSource: "desert.jpg" },
	{ backgroundColor: "#7789a0", environmentSource: "desert.jpg" },
	{ backgroundColor: "#2f0533" },
].map((options, index) => createScene({ ...options, index }));
//#endregion

//#region UI
const prevButton = document.getElementById("prev-scene");
const nextButton = document.getElementById("next-scene");
const staticOverlay = document.getElementById("static");

/**
 * Briefly reveals the looping static GIF, e.g. when changing scenes.
 *
 * @param {number} [durationMs]
 */
const flashStatic = (durationMs = 250) => {
	if (!staticOverlay) {
		return;
	}

	staticOverlay.classList.add("on");
	window.setTimeout(() => staticOverlay.classList.remove("on"), durationMs);
};

prevButton?.addEventListener("click", () => {
	flashStatic();
	currentSceneIndex = (currentSceneIndex - 1 + scenes.length) % scenes.length;
});
nextButton?.addEventListener("click", () => {
	flashStatic();
	currentSceneIndex = (currentSceneIndex + 1) % scenes.length;
});
//#endregion

let lastTime = performance.now();

const animate = () => {
	requestAnimationFrame(animate);

	// DeltaTime handling
	const now = performance.now();
	const delta = Math.min((now - lastTime) / 1000, 0.1);
	const elapsed = now / 1000;
	lastTime = now;

	const active = scenes[currentSceneIndex];

	active.update?.(delta, elapsed);
	controls.update();
	renderer.render(active.scene, camera);
};

animate();

