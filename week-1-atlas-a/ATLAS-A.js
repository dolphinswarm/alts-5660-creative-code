// @ts-check
import * as THREE from 'three';

//#region Three.js Scaffolding
const main = document.querySelector('main');
if (!main) {
	throw new Error('main element not found');
}

const camera = new THREE.PerspectiveCamera(
	75,
	main.clientWidth / main.clientHeight,
	0.1,
	1000,
);
camera.position.z = 5;

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
//#endregion

//#region Scene Variables
let currentSceneIndex = 0;
//#endregion

/**
 * Creates a letter A in various shapes and colors/materials (dependent on the screen index).
 *
 * @param {{ color: THREE.ColorRepresentation, index: number}} options
 * @returns {THREE.Group}
 */
const createLetterA = ({ color, index }) => {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({ color }); // TODO other materials

	switch (index) {
		//#region Scene #1 A
		case 0:
			break;
		//#endregion

		//#region
		case 1:
			break;
		//#endregion

		//#region
		case 2:
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
 * @param {{ background: THREE.ColorRepresentation, color: THREE.ColorRepresentation, index: number }} options
 * @returns {{ scene: THREE.Scene, letterA: THREE.Group }}
 */
const createScene = ({ background, color, index }) => {
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(background);

	scene.add(new THREE.AmbientLight(0xffffff, 0.5));

	const light = new THREE.DirectionalLight(0xffffff, 1);
	light.position.set(2, 2, 3);
	scene.add(light);

	const letterA = createLetterA({ color, index });
	scene.add(letterA);

	return { scene, letterA };
};

const scenes = [
	// TODO Background Images
	{ background: '#1e1e1e', color: '#ff5c5c' },
	{ background: '#0b1e3a', color: '#5ce1ff' },
	{ background: '#1a2e1a', color: '#8bff5c' },
].map((options, index) => createScene({ ...options, index }));

//#region UI
const prevButton = document.getElementById('prev-scene');
const nextButton = document.getElementById('next-scene');

prevButton?.addEventListener('click', () => {
	currentSceneIndex = (currentSceneIndex - 1 + scenes.length) % scenes.length;
});
nextButton?.addEventListener('click', () => {
	currentSceneIndex = (currentSceneIndex + 1) % scenes.length;
});
//#endregion

const animate = () => {
	requestAnimationFrame(animate);

	const { scene, letterA } = scenes[currentSceneIndex];
	letterA.rotation.y += 0.01;

	renderer.render(scene, camera);
};

animate();
