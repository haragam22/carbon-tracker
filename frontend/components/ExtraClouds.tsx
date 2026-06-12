"use client";

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useCarbon } from '@/context/CarbonContext';

export const ExtraClouds = React.memo(function ExtraClouds() {
  const { emissionIndex } = useCarbon();
  
  const gltf1 = useGLTF('/models/Clouds.glb');
  const gltf2 = useGLTF('/models/Cumulus Clouds 2.glb');

  // Generate 7 total clouds naturally scattered
  const cloudData = useMemo(() => [
    { type: 1, pos: [-2, 3.5, -2], scale: 0.5, speed: 0.05, offset: 0 },
    { type: 2, pos: [2.5, 2.8, 1.5], scale: 0.4, speed: 0.06, offset: 2 },
    { type: 1, pos: [-1.5, 2.5, 2.5], scale: 0.35, speed: 0.04, offset: 1 },
    { type: 2, pos: [3, 3.2, -1], scale: 0.45, speed: 0.07, offset: 3 },
    { type: 1, pos: [0, 3.8, -3], scale: 0.6, speed: 0.03, offset: 4 },
    { type: 2, pos: [1, 2.6, 3], scale: 0.3, speed: 0.05, offset: 5 },
    { type: 1, pos: [-3, 2.9, 1], scale: 0.4, speed: 0.08, offset: 6 },
  ], []);

  const scenes = useMemo(() => {
    return cloudData.map(data => {
      const gltf = data.type === 1 ? gltf1 : gltf2;
      const s = gltf.scene.clone(true);
      s.position.set(data.pos[0], data.pos[1], data.pos[2]);
      s.scale.set(data.scale, data.scale, data.scale);
      return { scene: s, data };
    });
  }, [gltf1.scene, gltf2.scene, cloudData]);

  const materialsRef = useRef<THREE.MeshStandardMaterial[]>([]);

  useEffect(() => {
    materialsRef.current = [];

    scenes.forEach(({ scene }) => {
      scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.material) {
            mesh.material = (mesh.material as THREE.Material).clone();
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.transparent = true;
            materialsRef.current.push(mat);
          }
        }
      });
    });

    return () => {
      materialsRef.current.forEach(m => m.dispose());
    };
  }, [scenes]);

  useFrame((state) => {
    const t = emissionIndex;
    const time = state.clock.getElapsedTime();

    // Drift all clouds
    scenes.forEach(({ scene, data }) => {
      scene.position.x = data.pos[0] + Math.sin(time * data.speed + data.offset) * 0.5;
      scene.position.z = data.pos[2] + Math.cos(time * data.speed + data.offset) * 0.5;
    });

    // Shift colors
    const cloudClean = new THREE.Color('#ffffff');
    const cloudDirty = new THREE.Color('#374151'); // dark slate
    
    materialsRef.current.forEach((mat) => {
      mat.color.lerpColors(cloudClean, cloudDirty, t);
      mat.opacity = 1.0 - (t * 0.2);
    });
  });

  return (
    <group>
      {scenes.map((s, i) => (
        <primitive key={i} object={s.scene} />
      ))}
    </group>
  );
});

useGLTF.preload('/models/Clouds.glb');
useGLTF.preload('/models/Cumulus Clouds 2.glb');
