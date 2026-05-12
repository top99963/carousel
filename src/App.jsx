/* eslint-disable react-hooks/immutability */
import { ContactShadows, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import "./App.css";

const IMAGES = [
  { url: "https://picsum.photos/seed/arch1/600/800", label: "Architecture" },
  { url: "https://picsum.photos/seed/nature2/600/800", label: "Nature" },
  { url: "https://picsum.photos/seed/city3/600/800", label: "City" },
  { url: "https://picsum.photos/seed/ocean4/600/800", label: "Ocean" },
  { url: "https://picsum.photos/seed/forest5/600/800", label: "Forest" },
  { url: "https://picsum.photos/seed/desert6/600/800", label: "Desert" },
  { url: "https://picsum.photos/seed/mountain7/600/800", label: "Mountain" },
  { url: "https://picsum.photos/seed/abstract8/600/800", label: "Abstract" },
  { url: "https://picsum.photos/seed/arch1/600/800", label: "Architecture" },
  { url: "https://picsum.photos/seed/nature2/600/800", label: "Nature" },
  { url: "https://picsum.photos/seed/city3/600/800", label: "City" },
  { url: "https://picsum.photos/seed/ocean4/600/800", label: "Ocean" },
  { url: "https://picsum.photos/seed/forest5/600/800", label: "Forest" },
  { url: "https://picsum.photos/seed/desert6/600/800", label: "Desert" },
  { url: "https://picsum.photos/seed/mountain7/600/800", label: "Mountain" },
  { url: "https://picsum.photos/seed/abstract8/600/800", label: "Abstract" },
];

const CARD_W = 2.1;
const CARD_H = 2.8;
const CARD_RADIUS = 0.15;
const ARC_SPAN = Math.PI;
// Keep card spacing equal to the current 8-card layout even if total changes.
const FIXED_ANGULAR_STEP = Math.PI / 7;
const SIDE_TILT_FACTOR = 2;
const MAX_SIDE_TILT = 1.1;
const CENTER_TILT_MAX_X = 0.18;
const CENTER_TILT_MAX_Y = 0.24;
const CENTER_TILT_EASE = 6.5;
const SCROLL_SENSITIVITY = 0.0003;

const DRAG_PX_PER_ARC = () => window.innerWidth * 0.7;
const TOUCH_DEADZONE_PX = 2;
const SNAP_SPEED = 4.0; // lerp speed for displayAngle (same as desktop)
const INERTIA_DECAY = 0.92; // per-frame velocity decay after flick
const SNAP_SPRING = 0.1; // fraction pulled toward nearest card per frame
const SNAP_THRESHOLD = 0.0012;
const EMA_ALPHA = 0.35;

function getConfig() {
  const w = window.innerWidth;
  const isMobile = w < 600;
  const isTablet = w < 900;
  return {
    radius: 4.1,
    fov: isMobile ? 70 : isTablet ? 60 : 52,
    camY: 0,
    camZ: isMobile ? 7.5 : isTablet ? 8.5 : 9.5,
  };
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function Card({ url, index, step, getDisplayAngle, getCenterTilt }) {
  const meshRef = useRef();
  const texture = useTexture(url);
  const baseAngle = index * step;
  const configRef = useRef(getConfig());

  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    const r = CARD_RADIUS,
      w = CARD_W,
      h = CARD_H;
    shape.moveTo(-w / 2 + r, -h / 2);
    shape.lineTo(w / 2 - r, -h / 2);
    shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    shape.lineTo(w / 2, h / 2 - r);
    shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    shape.lineTo(-w / 2 + r, h / 2);
    shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    shape.lineTo(-w / 2, -h / 2 + r);
    shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    const geo = new THREE.ShapeGeometry(shape);
    geo.computeBoundingBox();
    const box = geo.boundingBox;
    const size = new THREE.Vector2(
      box.max.x - box.min.x,
      box.max.y - box.min.y,
    );
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(
        i,
        (geo.attributes.position.getX(i) - box.min.x) / size.x,
        (geo.attributes.position.getY(i) - box.min.y) / size.y,
      );
    }
    return geo;
  }, []);

  useEffect(() => {
    const onResize = () => {
      configRef.current = getConfig();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!texture) return;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 16;
  }, [texture]);

  useFrame(() => {
    if (!meshRef.current) return;
    const { radius } = configRef.current;
    const displayAngle = getDisplayAngle();
    const angle = baseAngle - displayAngle;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    const dist = Math.abs(angle);
    const t = Math.min(dist / (ARC_SPAN * 0.7), 1);
    const scale = Math.max(0.7, 1 - t * 0.3);
    const sideTilt = THREE.MathUtils.clamp(
      -angle * SIDE_TILT_FACTOR,
      -MAX_SIDE_TILT,
      MAX_SIDE_TILT,
    );
    const centerWeight = Math.max(0, 1 - dist / (step * 0.95));
    const centerTilt = getCenterTilt();
    meshRef.current.position.set(x, 0, z);
    meshRef.current.rotation.x = centerTilt.x * centerWeight;
    meshRef.current.rotation.y = sideTilt + centerTilt.y * centerWeight;
    meshRef.current.scale.setScalar(scale);
  });

  return (
    <group ref={meshRef}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          map={texture}
          roughness={0.18}
          metalness={0.04}
          clearcoat={1.0}
          clearcoatRoughness={0.06}
          reflectivity={1.0}
          side={THREE.FrontSide}
        />
      </mesh>
    </group>
  );
}

// ─── Scene ────────────────────────────────────────────────────────────────────
function Scene({ scrollAngle }) {
  const { camera } = useThree();
  const displayAngle = useRef(0);
  const mouseTarget = useRef({ x: 0, y: 0 });
  const mouseTilt = useRef({ x: 0, y: 0 });
  const keyLightRef = useRef();
  const step = FIXED_ANGULAR_STEP;
  const configRef = useRef(getConfig());

  const applyCamera = useCallback(() => {
    const { fov, camY, camZ } = configRef.current;
    camera.fov = fov;
    camera.position.set(0, camY, camZ);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  useEffect(() => {
    applyCamera();
    const onResize = () => {
      configRef.current = getConfig();
      applyCamera();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applyCamera]);

  useFrame((_, delta) => {
    // Simple lerp — same as original desktop behavior
    displayAngle.current +=
      (scrollAngle.current - displayAngle.current) *
      Math.min(delta * SNAP_SPEED, 1);

    // Mouse tilt easing
    const ease = Math.min(delta * CENTER_TILT_EASE, 1);
    mouseTilt.current.x += (mouseTarget.current.x - mouseTilt.current.x) * ease;
    mouseTilt.current.y += (mouseTarget.current.y - mouseTilt.current.y) * ease;

    if (keyLightRef.current) {
      const targetX = mouseTarget.current.y * 7;
      const targetY = 7 + mouseTarget.current.x * 4;
      keyLightRef.current.position.x +=
        (targetX - keyLightRef.current.position.x) * ease;
      keyLightRef.current.position.y +=
        (targetY - keyLightRef.current.position.y) * ease;
    }
  });

  const getDisplayAngle = useCallback(() => displayAngle.current, []);
  const getCenterTilt = useCallback(() => mouseTilt.current, []);

  useEffect(() => {
    const onPointerMove = (e) => {
      if (e.pointerType === "touch") return;
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      mouseTarget.current.x = THREE.MathUtils.clamp(
        -ny * CENTER_TILT_MAX_X,
        -CENTER_TILT_MAX_X,
        CENTER_TILT_MAX_X,
      );
      mouseTarget.current.y = THREE.MathUtils.clamp(
        nx * CENTER_TILT_MAX_Y,
        -CENTER_TILT_MAX_Y,
        CENTER_TILT_MAX_Y,
      );
    };
    const onPointerLeave = () => {
      mouseTarget.current.x = 0;
      mouseTarget.current.y = 0;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerleave", onPointerLeave);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <group>
      <ambientLight intensity={1.05} />
      <directionalLight
        ref={keyLightRef}
        position={[0, 7, 9]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0001}
      />
      <directionalLight position={[-7, 4, -6]} intensity={0.55} />
      {IMAGES.map((img, i) => (
        <Card
          key={img.url}
          url={img.url}
          index={i}
          step={step}
          getDisplayAngle={getDisplayAngle}
          getCenterTilt={getCenterTilt}
        />
      ))}
      <ContactShadows
        position={[0, -1.42, 0]}
        opacity={0.55}
        blur={2.8}
        far={8}
        resolution={1024}
        scale={14}
        color="#2a1f14"
      />
    </group>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const scrollAngle = useRef(0);
  const inertiaVel = useRef(0); // arc-units/frame for post-flick coasting
  const isTouching = useRef(false);

  // Touch tracking
  const touchStartX = useRef(0);
  const touchStartAngle = useRef(0);
  const prevTouchX = useRef(0);
  const prevTouchTime = useRef(0);
  const emaVelocity = useRef(0); // EMA of instantaneous drag velocity

  const total = IMAGES.length;
  const step = FIXED_ANGULAR_STEP;
  const maxAngle = Math.max(total - 1, 0) * step;

  // ── Desktop wheel ─────────────────────────────────────────────────────────
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    inertiaVel.current += e.deltaY * SCROLL_SENSITIVITY;
  }, []);

  // ── Touch start ───────────────────────────────────────────────────────────
  const handleTouchStart = useCallback((e) => {
    const x = e.touches[0].clientX;
    isTouching.current = true;
    inertiaVel.current = 0;
    emaVelocity.current = 0;
    touchStartX.current = x;
    touchStartAngle.current = scrollAngle.current;
    prevTouchX.current = x;
    prevTouchTime.current = performance.now();
  }, []);

  // ── Touch move: direct finger → scrollAngle (anchored from start point) ──
  const handleTouchMove = useCallback(
    (e) => {
      e.preventDefault();
      if (!isTouching.current) return;

      const x = e.touches[0].clientX;
      const now = performance.now();
      const dt = now - prevTouchTime.current;

      // Absolute mapping from finger start — no drift accumulation
      const totalDx = touchStartX.current - x;
      const totalDxAbs = Math.abs(totalDx);
      const adjustedDx =
        totalDxAbs <= TOUCH_DEADZONE_PX
          ? 0
          : Math.sign(totalDx) * (totalDxAbs - TOUCH_DEADZONE_PX);

      scrollAngle.current = THREE.MathUtils.clamp(
        touchStartAngle.current + adjustedDx / DRAG_PX_PER_ARC(),
        0,
        maxAngle,
      );

      // EMA velocity in arc-units/frame
      if (dt > 0) {
        const instV = ((prevTouchX.current - x) / DRAG_PX_PER_ARC() / dt) * 16;
        emaVelocity.current =
          EMA_ALPHA * instV + (1 - EMA_ALPHA) * emaVelocity.current;
      }
      prevTouchX.current = x;
      prevTouchTime.current = now;
    },
    [maxAngle],
  );

  // ── Touch end: hand off EMA velocity to inertia coasting ─────────────────
  const handleTouchEnd = useCallback(() => {
    isTouching.current = false;
    // Transfer finger velocity to inertia — no artificial damping multiplier
    // The INERTIA_DECAY per-frame handles the coast naturally
    inertiaVel.current = emaVelocity.current;
  }, []);

  useEffect(() => {
    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleWheel, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // ── Animation loop: inertia coast + snap (skips during active touch) ──────
  useEffect(() => {
    let raf;
    const tick = () => {
      if (!isTouching.current) {
        const absV = Math.abs(inertiaVel.current);

        if (absV > SNAP_THRESHOLD) {
          // Coasting — exponential decay
          scrollAngle.current += inertiaVel.current;
          inertiaVel.current *= INERTIA_DECAY;

          // Edge bounce
          if (scrollAngle.current < 0) {
            scrollAngle.current = 0;
            inertiaVel.current = 0;
          } else if (scrollAngle.current > maxAngle) {
            scrollAngle.current = maxAngle;
            inertiaVel.current = 0;
          }
        } else {
          // Slow/stopped → spring toward nearest card
          inertiaVel.current = 0;
          const nearest = Math.round(scrollAngle.current / step) * step;
          scrollAngle.current += (nearest - scrollAngle.current) * SNAP_SPRING;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [maxAngle, step]);

  return (
    <div className="app">
      <Canvas
        shadows
        gl={{ antialias: true, alpha: true, premultipliedAlpha: false }}
        onCreated={({ gl }) => gl.setClearAlpha(0)}
        dpr={[1, Math.min(window.devicePixelRatio, 2)]}
        style={{ position: "absolute", inset: 0 }}
      >
        <Scene scrollAngle={scrollAngle} />
      </Canvas>
    </div>
  );
}
