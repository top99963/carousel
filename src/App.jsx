/* eslint-disable react-hooks/immutability */
import { ContactShadows, RoundedBox, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import "./App.css";

const IMAGES = [
  {
    url: "https://images.unsplash.com/photo-1493666438817-866a91353ca9?auto=format&fit=crop&w=900&h=1200&q=80",
    label: "Living Room",
  },
  {
    url: "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=900&h=1200&q=80",
    label: "Kitchen",
  },
  {
    url: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&h=1200&q=80",
    label: "Bedroom",
  },
  {
    url: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=900&h=1200&q=80",
    label: "Hallway",
  },
  {
    url: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=900&h=1200&q=80",
    label: "Office",
  },
  {
    url: "https://images.unsplash.com/photo-1505692952047-1a78307da8f2?auto=format&fit=crop&w=900&h=1200&q=80",
    label: "Dining Room",
  },
  {
    url: "https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=900&h=1200&q=80",
    label: "Modern Loft",
  },
  {
    url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=900&h=1200&q=80",
    label: "Studio",
  },
];

// 3:4 ratio card
const CARD_W = 2.1;
const CARD_H = 2.8;
const CARD_DEPTH = 0.055; // ATM-card thickness in world units
const CARD_RADIUS = 0.026; // must be < CARD_DEPTH/2 to avoid RoundedBox artifacts
const SNAP_SPEED = 4.0;
const SCROLL_SENSITIVITY = 0.0003;
const TOUCH_SENSITIVITY = 0.0025;
const ARC_SPAN = Math.PI;
const SIDE_TILT_FACTOR = 1.45;
const MAX_SIDE_TILT = 1.1;
const CENTER_TILT_MAX_X = 0.18;
const CENTER_TILT_MAX_Y = 0.24;
const CENTER_TILT_EASE = 6.5;

// Responsive config based on viewport
function getConfig() {
  const w = window.innerWidth;
  const isMobile = w < 600;
  const isTablet = w < 900;
  return {
    radius: isMobile ? 3.2 : isTablet ? 3.8 : 4.5,
    fov: isMobile ? 70 : isTablet ? 60 : 52,
    camY: isMobile ? 0.5 : 0.8,
    camZ: isMobile ? 7.5 : isTablet ? 8.5 : 9.5,
  };
}

function ImageCard({
  url,
  index,
  total,
  step,
  getDisplayAngle,
  getCenterTilt,
}) {
  const meshRef = useRef();
  const texture = useTexture(url);
  const baseAngle = (index / Math.max(total - 1, 1)) * ARC_SPAN;
  const configRef = useRef(getConfig());

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
    texture.needsUpdate = true;
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
    const tiltX = centerTilt.x * centerWeight;
    const tiltY = centerTilt.y * centerWeight;

    meshRef.current.position.set(x, 0, z);
    meshRef.current.rotation.x = tiltX;
    meshRef.current.rotation.y = sideTilt + tiltY;
    meshRef.current.scale.setScalar(scale);
  });

  return (
    <group ref={meshRef}>
      <RoundedBox
        args={[CARD_W, CARD_H, CARD_DEPTH]}
        radius={CARD_RADIUS}
        smoothness={6}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color="#f3f1ec"
          roughness={0.82}
          metalness={0.02}
          side={THREE.DoubleSide}
        />
      </RoundedBox>

      <mesh
        position={[0, 0, CARD_DEPTH * 0.5 + 0.001]}
        castShadow
        receiveShadow
      >
        <planeGeometry args={[CARD_W - 0.055, CARD_H - 0.055]} />
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

function Scene({ scrollAngle }) {
  const { camera } = useThree();
  const displayAngle = useRef(0);
  const mouseTarget = useRef({ x: 0, y: 0 });
  const mouseTilt = useRef({ x: 0, y: 0 });
  const keyLightRef = useRef();
  const total = IMAGES.length;
  const step = ARC_SPAN / Math.max(total - 1, 1);
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
    const diff = scrollAngle.current - displayAngle.current;
    displayAngle.current += diff * Math.min(delta * SNAP_SPEED, 1);

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
      {/* Canvas is alpha:true — real room photo shows through from CSS */}
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
        <ImageCard
          key={img.url}
          url={img.url}
          index={i}
          total={total}
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

export default function App() {
  const scrollAngle = useRef(0);
  const velocity = useRef(0);
  const isScrolling = useRef(false);
  const snapTimer = useRef(null);
  const touchStartY = useRef(null);
  const touchLastY = useRef(null);
  const total = IMAGES.length;
  const step = ARC_SPAN / Math.max(total - 1, 1);

  const startScrolling = useCallback(() => {
    isScrolling.current = true;
    clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      isScrolling.current = false;
    }, 200);
  }, []);

  // Mouse wheel
  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      velocity.current += e.deltaY * SCROLL_SENSITIVITY;
      startScrolling();
    },
    [startScrolling],
  );

  // Touch
  const handleTouchStart = useCallback((e) => {
    touchStartY.current = e.touches[0].clientX;
    touchLastY.current = e.touches[0].clientX;
    velocity.current = 0;
  }, []);

  const handleTouchMove = useCallback(
    (e) => {
      e.preventDefault();
      const x = e.touches[0].clientX;
      const dx = touchLastY.current - x;
      touchLastY.current = x;
      velocity.current += dx * TOUCH_SENSITIVITY;
      startScrolling();
    },
    [startScrolling],
  );

  const handleTouchEnd = useCallback(() => {
    isScrolling.current = false;
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

  // Animation loop
  useEffect(() => {
    let raf;
    const tick = () => {
      if (!isScrolling.current && Math.abs(velocity.current) < 0.0005) {
        const nearest = Math.round(scrollAngle.current / step) * step;
        scrollAngle.current += (nearest - scrollAngle.current) * 0.1;
        velocity.current = 0;
      } else {
        scrollAngle.current += velocity.current;
        velocity.current *= isScrolling.current ? 0.88 : 0.8;
      }

      // Clamp to the first/last image so scrolling does not loop forever.
      if (scrollAngle.current < 0) {
        scrollAngle.current = 0;
        if (velocity.current < 0) velocity.current *= 0.35;
      } else if (scrollAngle.current > ARC_SPAN) {
        scrollAngle.current = ARC_SPAN;
        if (velocity.current > 0) velocity.current *= 0.35;
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step]);

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
      {/* <HUD scrollAngle={scrollAngle} onDotClick={handleDotClick} /> */}
    </div>
  );
}
