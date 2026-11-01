// Only the VS Code Shader Validator sees this - three.js declares "position".
#ifdef SHADER_VALIDATOR
attribute vec3 position;
#endif

void main() {
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
