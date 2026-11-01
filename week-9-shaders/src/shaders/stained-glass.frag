// Only the VS Code Shader Validator sees this - Vite resolves "#include" and three.js sets precision.
#ifdef SHADER_VALIDATOR
#extension GL_GOOGLE_include_directive : enable
precision highp float;
#endif

#include "../../node_modules/lygia/generative/random.glsl"
#include "../../node_modules/lygia/math/const.glsl"

// #region Uniforms
// Setup uniforms
uniform float uTime;					// Time in seconds
uniform vec2 uResolution;				// Resolution of the canvas in pixels

// Camera uniforms
uniform sampler2D uCamera;				// Webcam texture
uniform vec2 uCameraResolution;			// Resolution of the webcam texture in pixels

// Slider uniforms
uniform float uCells;					// Number of cells in the stained glass effect
uniform float uSpeed;					// Speed of the drifting seeds
uniform float uEdge;					// Width of the lead lines between cells
uniform float uSaturation;				// Saturation of the colors sampled from the webcam
// #endregion

/** Screen UV to webcam UV - mirrored, and cropped to cover the canvas */
vec2 cameraUV(vec2 screenUV) {
	// Get the aspect rations of the canvas and the camera
	float canvasAspect = uResolution.x / uResolution.y;
	float cameraAspect = uCameraResolution.x / uCameraResolution.y;

	// Crop the screen UV to the camera aspect ratio, then mirror it horizontally
	vec2 crop = canvasAspect > cameraAspect
		? vec2(1.0, cameraAspect / canvasAspect)
		: vec2(canvasAspect / cameraAspect, 1.0);
	vec2 centered = (screenUV - 0.5) * crop + 0.5;
	return vec2(1.0 - centered.x, centered.y);
}

void main() {
	// Get the cell coordinates of the current pixel
	vec2 point = gl_FragCoord.xy / uResolution.y * uCells;
	vec2 cell = floor(point);

	// Find the nearest and second-nearest seeds to the current pixel
	vec2 nearestSeed = vec2(0.0);
	float nearestDistance = 10.0;
	float secondDistance = 10.0;
	for (int row = -1; row <= 1; row++) {
		for (int column = -1; column <= 1; column++) {
			vec2 neighbor = cell + vec2(float(column), float(row)); // One of the 3x3 grid squares around this pixel
			vec2 jitter = 0.5 + 0.4 * sin(uTime * uSpeed + TAU * random2(neighbor)); // Seed's drifting offset inside that square

			vec2 seed = neighbor + jitter;
			float seedDistance = distance(point, seed);

			if (seedDistance < nearestDistance) {
				secondDistance = nearestDistance;
				nearestDistance = seedDistance;
				nearestSeed = seed;
			} else if (seedDistance < secondDistance) {
				secondDistance = seedDistance;
			}
		}
	}

	// Sample the color from the webcam at the nearest seed's position
	vec2 seedUV = nearestSeed / uCells * vec2(uResolution.y / uResolution.x, 1.0);
	vec3 color = texture2D(uCamera, cameraUV(seedUV)).rgb;

	// Boost saturation, then brighten each cell's middle so it glows like backlit glass
	float luma = dot(color, vec3(0.299, 0.587, 0.114));
	color = mix(vec3(luma), color, uSaturation);
	color *= mix(0.8, 1.15, smoothstep(0.7, 0.0, nearestDistance));

	// Draw the lead lines between cells
	float lead = smoothstep(uEdge, uEdge + 0.03, secondDistance - nearestDistance);
	gl_FragColor = vec4(mix(vec3(0.04), color, lead), 1.0);
}
