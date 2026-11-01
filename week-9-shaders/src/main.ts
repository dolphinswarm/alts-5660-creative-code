import * as THREE from "three";
import GUI from "lil-gui";
import vertexShader from "./shaders/fullscreen.vert";
import fragmentShader from "./shaders/stained-glass.frag";

// Raw sRGB in, raw sRGB out, like Shadertoy - otherwise colors come out darker
THREE.ColorManagement.enabled = false;

const main = document.querySelector("main");
const hint = document.querySelector<HTMLElement>(".hint");
if (!main || !hint) {
	throw new Error("main or hint element not found");
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
main.appendChild(renderer.domElement);

const uniforms = {
	uTime: { value: 0 },
	uResolution: { value: new THREE.Vector2() },
	uCamera: { value: null as THREE.VideoTexture | null },
	uCameraResolution: { value: new THREE.Vector2(1, 1) },
	uCells: { value: 18 },
	uSpeed: { value: 0.4 },
	uEdge: { value: 0.05 },
	uSaturation: { value: 1.4 },
};

const scene = new THREE.Scene();
const camera = new THREE.Camera();
const material = new THREE.ShaderMaterial({
	vertexShader,
	fragmentShader,
	uniforms,
});
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

/** Matches the canvas to "main" and keeps "uResolution" in drawing-buffer pixels */
const resize = () => {
	renderer.setSize(main.clientWidth, main.clientHeight, false);
	renderer.getDrawingBufferSize(uniforms.uResolution.value);
};
new ResizeObserver(resize).observe(main);

const gui = new GUI({ container: main });
gui.add(uniforms.uCells, "value", 3, 60, 1).name("Cells");
gui.add(uniforms.uSpeed, "value", 0, 2).name("Drift");
gui.add(uniforms.uEdge, "value", 0, 0.3).name("Lead");
gui.add(uniforms.uSaturation, "value", 0, 2).name("Saturation");
gui.hide();

/** Asks for the webcam, then starts rendering */
const startCamera = async () => {
	hint.textContent = "Starting webcam...";
	try {
		const video = document.createElement("video");
		video.muted = true;
		video.playsInline = true;
		video.srcObject = await navigator.mediaDevices.getUserMedia({
			video: { facingMode: "user" },
		});
		await video.play();
		uniforms.uCamera.value = new THREE.VideoTexture(video);
		uniforms.uCameraResolution.value.set(
			video.videoWidth,
			video.videoHeight,
		);
		hint.hidden = true;
		gui.show();
		renderer.setAnimationLoop((time) => {
			uniforms.uTime.value = time / 1000;
			renderer.render(scene, camera);
		});
	} catch {
		hint.textContent =
			"Couldn't access the webcam - check your browser's camera permission.";
	}
};
main.addEventListener("click", () => {
	if (uniforms.uCamera.value === null) {
		void startCamera();
	}
});

