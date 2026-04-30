/* eslint-disable react-hooks/immutability */
import { useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
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
];

// 3:4 ratio card
const CARD_W = 2.1;
const CARD_H = 2.8;
const SNAP_SPEED = 5.0;
const SCROLL_SENSITIVITY = 0.0007;
const TOUCH_SENSITIVITY = 0.0025;

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

function ImageCard({ url, index, total, getDisplayAngle }) {
  const meshRef = useRef();
  const matRef = useRef();
  const texture = useTexture(url);
  const baseAngle = (index / total) * Math.PI * 2;
  const configRef = useRef(getConfig());

  useEffect(() => {
    const onResize = () => {
      configRef.current = getConfig();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useFrame(() => {
    if (!meshRef.current || !matRef.current) return;
    const { radius } = configRef.current;
    const displayAngle = getDisplayAngle();
    const angle = baseAngle - displayAngle;

    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;

    const norm = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const dist = Math.min(norm, Math.PI * 2 - norm);
    const t = dist / Math.PI;

    const opacity = Math.max(0.1, 1 - t * 0.9);
    const scale = Math.max(0.7, 1 - t * 0.3);

    meshRef.current.position.set(x, 0, z);
    meshRef.current.rotation.y = -angle;
    meshRef.current.scale.setScalar(scale);
    matRef.current.opacity = opacity;
  });

  return (
    <mesh ref={meshRef} castShadow>
      <planeGeometry args={[CARD_W, CARD_H]} />
      <meshBasicMaterial
        ref={matRef}
        map={texture}
        transparent
        opacity={1}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}

function Scene({ scrollAngle }) {
  const { camera } = useThree();
  const displayAngle = useRef(0);
  const total = IMAGES.length;
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
  });

  const getDisplayAngle = useCallback(() => displayAngle.current, []);

  return (
    <group>
      {IMAGES.map((img, i) => (
        <ImageCard
          key={img.url}
          url={img.url}
          index={i}
          total={total}
          getDisplayAngle={getDisplayAngle}
        />
      ))}
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
  const step = (Math.PI * 2) / total;

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
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  return (
    <div className="app">
      <Canvas
        gl={{ antialias: true, alpha: true }}
        dpr={[1, Math.min(window.devicePixelRatio, 2)]}
        style={{ position: "absolute", inset: 0 }}
      >
        <Scene scrollAngle={scrollAngle} />
      </Canvas>
      {/* <HUD scrollAngle={scrollAngle} onDotClick={handleDotClick} /> */}
    </div>
  );
}
