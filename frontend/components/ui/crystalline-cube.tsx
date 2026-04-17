"use client";

import React, { useRef, useEffect } from "react";

interface ShaderProps {
  complexity?: number;
  colorShift?: number;
  lightIntensity?: number;
  mouseInfluence?: number;
  className?: string;
}

/**
 * Interactive WebGL ray-marched crystalline shader.
 *
 * Self-contained: no external dependencies. The canvas auto-resizes to its
 * parent and the light position tracks the mouse via a window listener
 * (so it works as a fixed background that responds anywhere on the page).
 *
 * Parameters can be tuned per usage site:
 *   complexity      — sine-wave displacement frequency (1–10)
 *   colorShift      — palette cycling speed (0–1)
 *   lightIntensity  — diffuse + specular gain (0.5–3)
 *   mouseInfluence  — how much the cursor moves the light (0–1)
 */
const CrystallineCube: React.FC<ShaderProps> = ({
  complexity = 4.0,
  colorShift = 0.3,
  lightIntensity = 1.5,
  mouseInfluence = 0.5,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mousePos = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) {
      console.error("WebGL is not supported in this browser.");
      return;
    }

    const vertexShaderSource = `
      attribute vec2 aPosition;
      void main() {
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;

    const fragmentShaderSource = `
      precision highp float;
      uniform vec2 iResolution;
      uniform float iTime;
      uniform vec2 iMouse;
      uniform float uComplexity;
      uniform float uColorShift;
      uniform float uLightIntensity;
      uniform float uMouseInfluence;

      #define MAX_STEPS 64
      #define MAX_DIST 100.0
      #define SURF_DIST 0.001

      vec3 palette(float t) {
          vec3 a = vec3(0.5, 0.5, 0.5);
          vec3 b = vec3(0.5, 0.5, 0.5);
          vec3 c = vec3(1.0, 1.0, 0.5);
          vec3 d = vec3(0.8, 0.9, 0.3);
          return a + b * cos(6.28318 * (c * t + d));
      }

      mat3 rotate(vec3 axis, float angle) {
          axis = normalize(axis);
          float s = sin(angle);
          float c = cos(angle);
          float oc = 1.0 - c;
          return mat3(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,
                      oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,
                      oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c);
      }

      float getDist(vec3 p) {
          p = rotate(normalize(vec3(1.0, 1.0, 1.0)), iTime * 0.2) * p;
          vec3 b = vec3(1.0);
          float box = length(max(abs(p) - b, 0.0));
          float displacement = sin(uComplexity * p.x) * sin(uComplexity * p.y) * sin(uComplexity * p.z);
          return box - displacement * 0.1;
      }

      vec3 getNormal(vec3 p) {
          vec2 e = vec2(0.001, 0);
          float d = getDist(p);
          vec3 n = d - vec3(
              getDist(p - e.xyy),
              getDist(p - e.yxy),
              getDist(p - e.yyx)
          );
          return normalize(n);
      }

      float rayMarch(vec3 ro, vec3 rd) {
          float dO = 0.0;
          for(int i=0; i<MAX_STEPS; i++) {
              vec3 p = ro + rd * dO;
              float dS = getDist(p);
              dO += dS;
              if(dO > MAX_DIST || dS < SURF_DIST) break;
          }
          return dO;
      }

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;
        vec3 ro = vec3(0, 0, -3.0);
        vec3 rd = normalize(vec3(uv, 1.0));

        float d = rayMarch(ro, rd);
        vec3 col = vec3(0);

        if (d < MAX_DIST) {
            vec3 p = ro + rd * d;
            vec3 n = getNormal(p);

            vec2 mouse = (iMouse.xy / iResolution.xy - 0.5) * 2.0;
            vec3 lightPos = vec3(mouse.x * 2.0 * uMouseInfluence, mouse.y * 2.0 * uMouseInfluence, -3.0);
            vec3 l = normalize(lightPos - p);

            float dif = clamp(dot(n, l), 0.0, 1.0);

            vec3 v = normalize(ro - p);
            vec3 h = normalize(l + v);
            float spec = pow(clamp(dot(n, h), 0.0, 1.0), 32.0);

            vec3 baseColor = palette(length(p) * 0.2 + iTime * uColorShift);

            col = (dif * baseColor + spec * vec3(1.0)) * uLightIntensity;
        }

        col += palette(length(uv) * 0.5 - iTime * uColorShift * 0.2) * 0.2;

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    const compileShader = (source: string, type: number): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(`Shader compile error: ${gl.getShaderInfoLog(shader)}`);
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(`Program linking error: ${gl.getProgramInfoLog(program)}`);
      return;
    }
    gl.useProgram(program);

    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const iResolutionLocation = gl.getUniformLocation(program, "iResolution");
    const iTimeLocation = gl.getUniformLocation(program, "iTime");
    const iMouseLocation = gl.getUniformLocation(program, "iMouse");
    const uComplexityLocation = gl.getUniformLocation(program, "uComplexity");
    const uColorShiftLocation = gl.getUniformLocation(program, "uColorShift");
    const uLightIntensityLocation = gl.getUniformLocation(program, "uLightIntensity");
    const uMouseInfluenceLocation = gl.getUniformLocation(program, "uMouseInfluence");

    const startTime = performance.now();
    let animationFrameId = 0;

    const handleMouseMove = (e: MouseEvent) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mousePos.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };
    window.addEventListener("mousemove", handleMouseMove);

    const resizeCanvas = () => {
      // Use device-pixel ratio so the shader stays crisp on retina, but cap
      // at 2 to avoid melting integrated GPUs.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      gl.uniform2f(iResolutionLocation, gl.canvas.width, gl.canvas.height);
    };
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    const renderLoop = () => {
      if (!gl || gl.isContextLost()) return;
      const currentTime = performance.now();
      gl.uniform1f(iTimeLocation, (currentTime - startTime) / 1000.0);
      gl.uniform2f(
        iMouseLocation,
        mousePos.current.x,
        canvas.height - mousePos.current.y,
      );
      gl.uniform1f(uComplexityLocation, complexity);
      gl.uniform1f(uColorShiftLocation, colorShift);
      gl.uniform1f(uLightIntensityLocation, lightIntensity);
      gl.uniform1f(uMouseInfluenceLocation, mouseInfluence);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animationFrameId = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("mousemove", handleMouseMove);
      if (gl && !gl.isContextLost()) {
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(vertexBuffer);
      }
    };
  }, [complexity, colorShift, lightIntensity, mouseInfluence]);

  return (
    <canvas
      ref={canvasRef}
      className={className ?? "absolute inset-0 w-full h-full"}
    />
  );
};

export default CrystallineCube;
