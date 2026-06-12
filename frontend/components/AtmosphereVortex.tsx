"use client";

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useCarbon } from '@/context/CarbonContext';

// 2x the particles
const MIN_PARTICLES = 800;
const MAX_PARTICLES = 8000; // Reduced max count to prevent extreme clustering

function buildParticleBuffers(count: number) {
  const positions = new Float32Array(count * 3);
  const origins = new Float32Array(count * 3);
  
  for (let i = 0; i < count; i++) {
    // Huge spread over the island to increase space between particles (radius 4.0)
    const r = Math.random() * 4.0;
    const theta = Math.random() * Math.PI * 2;
    
    // Y positioned distinctly between the island and high up into the clouds
    const y = 0.2 + Math.random() * 3.5; // height spread increased to 3.5
    
    const x = r * Math.cos(theta);
    const z = r * Math.sin(theta);

    positions[i * 3]     = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    origins[i * 3]     = x;
    origins[i * 3 + 1] = y;
    origins[i * 3 + 2] = z;
  }
  return { positions, origins };
}

const PERM = new Uint8Array(512);
(function seedPerm() {
  const p = Array.from({length: 256}, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

function fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp1D(a: number, b: number, t: number) { return a + t * (b - a); }
function grad1D(hash: number, x: number) { return (hash & 1) === 0 ? x : -x; }

export function perlin1(x: number) {
  const xi = Math.floor(x) & 255;
  const xf = x - Math.floor(x);
  const u  = fade(xf);
  return lerp1D(grad1D(PERM[xi], xf), grad1D(PERM[xi + 1], xf - 1), u) * 2;
}

const PARTICLE_CLEAN    = new THREE.Color('#a8d8ea');
const PARTICLE_MID      = new THREE.Color('#e8a838');
const PARTICLE_CRITICAL = new THREE.Color('#1F2937'); // Murky dark gray

export const AtmosphereVortex = React.memo(function AtmosphereVortex() {
  const pointsRef          = useRef<THREE.Points>(null);
  const { emissionIndex }  = useCarbon();
  const lastSnappedRef     = useRef(0);

  const { geometry, material } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const buffers = buildParticleBuffers(MIN_PARTICLES);
    geo.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
    geo.setAttribute('origin', new THREE.BufferAttribute(buffers.origins, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.02,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      sizeAttenuation: true,
    });
    
    return { geometry: geo, material: mat };
  }, []);

  const geometryRef = useRef<THREE.BufferGeometry>(geometry);
  const materialRef = useRef<THREE.PointsMaterial>(material);

  useEffect(() => {
    return () => {
      geometryRef.current.dispose();
      materialRef.current.dispose();
    };
  }, []);

  useEffect(() => {
    const snapped = Math.round(
      (MIN_PARTICLES + emissionIndex * (MAX_PARTICLES - MIN_PARTICLES)) / 400
    ) * 400;

    if (snapped === lastSnappedRef.current || !geometryRef.current) return;
    lastSnappedRef.current = snapped;

    const oldGeo = geometryRef.current;
    const newGeo = new THREE.BufferGeometry();
    const buffers = buildParticleBuffers(snapped);
    newGeo.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
    newGeo.setAttribute('origin', new THREE.BufferAttribute(buffers.origins, 3));
    geometryRef.current = newGeo;
    
    if (pointsRef.current) {
      pointsRef.current.geometry = newGeo;
    }
    
    oldGeo.dispose();
  }, [emissionIndex]);

  useFrame(({ clock }) => {
    if (!pointsRef.current || !geometryRef.current || !materialRef.current) return;
    
    const t = clock.getElapsedTime();
    const ei = emissionIndex;
    
    const geo = geometryRef.current;
    const pos = geo.attributes.position.array as Float32Array;
    const ori = geo.attributes.origin.array as Float32Array;
    const count = pos.length / 3;

    // Random Brownian-style motion mapped from origins using 3D Noise offsets
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      
      // Compute random, fluid directional noise for each particle based on time and its index
      const noiseX = perlin1(i * 0.12 + t * 0.4) * 0.6 * ei;
      const noiseY = perlin1(i * 0.23 + t * 0.5) * 0.6 * ei;
      const noiseZ = perlin1(i * 0.34 + t * 0.3) * 0.6 * ei;

      pos[i3]     = ori[i3]     + noiseX;
      pos[i3 + 1] = ori[i3 + 1] + noiseY;
      pos[i3 + 2] = ori[i3 + 2] + noiseZ;
    }

    geo.attributes.position.needsUpdate = true;

    const pColor = ei < 0.5
      ? PARTICLE_CLEAN.clone().lerp(PARTICLE_MID, ei / 0.5)
      : PARTICLE_MID.clone().lerp(PARTICLE_CRITICAL, (ei - 0.5) / 0.5);

    materialRef.current.color.copy(pColor);
    materialRef.current.size = 0.02 + ei * 0.04;
    
    // Scale opacity
    materialRef.current.opacity = ei * 0.8; 
  });

  return (
    <points
      ref={pointsRef}
      geometry={geometryRef.current}
      material={materialRef.current}
    />
  );
});
