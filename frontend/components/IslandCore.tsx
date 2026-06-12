"use client";

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useCarbon } from '@/context/CarbonContext';

const COLOR_HEALTHY  = new THREE.Color('#10B981');
const COLOR_STRESSED = new THREE.Color('#F59E0B');
const COLOR_CRITICAL = new THREE.Color('#4B5563'); // Slate Gray

export const IslandCore = React.memo(function IslandCore() {
  const { emissionIndex } = useCarbon();
  
  // Load the GLTF asset
  const { scene } = useGLTF('/models/Nature.glb');

  // Deep clone the scene to allow material mutation without affecting cache
  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  const islandRef = useRef<THREE.Group>(null);

  // Keep track of materials and meshes for the frame loop
  const grassMaterials = useRef<THREE.MeshStandardMaterial[]>([]);
  const treeMeshes = useRef<THREE.Object3D[]>([]);
  const cloudMeshes = useRef<THREE.Object3D[]>([]);
  
  // Track initial scales and positions for lerping
  const treeInitialScales = useRef<Map<string, THREE.Vector3>>(new Map());

  useEffect(() => {
    grassMaterials.current = [];
    treeMeshes.current = [];
    cloudMeshes.current = [];

    clonedScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        
        // Clone material so we don't mutate the shared GLTF material
        if (mesh.material) {
          mesh.material = (mesh.material as THREE.Material).clone();
        }

        const name = child.name.toLowerCase();

        // Identify Grass / Ground
        if (name.includes('grass') || name.includes('ground') || name.includes('land') || name.includes('surface')) {
          grassMaterials.current.push(mesh.material as THREE.MeshStandardMaterial);
        }
        
        // Identify Trees / Foliage
        if (name.includes('tree') || name.includes('foliage') || name.includes('pine')) {
          treeMeshes.current.push(mesh);
          treeInitialScales.current.set(mesh.uuid, mesh.scale.clone());
        }

        // Identify Clouds
        if (name.includes('cloud')) {
          cloudMeshes.current.push(mesh);
          if (mesh.material) {
            (mesh.material as THREE.MeshStandardMaterial).transparent = true;
          }
        }
      }
    });

    return () => {
      // Cleanup cloned materials on unmount
      clonedScene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else {
            mesh.material?.dispose();
          }
        }
      });
    };
  }, [clonedScene]);

  useFrame((state) => {
    const t = emissionIndex;
    const time = state.clock.getElapsedTime();

    // 1. Lerp Ground Color
    const targetColor = t < 0.5
      ? COLOR_HEALTHY.clone().lerp(COLOR_STRESSED, t / 0.5)
      : COLOR_STRESSED.clone().lerp(COLOR_CRITICAL, (t - 0.5) / 0.5);

    grassMaterials.current.forEach((mat) => {
      mat.color.lerp(targetColor, 0.05);
    });

    // 2. Deforestation Effect (Scale down trees if emission > 0.7)
    treeMeshes.current.forEach((tree) => {
      const initialScale = treeInitialScales.current.get(tree.uuid);
      if (!initialScale) return;

      const targetScale = t > 0.7 ? 0 : 1;
      tree.scale.lerp(initialScale.clone().multiplyScalar(targetScale), 0.05);
      
      // Optimization: hide if scale is practically 0
      tree.visible = tree.scale.x > 0.01;
    });

    // 3. Drift Clouds and Darken them
    cloudMeshes.current.forEach((cloud, i) => {
      // Drift slowly
      cloud.position.x += Math.sin(time * 0.1 + i) * 0.002;
      cloud.position.z += Math.cos(time * 0.15 + i) * 0.002;

      // Darken cloud color based on emissions
      const mat = (cloud as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (mat) {
        const cloudBase = new THREE.Color('#ffffff');
        const cloudDark = new THREE.Color('#4B5563'); // Dark slate
        mat.color.lerpColors(cloudBase, cloudDark, t);
        mat.opacity = 1.0 - t * 0.5; // Make them slightly translucent at high pollution
      }
    });

    // Slight breathing and bobbing of the entire island group
    if (islandRef.current) {
      islandRef.current.rotation.y += 0.001;
      const breathe = 1.0 + Math.sin(time * 2) * 0.005 * (1.0 - t);
      islandRef.current.scale.setScalar(breathe);
      islandRef.current.position.y = Math.sin(time * 1.5) * 0.02 * (1.0 - t);
    }
  });

  return (
    <group ref={islandRef}>
      <primitive object={clonedScene} />
    </group>
  );
});

// Preload the model
useGLTF.preload('/models/Nature.glb');
