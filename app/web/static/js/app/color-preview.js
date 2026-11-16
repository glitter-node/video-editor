const vertexSource = `attribute vec2 position;
varying vec2 uv;
void main() {
  uv = (position + 1.0) * 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;
const fragmentSource = `precision mediump float;
varying vec2 uv;
uniform sampler2D frame;
uniform float brightness;
uniform float contrast;
uniform float saturation;
uniform float gammaValue;
void main() {
  vec3 color = texture2D(frame, uv).rgb;
  color = clamp((color - 0.5) * contrast + 0.5 + brightness, 0.0, 1.0);
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = clamp(mix(vec3(luma), color, saturation), 0.0, 1.0);
  color = pow(color, vec3(1.0 / gammaValue));
  gl_FragColor = vec4(color, 1.0);
}`;

export function createColorPreview(canvas, video, onUnavailable) {
  let gl = null;
  let program = null;
  let texture = null;
  let buffer = null;
  let uniforms = null;
  let failed = false;
  let lost = false;

  function report(error) {
    canvas.hidden = true;
    if (!failed) onUnavailable(error);
    failed = true;
  }

  function shader(type, source) {
    const item = gl.createShader(type);
    gl.shaderSource(item, source);
    gl.compileShader(item);
    if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) { const message = gl.getShaderInfoLog(item) || "Shader compilation failed."; gl.deleteShader(item); throw new Error(message); }
    return item;
  }

  function initialize() {
    if (failed || lost) return false;
    if (program) return true;
    try {
      gl = canvas.getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: true });
      if (!gl) throw new Error("WebGL is unavailable.");
      const vertex = shader(gl.VERTEX_SHADER, vertexSource);
      const fragment = shader(gl.FRAGMENT_SHADER, fragmentSource);
      program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Shader linking failed.");
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      uniforms = Object.fromEntries(["frame", "brightness", "contrast", "saturation", "gammaValue"].map((name) => [name, gl.getUniformLocation(program, name)]));
      return true;
    } catch (error) { destroy(); report(error); return false; }
  }

  function render(values, source = video) {
    if (!values || (values.brightness === 0 && values.contrast === 1 && values.saturation === 1 && values.gamma === 1)) { canvas.hidden = true; return; }
    if (video.hidden || video.readyState < 2 || !video.videoWidth || !video.videoHeight || !initialize()) { canvas.hidden = true; return; }
    const frame = { width: video.clientWidth, height: video.clientHeight };
    const stretched = video.closest(".preview-stage.canvas-enabled");
    const width = stretched ? frame.width : Math.min(frame.width, frame.height * video.videoWidth / video.videoHeight);
    const height = stretched ? frame.height : Math.min(frame.height, frame.width * video.videoHeight / video.videoWidth);
    if (!width || !height) { canvas.hidden = true; return; }
    canvas.style.left = `${(frame.width - width) / 2}px`;
    canvas.style.top = `${(frame.height - height) / 2}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ratio = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
    try {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const position = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.uniform1i(uniforms.frame, 0);
      gl.uniform1f(uniforms.brightness, values.brightness);
      gl.uniform1f(uniforms.contrast, values.contrast);
      gl.uniform1f(uniforms.saturation, values.saturation);
      gl.uniform1f(uniforms.gammaValue, values.gamma);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      canvas.hidden = false;
    } catch (error) { report(error); }
  }

  function destroy() {
    canvas.hidden = true;
    if (gl && !lost) {
      if (texture) gl.deleteTexture(texture);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    }
    program = null;
    texture = null;
    buffer = null;
    uniforms = null;
    gl = null;
    failed = false;
  }

  canvas.addEventListener("webglcontextlost", (event) => { event.preventDefault(); lost = true; program = null; texture = null; buffer = null; canvas.hidden = true; report(new Error("WebGL context was lost.")); });
  canvas.addEventListener("webglcontextrestored", () => { lost = false; failed = false; gl = null; program = null; onUnavailable(null); });
  return { render, destroy };
}
