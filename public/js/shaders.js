/* RetroZone shaders, MIT license. See THIRD_PARTY_NOTICES.md. */

export const vertexShaderSource = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

export const crtFragmentSource = `
precision mediump float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;

varying vec2 v_texCoord;

#define PI 3.14159265359
#define BLOOM_STRENGTH 0.65
#define HALATION_STRENGTH 0.35
#define MASK_STRENGTH 0.12
#define NOISE_STRENGTH 0.025
#define FLICKER_STRENGTH 0.08
#define CURVATURE_STRENGTH 0.04
#define CORNER_RADIUS 0.15

const vec2 vRes = vec2(256.0, 224.0);
const vec2 vTexel = vec2(1.0 / 256.0, 1.0 / 224.0);

vec3 toLinear(vec3 c) { return c * c; }
vec3 toGamma(vec3 c) { return sqrt(c); }

vec3 noise3(vec2 co, float t) {
  float r = fract(sin(dot(co + t, vec2(12.9898, 78.233))) * 43758.5453);
  float g = fract(sin(dot(co + t, vec2(93.9898, 67.345))) * 43758.5453);
  float b = fract(sin(dot(co + t, vec2(41.9898, 29.876))) * 43758.5453);
  return vec3(r, g, b) * 2.0 - 1.0;
}

vec2 curveUV(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  c *= 1.0 + dot(c, c) * CURVATURE_STRENGTH;
  return c * 0.5 + 0.5;
}

float roundedRectSDF(vec2 uv, vec2 s, float r) {
  vec2 d = abs(uv - 0.5) * 2.0 - s + r;
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
}

vec3 maxSample(vec2 uv) {
  vec2 vs = vec2(0.0, 0.4 * vTexel.y);
  vec2 hs = vec2(0.4 * vTexel.x, 0.0);
  vec3 s0 = toLinear(texture2D(u_texture, uv).rgb);
  vec3 s1 = toLinear(texture2D(u_texture, uv - vs).rgb);
  vec3 s2 = toLinear(texture2D(u_texture, uv + vs).rgb);
  vec3 s3 = toLinear(texture2D(u_texture, uv - hs).rgb);
  vec3 s4 = toLinear(texture2D(u_texture, uv + hs).rgb);
  return max(max(max(s0, s1), max(s2, s3)), s4);
}

vec3 getBlur(vec2 uv) {
  vec3 r = toLinear(texture2D(u_texture, uv).rgb) * 0.4;
  r += toLinear(texture2D(u_texture, uv + vec2(-vTexel.x, 0.0)).rgb) * 0.15;
  r += toLinear(texture2D(u_texture, uv + vec2( vTexel.x, 0.0)).rgb) * 0.15;
  r += toLinear(texture2D(u_texture, uv + vec2(0.0, -vTexel.y)).rgb) * 0.15;
  r += toLinear(texture2D(u_texture, uv + vec2(0.0,  vTexel.y)).rgb) * 0.15;
  return r;
}

void main() {
  vec2 uv = v_texCoord;

  if (roundedRectSDF(uv, vec2(1.0, 1.0), CORNER_RADIUS) > 0.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec2 curved = curveUV(uv);
  const float margin = 0.001;
  if (curved.x < -margin || curved.x > 1.0 + margin ||
      curved.y < -margin || curved.y > 1.0 + margin) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  curved = clamp(curved, 0.0, 1.0);

  float pitch = u_resolution.y / vRes.y;

  // Virtual pixel sampling with NTSC horizontal blend
  vec2 vPos = curved * vRes;
  vec2 pxCenter = (floor(vPos) + 0.5) / vRes;
  vec3 center = maxSample(pxCenter);
  vec3 colL = toLinear(texture2D(u_texture, pxCenter - vec2(vTexel.x, 0.0)).rgb);
  vec3 colR = toLinear(texture2D(u_texture, pxCenter + vec2(vTexel.x, 0.0)).rgb);
  float blendAmt = mix(0.18, 0.10, smoothstep(1.5, 3.0, pitch));
  float fx = fract(vPos.x);
  float wL = blendAmt * (1.0 - fx);
  float wR = blendAmt * fx;
  vec3 color = center * (1.0 - wL - wR) + colL * wL + colR * wR;

  // Bloom + halation
  vec3 tightBlur = getBlur(pxCenter);
  color += max(tightBlur - 0.6, 0.0) * 2.5 * BLOOM_STRENGTH;
  vec2 ht = vTexel * 3.0;
  vec3 halation = toLinear(texture2D(u_texture, pxCenter + vec2(-ht.x, 0.0)).rgb)
                + toLinear(texture2D(u_texture, pxCenter + vec2( ht.x, 0.0)).rgb)
                + toLinear(texture2D(u_texture, pxCenter + vec2(0.0, -ht.y)).rgb)
                + toLinear(texture2D(u_texture, pxCenter + vec2(0.0,  ht.y)).rgb);
  color += max(halation * 0.25 - 0.45, 0.0) * 1.5 * HALATION_STRENGTH;

  // Gaussian beam scanlines with brightness-dependent bloom
  float virtualY = curved.y * vRes.y;
  float d = fract(virtualY) - 0.5;
  float baseSigma = mix(0.65, 0.35, smoothstep(1.5, 3.0, pitch));
  float bright = max(max(color.r, color.g), color.b);
  float sigma = baseSigma + bright * 0.12;
  float beam = exp(-0.5 * d * d / (sigma * sigma));
  color *= mix(1.0, beam, smoothstep(1.0, 2.0, pitch));

  // Aperture grille (Trinitron-style vertical RGB stripes)
  float mx = mod(gl_FragCoord.x, 3.0);
  vec3 mask;
  if (mx < 1.0) {
    mask = vec3(1.0 + MASK_STRENGTH, 1.0 - MASK_STRENGTH * 0.5, 1.0 - MASK_STRENGTH * 0.5);
  } else if (mx < 2.0) {
    mask = vec3(1.0 - MASK_STRENGTH * 0.5, 1.0 + MASK_STRENGTH, 1.0 - MASK_STRENGTH * 0.5);
  } else {
    mask = vec3(1.0 - MASK_STRENGTH * 0.5, 1.0 - MASK_STRENGTH * 0.5, 1.0 + MASK_STRENGTH);
  }
  float sep = smoothstep(0.0, 0.5, mx) * smoothstep(3.0, 2.5, mx);
  mask *= mix(0.88, 1.0, sep);
  color *= mix(vec3(1.0), mask, smoothstep(1.0, 2.0, pitch));

  // Warm color temperature
  color *= vec3(1.04, 1.01, 0.95);

  // Interlace flicker
  float fieldPhase = mod(floor(u_time * 30.0), 2.0);
  float scanIdx = floor(virtualY);
  float interlace = mod(scanIdx + fieldPhase, 2.0);
  color *= 1.0 - interlace * 0.015 * smoothstep(1.5, 2.5, pitch);

  // Vignette
  vec2 ctr = curved * 2.0 - 1.0;
  color *= 1.0 - dot(ctr, ctr) * 0.12;

  // RGB static noise
  color += noise3(gl_FragCoord.xy, u_time) * NOISE_STRENGTH;

  // Power supply flicker
  float flicker = sin(u_time * 13.7) * 0.5 + sin(u_time * 7.3) * 0.3 + sin(u_time * 23.1) * 0.2;
  float cb = max(max(color.r, color.g), color.b);
  color *= 1.0 + flicker * FLICKER_STRENGTH * (1.0 + cb * 0.5);

  gl_FragColor = vec4(clamp(toGamma(color), 0.0, 1.0), 1.0);
}
`;

export const bloomDownsampleFragSrc = `
precision mediump float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;

varying vec2 v_texCoord;

void main() {
  vec2 texelSize = 1.0 / u_resolution;
  vec2 halfTexel = texelSize * 0.5;

  vec3 a = texture2D(u_texture, v_texCoord + vec2(-halfTexel.x, -halfTexel.y)).rgb;
  vec3 b = texture2D(u_texture, v_texCoord + vec2( halfTexel.x, -halfTexel.y)).rgb;
  vec3 c = texture2D(u_texture, v_texCoord + vec2(-halfTexel.x,  halfTexel.y)).rgb;
  vec3 d = texture2D(u_texture, v_texCoord + vec2( halfTexel.x,  halfTexel.y)).rgb;

  vec3 color = (a + b + c + d) * 0.25;

  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  float knee = 0.25;
  float threshold = 0.15;
  float soft = luma - threshold + knee;
  soft = clamp(soft / (2.0 * knee), 0.0, 1.0);
  soft = soft * soft;
  float contribution = max(soft, step(threshold + knee, luma));

  gl_FragColor = vec4(color * contribution, 1.0);
}
`;

export const blurFragSrc = `
precision mediump float;

uniform sampler2D u_texture;
uniform vec2 u_direction;
uniform vec2 u_resolution;

varying vec2 v_texCoord;

void main() {
  vec2 texelSize = u_direction / u_resolution;

  vec3 result = vec3(0.0);
  result += texture2D(u_texture, v_texCoord + texelSize * -4.0).rgb * 0.0162;
  result += texture2D(u_texture, v_texCoord + texelSize * -3.0).rgb * 0.0540;
  result += texture2D(u_texture, v_texCoord + texelSize * -2.0).rgb * 0.1216;
  result += texture2D(u_texture, v_texCoord + texelSize * -1.0).rgb * 0.1945;
  result += texture2D(u_texture, v_texCoord).rgb * 0.2270;
  result += texture2D(u_texture, v_texCoord + texelSize *  1.0).rgb * 0.1945;
  result += texture2D(u_texture, v_texCoord + texelSize *  2.0).rgb * 0.1216;
  result += texture2D(u_texture, v_texCoord + texelSize *  3.0).rgb * 0.0540;
  result += texture2D(u_texture, v_texCoord + texelSize *  4.0).rgb * 0.0162;

  gl_FragColor = vec4(result, 1.0);
}
`;

export const vectorCompositeFragSrc = `
precision mediump float;

uniform sampler2D u_texture;
uniform sampler2D u_bloom;
uniform sampler2D u_prevFrame;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_phosphorDecay;
uniform vec2 u_motion;
uniform float u_zoomMotion;
uniform vec2 u_cameraOffset;

varying vec2 v_texCoord;

#define CURVATURE 0.012
#define CORNER_RADIUS 0.018

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

float hash(vec2 co, float t) {
  return fract(sin(dot(co + t, vec2(12.9898, 78.233))) * 43758.5453);
}

float hash2(vec2 co) {
  return fract(sin(dot(co, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 curveUV(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  c *= 1.0 + dot(c, c) * CURVATURE;
  return c * 0.5 + 0.5;
}

float roundedRectSDF(vec2 uv, vec2 s, float r) {
  vec2 d = abs(uv - 0.5) * 2.0 - s + r;
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// Color grading: maps source colors to blue phosphor aesthetic
vec3 vectorColorGrade(vec3 src) {
  // Retain the feature palette through the display pass.
  return src * vec3(1.0, 1.02, 1.04);
}

// Edge beam defocus
vec3 defocusedSample(vec2 uv) {
  vec2 texel = vec2(1.0) / u_resolution;
  vec2 fromCenter = uv - 0.5;
  float edgeDist = dot(fromCenter, fromCenter) * 2.0;
  float defocusRadius = edgeDist * 1.15;

  if (defocusRadius < 0.3) {
    return texture2D(u_texture, uv).rgb;
  }

  float r = defocusRadius;
  vec3 sum = texture2D(u_texture, uv).rgb * 0.40;
  sum += texture2D(u_texture, clamp(uv + vec2(-texel.x * r, 0.0), 0.0, 1.0)).rgb * 0.10;
  sum += texture2D(u_texture, clamp(uv + vec2( texel.x * r, 0.0), 0.0, 1.0)).rgb * 0.10;
  sum += texture2D(u_texture, clamp(uv + vec2(0.0, -texel.y * r), 0.0, 1.0)).rgb * 0.10;
  sum += texture2D(u_texture, clamp(uv + vec2(0.0,  texel.y * r), 0.0, 1.0)).rgb * 0.10;
  sum += texture2D(u_texture, clamp(uv + vec2(-texel.x * r, -texel.y * r) * 0.7, 0.0, 1.0)).rgb * 0.05;
  sum += texture2D(u_texture, clamp(uv + vec2( texel.x * r, -texel.y * r) * 0.7, 0.0, 1.0)).rgb * 0.05;
  sum += texture2D(u_texture, clamp(uv + vec2(-texel.x * r,  texel.y * r) * 0.7, 0.0, 1.0)).rgb * 0.05;
  sum += texture2D(u_texture, clamp(uv + vec2( texel.x * r,  texel.y * r) * 0.7, 0.0, 1.0)).rgb * 0.05;
  return sum;
}

void main() {
  vec2 uv = v_texCoord;

  if (roundedRectSDF(uv, vec2(1.0, 1.0), CORNER_RADIUS) > 0.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec2 curved = curveUV(uv);
  if (curved.x < 0.0 || curved.x > 1.0 || curved.y < 0.0 || curved.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec2 softStep = 1.15 / u_resolution;
  vec3 core = defocusedSample(curved) * 0.44;
  core += defocusedSample(curved + vec2(softStep.x, 0.0)) * 0.14;
  core += defocusedSample(curved - vec2(softStep.x, 0.0)) * 0.14;
  core += defocusedSample(curved + vec2(0.0, softStep.y)) * 0.14;
  core += defocusedSample(curved - vec2(0.0, softStep.y)) * 0.14;
  core *= 0.88;
  vec3 color = vectorColorGrade(core);

  for (int i = 1; i <= 8; i++) {
    float t = float(i) / 9.0;
    vec2 sampleUV = curved + (u_motion + (curved - 0.5 - u_cameraOffset) * u_zoomMotion) * t;
    if (sampleUV.x >= 0.0 && sampleUV.x <= 1.0 && sampleUV.y >= 0.0 && sampleUV.y <= 1.0) {
      color = max(color, vectorColorGrade(defocusedSample(sampleUV)) * (0.65 - 0.30 * t));
    }
  }

  // Bloom (half-res, Y-flipped for FBO convention)
  vec3 bloomSample = texture2D(u_bloom, vec2(curved.x, 1.0 - curved.y)).rgb;
  vec3 bloomGraded = vectorColorGrade(bloomSample);
  color += bloomGraded * 0.90;

  // Chromatic aberration
  vec2 fromCenter = curved - 0.5;
  float caStrength = dot(fromCenter, fromCenter) * 0.008;
  if (caStrength > 0.0005) {
    vec2 caOffset = fromCenter * caStrength;
    float rShift = luma(vectorColorGrade(texture2D(u_texture, clamp(curved + caOffset, 0.0, 1.0)).rgb));
    float bShift = luma(vectorColorGrade(texture2D(u_texture, clamp(curved - caOffset, 0.0, 1.0)).rgb));
    color.r = mix(color.r, color.r * (1.0 + (rShift - luma(color)) * 0.3), 0.5);
    color.b = mix(color.b, color.b * (1.0 + (bShift - luma(color)) * 0.3), 0.5);
  }

  // Phosphor grain
  vec2 grainCoord = gl_FragCoord.xy;
  float grain = hash2(grainCoord) * 0.11 - 0.055;
  float intensity = luma(color);
  float grainAmt = smoothstep(0.08, 0.6, intensity);
  color += grain * grainAmt;

  // Glass surface reflection
  vec2 glassCoord = curved * 2.0 - 1.0;
  float glassHighlight = 1.0 - dot(glassCoord, glassCoord) * 0.5;
  glassHighlight = max(glassHighlight, 0.0);
  color += vec3(0.002, 0.003, 0.006) * glassHighlight;

  // Blue phosphor glass tint
  float blueVar = 0.7 + 0.3 * sin(u_time * 0.4 + curved.y * 4.0 + curved.x * 2.5);
  float blueNoise = hash2(floor(gl_FragCoord.xy * 0.5)) * 0.15;
  vec3 blueTint = vec3(0.02, 0.03, 0.08) * (blueVar + blueNoise);
  float blueGate = max(0.55, smoothstep(0.15, 1.0, luma(color)));
  color += blueTint * blueGate;

  // Analog noise
  float n = (hash(gl_FragCoord.xy, u_time) - 0.5) * 0.01;
  color += n;

  // Beam flicker
  float flicker = sin(u_time * 8.3) * 0.013 + sin(u_time * 17.1) * 0.006;
  color *= 1.0 + flicker;

  // Per-channel phosphor persistence
  vec2 jitter = vec2(
    (hash(gl_FragCoord.xy, u_time) - 0.5),
    (hash(gl_FragCoord.yx, u_time + 17.0) - 0.5)
  ) * 0.0004;
  vec3 prev = texture2D(u_prevFrame, vec2(uv.x, 1.0 - uv.y) + jitter).rgb;
  float phosphorFade = u_phosphorDecay * mix(1.0, 0.50, smoothstep(0.015, 0.18, luma(prev)));
  vec3 warmAfterglow = vec3(luma(prev) * 0.95, luma(prev) * 0.77, luma(prev) * 0.22);
  vec3 aged = mix(prev, warmAfterglow, 0.12);
  color = max(color * 1.22, aged * phosphorFade);

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export const passthroughFragmentSource = `
precision mediump float;
uniform sampler2D u_texture;
varying vec2 v_texCoord;
void main() {
  gl_FragColor = texture2D(u_texture, vec2(v_texCoord.x, 1.0 - v_texCoord.y));
}
`;
