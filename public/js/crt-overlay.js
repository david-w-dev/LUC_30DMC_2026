import {
  vertexShaderSource,
  crtFragmentSource,
  bloomDownsampleFragSrc,
  blurFragSrc,
  vectorCompositeFragSrc,
  passthroughFragmentSource,
} from "./shaders.js";

/*
MIT License

Copyright (c) 2025 RetroZone Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/
/**
 * WebGL shader overlay for CRT and Vector display effects.
 *
 * Creates a WebGL canvas that sits on top of your game canvas and applies
 * real-time post-processing effects. Two display modes are supported:
 *
 * CRT Mode (single-pass):
 *   256x224 NTSC simulation with gaussian beam scanlines, aperture grille mask,
 *   bloom, halation, barrel distortion, warm color temperature, interlace flicker.
 *
 * Vector Mode (5-pass):
 *   Blue phosphor CRT with multi-pass bloom, per-channel phosphor persistence,
 *   color grading, chromatic aberration, grain, and edge beam defocus.
 */

// ── Shared vertex shader ──

// ── CRT raster display shader ──

// ── Bloom downsample shader ──

// ── Separable Gaussian blur shader ──

// ── Vector composite shader ──

// ── Passthrough shader (blit FBO to screen) ──

// ── WebGL helpers ──

function compileGL(gl, src, type) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error("RetroZone shader compile error:", gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function buildProgram(gl, vertSrc, fragSrc) {
  const vs = compileGL(gl, vertSrc, gl.VERTEX_SHADER);
  const fs = compileGL(gl, fragSrc, gl.FRAGMENT_SHADER);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("RetroZone program link error:", gl.getProgramInfoLog(prog));
    return null;
  }
  return {
    program: prog,
    aPosition: gl.getAttribLocation(prog, "a_position"),
    aTexCoord: gl.getAttribLocation(prog, "a_texCoord"),
    uResolution: gl.getUniformLocation(prog, "u_resolution"),
    uTime: gl.getUniformLocation(prog, "u_time"),
  };
}

/**
 * Create a shader overlay on top of the given canvas.
 *
 * @param {HTMLCanvasElement} gameCanvas - The source canvas to apply effects to
 * @param {Object} [options]
 * @param {string} [options.mode='vector'] - Initial display mode: 'vector' or 'crt'
 * @param {number} [options.phosphorDecay=0.78] - Phosphor persistence decay (0-1, vector mode only)
 * @returns {Object} Overlay control object
 */
export function createShaderOverlay(gameCanvas, options = {}) {
  const initialMode = options.mode || "vector";
  const initialDecay = options.phosphorDecay ?? 0.78;

  const overlay = document.createElement("canvas");
  overlay.style.position = "absolute";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "1000";
  overlay.id = "retrozone-overlay";

  const updateOverlayPosition = () => {
    const rect = gameCanvas.getBoundingClientRect();
    overlay.style.left = rect.left + "px";
    overlay.style.top = rect.top + "px";
    overlay.width = rect.width;
    overlay.height = rect.height;
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";
  };

  document.body.appendChild(overlay);
  setTimeout(updateOverlayPosition, 0);
  window.addEventListener("resize", updateOverlayPosition);
  window.addEventListener("scroll", updateOverlayPosition);

  const gl =
    overlay.getContext("webgl") || overlay.getContext("experimental-webgl");
  if (!gl) {
    console.error("RetroZone: WebGL not supported");
    return null;
  }

  // Build all shader programs
  const programs = {
    crt: buildProgram(gl, vertexShaderSource, crtFragmentSource),
    bloomDownsample: buildProgram(
      gl,
      vertexShaderSource,
      bloomDownsampleFragSrc,
    ),
    blur: buildProgram(gl, vertexShaderSource, blurFragSrc),
    vectorComposite: buildProgram(
      gl,
      vertexShaderSource,
      vectorCompositeFragSrc,
    ),
    passthrough: buildProgram(
      gl,
      vertexShaderSource,
      passthroughFragmentSource,
    ),
  };

  const blurUDirection = gl.getUniformLocation(
    programs.blur.program,
    "u_direction",
  );
  const compositeUTexture = gl.getUniformLocation(
    programs.vectorComposite.program,
    "u_texture",
  );
  const compositeUBloom = gl.getUniformLocation(
    programs.vectorComposite.program,
    "u_bloom",
  );
  const compositeUPrevFrame = gl.getUniformLocation(
    programs.vectorComposite.program,
    "u_prevFrame",
  );
  const compositeUPhosphorDecay = gl.getUniformLocation(
    programs.vectorComposite.program,
    "u_phosphorDecay",
  );
  const compositeUMotion = gl.getUniformLocation(
    programs.vectorComposite.program,
    "u_motion",
  );
  const compositeUZoomMotion = gl.getUniformLocation(
    programs.vectorComposite.program,
    "u_zoomMotion",
  );
  const compositeUCameraOffset = gl.getUniformLocation(
    programs.vectorComposite.program,
    "u_cameraOffset",
  );
  let frameMotionX = 0,
    frameMotionY = 0,
    frameLogZoom = 0,
    cameraX = 0,
    cameraY = 0;

  let currentPhosphorDecay = initialDecay;

  // Persistence FBOs (ping-pong, full-res)
  let persistA = null,
    persistB = null;
  let persistW = 0,
    persistH = 0;
  let pingPong = 0;

  // Bloom FBOs (half-res)
  let bloomA = null,
    bloomB = null;
  let bloomW = 0,
    bloomH = 0;

  function makeFBO(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      w,
      h,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      tex,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex };
  }

  function ensurePersistFBOs(w, h) {
    if (persistW === w && persistH === h) return;
    if (persistA) {
      gl.deleteFramebuffer(persistA.fb);
      gl.deleteTexture(persistA.tex);
    }
    if (persistB) {
      gl.deleteFramebuffer(persistB.fb);
      gl.deleteTexture(persistB.tex);
    }
    persistA = makeFBO(w, h);
    persistB = makeFBO(w, h);
    persistW = w;
    persistH = h;
    pingPong = 0;
  }

  function ensureBloomFBOs(w, h) {
    const halfW = Math.max(1, Math.floor(w / 2));
    const halfH = Math.max(1, Math.floor(h / 2));
    if (bloomW === halfW && bloomH === halfH) return;
    if (bloomA) {
      gl.deleteFramebuffer(bloomA.fb);
      gl.deleteTexture(bloomA.tex);
    }
    if (bloomB) {
      gl.deleteFramebuffer(bloomB.fb);
      gl.deleteTexture(bloomB.tex);
    }
    bloomA = makeFBO(halfW, halfH);
    bloomB = makeFBO(halfW, halfH);
    bloomW = halfW;
    bloomH = halfH;
  }

  // Full-screen quad
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, 1, 1, 0]),
    gl.STATIC_DRAW,
  );

  // Source texture
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.clearColor(0, 0, 0, 0);

  let activeShaderName = initialMode === "crt" ? "crt" : "vector";

  function applyTextureFilter(mode) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const filter = mode === "crt" ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  }
  applyTextureFilter(activeShaderName);

  function activateProgram(prog) {
    gl.useProgram(prog.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(prog.aPosition);
    gl.vertexAttribPointer(prog.aPosition, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(prog.aTexCoord);
    gl.vertexAttribPointer(prog.aTexCoord, 2, gl.FLOAT, false, 16, 8);
  }

  let running = true;
  let rafId = null;

  function render() {
    if (!running) return;

    updateOverlayPosition();
    if (
      overlay.width <= 0 ||
      overlay.height <= 0 ||
      !gameCanvas ||
      gameCanvas.width <= 0 ||
      gameCanvas.height <= 0
    ) {
      rafId = requestAnimationFrame(render);
      return;
    }

    const now = performance.now() / 1000;

    // Upload game canvas
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      gameCanvas,
    );

    if (activeShaderName === "vector") {
      ensurePersistFBOs(overlay.width, overlay.height);
      ensureBloomFBOs(overlay.width, overlay.height);

      // Pass 1: Bloom downsample + threshold
      activateProgram(programs.bloomDownsample);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fb);
      gl.viewport(0, 0, bloomW, bloomH);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(
        gl.getUniformLocation(programs.bloomDownsample.program, "u_texture"),
        0,
      );
      gl.uniform2f(
        programs.bloomDownsample.uResolution,
        gameCanvas.width,
        gameCanvas.height,
      );
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Pass 2: Horizontal blur
      activateProgram(programs.blur);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomB.fb);
      gl.viewport(0, 0, bloomW, bloomH);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
      gl.uniform1i(
        gl.getUniformLocation(programs.blur.program, "u_texture"),
        0,
      );
      gl.uniform2f(blurUDirection, 1.0, 0.0);
      gl.uniform2f(programs.blur.uResolution, bloomW, bloomH);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Pass 3: Vertical blur
      activateProgram(programs.blur);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fb);
      gl.viewport(0, 0, bloomW, bloomH);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, bloomB.tex);
      gl.uniform1i(
        gl.getUniformLocation(programs.blur.program, "u_texture"),
        0,
      );
      gl.uniform2f(blurUDirection, 0.0, 1.0);
      gl.uniform2f(programs.blur.uResolution, bloomW, bloomH);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Pass 4: Vector composite
      const writeFBO = pingPong === 0 ? persistA : persistB;
      const readFBO = pingPong === 0 ? persistB : persistA;

      activateProgram(programs.vectorComposite);
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO.fb);
      gl.viewport(0, 0, persistW, persistH);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(compositeUTexture, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
      gl.uniform1i(compositeUBloom, 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, readFBO.tex);
      gl.uniform1i(compositeUPrevFrame, 2);

      gl.uniform2f(
        programs.vectorComposite.uResolution,
        overlay.width,
        overlay.height,
      );
      gl.uniform1f(programs.vectorComposite.uTime, now);
      gl.uniform1f(compositeUPhosphorDecay, currentPhosphorDecay);
      gl.uniform2f(
        compositeUMotion,
        frameMotionX / overlay.width,
        frameMotionY / overlay.height,
      );
      gl.uniform1f(compositeUZoomMotion, 1 - Math.exp(-frameLogZoom));
      gl.uniform2f(
        compositeUCameraOffset,
        cameraX / overlay.width,
        cameraY / overlay.height,
      );
      frameMotionX = frameMotionY = frameLogZoom = 0;

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Pass 5: Blit to screen
      activateProgram(programs.passthrough);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, overlay.width, overlay.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, writeFBO.tex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      pingPong = 1 - pingPong;
    } else {
      // CRT mode: single-pass
      activateProgram(programs.crt);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, overlay.width, overlay.height);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.uniform2f(programs.crt.uResolution, overlay.width, overlay.height);
      gl.uniform1f(programs.crt.uTime, now);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    rafId = requestAnimationFrame(render);
  }

  setTimeout(render, 50);

  return {
    /** The overlay canvas element */
    overlay,

    /**
     * Switch display mode.
     * @param {'vector'|'crt'} name
     */
    setShader(name) {
      if (name === "crt" || name === "vector") {
        activeShaderName = name;
        applyTextureFilter(name);
      }
    },

    /**
     * Set phosphor persistence decay (vector mode only).
     * @param {number} value - 0 (no persistence) to 1 (infinite persistence). Default: 0.78
     */
    setMotion(dx, dy, logZoom, x, y) {
      frameMotionX += dx;
      frameMotionY += dy;
      frameLogZoom += logZoom;
      cameraX = x;
      cameraY = y;
    },

    setPhosphorDecay(value) {
      currentPhosphorDecay = value;
    },

    /**
     * Get the current display mode name.
     * @returns {'vector'|'crt'}
     */
    getShaderName() {
      return activeShaderName;
    },

    /**
     * Stop the render loop and clean up resources.
     */
    destroy() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateOverlayPosition);
      window.removeEventListener("scroll", updateOverlayPosition);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    },
  };
}
