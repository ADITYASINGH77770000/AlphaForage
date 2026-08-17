"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Icosahedron, MeshDistortMaterial, Torus } from "@react-three/drei";
import { EffectComposer, Bloom, ChromaticAberration } from "@react-three/postprocessing";
import * as THREE from "three";

/* ──────────────────────────────────────────────────────────────────────────
   Forge Core — the molten center: capital, conviction, strategic energy.
   ────────────────────────────────────────────────────────────────────────── */
function Core() {
  const g = useRef<THREE.Group>(null!);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.15;
  });
  return (
    <group ref={g}>
      <Icosahedron args={[1.15, 6]}>
        <MeshDistortMaterial
          color="#0be0ff"
          emissive="#00f5a0"
          emissiveIntensity={1.4}
          roughness={0.15}
          metalness={0.6}
          distort={0.35}
          speed={1.6}
        />
      </Icosahedron>
      {/* inner hot core */}
      <Icosahedron args={[0.7, 3]}>
        <meshBasicMaterial color="#eafff6" />
      </Icosahedron>
      {/* hexagonal forge cages */}
      <Torus args={[2.1, 0.012, 6, 6]} rotation={[Math.PI / 2, 0, 0]}>
        <meshBasicMaterial color="#0be0ff" transparent opacity={0.5} />
      </Torus>
      <Torus args={[2.55, 0.01, 6, 6]} rotation={[Math.PI / 2.4, 0.4, 0]}>
        <meshBasicMaterial color="#a55efd" transparent opacity={0.35} />
      </Torus>
    </group>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Orbiting particle field.
   Physics: inverse-square central attraction  a = -k * r / |r|^3  (F ∝ 1/r²),
   plus cursor repulsion with 1/r² falloff. Particles are given tangential
   velocity so they orbit rather than fall in. GPU-instanced for performance.
   ────────────────────────────────────────────────────────────────────────── */
const PALETTE = [new THREE.Color("#00f5a0"), new THREE.Color("#0be0ff"), new THREE.Color("#a55efd")];
const CA_OFFSET = new THREE.Vector2(0.0006, 0.0009);

function Particles({ count }: { count: number }) {
  const COUNT = count;
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const { viewport } = useThree();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const pointer = useRef(new THREE.Vector3(999, 999, 0));

  const { pos, vel } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const vel = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      // seed on a shell with random orientation
      const r = 2.4 + Math.random() * 3.6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta) * 0.55; // flatten into a disc
      const z = r * Math.cos(phi);
      pos.set([x, y, z], i * 3);
      // tangential velocity ~ sqrt(k/r) for a stable-ish orbit, in the xz plane
      const speed = Math.sqrt(2.2 / r) * (0.8 + Math.random() * 0.4);
      vel.set([-z * speed / r, (Math.random() - 0.5) * 0.05, x * speed / r], i * 3);
    }
    return { pos, vel };
  }, []);

  const colors = useMemo(() => {
    const c = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const col = PALETTE[i % 3];
      c.set([col.r, col.g, col.b], i * 3);
    }
    return c;
  }, []);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.033);
    // map cursor (-1..1) to world space on the z=0 plane
    pointer.current.set(
      state.pointer.x * viewport.width * 0.5,
      state.pointer.y * viewport.height * 0.5,
      0
    );
    const K = 2.2; // central field strength
    const REP = 3.5; // cursor repulsion strength
    for (let i = 0; i < COUNT; i++) {
      const ix = i * 3;
      let x = pos[ix], y = pos[ix + 1], z = pos[ix + 2];
      let r2 = x * x + y * y + z * z + 0.4;
      const invr = 1 / Math.sqrt(r2);
      const invr3 = invr / r2;
      // central inverse-square pull
      let ax = -K * x * invr3;
      let ay = -K * y * invr3;
      let az = -K * z * invr3;
      // cursor repulsion (1/r²)
      const dx = x - pointer.current.x, dy = y - pointer.current.y, dz = z - pointer.current.z;
      const dr2 = dx * dx + dy * dy + dz * dz + 0.6;
      const f = REP / (dr2 * Math.sqrt(dr2));
      ax += dx * f; ay += dy * f; az += dz * f;
      // integrate + gentle damping
      vel[ix] = (vel[ix] + ax * dt) * 0.999;
      vel[ix + 1] = (vel[ix + 1] + ay * dt) * 0.999;
      vel[ix + 2] = (vel[ix + 2] + az * dt) * 0.999;
      x += vel[ix] * dt; y += vel[ix + 1] * dt; z += vel[ix + 2] * dt;
      // keep the field alive: re-seed anything that escaped or fell in
      const d2 = x * x + y * y + z * z;
      if (d2 > 64 || d2 < 1.2) {
        const rr = 3 + Math.random() * 2.5, th = Math.random() * Math.PI * 2;
        x = rr * Math.cos(th); y = (Math.random() - 0.5) * 1.5; z = rr * Math.sin(th);
        const sp = Math.sqrt(2.2 / rr);
        vel[ix] = -z * sp / rr; vel[ix + 1] = 0; vel[ix + 2] = x * sp / rr;
      }
      pos[ix] = x; pos[ix + 1] = y; pos[ix + 2] = z;
      dummy.position.set(x, y, z);
      const s = 0.02 + (i % 5) * 0.004;
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]}>
      <sphereGeometry args={[1, 8, 8]}>
        <instancedBufferAttribute attach="attributes-color" args={[colors, 3]} />
      </sphereGeometry>
      <meshBasicMaterial vertexColors toneMapped={false} />
    </instancedMesh>
  );
}

function Rig() {
  useFrame((state) => {
    // Cinematic scroll: the camera dollies back and rises as you leave the hero,
    // so the transition into the proof row feels like a camera move, not a cut.
    const p = Math.min(window.scrollY / Math.max(window.innerHeight, 1), 1);
    const targetZ = 8 + p * 4.5;
    const targetY = state.pointer.y * 0.8 + p * 1.6;
    state.camera.position.x += (state.pointer.x * 1.2 - state.camera.position.x) * 0.03;
    state.camera.position.y += (targetY - state.camera.position.y) * 0.05;
    state.camera.position.z += (targetZ - state.camera.position.z) * 0.05;
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function ForgeScene() {
  // Device tier decides particle count + whether to run post-processing.
  const [lowPower, setLowPower] = useState(false);
  useEffect(() => {
    const small = window.innerWidth < 768;
    const weak = (navigator.hardwareConcurrency || 8) <= 4;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setLowPower(small || weak || reduce);
  }, []);

  const count = lowPower ? 550 : 1400;

  return (
    <Canvas
      camera={{ position: [0, 0, 8], fov: 45 }}
      dpr={lowPower ? [1, 1.25] : [1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ background: "transparent", width: "100%", height: "100%", display: "block" }}
    >
      <ambientLight intensity={0.4} />
      <pointLight position={[6, 6, 6]} intensity={40} color="#0be0ff" />
      <pointLight position={[-6, -4, -4]} intensity={30} color="#a55efd" />
      <Core />
      <Particles count={count} />
      <Rig />
      {!lowPower && (
        <EffectComposer>
          <Bloom mipmapBlur intensity={1.15} luminanceThreshold={0.15} luminanceSmoothing={0.7} />
          <ChromaticAberration offset={CA_OFFSET} radialModulation={false} modulationOffset={0} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
