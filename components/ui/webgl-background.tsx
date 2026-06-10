"use client";

import { useEffect, useRef } from "react";

export function WebGLBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      antialias: true,
      alpha: false,
      powerPreference: "low-power",
    });
    if (!gl) {
      canvas.style.display = "none";
      return;
    }

    const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    const state = {
      accent: [0.36, 0.62, 0.98] as [number, number, number],
      intensity: 1.0,
      motion: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      mouseX: 0,
      mouseY: 0,
      targetX: 0,
      targetY: 0,
      t: 0,
      running: true,
    };

    function compile(type: number, src: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      return s;
    }

    function makeProgram(vs: string, fs: string) {
      const p = gl!.createProgram()!;
      gl!.attachShader(p, compile(gl!.VERTEX_SHADER, vs));
      gl!.attachShader(p, compile(gl!.FRAGMENT_SHADER, fs));
      gl!.linkProgram(p);
      return p;
    }

    /* ── Pass 1: nebula quad ── */
    const quadVS = [
      "attribute vec2 aPos;",
      "varying vec2 vUv;",
      "void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }",
    ].join("\n");

    const quadFS = [
      "precision mediump float;",
      "varying vec2 vUv;",
      "uniform float uTime;",
      "uniform vec2 uRes;",
      "uniform vec2 uMouse;",
      "uniform vec3 uAccent;",
      "uniform float uIntensity;",
      "float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
      "float noise(vec2 p){",
      "  vec2 i = floor(p); vec2 f = fract(p);",
      "  f = f * f * (3.0 - 2.0 * f);",
      "  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),",
      "             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);",
      "}",
      "float fbm(vec2 p){",
      "  float v = 0.0; float a = 0.5;",
      "  for(int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; }",
      "  return v;",
      "}",
      "void main(){",
      "  vec2 uv = vUv;",
      "  vec2 asp = vec2(uRes.x / uRes.y, 1.0);",
      "  vec2 p = (uv - 0.5) * asp;",
      "  p -= uMouse * 0.03;",
      "  vec3 base = vec3(0.027, 0.031, 0.045);",
      "  vec3 col = base + vec3(0.010, 0.012, 0.020) * (1.0 - uv.y);",
      "  float t = uTime * 0.04;",
      "  float n = fbm(p * 1.6 + vec2(t, -t * 0.6));",
      "  float n2 = fbm(p * 3.2 - vec2(t * 0.7, t * 0.4) + n);",
      "  float neb = smoothstep(0.45, 0.95, n2);",
      "  col += uAccent * neb * 0.10 * uIntensity;",
      "  float d = length(p - vec2(0.0, 0.28));",
      "  col += uAccent * exp(-d * d * 3.2) * 0.10 * uIntensity;",
      "  float horizon = 0.42;",
      "  if (uv.y < horizon) {",
      "    float depth = (horizon - uv.y) / horizon;",
      "    float persp = 1.0 / (depth + 0.06);",
      "    float gx = abs(fract(p.x * persp * 0.9 + 0.5) - 0.5);",
      "    float gy = abs(fract(depth * persp * 1.4 - uTime * 0.02) - 0.5);",
      "    float line = (1.0 - smoothstep(0.0, 0.035, gx)) + (1.0 - smoothstep(0.0, 0.045, gy));",
      "    col += uAccent * line * depth * 0.05 * uIntensity;",
      "  }",
      "  float vig = smoothstep(1.35, 0.45, length((uv - 0.5) * asp * 1.25));",
      "  col *= mix(0.72, 1.0, vig);",
      "  col += (hash(uv * uRes + uTime) - 0.5) * 0.012;",
      "  gl_FragColor = vec4(col, 1.0);",
      "}",
    ].join("\n");

    const quadProg = makeProgram(quadVS, quadFS);
    const quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const qLoc = {
      aPos: gl.getAttribLocation(quadProg, "aPos"),
      uTime: gl.getUniformLocation(quadProg, "uTime"),
      uRes: gl.getUniformLocation(quadProg, "uRes"),
      uMouse: gl.getUniformLocation(quadProg, "uMouse"),
      uAccent: gl.getUniformLocation(quadProg, "uAccent"),
      uIntensity: gl.getUniformLocation(quadProg, "uIntensity"),
    };

    /* ── Pass 2: particle field ── */
    const COUNT = 700;
    const partVS = [
      "attribute vec4 aData;",
      "uniform float uTime;",
      "uniform vec2 uRes;",
      "uniform vec2 uMouse;",
      "uniform float uMotion;",
      "varying float vDepth;",
      "varying float vTw;",
      "void main(){",
      "  float z = aData.z;",
      "  float seed = aData.w;",
      "  float t = uTime * uMotion;",
      "  float y = fract(aData.y + t * (0.006 + z * 0.012) + seed);",
      "  float x = aData.x + sin(t * 0.18 + seed * 6.2831) * 0.012 * z;",
      "  x += uMouse.x * 0.018 * (0.3 + z);",
      "  y -= uMouse.y * 0.018 * (0.3 + z);",
      "  vec2 clip = vec2(x, y) * 2.0 - 1.0;",
      "  vDepth = z;",
      "  vTw = 0.6 + 0.4 * sin(t * (0.8 + seed * 2.0) + seed * 40.0);",
      "  gl_Position = vec4(clip, 0.0, 1.0);",
      "  gl_PointSize = (1.0 + z * 2.6) * (uRes.y / 900.0 + 0.6);",
      "}",
    ].join("\n");

    const partFS = [
      "precision mediump float;",
      "uniform vec3 uAccent;",
      "uniform float uIntensity;",
      "varying float vDepth;",
      "varying float vTw;",
      "void main(){",
      "  vec2 c = gl_PointCoord - 0.5;",
      "  float d = length(c);",
      "  float a = smoothstep(0.5, 0.05, d);",
      "  vec3 col = mix(vec3(0.55, 0.62, 0.75), uAccent, vDepth * 0.85);",
      "  float alpha = a * (0.08 + vDepth * 0.30) * vTw * uIntensity;",
      "  gl_FragColor = vec4(col * alpha, alpha);",
      "}",
    ].join("\n");

    const partProg = makeProgram(partVS, partFS);
    const partData = new Float32Array(COUNT * 4);
    for (let i = 0; i < COUNT; i++) {
      partData[i * 4] = Math.random();
      partData[i * 4 + 1] = Math.random();
      partData[i * 4 + 2] = Math.pow(Math.random(), 1.6);
      partData[i * 4 + 3] = Math.random();
    }
    const partBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
    gl.bufferData(gl.ARRAY_BUFFER, partData, gl.STATIC_DRAW);
    const pLoc = {
      aData: gl.getAttribLocation(partProg, "aData"),
      uTime: gl.getUniformLocation(partProg, "uTime"),
      uRes: gl.getUniformLocation(partProg, "uRes"),
      uMouse: gl.getUniformLocation(partProg, "uMouse"),
      uMotion: gl.getUniformLocation(partProg, "uMotion"),
      uAccent: gl.getUniformLocation(partProg, "uAccent"),
      uIntensity: gl.getUniformLocation(partProg, "uIntensity"),
    };

    function resize() {
      const w = Math.floor(window.innerWidth * DPR);
      const h = Math.floor(window.innerHeight * DPR);
      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width = w;
        canvas!.height = h;
        gl!.viewport(0, 0, w, h);
      }
    }

    let last = performance.now();
    let rafId: number;

    function frame(now: number) {
      if (!state.running) return;
      rafId = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (state.motion) state.t += dt;

      state.mouseX += (state.targetX - state.mouseX) * 0.05;
      state.mouseY += (state.targetY - state.mouseY) * 0.05;

      resize();

      gl!.disable(gl!.BLEND);
      gl!.useProgram(quadProg);
      gl!.bindBuffer(gl!.ARRAY_BUFFER, quadBuf);
      gl!.enableVertexAttribArray(qLoc.aPos);
      gl!.vertexAttribPointer(qLoc.aPos, 2, gl!.FLOAT, false, 0, 0);
      gl!.uniform1f(qLoc.uTime, state.t);
      gl!.uniform2f(qLoc.uRes, canvas!.width, canvas!.height);
      gl!.uniform2f(qLoc.uMouse, state.mouseX, state.mouseY);
      gl!.uniform3fv(qLoc.uAccent, state.accent);
      gl!.uniform1f(qLoc.uIntensity, state.intensity);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);

      gl!.enable(gl!.BLEND);
      gl!.blendFunc(gl!.ONE, gl!.ONE_MINUS_SRC_ALPHA);
      gl!.useProgram(partProg);
      gl!.bindBuffer(gl!.ARRAY_BUFFER, partBuf);
      gl!.enableVertexAttribArray(pLoc.aData);
      gl!.vertexAttribPointer(pLoc.aData, 4, gl!.FLOAT, false, 0, 0);
      gl!.uniform1f(pLoc.uTime, state.t);
      gl!.uniform2f(pLoc.uRes, canvas!.width, canvas!.height);
      gl!.uniform2f(pLoc.uMouse, state.mouseX, state.mouseY);
      gl!.uniform1f(pLoc.uMotion, state.motion ? 1.0 : 0.0);
      gl!.uniform3fv(pLoc.uAccent, state.accent);
      gl!.uniform1f(pLoc.uIntensity, state.intensity);
      gl!.drawArrays(gl!.POINTS, 0, COUNT);
    }

    const onPointerMove = (e: PointerEvent) => {
      state.targetX = (e.clientX / window.innerWidth) * 2 - 1;
      state.targetY = (e.clientY / window.innerHeight) * 2 - 1;
    };

    const onVisibility = () => {
      if (document.hidden) {
        state.running = false;
      } else if (!state.running) {
        state.running = true;
        last = performance.now();
        rafId = requestAnimationFrame(frame);
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", resize);

    resize();
    rafId = requestAnimationFrame(frame);

    return () => {
      state.running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 z-0 block h-full w-full"
    />
  );
}
