/**
 * shaders.js: every material in the scene.
 *
 * The Quest 1 runs out of pixel-shading time long before it runs out of vertices, so all light
 * and haze is worked out per vertex and the pixel shaders do next to nothing: most of them write
 * one interpolated colour. Colours are computed in linear light and converted for the screen in
 * the vertex shader too (a soft shoulder, then gamma), so nothing is left for three.js to convert.
 *
 * The light and haze formulas are the ones in world.js (lightOn, fogColor, fogAmount, toDisplay);
 * keep the two in step.
 *
 * `aux` (4 numbers per vertex):
 *   world meshes   x: how much the vertex sways in the wind (metres at full gust)
 *                  y: 1 for leaves (tinted by the tree's colour, lit from behind), 0 for wood/rock
 *                  w: sway phase, for meshes that are not instanced
 *   dragons        x, y: the two bones the vertex follows; z: weight of the first
 *                  w: 0 body, 1 wing membrane (light shines through), 2 glows (eyes)
 */

import * as THREE from '../vendor/three.module.min.js';
import { SUN_DIR, LIGHT, FOG } from './world.js';

/** Uniforms every material shares. One object, so a change reaches all of them. */
export function makeShared() {
  return {
    uSunDir: { value: new THREE.Vector3(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]) },
    uSunColor: { value: new THREE.Vector3(LIGHT.sun[0], LIGHT.sun[1], LIGHT.sun[2]) },
    uSkyColor: { value: new THREE.Vector3(LIGHT.sky[0], LIGHT.sky[1], LIGHT.sky[2]) },
    uBounceColor: { value: new THREE.Vector3(LIGHT.bounce[0], LIGHT.bounce[1], LIGHT.bounce[2]) },
    uFogColor: { value: new THREE.Vector3(FOG.color[0], FOG.color[1], FOG.color[2]) },
    uFogSunColor: { value: new THREE.Vector3(FOG.sunColor[0], FOG.sunColor[1], FOG.sunColor[2]) },
    uFog: { value: new THREE.Vector4(FOG.haze, FOG.mist, FOG.falloff, FOG.base) },
    uExposure: { value: LIGHT.exposure },
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(0.8, 0.45) }, // direction and strength of the sway
  };
}

const COMMON = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uBounceColor;
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform vec4 uFog;
uniform float uExposure;
uniform float uTime;

vec3 dvFogColor(vec3 dir) {
  float s = max(dot(dir, uSunDir), 0.0);
  float s2 = s * s;
  float s8 = s2 * s2;
  s8 *= s8;
  return mix(uFogColor, uFogSunColor, s8 * 0.8 + s2 * 0.2);
}

float dvFogAmount(float eyeY, float dirY, float dist) {
  float above = max(eyeY - uFog.w, 0.0);
  float t = max(uFog.z * dirY * dist, -uFog.z * above);
  float k = abs(t) < 1.0e-4 ? 1.0 : (1.0 - exp(-t)) / t;
  float depth = uFog.y * exp(-uFog.z * above) * dist * k + uFog.x * dist;
  return 1.0 - exp(-depth);
}

vec3 dvLight(vec3 n, float sunlit) {
  // The sun is low and the sky around it is bright: let its light wrap a little past the edge.
  float d = max((dot(n, uSunDir) + 0.3) / 1.3, 0.0) * sunlit;
  return mix(uBounceColor, uSkyColor, n.y * 0.5 + 0.5) + uSunColor * d;
}

vec3 dvDisplay(vec3 c) {
  return pow(1.0 - exp(-max(c, 0.0) * uExposure), vec3(0.4545));
}

// Haze between the eye and a world position, applied to a linear colour.
vec3 dvHaze(vec3 c, vec3 worldPos, float scale) {
  vec3 toP = worldPos - cameraPosition;
  float dist = length(toP);
  vec3 dir = toP / max(dist, 1.0e-4);
  float f = dvFogAmount(cameraPosition.y, dir.y, dist) * scale;
  return mix(c, dvFogColor(dir), f);
}
`;

const FLAT_FRAGMENT = /* glsl */ `
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 1.0);
}
`;

/**
 * Terrain, rocks, trees. Options:
 *   lit    light is computed here from the normal (trees, anything that turns); otherwise the
 *          vertex colour already holds the lit colour (terrain, the ledge)
 *   sway   vertices move in the wind by aux.x
 */
export function worldMaterial(shared, options) {
  const o = options || {};
  const defines = {};
  if (o.lit) defines.DV_LIT = 1;
  if (o.sway) defines.DV_SWAY = 1;
  return new THREE.ShaderMaterial({
    uniforms: Object.assign({ uHaze: { value: o.haze === undefined ? 1 : o.haze } }, shared),
    defines,
    vertexColors: true,
    side: o.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    vertexShader: /* glsl */ `
      ${COMMON}
      uniform float uHaze;
      uniform vec2 uWind;
      attribute vec4 aux;
      #ifdef USE_INSTANCING
        attribute float aShade;
      #endif
      varying vec3 vColor;
      void main() {
        #ifdef USE_INSTANCING
          vec4 wp = modelMatrix * (instanceMatrix * vec4(position, 1.0));
        #else
          vec4 wp = modelMatrix * vec4(position, 1.0);
        #endif
        #ifdef DV_SWAY
          #ifdef USE_INSTANCING
            float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
          #else
            float ph = aux.w;
          #endif
          float gust = sin(uTime * 0.9 + ph) * 0.6 + sin(uTime * 2.3 + ph * 1.7) * 0.4;
          float flutter = sin(uTime * 6.0 + wp.x * 1.9 + wp.y * 2.7 + wp.z * 1.3) * aux.y * 0.03;
          wp.x += (gust * uWind.x + flutter) * aux.x;
          wp.z += (gust * uWind.y - flutter) * aux.x;
        #endif
        vec3 c = color;
        #ifdef DV_LIT
          float sunlit = 1.0;
          #ifdef USE_INSTANCING
            mat3 im = mat3(instanceMatrix);
            vec3 n = im * (normal / vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2])));
            sunlit = aShade;
            #ifdef USE_INSTANCING_COLOR
              c *= mix(vec3(1.0), instanceColor, aux.y);
            #endif
          #else
            vec3 n = normal;
          #endif
          n = normalize(mat3(modelMatrix) * n);
          vec3 albedo = c;
          c = albedo * dvLight(n, sunlit);
          // Low sun through leaves: the side away from the sun glows.
          c += albedo * uSunColor * (max(-dot(n, uSunDir), 0.0) * 0.55 * aux.y * sunlit);
        #endif
        vColor = dvDisplay(dvHaze(c, wp.xyz, uHaze));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: FLAT_FRAGMENT,
  });
}

/**
 * The sky dome. Its vertex colours are final screen colours (baked in scene.js); it is drawn at
 * the far plane after everything solid, so it only costs pixels where sky shows.
 */
export function skyMaterial() {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        // A little noise hides the steps an 8-bit screen makes in a smooth sky.
        float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        gl_FragColor = vec4(vColor + (n - 0.5) / 255.0, 1.0);
      }
    `,
  });
}

/** The sun's disc and the glare around it: added on top of whatever is there. */
export function sunMaterial() {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: FLAT_FRAGMENT,
  });
}

/**
 * The lake. What it mirrors (sky, hills, the sun's path) was worked out once for the viewer's
 * spot and stored in a texture: rgb is the mirrored colour, alpha is how strongly the sun
 * glitters there. The pixel shader adds moving sparkle and the haze.
 */
export function waterMaterial(shared, reflection, noise, bounds) {
  return new THREE.ShaderMaterial({
    uniforms: Object.assign(
      {
        uReflection: { value: reflection },
        uNoise: { value: noise },
        uBounds: { value: new THREE.Vector4(bounds.x0, bounds.z0, 1 / (bounds.x1 - bounds.x0), 1 / (bounds.z1 - bounds.z0)) },
      },
      shared
    ),
    depthWrite: false,
    vertexShader: /* glsl */ `
      ${COMMON}
      uniform vec4 uBounds;
      varying vec2 vUv;
      varying vec2 vWorld;
      varying vec4 vFog;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vUv = (wp.xz - uBounds.xy) * uBounds.zw;
        vWorld = wp.xz;
        vec3 toP = wp.xyz - cameraPosition;
        float dist = length(toP);
        vec3 dir = toP / max(dist, 1.0e-4);
        vFog = vec4(dvDisplay(dvFogColor(dir)), dvFogAmount(cameraPosition.y, dir.y, dist));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uReflection;
      uniform sampler2D uNoise;
      uniform float uTime;
      varying vec2 vUv;
      varying vec2 vWorld;
      varying vec4 vFog;
      void main() {
        float n1 = texture2D(uNoise, vWorld * 0.047 + vec2(uTime * 0.019, uTime * 0.011)).r;
        float n2 = texture2D(uNoise, vWorld * 0.073 - vec2(uTime * 0.015, -uTime * 0.022)).g;
        // Ripples nudge where the mirror is read.
        vec4 r = texture2D(uReflection, vUv + (vec2(n1, n2) - 0.5) * 0.006);
        float sparkle = smoothstep(0.34, 0.46, n1 * n2);
        vec3 c = r.rgb * (0.95 + 0.1 * n1) + vec3(1.0, 0.86, 0.6) * (r.a * (sparkle * 1.1 + 0.12));
        gl_FragColor = vec4(mix(c, vFog.rgb, vFog.a), 1.0);
      }
    `,
  });
}

export { THREE, COMMON, FLAT_FRAGMENT };
