import { vertSrc, fragSrc } from "./shader.js";

const canvas = document.getElementById("glcanvas");
const genBtn = document.getElementById("genBtn");
const stopBtn = document.getElementById("stopBtn");
const loading = document.getElementById("loading");
const placeholder = document.getElementById("placeholder");
const imgEl = document.getElementById("hiddenImg");
const intensityEl = document.getElementById("intensity");
const zoomEl = document.getElementById("zoom");

let gl, program, tex, aPos, uLocs;
let rafId = null;
let startTime = 0;
let paused = false;
let imageReady = false;
let nudge = { x: 0, y: 0 };
let nudgeTarget = { x: 0, y: 0 };

function setupGL() {
  gl = canvas.getContext("webgl", { preserveDrawingBuffer: false, antialias: true });
  if (!gl) {
    alert("WebGL not supported.");
    return;
  }
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vertSrc);
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, fragSrc);
  gl.compileShader(fs);

  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS) || !gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs));
    alert("Shader compile error.");
    return;
  }

  program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    alert("Shader link error.");
    return;
  }

  gl.useProgram(program);

  // Fullscreen triangle (2 triangles as a quad)
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const verts = new Float32Array([
    -1, -1,  1, -1, -1,  1,
     1, -1,  1,  1, -1,  1,
  ]);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

  aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  uLocs = {
    uTex: gl.getUniformLocation(program, "uTex"),
    uRes: gl.getUniformLocation(program, "uRes"),
    uTime: gl.getUniformLocation(program, "uTime"),
    uIntensity: gl.getUniformLocation(program, "uIntensity"),
    uBaseZoom: gl.getUniformLocation(program, "uBaseZoom"),
    uNudge: gl.getUniformLocation(program, "uNudge"),
  };

  tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  resize();
  window.addEventListener("resize", resize, { passive: true });
}

function resize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";
  if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
}

function uploadTexture(image) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
}

function animate(t) {
  rafId = requestAnimationFrame(animate);
  if (!gl || !imageReady) return;

  if (!paused) {
    const elapsed = (performance.now() - startTime) / 1000;

    // Smooth nudge easing back to 0
    nudge.x += (nudgeTarget.x - nudge.x) * 0.08;
    nudge.y += (nudgeTarget.y - nudge.y) * 0.08;

    gl.useProgram(program);
    gl.uniform1i(uLocs.uTex, 0);
    gl.uniform2f(uLocs.uRes, canvas.width, canvas.height);
    gl.uniform1f(uLocs.uTime, elapsed);
    gl.uniform1f(uLocs.uIntensity, parseFloat(intensityEl.value));
    gl.uniform1f(uLocs.uBaseZoom, parseFloat(zoomEl.value));
    gl.uniform2f(uLocs.uNudge, nudge.x, nudge.y);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}

function setLoading(isLoading) {
  loading.hidden = !isLoading;
  placeholder.hidden = isLoading || imageReady;
  genBtn.disabled = isLoading;
  if (isLoading) simulateProgress();
}

function simulateProgress() {
  // Visual 10s spinner already animates; no explicit progress bar width.
  // Could extend if needed.
}

async function generateImage(aspect) {
  setLoading(true);
  try {
    const prompt = [
      "extreme close-up selfie of a cat looking into the camera",
      "nose and whiskers very near the lens, shallow depth of field",
      "front-facing, endearing expression, photorealistic, ultra-detailed",
      "soft lighting, studio-quality, high-resolution",
      "captured on a smartphone front camera, slight lens distortion"
    ].join(", ");

    const result = await websim.imageGen({
      prompt,
      aspect_ratio: aspect,
      seed: Math.floor(Math.random() * 1000000),
    });

    imgEl.onload = () => {
      uploadTexture(imgEl);
      imageReady = true;
      setLoading(false);
      placeholder.hidden = true;
      startTime = performance.now();
    };
    imgEl.onerror = () => {
      setLoading(false);
      alert("Failed to load generated image. Please try again.");
    };
    imgEl.src = result.url;
  } catch (e) {
    console.error(e);
    setLoading(false);
    alert("Image generation failed. Please try again.");
  }
}

function currentAspect() {
  const selected = document.querySelector('input[name="aspect"]:checked');
  return selected ? selected.value : "9:16";
}

// Touch/drag input for motion nudge
function setupInteractions() {
  let dragging = false;
  let start = { x: 0, y: 0 };

  const toNorm = (x, y) => {
    const rect = canvas.getBoundingClientRect();
    const nx = ((x - rect.left) / rect.width) * 2 - 1;
    const ny = ((y - rect.top) / rect.height) * 2 - 1;
    return { x: nx, y: -ny };
  };

  const onDown = (e) => {
    dragging = true;
    paused = false;
    stopBtn.setAttribute("aria-pressed", "false");
    const p = e.touches ? e.touches[0] : e;
    start = toNorm(p.clientX, p.clientY);
    nudgeTarget = { x: 0, y: 0 };
  };

  const onMove = (e) => {
    if (!dragging) return;
    const p = e.touches ? e.touches[0] : e;
    const cur = toNorm(p.clientX, p.clientY);
    nudgeTarget = {
      x: (cur.x - start.x),
      y: (cur.y - start.y),
    };
  };

  const onUp = () => {
    dragging = false;
    // ease back to center
    nudgeTarget = { x: 0, y: 0 };
  };

  // Long press to toggle pause
  let pressTimer = null;
  const onPressStart = () => {
    pressTimer = setTimeout(() => {
      paused = !paused;
      stopBtn.setAttribute("aria-pressed", paused ? "true" : "false");
    }, 500);
  };
  const onPressEnd = () => {
    clearTimeout(pressTimer);
  };

  canvas.addEventListener("touchstart", (e) => { onDown(e); onPressStart(); }, { passive: true });
  canvas.addEventListener("touchmove", onMove, { passive: true });
  canvas.addEventListener("touchend", () => { onUp(); onPressEnd(); }, { passive: true });
  canvas.addEventListener("mousedown", (e) => { onDown(e); onPressStart(); });
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", () => { onUp(); onPressEnd(); });

  stopBtn.addEventListener("click", () => {
    paused = !paused;
    stopBtn.setAttribute("aria-pressed", paused ? "true" : "false");
  });
}

function init() {
  setupGL();
  setupInteractions();
  animate();
  genBtn.addEventListener("click", async () => {
    await generateImage(currentAspect());
  });
}

init();

