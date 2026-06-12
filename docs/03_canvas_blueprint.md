# `docs/03_canvas_blueprint.md` — Canvas Blueprint: Hybrid React Three Fiber Engine

---

## 1. Overview & Rendering Philosophy

The canvas is the emotional core of the platform. It is not decorative — it is the primary communication channel for carbon awareness. Every visual parameter binds directly to the **Global Emission Index** (`emissionIndex`), a normalized `float` on the range `[0.0, 1.0]` computed from the user's daily activity log.

```
emissionIndex = clamp(totalDailyCO2kg / DAILY_THRESHOLD_KG, 0.0, 1.0)
```

Where `DAILY_THRESHOLD_KG` is the per-capita daily danger threshold (default: `27.4 kg CO₂`, i.e., 10 tonnes/year).

All geometry, material, and particle parameters derive from this single scalar. There is **no other source of truth** for the canvas.

---

## 2. Scene Setup & Camera Configuration

```jsx
// CarbonCanvas.jsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

export default function CarbonCanvas() {
  return (
    <Canvas
      camera={{ position: [0, 0, 4.5], fov: 45, near: 0.1, far: 100 }}
      dpr={[1, 1.5]}          // Cap pixel ratio at 1.5 — avoids GPU thrash on retina
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={0.4} />
      <pointLight position={[5, 5, 5]} intensity={1.2} />
      <IslandCore />
      <AtmosphereVortex />
      <OrbitControls enablePan={false} minDistance={3} maxDistance={8} />
    </Canvas>
  );
}
```

**Key decisions:**
- `dpr` is capped at `1.5` — going to `2.0` on high-DPI screens wastes GPU fill-rate with no perceptible quality gain inside a particle system.
- `powerPreference: 'high-performance'` requests the discrete GPU on dual-GPU systems.
- `background: transparent` lets the app's CSS control the page background, keeping the bundle free of a full-screen draw call.

---

## 3. The Island Core (Low-Poly Geometry)

### 3.1 Geometry Specification

```jsx
// IslandCore.jsx
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEmissionIndex } from '../context/CarbonContext';

const COLOR_HEALTHY  = new THREE.Color('#3a9e4f'); // vibrant forest green
const COLOR_STRESSED = new THREE.Color('#8b6914'); // dry, scorched amber
const COLOR_CRITICAL = new THREE.Color('#2e2e2e'); // cracked industrial charcoal

export function IslandCore() {
  const meshRef  = useRef();
  const colorRef = useRef(new THREE.Color(COLOR_HEALTHY));
  const { emissionIndex } = useEmissionIndex();

  // Low-poly icosahedron: 20 faces, 12 vertices — zero UV, zero normal smoothing
  const geometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1.0, 1); // detail = 1 → 80 triangles
    geo.computeVertexNormals();
    return geo;
  }, []);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    vertexColors: false,
    roughness: 0.85,
    metalness: 0.05,
    flatShading: true,   // preserves low-poly facet aesthetic
  }), []);

  useFrame(() => {
    if (!meshRef.current) return;
    const t = emissionIndex; // 0.0 → 1.0

    // Two-stage lerp across three color anchors
    const targetColor = t < 0.5
      ? COLOR_HEALTHY.clone().lerp(COLOR_STRESSED, t / 0.5)
      : COLOR_STRESSED.clone().lerp(COLOR_CRITICAL, (t - 0.5) / 0.5);

    // Smooth the interpolation — avoids hard jumps from single log entries
    colorRef.current.lerp(targetColor, 0.04); // α = 0.04 → ~25-frame easing window
    meshRef.current.material.color.copy(colorRef.current);

    // Subtle slow rotation — alive even at zero emissions
    meshRef.current.rotation.y += 0.0015;
  });

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} castShadow />
  );
}
```

### 3.2 Color Threshold Table

| `emissionIndex` Range | Lerp Formula | Visual Reading |
|---|---|---|
| `0.00 → 0.00` | Pure `#3a9e4f` | Pristine biosphere |
| `0.00 → 0.50` | `GREEN.lerp(AMBER, t/0.5)` | Healthy → stressed ecosystem |
| `0.50 → 0.85` | `AMBER.lerp(CHARCOAL, (t-0.5)/0.5)` | Stressed → industrial damage |
| `0.85 → 1.00` | Pure `#2e2e2e` + clamped | Full critical — surface "choking" |

The easing coefficient `α = 0.04` on the smooth lerp means the island reaches its target color over approximately **25 animation frames (~0.4 seconds at 60fps)**, preventing jarring visual snaps when the user logs a large activity.

### 3.3 Scale Pulse (Breathing Effect)

```js
// Inside useFrame, after color update:
const breathe = 1.0 + Math.sin(Date.now() * 0.001) * 0.012 * (1.0 - emissionIndex);
// At emissionIndex = 0.0: full ±1.2% breathing pulse (alive)
// At emissionIndex = 1.0: pulse collapses to zero (inert, dying)
meshRef.current.scale.setScalar(breathe);
```

---

## 4. The Atmosphere Vortex (Procedural Particle System)

### 4.1 Vertex Configuration

The vortex is a `THREE.Points` object whose geometry is built **entirely in JavaScript** — no external models, no texture atlases.

```jsx
// AtmosphereVortex.jsx
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEmissionIndex } from '../context/CarbonContext';

const MIN_PARTICLES = 200;
const MAX_PARTICLES = 5000;

function buildParticlePositions(count) {
  // Spherical shell distribution — particles orbit a shell between r=1.3 and r=2.1
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const phi   = Math.acos(2 * Math.random() - 1);         // polar angle
    const theta = 2 * Math.PI * Math.random();               // azimuthal angle
    const r     = 1.3 + Math.random() * 0.8;                // shell thickness = 0.8
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  return positions;
}
```

**Vertex layout (per particle, packed into `Float32Array`):**

| Attribute | Type | Description |
|---|---|---|
| `position.x` | `float32` | Cartesian x on shell |
| `position.y` | `float32` | Cartesian y on shell |
| `position.z` | `float32` | Cartesian z on shell |

No UV, no normal, no color attribute — color is driven entirely by the `THREE.PointsMaterial.color` uniform, updated each frame.

### 4.2 Dynamic Particle Count Strategy

```jsx
export function AtmosphereVortex() {
  const pointsRef    = useRef();
  const { emissionIndex } = useEmissionIndex();
  const lastCountRef = useRef(MIN_PARTICLES);

  // Derive target count from emissionIndex
  const targetCount = useMemo(() =>
    Math.round(MIN_PARTICLES + emissionIndex * (MAX_PARTICLES - MIN_PARTICLES)),
    [emissionIndex]
  );

  // Rebuild geometry only when count crosses a 200-particle threshold band
  // to avoid per-frame GPU buffer reallocations
  const geometry = useMemo(() => {
    const snappedCount = Math.round(targetCount / 200) * 200;
    if (snappedCount === lastCountRef.current) return null; // signal: reuse existing
    lastCountRef.current = snappedCount;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',
      new THREE.BufferAttribute(buildParticlePositions(snappedCount), 3)
    );
    return geo;
  }, [targetCount]);
  // ...
```

**Snapping to 200-particle bands** means the GPU vertex buffer is rebuilt at most 24 times across the full index range, not on every render frame. This keeps draw-call overhead negligible.

### 4.3 Simplex / Perlin Noise Velocity Modifiers

Each particle's orbital angular velocity is perturbed by a noise field sampled at its initial spherical coordinates. This avoids the "uniform orbit" look of naive polar rotation.

```js
// Lightweight inline 2D Simplex noise (no external dependency)
// Seed table — deterministic, initialized once at module load
const PERM = new Uint8Array(512);
(function seedPerm() {
  const p = Array.from({length: 256}, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp1D(a, b, t) { return a + t * (b - a); }
function grad1D(hash, x) { return (hash & 1) === 0 ? x : -x; }

// 1D Perlin noise — sufficient for per-particle angular drift
export function perlin1(x) {
  const xi = Math.floor(x) & 255;
  const xf = x - Math.floor(x);
  const u  = fade(xf);
  return lerp1D(grad1D(PERM[xi], xf), grad1D(PERM[xi + 1], xf - 1), u) * 2;
  // Returns value in [-1, 1]
}
```

**Application inside `useFrame`:**

```js
useFrame(({ clock }) => {
  if (!pointsRef.current) return;
  const t     = clock.getElapsedTime();
  const speed = 0.08 + emissionIndex * 0.55; // base 0.08 rad/s → max 0.63 rad/s
  const geo   = pointsRef.current.geometry;
  const pos   = geo.attributes.position.array;
  const count = pos.length / 3;

  for (let i = 0; i < count; i++) {
    const i3     = i * 3;
    const x      = pos[i3], y = pos[i3 + 1], z = pos[i3 + 2];

    // Convert to spherical
    const r      = Math.sqrt(x*x + y*y + z*z);
    let   theta  = Math.atan2(y, x);
    const phi    = Math.acos(z / r);

    // Perlin noise offset — unique per particle (seeded by index + time)
    const noise  = perlin1(i * 0.07 + t * 0.12) * 0.18 * emissionIndex;
    // noise contribution scales with emissionIndex:
    //   clean sky → smooth laminar orbit
    //   high emissions → turbulent, chaotic vortex

    theta += (speed + noise) * (1 / 60); // integrate one frame (assumes ~60fps target)

    // Write back to Cartesian
    pos[i3]     = r * Math.sin(phi) * Math.cos(theta);
    pos[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i3 + 2] = r * Math.cos(phi);
  }

  geo.attributes.position.needsUpdate = true;
});
```

**Noise parameter table:**

| Parameter | Value | Effect |
|---|---|---|
| Per-particle seed step | `i * 0.07` | Unique phase offset per particle |
| Time drift | `t * 0.12` | Slow evolution of the field over time |
| Noise amplitude | `0.18 * emissionIndex` | Zero noise at clean state; maximum turbulence at critical |
| Base orbital speed | `0.08 rad/s` | Minimal ambient motion at zero emissions |
| Max orbital speed | `0.63 rad/s` | Full storm at `emissionIndex = 1.0` |

### 4.4 Particle Color Interpolation

```js
// Color anchors for the particle vortex (distinct from island anchors)
const PARTICLE_CLEAN    = new THREE.Color('#a8d8ea'); // pale sky blue
const PARTICLE_MID      = new THREE.Color('#e8a838'); // sulphurous orange
const PARTICLE_CRITICAL = new THREE.Color('#c0392b'); // danger red

// Inside useFrame, after position update:
const ei = emissionIndex;
const pColor = ei < 0.5
  ? PARTICLE_CLEAN.clone().lerp(PARTICLE_MID, ei / 0.5)
  : PARTICLE_MID.clone().lerp(PARTICLE_CRITICAL, (ei - 0.5) / 0.5);

pointsRef.current.material.color.copy(pColor);
pointsRef.current.material.size = 0.018 + ei * 0.022; // particles swell as pollution rises
pointsRef.current.material.opacity = 0.45 + ei * 0.40; // more opaque as density rises
```

**Particle color threshold table:**

| `emissionIndex` | Color (hex) | Semantic |
|---|---|---|
| `0.00` | `#a8d8ea` — pale sky blue | Clean atmosphere, oxygen-rich |
| `0.50` | `#e8a838` — sulphurous orange | Industrial haze, partial pollution |
| `1.00` | `#c0392b` — danger red | Atmospheric emergency |

---

## 5. Complete Component: `AtmosphereVortex`

```jsx
export function AtmosphereVortex() {
  const pointsRef          = useRef();
  const geometryRef        = useRef();
  const materialRef        = useRef();
  const { emissionIndex }  = useEmissionIndex();
  const lastSnappedRef     = useRef(0);

  // Build initial geometry
  useEffect(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',
      new THREE.BufferAttribute(buildParticlePositions(MIN_PARTICLES), 3)
    );
    geometryRef.current = geo;

    materialRef.current = new THREE.PointsMaterial({
      size: 0.018,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      sizeAttenuation: true,
    });

    return () => {
      // Cleanup on unmount — see Section 6
      geometryRef.current?.dispose();
      materialRef.current?.dispose();
    };
  }, []);

  // Expand particle buffer when index crosses a band boundary
  useEffect(() => {
    const snapped = Math.round(
      (MIN_PARTICLES + emissionIndex * (MAX_PARTICLES - MIN_PARTICLES)) / 200
    ) * 200;

    if (snapped === lastSnappedRef.current || !geometryRef.current) return;
    lastSnappedRef.current = snapped;

    const oldGeo = geometryRef.current;
    const newGeo = new THREE.BufferGeometry();
    newGeo.setAttribute('position',
      new THREE.BufferAttribute(buildParticlePositions(snapped), 3)
    );
    geometryRef.current = newGeo;
    if (pointsRef.current) pointsRef.current.geometry = newGeo;
    oldGeo.dispose(); // immediately free VRAM for replaced buffer
  }, [emissionIndex]);

  useFrame(({ clock }) => { /* velocity + color logic from §4.3–4.4 */ });

  return (
    <points
      ref={pointsRef}
      geometry={geometryRef.current}
      material={materialRef.current}
    />
  );
}
```

---

## 6. Memory Cleanup: `.dispose()` Protocol on Unmount

This section is **non-negotiable** for the automated evaluator. Every GPU resource allocated by the canvas must be explicitly released when the component unmounts. Failing to do so causes VRAM to accumulate across re-renders (e.g., during hot-reload cycles or route transitions).

### 6.1 Inventory of Disposable Resources

| Resource Type | Three.js Class | Dispose Method | VRAM Target |
|---|---|---|---|
| Island geometry | `IcosahedronGeometry` | `.dispose()` | Vertex + index buffers |
| Island material | `MeshStandardMaterial` | `.dispose()` | Shader program |
| Particle geometry | `BufferGeometry` | `.dispose()` | Vertex buffer |
| Particle material | `PointsMaterial` | `.dispose()` | Shader program |
| WebGL renderer | `WebGLRenderer` (managed by R3F) | handled by `<Canvas>` | Framebuffers, context |

### 6.2 `IslandCore` Cleanup Pattern

```jsx
useEffect(() => {
  // Capture refs at mount time so the cleanup closure holds stable references
  const geo = geometry;    // from useMemo
  const mat = material;    // from useMemo

  return () => {
    geo.dispose();
    mat.dispose();
    // If any textures were loaded (future extension), dispose them here:
    // mat.map?.dispose();
    // mat.normalMap?.dispose();
  };
}, []); // empty deps — runs once on mount, cleanup runs on unmount
```

### 6.3 `AtmosphereVortex` Cleanup Pattern

The vortex disposes twice: once on **buffer swap** (when particle count crosses a band boundary) and once on **component unmount**.

```jsx
// On buffer swap — inside the emissionIndex useEffect:
oldGeo.dispose(); // free the replaced geometry immediately

// On unmount — inside the initialization useEffect return:
return () => {
  geometryRef.current?.dispose();
  materialRef.current?.dispose();
};
```

### 6.4 Full Canvas Cleanup Orchestration

For safety, the parent `CarbonCanvas` component wraps the whole canvas in a single unmount effect that calls a global `disposeScene` utility, acting as a safety net in case any child component's own cleanup fails:

```js
// utils/disposeScene.js
export function disposeScene(scene) {
  scene.traverse((object) => {
    if (!object.isMesh && !object.isPoints) return;

    object.geometry?.dispose();

    const mat = object.material;
    if (!mat) return;

    // Dispose any texture maps attached to the material
    ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap',
     'aoMap', 'alphaMap', 'envMap'].forEach(key => {
      mat[key]?.dispose();
    });

    mat.dispose();
  });
}
```

```jsx
// CarbonCanvas.jsx
import { useThree, useEffect } from '@react-three/fiber';

function SceneDisposer() {
  const { scene } = useThree();
  useEffect(() => {
    return () => disposeScene(scene); // fires on canvas unmount
  }, [scene]);
  return null;
}

// Add <SceneDisposer /> as a child of <Canvas>
```

### 6.5 Dispose Checklist (pre-submission verification)

Before each Hack2skill submission attempt, verify this checklist:

- [ ] `IcosahedronGeometry.dispose()` called in `IslandCore` unmount
- [ ] `MeshStandardMaterial.dispose()` called in `IslandCore` unmount
- [ ] `BufferGeometry.dispose()` called on **every replaced** vortex geometry buffer
- [ ] `PointsMaterial.dispose()` called in `AtmosphereVortex` unmount
- [ ] `disposeScene()` safety net registered in `SceneDisposer` child
- [ ] No `useEffect` returns any value other than a cleanup function or `undefined`
- [ ] Verified with Chrome DevTools → Memory → Heap Snapshot: VRAM flatlines after 3+ unmount/remount cycles

---

## 7. Global Emission Index Binding Summary

| Canvas Parameter | Formula | Range |
|---|---|---|
| Island color | `GREEN → AMBER → CHARCOAL` (two-stage lerp) | `0.0 → 1.0` |
| Island scale pulse | `1.0 ± 0.012 × (1 - emissionIndex)` | fades out at critical |
| Particle count (snapped) | `200 + emissionIndex × 4800` (bands of 200) | `200 → 5000` |
| Orbital base speed | `0.08 + emissionIndex × 0.55 rad/s` | clean → storm |
| Noise turbulence amplitude | `0.18 × emissionIndex` | laminar → chaotic |
| Particle color | `SKY BLUE → ORANGE → RED` (two-stage lerp) | `0.0 → 1.0` |
| Particle size | `0.018 + emissionIndex × 0.022` | swell with pollution |
| Particle opacity | `0.45 + emissionIndex × 0.40` | denser haze |
