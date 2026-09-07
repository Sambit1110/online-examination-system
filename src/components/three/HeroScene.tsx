import React from 'react';
import { Canvas } from '@react-three/fiber';
import { Float, MeshDistortMaterial } from '@react-three/drei';

/**
 * The actual WebGL content — isolated in its own module so
 * three.js / @react-three/fiber / drei are only pulled into a
 * lazy-loaded chunk (see HeroBackground.tsx), never the main bundle.
 *
 * Purely procedural geometry (no textures, no GLTF downloads) to keep
 * this genuinely lightweight: a handful of low-poly primitives, reused
 * materials, no shadow maps, capped pixel ratio.
 */

/**
 * react-three-fiber measures its container via react-use-measure's
 * ResizeObserver-based hook. That measurement is async — it waits for the
 * browser's next layout/paint cycle to report a size — which can leave the
 * canvas sized at the browser's 300x150 default (then CSS-stretched, blurry
 * and oversized) for one or more frames after mount, worse on a throttled
 * or just-backgrounded tab. This polyfill fires an immediate *synchronous*
 * measurement via getBoundingClientRect on `observe()`, then hands off to a
 * real ResizeObserver (when available) for genuine subsequent resizes.
 */
class ImmediateResizeObserver {
  private ro: ResizeObserver | null = null;
  constructor(private callback: (entries: unknown[], observer: unknown) => void) {
    if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
      this.ro = new window.ResizeObserver(callback as ResizeObserverCallback);
    }
  }
  observe(target: Element) {
    const rect = target.getBoundingClientRect();
    this.callback([{ contentRect: rect, target }], this);
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

/** A thin flat plane standing in for a floating exam sheet / document. */
const DocumentCard: React.FC<{
  position: [number, number, number];
  rotation: [number, number, number];
  color: string;
  scale?: number;
}> = ({ position, rotation, color, scale = 1 }) => (
  <Float speed={1.4} rotationIntensity={0.5} floatIntensity={1.1}>
    <mesh position={position} rotation={rotation} scale={scale} castShadow={false} receiveShadow={false}>
      <boxGeometry args={[1.15, 1.5, 0.035]} />
      <meshStandardMaterial
        color={color}
        roughness={0.35}
        metalness={0.15}
        emissive={color}
        emissiveIntensity={0.06}
      />
    </mesh>
  </Float>
);

const KnowledgeGem: React.FC = () => (
  <Float speed={1.1} rotationIntensity={0.7} floatIntensity={1.3}>
    <mesh position={[3.7, 1.3, -3.8]} scale={0.95}>
      <icosahedronGeometry args={[1, 1]} />
      <MeshDistortMaterial
        color="#6366f1"
        roughness={0.15}
        metalness={0.6}
        distort={0.24}
        speed={1.4}
        emissive="#6366f1"
        emissiveIntensity={0.2}
      />
    </mesh>
  </Float>
);

const AcademicRing: React.FC = () => (
  <Float speed={0.9} rotationIntensity={0.4} floatIntensity={0.9}>
    <mesh position={[-3.9, 1.7, -3.4]} rotation={[0.6, 0.3, 0]} scale={0.75}>
      <torusGeometry args={[0.85, 0.14, 24, 80]} />
      <meshStandardMaterial
        color="#22d3ee"
        roughness={0.25}
        metalness={0.7}
        emissive="#22d3ee"
        emissiveIntensity={0.3}
      />
    </mesh>
  </Float>
);

const AccentSphere: React.FC = () => (
  <Float speed={1.6} rotationIntensity={0.2} floatIntensity={1.5}>
    <mesh position={[-3.5, -2, -3]} scale={0.32}>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#f3f5f9" roughness={0.2} metalness={0.4} emissive="#818cf8" emissiveIntensity={0.12} />
    </mesh>
  </Float>
);

const SceneContent: React.FC = () => (
  <>
    {/* No scene background — leaving it unset keeps the canvas transparent
        (gl alpha:true below) so the page's own CSS gradient shows through. */}
    <fog attach="fog" args={['#05070d', 7, 16]} />

    <ambientLight intensity={0.85} color="#c7d2fe" />
    <directionalLight position={[4, 5, 3]} intensity={1.3} color="#ffffff" />
    <directionalLight position={[-3, -2, 2]} intensity={0.4} color="#818cf8" />
    <pointLight position={[-3, 2, 2]} intensity={14} color="#6366f1" distance={9} />
    <pointLight position={[3, -1, 1]} intensity={12} color="#22d3ee" distance={9} />

    {/* Positioned toward the edges/corners and pushed back in depth, well
        clear of the centered login card — each object only bobs gently in
        place (via Float below) rather than orbiting through the center. */}
    <KnowledgeGem />
    <AcademicRing />
    <AccentSphere />
    <DocumentCard position={[3.3, -2.1, -4]} rotation={[0.2, -0.4, 0.15]} color="#a5b4fc" scale={0.6} />
    <DocumentCard position={[-3.6, -0.6, -4.2]} rotation={[-0.15, 0.5, -0.1]} color="#67e8f9" scale={0.5} />
  </>
);

export const HeroScene: React.FC = () => (
  <Canvas
    dpr={[1, 1.5]}
    gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
    camera={{ position: [0, 0, 7.5], fov: 48 }}
    resize={{ polyfill: ImmediateResizeObserver as unknown as typeof ResizeObserver, debounce: 0 }}
    style={{ width: '100%', height: '100%' }}
  >
    <SceneContent />
  </Canvas>
);

export default HeroScene;
