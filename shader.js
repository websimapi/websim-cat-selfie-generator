export const vertSrc = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const fragSrc = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime;
uniform float uIntensity;
uniform float uBaseZoom;
uniform vec2 uNudge; // -1..1 drag influence

varying vec2 vUv;

float easeInOut(float t){ return t*t*(3.0-2.0*t); }

vec2 barrel(vec2 uv, float k){
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  vec2 res = cc * (1.0 + k * r2);
  return res + 0.5;
}

void main() {
  float t = uTime * 0.65;

  // Organic micro wobble
  float wobX = sin(t*1.3) * 0.003 * uIntensity;
  float wobY = cos(t*1.7) * 0.003 * uIntensity;

  // Breathing zoom
  float zPulse = sin(t*0.9) * 0.02 * uIntensity;
  float zoom = uBaseZoom + zPulse;

  // Slow drift + user nudge
  vec2 drift = vec2(sin(t*0.6), cos(t*0.5)) * 0.012 * uIntensity;
  vec2 nudge = uNudge * 0.02 * uIntensity;

  vec2 uv = vUv;
  uv -= 0.5;
  uv *= zoom;
  uv += 0.5;

  uv += vec2(wobX, wobY) + drift + nudge;

  // Subtle barrel distortion
  uv = barrel(uv, 0.12 * uIntensity);

  // Chromatic aberration
  float ca = 0.003 * uIntensity;
  vec2 dir = normalize(uv - 0.5 + 1e-5);
  vec2 caOff = dir * ca;

  vec3 col;
  col.r = texture2D(uTex, uv + caOff).r;
  col.g = texture2D(uTex, uv).g;
  col.b = texture2D(uTex, uv - caOff).b;

  // Soft vignette
  float d = distance(uv, vec2(0.5));
  float vig = smoothstep(0.9, 0.4, d);
  col *= mix(0.92, 1.0, vig);

  // Clamp when outside
  if(uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0){
    col *= 0.95;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

