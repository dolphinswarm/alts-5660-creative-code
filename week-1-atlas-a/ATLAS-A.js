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
let currentSceneIndex = 0;
//#endregion

//#region Helper functions

/**
 * Loads a skybox HRDI image into the scene.
 *
 * @param {string} url
 */
const loadSkybox = (url) => {
	const texture = textureLoader.load(`assets/${url}`);
	texture.mapping = THREE.EquirectangularReflectionMapping;
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
};

/**
 * Creates a letter A in various shapes and colors/materials (dependent on the screen index).
 *
 * @param {{ index: number}} options
 * @returns {THREE.Group}
 */
const createLetterA = ({ index }) => {
	const group = new THREE.Group();
	// TODO optional scene animation

	switch (index) {
		//#region Scene #1: Stars
		case 0:
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

			boxPositions.forEach(({ x, y }) => {
				const boxGeo = new THREE.BoxGeometry();
				const boxMesh = new THREE.Mesh(boxGeo, boxMat);
				boxMesh.scale.set(0.9, 0.9, 0.9);
				boxMesh.position.set(x, y, 0);
				group.add(boxMesh);
			});

			break;
		//#endregion

		//#region Scene #2: Wireframe
		case 1:
			const wireframeMat = new THREE.MeshStandardMaterial({
				color: "#52f42e",
				wireframeLinewidth: 2,
			});

			const cylinderGeo = new THREE.WireframeGeometry(
				new THREE.CylinderGeometry(1, 1, 1, 16),
			);
			const cylinder = new THREE.LineSegments(cylinderGeo, wireframeMat);
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
			break;
		//#endregion

		//#region Scene #3: Pyramids
		case 2:
			const pyramidPositons = [
				{ x: 0, y: 0.5 },
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
		//#endregion

		//#region Scene #4: Metallic
		case 3:
			const archMat = new THREE.MeshStandardMaterial({
				color: "#c0c0c0",
				metalness: 0.7,
				roughness: 0.25,
			});
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

			break;
		//#endregion

		default:
			alert(`{index} doesn't exist, you dun goofed up guvnah`);
	}

	return group;
};

/**
 * Creates a Three.JS scene.
 *
 * @param {{ backgroundColor?: THREE.ColorRepresentation, skyboxSource?: string, index: number }} options
 * @returns {{ scene: THREE.Scene }}
 */
const createScene = ({ backgroundColor = "#000000", skyboxSource, index }) => {
	const scene = new THREE.Scene();
	scene.background = skyboxSource
		? loadSkybox(skyboxSource)
		: new THREE.Color(backgroundColor);

	scene.add(new THREE.AmbientLight("#ffffff", 0.5));

	const light = new THREE.DirectionalLight("#ffffff", 1);
	light.position.set(2, 2, 3);
	scene.add(light);

	scene.add(createLetterA({ index }));

	return { scene };
};

const scenes = [
	{ skyboxSource: "space.jpg" },
	{ backgroundColor: "#000000" },
	{ skyboxSource: "desert.jpg" },
	{ backgroundColor: "#7789a0" },
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

const animate = () => {
	requestAnimationFrame(animate);

	const { scene } = scenes[currentSceneIndex];

	controls.update();
	renderer.render(scene, camera);
};

animate();

