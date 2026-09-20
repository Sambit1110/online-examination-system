import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

/**
 * The WebGL content, isolated so three.js / fiber / drei only ever land in
 * a lazy chunk (see HeroBackground.tsx), never the main bundle.
 *
 * Budget: procedural geometry only — no textures, no GLTF, no shadow maps,
 * no transmission/refraction passes. A few hundred triangles and one points
 * cloud, capped at 1.5x device pixel ratio.
 */

/**
 * react-three-fiber measures its container with a ResizeObserver-based hook.
 * That measurement is async, which can leave the canvas at the browser's
 * 300x150 default (then CSS-stretched and blurry) for a frame or more after
 * mount. This fires one synchronous measurement on observe(), then hands off
 * to a real ResizeObserver for genuine resizes.
 */
class ImmediateResizeObserver {
  private ro: ResizeObserver | null = null;
  constructor(private callback: (entries: unknown[], observer: unknown) => void) {
    if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
      this.ro = new window.ResizeObserver(callback as ResizeObserverCallback);
    }
  }
  observe(target: Element) {
    this.callback([{ contentRect: target.getBoundingClientRect(), target }], this);
    this.ro?.observe(target);
  }
  unobserve(target: Element) {
    this.ro?.unobserve(target);
  }
  disconnect() {
    this.ro?.disconnect();
  }
  static toString() {
    return 'ImmediateResizeObserver';
  }
}

export type SceneVariant = 'hero' | 'ambient';

/* ------------------------------------------------------------------ */
/* Motion                                                              */
/* ------------------------------------------------------------------ */

/**
 * Damped pointer parallax plus a very slow orbit. The whole scene is one
 * group, so this is a single matrix update per frame rather than per-object
 * work. Pointer influence is deliberately small — it should read as depth,
 * not as a toy that follows the cursor.
 */
const ParallaxRig: React.FC<{ children: React.ReactNode; strength: number }> = ({
  children,
  strength
}) => {
  const group = useRef<THREE.Group>(null);
  const { pointer } = useThree();

  useFrame((state, delta) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;

    const targetX = pointer.y * strength * 0.35;
    const targetY = pointer.x * strength + Math.sin(t * 0.06) * 0.08;

    // Frame-rate independent damping — the same feel at 60 and 120Hz.
    const k = 1 - Math.pow(0.0015, delta);
    group.current.rotation.x += (targetX - group.current.rotation.x) * k;
    group.current.rotation.y += (targetY - group.current.rotation.y) * k;
  });

  return <group ref={group}>{children}</group>;
};

/** Pauses rendering whenever the tab is hidden, so a backgrounded login
 *  page costs nothing. */
const PauseWhenHidden: React.FC = () => {
  const setFrameloop = useThree(s => s.setFrameloop);
  React.useEffect(() => {
    const sync = () => setFrameloop(document.hidden ? 'never' : 'always');
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      setFrameloop('always');
    };
  }, [setFrameloop]);
  return null;
};

/* ------------------------------------------------------------------ */
/* Objects                                                             */
/* ------------------------------------------------------------------ */

/** Sparse dust giving the empty volume a sense of scale and depth. */
const Dust: React.FC<{ count: number }> = ({ count }) => {
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      // Pushed outward from the centre so nothing drifts over the card.
      const radius = 8 + Math.random() * 7;
      const theta = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 9;
      positions[i * 3] = Math.cos(theta) * radius;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(theta) * radius - 6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [count]);

  const ref = useRef<THREE.Points>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.012;
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        size={0.038}
        sizeAttenuation
        color="#C3BCF7"
        transparent
        opacity={0.7}
        depthWrite={false}
      />
    </points>
  );
};

/** A thin plane standing in for a floating answer sheet. */
const Sheet: React.FC<{
  position: [number, number, number];
  rotation: [number, number, number];
  color: string;
  scale?: number;
}> = ({ position, rotation, color, scale = 1 }) => (
  <Float speed={1.1} rotationIntensity={0.35} floatIntensity={0.9}>
    <mesh position={position} rotation={rotation} scale={scale}>
      <boxGeometry args={[1.15, 1.5, 0.028]} />
      <meshStandardMaterial
        color={color}
        roughness={0.32}
        metalness={0.2}
        emissive={color}
        emissiveIntensity={0.16}
      />
    </mesh>
  </Float>
);

/** The focal object: a faceted, slowly-breathing gem. */
const Gem: React.FC<{ position: [number, number, number]; scale: number }> = ({ position, scale }) => (
  <Float speed={0.9} rotationIntensity={0.55} floatIntensity={1.1}>
    <mesh position={position} scale={scale}>
      <icosahedronGeometry args={[1, 0]} />
      <MeshDistortMaterial
        color="#6E5DE7"
        roughness={0.12}
        metalness={0.72}
        distort={0.12}
        speed={1.1}
        emissive="#6E5DE7"
        emissiveIntensity={0.62}
      />
    </mesh>
  </Float>
);

const Ring: React.FC<{ position: [number, number, number]; scale: number }> = ({ position, scale }) => {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z += delta * 0.09;
  });
  return (
    <Float speed={0.75} rotationIntensity={0.25} floatIntensity={0.7}>
      <mesh ref={ref} position={position} rotation={[0.62, 0.3, 0]} scale={scale}>
        <torusGeometry args={[0.88, 0.075, 20, 72]} />
        <meshStandardMaterial
          color="#4FD1E0"
          roughness={0.2}
          metalness={0.8}
          emissive="#4FD1E0"
          emissiveIntensity={0.72}
        />
      </mesh>
    </Float>
  );
};

const Shard: React.FC<{ position: [number, number, number]; scale: number }> = ({ position, scale }) => (
  <Float speed={1.35} rotationIntensity={0.2} floatIntensity={1.3}>
    <mesh position={position} scale={scale}>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial
        color="#DFB369"
        roughness={0.18}
        metalness={0.65}
        emissive="#DFB369"
        emissiveIntensity={0.38}
      />
    </mesh>
  </Float>
);

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

const SceneContent: React.FC<{ variant: SceneVariant }> = ({ variant }) => {
  const hero = variant === 'hero';

  return (
    <>
      {/* No scene.background — the canvas stays transparent (gl alpha) so
          the page's own atmosphere shows through and the two never fight. */}
      <fog attach="fog" args={['#08090F', 15, 28]} />

      {/* Key from above-front, a violet fill from below, and a cyan rim
          from behind to separate objects from the dark field. */}
      <ambientLight intensity={0.55} color="#C3BCF7" />
      <directionalLight position={[4, 6, 4]} intensity={1.15} color="#ffffff" />
      <directionalLight position={[-4, -3, 2]} intensity={0.35} color="#8878F1" />
      <pointLight position={[-4, 2, 1]} intensity={16} color="#6E5DE7" distance={12} decay={2} />
      <pointLight position={[4.5, -1.5, 0.5]} intensity={11} color="#4FD1E0" distance={11} decay={2} />

      <ParallaxRig strength={hero ? 0.16 : 0.09}>
        <Dust count={hero ? 240 : 110} />

        {/* Positioned toward the edges and pushed back in depth, well clear
            of the centred card. Each object bobs in place rather than
            orbiting through the middle of the composition. */}
        {/* Everything lives in the corners of the far field, outside the
            band where the headline and the form card sit. Nothing drifts
            across the centre of the composition. */}
        {/* The content column spans roughly x ∈ [-7.4, 7.4] and y ∈ [-3.6,
            3.6] at this depth. Everything is placed outside that band — the
            outer edges and the top/bottom strips — so the composition never
            has geometry sitting on top of type. */}
        <Gem position={[-8.7, 2.5, -6.0]} scale={hero ? 0.78 : 0.58} />
        <Ring position={[8.9, 2.0, -6.0]} scale={hero ? 0.7 : 0.52} />
        <Shard position={[-8.3, -3.1, -5.6]} scale={hero ? 0.32 : 0.24} />

        {hero && (
          <>
            <Sheet position={[8.5, -3.3, -6.0]} rotation={[0.2, -0.42, 0.16]} color="#A99CF5" scale={0.55} />
            <Sheet position={[-6.6, -5.4, -6.6]} rotation={[-0.16, 0.52, -0.12]} color="#79D8E4" scale={0.46} />
            <Sheet position={[4.6, 5.1, -6.6]} rotation={[0.3, 0.2, -0.26]} color="#C3BCF7" scale={0.42} />
          </>
        )}
      </ParallaxRig>
    </>
  );
};

export const HeroScene: React.FC<{ variant?: SceneVariant }> = ({ variant = 'hero' }) => (
  <Canvas
    dpr={[1, variant === 'hero' ? 1.5 : 1.25]}
    gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
    camera={{ position: [0, 0, 8], fov: 46 }}
    resize={{ polyfill: ImmediateResizeObserver as unknown as typeof ResizeObserver, debounce: 0 }}
    style={{ width: '100%', height: '100%' }}
  >
    <PauseWhenHidden />
    <SceneContent variant={variant} />
  </Canvas>
);

export default HeroScene;
