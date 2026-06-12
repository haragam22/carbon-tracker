"use client";

import React, { useEffect, useState, Suspense } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { IslandCore } from './IslandCore';
import { AtmosphereVortex } from './AtmosphereVortex';
import { ExtraClouds } from './ExtraClouds';
import { useCarbon } from '@/context/CarbonContext';
import * as THREE from 'three';

export function disposeScene(scene: any) {
  scene.traverse((object: any) => {
    if (!object.isMesh && !object.isPoints) return;

    object.geometry?.dispose();

    const mat = object.material;
    if (!mat) return;

    ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap',
     'aoMap', 'alphaMap', 'envMap'].forEach(key => {
      mat[key]?.dispose();
    });

    mat.dispose();
  });
}

function SceneDisposer() {
  const { scene } = useThree();
  useEffect(() => {
    return () => disposeScene(scene);
  }, [scene]);
  return null;
}

// Controller component to dynamically update fog from within the Canvas Context
function FogController() {
  const { scene } = useThree();
  const { emissionIndex } = useCarbon();

  useEffect(() => {
    // Initial fog setup
    scene.fog = new THREE.FogExp2('#1F2937', 0.0);
    return () => {
      scene.fog = null;
    };
  }, [scene]);

  useEffect(() => {
    if (scene.fog && scene.fog instanceof THREE.FogExp2) {
      // Density ramps up as emissionIndex increases
      // At 0.0: density is 0. At 1.0: density is dense.
      const targetDensity = emissionIndex * 0.08;
      scene.fog.density = targetDensity;
      
      // Shift color towards murky gray
      const cleanFog = new THREE.Color('#f0f8ff'); // very light blue/white
      const dirtyFog = new THREE.Color('#1F2937'); // murky gray
      scene.fog.color.lerpColors(cleanFog, dirtyFog, emissionIndex);
    }
  }, [emissionIndex, scene.fog]);

  return null;
}

export function CarbonCanvas({ isPreview = false }: { isPreview?: boolean }) {
  // Prevent hydration mismatch by mounting client-side only
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="canvas-container" />;

  return (
    <div className="canvas-container">
      <Canvas
        camera={{ position: [0, 1.5, 5], fov: 45, near: 0.1, far: 100 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
      >
        <FogController />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 10, 5]} intensity={1.5} castShadow />
        <group scale={0.7}>
          <Suspense fallback={null}>
            <IslandCore />
            <ExtraClouds />
          </Suspense>
          {!isPreview && <AtmosphereVortex />}
        </group>
        {!isPreview && (
          <OrbitControls enablePan={false} minDistance={3} maxDistance={10} maxPolarAngle={Math.PI / 2 + 0.1} />
        )}
        <SceneDisposer />
      </Canvas>
    </div>
  );
}
