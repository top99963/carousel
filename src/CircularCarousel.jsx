import {
  useEffect,
  useRef,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";

// ─── Demo images (4:3 ratio placeholders) ───────────────────────────────────
const DEFAULT_IMAGES = [
  { src: "https://picsum.photos/seed/arch1/800/600", label: "Architecture" },
  { src: "https://picsum.photos/seed/forest2/800/600", label: "Forest" },
  { src: "https://picsum.photos/seed/ocean3/800/600", label: "Ocean" },
  { src: "https://picsum.photos/seed/city4/800/600", label: "City" },
  { src: "https://picsum.photos/seed/desert5/800/600", label: "Desert" },
  { src: "https://picsum.photos/seed/mountain6/800/600", label: "Mountain" },
];

// ─── Constants ───────────────────────────────────────────────────────────────
const CARD_W = 4; // world-units width (4:3)
const CARD_H = 3; // world-units height
const CARD_DEPTH = 0.04; // thin extrusion
const RING_RADIUS = 8; // circle radius
const CAMERA_Z = 14;
const TILT_MAX = 0.12; // radians max tilt
const TILT_SMOOTH = 0.06;
const SNAP_SPEED = 0.08;
const MOMENTUM_DECAY = 0.92;
const SCROLL_SENSITIVITY = 0.003;
const TOUCH_SENSITIVITY = 0.004;

// ─── CircularCarousel ────────────────────────────────────────────────────────
/**
 * Props:
 *   images        – array of { src, label }
 *   activeIndex   – controlled index (optional)
 *   onIndexChange – called with new index when user navigates (optional)
 *   className     – extra Tailwind classes for wrapper
 *   style         – inline styles for wrapper
 */
const CircularCarousel = forwardRef(function CircularCarousel(
  {
    images = DEFAULT_IMAGES,
    activeIndex: externalIndex,
    onIndexChange,
    className = "",
    style = {},
  },
  ref,
) {
  const mountRef = useRef(null);
  const stateRef = useRef({
    angle: 0, // current ring rotation angle (radians)
    targetAngle: 0, // angle we're snapping toward
    velocity: 0, // momentum
    tiltX: 0, // current tilt (mouse)
    tiltY: 0,
    targetTiltX: 0,
    targetTiltY: 0,
    isDragging: false,
    lastPointer: null,
    lastTime: null,
    activeIdx: 0,
    images: images,
  });
  const threeRef = useRef(null); // { scene, camera, renderer, cards, lights }
  const rafRef = useRef(null);
  const [activeLabel, setActiveLabel] = useState(images[0]?.label ?? "");
  const [activeIdx, setActiveIdxState] = useState(0);

  const snapTo = useCallback(
    (idx) => {
      const step = (Math.PI * 2) / images.length;
      stateRef.current.targetAngle = -idx * step;
      stateRef.current.velocity = 0;
    },
    [images.length],
  );

  // ── Expose imperative API ──────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    goTo(index) {
      snapTo(index);
    },
    next() {
      const s = stateRef.current;
      snapTo((s.activeIdx + 1) % images.length);
    },
    prev() {
      const s = stateRef.current;
      snapTo((s.activeIdx - 1 + images.length) % images.length);
    },
  }));

  // ── Sync external controlled index ────────────────────────────────────────
  useEffect(() => {
    if (
      externalIndex !== undefined &&
      externalIndex !== stateRef.current.activeIdx
    ) {
      snapTo(externalIndex);
    }
  }, [externalIndex]);

  // ── Angle → index ─────────────────────────────────────────────────────────
  const angleToIndex = useCallback(
    (angle) => {
      const step = (Math.PI * 2) / images.length;
      let idx = Math.round(-angle / step) % images.length;
      if (idx < 0) idx += images.length;
      return idx;
    },
    [images.length],
  );

  // ── Three.js setup ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const aspect = el.clientWidth / el.clientHeight;
    const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
    camera.position.set(0, 0, CAMERA_Z);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const point = new THREE.PointLight(0xffffff, 1.2, 50);
    point.position.set(0, 6, 12);
    scene.add(point);
    const rimLight = new THREE.DirectionalLight(0x8899ff, 0.4);
    rimLight.position.set(-6, -2, 4);
    scene.add(rimLight);

    // Cards
    const loader = new THREE.TextureLoader();
    const step = (Math.PI * 2) / images.length;
    const cards = images.map((img, i) => {
      const geo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_DEPTH, 1, 1, 1);

      // Front face: image texture (load async)
      const frontMat = new THREE.MeshStandardMaterial({
        color: 0x222233,
        roughness: 0.4,
        metalness: 0.1,
      });
      loader.load(img.src, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        frontMat.map = tex;
        frontMat.color.set(0xffffff);
        frontMat.needsUpdate = true;
      });

      const edgeMat = new THREE.MeshStandardMaterial({
        color: 0x111122,
        roughness: 0.8,
        metalness: 0.2,
      });

      // BoxGeometry face order: +X, -X, +Y, -Y, +Z (front), -Z (back)
      const materials = [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, edgeMat];
      const mesh = new THREE.Mesh(geo, materials);

      const angle = step * i;
      mesh.position.set(
        Math.sin(angle) * RING_RADIUS,
        0,
        Math.cos(angle) * RING_RADIUS - RING_RADIUS,
      );
      mesh.userData.baseAngle = angle;
      mesh.userData.index = i;

      // Shadow
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      scene.add(mesh);
      return mesh;
    });

    // Ground plane (receives shadow)
    const groundGeo = new THREE.PlaneGeometry(40, 40);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.15 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -CARD_H / 2 - 0.1;
    ground.receiveShadow = true;
    scene.add(ground);

    // Point light shadow
    point.castShadow = true;
    point.shadow.mapSize.set(1024, 1024);

    threeRef.current = { scene, camera, renderer, cards, el };

    // ── Resize handler ──
    const onResize = () => {
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    return () => {
      ro.disconnect();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      threeRef.current = null;
    };
  }, [images]);

  // ── Animation loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const s = stateRef.current;
      const t = threeRef.current;
      if (!t) return;
      const { scene, camera, renderer, cards } = t;

      // Momentum → target
      if (!s.isDragging) {
        if (Math.abs(s.velocity) > 0.0001) {
          s.targetAngle += s.velocity;
          s.velocity *= MOMENTUM_DECAY;
          if (Math.abs(s.velocity) < 0.001) {
            // Snap to nearest card
            const step = (Math.PI * 2) / images.length;
            const nearest = Math.round(s.targetAngle / step);
            s.targetAngle = nearest * step;
            s.velocity = 0;
          }
        }
      }

      // Smooth angle
      s.angle += (s.targetAngle - s.angle) * SNAP_SPEED;

      // Smooth tilt
      s.tiltX += (s.targetTiltX - s.tiltX) * TILT_SMOOTH;
      s.tiltY += (s.targetTiltY - s.tiltY) * TILT_SMOOTH;

      // Derive active index
      const newIdx = angleToIndex(s.angle);
      if (newIdx !== s.activeIdx) {
        s.activeIdx = newIdx;
        setActiveIdxState(newIdx);
        setActiveLabel(images[newIdx]?.label ?? "");
        onIndexChange?.(newIdx);
      }

      const step = (Math.PI * 2) / images.length;

      // Update cards
      cards.forEach((card, i) => {
        const cardAngle = step * i + s.angle;
        const x = Math.sin(cardAngle) * RING_RADIUS;
        const z = Math.cos(cardAngle) * RING_RADIUS - RING_RADIUS;
        card.position.set(x, 0, z);

        // Face the center (outward normal → inward)
        card.rotation.y = cardAngle;

        // Distance-based scale & opacity
        const dist = Math.abs(cardAngle % (Math.PI * 2));
        const normDist = Math.min(dist, Math.PI * 2 - dist) / Math.PI; // 0=front, 1=back
        const scale = 1 - normDist * 0.35;
        card.scale.setScalar(scale);

        // Tilt from mouse (only on front card)
        if (i === s.activeIdx) {
          card.rotation.x = -s.tiltY + cardAngle * 0;
          card.rotation.z = s.tiltX * 0.3;
          // Slight extra tilt
          card.rotation.x += s.tiltY * 0.5;
        }

        // Fade side cards
        const opacity = 1 - normDist * 0.6;
        [card.material].flat().forEach((m) => {
          if (m) {
            m.transparent = true;
            m.opacity = opacity;
          }
        });
      });

      // Camera tilt
      camera.rotation.x = s.tiltY * 0.04;
      camera.rotation.z = -s.tiltX * 0.02;

      renderer.render(scene, camera);
    };

    animate();
    return () => cancelAnimationFrame(rafRef.current);
  }, [images, angleToIndex, onIndexChange]);

  // ── Input handlers ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const s = stateRef.current;

    // Mouse tilt
    const onMouseMove = (e) => {
      const rect = el.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5; // -0.5 to 0.5
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      s.targetTiltX = nx * TILT_MAX * 2;
      s.targetTiltY = ny * TILT_MAX * 2;
    };
    const onMouseLeave = () => {
      s.targetTiltX = 0;
      s.targetTiltY = 0;
    };

    // Wheel / trackpad scroll → rotate ring
    const onWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      s.velocity += delta * SCROLL_SENSITIVITY;
      s.targetAngle += delta * SCROLL_SENSITIVITY;
    };

    // Touch
    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        s.isDragging = true;
        s.lastPointer = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        s.velocity = 0;
      }
    };
    const onTouchMove = (e) => {
      if (!s.isDragging || e.touches.length !== 1) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - s.lastPointer.x;
      const now = performance.now();
      const dt = now - (s.lastTime ?? now);
      s.lastTime = now;
      s.lastPointer = { x: e.touches[0].clientX, y: e.touches[0].clientY };

      const delta = -dx * TOUCH_SENSITIVITY;
      s.targetAngle += delta;
      s.velocity = dt > 0 ? delta / (dt / 16) : 0;

      // Touch tilt
      const rect = el.getBoundingClientRect();
      const nx = (e.touches[0].clientX - rect.left) / rect.width - 0.5;
      const ny = (e.touches[0].clientY - rect.top) / rect.height - 0.5;
      s.targetTiltX = nx * TILT_MAX;
      s.targetTiltY = ny * TILT_MAX;
    };
    const onTouchEnd = () => {
      s.isDragging = false;
      s.lastPointer = null;
      s.lastTime = null;
      s.targetTiltX = 0;
      s.targetTiltY = 0;
      // Snap
      const step = (Math.PI * 2) / images.length;
      const nearest = Math.round(s.targetAngle / step);
      s.targetAngle = nearest * step;
    };

    // Pointer drag (mouse drag for desktop)
    const onPointerDown = (e) => {
      if (e.pointerType === "touch") return;
      s.isDragging = true;
      s.lastPointer = { x: e.clientX };
      s.velocity = 0;
      el.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e) => {
      if (!s.isDragging || e.pointerType === "touch") return;
      const dx = e.clientX - s.lastPointer.x;
      const now = performance.now();
      const dt = now - (s.lastTime ?? now);
      s.lastTime = now;
      s.lastPointer = { x: e.clientX };
      const delta = -dx * TOUCH_SENSITIVITY;
      s.targetAngle += delta;
      s.velocity = dt > 0 ? delta / (dt / 16) : 0;
    };
    const onPointerUp = (e) => {
      if (e.pointerType === "touch") return;
      s.isDragging = false;
      const step = (Math.PI * 2) / images.length;
      const nearest = Math.round(s.targetAngle / step);
      s.targetAngle = nearest * step;
    };

    el.addEventListener("mousemove", onMouseMove);
    el.addEventListener("mouseleave", onMouseLeave);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);

    return () => {
      el.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("mouseleave", onMouseLeave);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
    };
  }, [images.length]);

  // ── Keyboard nav ───────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const s = stateRef.current;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        snapTo((s.activeIdx + 1) % images.length);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        snapTo((s.activeIdx - 1 + images.length) % images.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, snapTo]);

  // ── Dot nav ────────────────────────────────────────────────────────────────
  const handleDotClick = useCallback(
    (i) => {
      snapTo(i);
      onIndexChange?.(i);
    },
    [snapTo, onIndexChange],
  );

  return (
    <div
      className={`relative w-full select-none overflow-hidden ${className}`}
      style={{
        height: "clamp(320px, 60vw, 600px)",
        touchAction: "none",
        ...style,
      }}
    >
      {/* Three.js canvas mount */}
      <div
        ref={mountRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        style={{ touchAction: "none" }}
      />

      {/* Label overlay */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex flex-col items-center pb-6">
        <span
          key={activeLabel}
          className="rounded-full bg-black/40 px-4 py-1 text-sm font-medium tracking-widest text-white backdrop-blur-sm"
          style={{
            fontFamily: "'DM Mono', monospace",
            letterSpacing: "0.15em",
          }}
        >
          {activeLabel}
        </span>

        {/* Dot indicators */}
        <div className="mt-3 flex gap-2">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => handleDotClick(i)}
              aria-label={`Go to ${images[i]?.label ?? i}`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === activeIdx
                  ? "w-6 bg-white"
                  : "w-1.5 bg-white/40 hover:bg-white/70"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Arrow buttons */}
      <button
        onClick={() =>
          handleDotClick((activeIdx - 1 + images.length) % images.length)
        }
        className="pointer-events-auto absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white backdrop-blur-sm transition hover:bg-black/50"
        aria-label="Previous"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <button
        onClick={() => handleDotClick((activeIdx + 1) % images.length)}
        className="pointer-events-auto absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white backdrop-blur-sm transition hover:bg-black/50"
        aria-label="Next"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
});

// ─── Demo wrapper ─────────────────────────────────────────────────────────────
export default function App() {
  const carouselRef = useRef(null);
  const [controlled, setControlled] = useState(0);
  const [log, setLog] = useState("Slide 1");

  const handleIndexChange = (i) => {
    setControlled(i);
    setLog(`Slide ${i + 1} — ${DEFAULT_IMAGES[i]?.label}`);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="px-6 pt-10 pb-4 text-center">
        <h1
          className="text-3xl font-light tracking-[0.3em] uppercase text-white/90"
          style={{ fontFamily: "'DM Mono', monospace" }}
        >
          Circular Gallery
        </h1>
        <p className="mt-2 text-sm text-white/40 tracking-widest">
          scroll · drag · swipe · keyboard ↔
        </p>
      </header>

      {/* Carousel */}
      <CircularCarousel
        ref={carouselRef}
        images={DEFAULT_IMAGES}
        activeIndex={controlled}
        onIndexChange={handleIndexChange}
        className="flex-1"
      />

      {/* External state demo controls */}
      <footer className="px-6 py-8 flex flex-col items-center gap-4">
        <p className="text-xs text-white/40 tracking-widest uppercase">
          External state control
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {DEFAULT_IMAGES.map((img, i) => (
            <button
              key={i}
              onClick={() => setControlled(i)}
              className={`rounded-full px-4 py-1.5 text-xs tracking-widest uppercase transition-all ${
                controlled === i
                  ? "bg-white text-gray-950 font-medium"
                  : "border border-white/20 text-white/60 hover:border-white/50 hover:text-white"
              }`}
            >
              {img.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-white/30 font-mono">{log}</p>

        {/* Imperative API demo */}
        <div className="flex gap-3 mt-1">
          <button
            onClick={() => carouselRef.current?.prev()}
            className="rounded-full border border-white/20 px-4 py-1.5 text-xs text-white/60 hover:border-white/50 hover:text-white transition-all"
          >
            ← ref.prev()
          </button>
          <button
            onClick={() => carouselRef.current?.next()}
            className="rounded-full border border-white/20 px-4 py-1.5 text-xs text-white/60 hover:border-white/50 hover:text-white transition-all"
          >
            ref.next() →
          </button>
        </div>
      </footer>
    </div>
  );
}
