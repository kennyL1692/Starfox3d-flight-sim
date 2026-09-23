import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type GameState = "menu" | "playing" | "gameover";

export function StarfoxGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<GameState>("menu");
  const [score, setScore] = useState(0);
  const [hp, setHp] = useState(100);
  const [hitFlash, setHitFlash] = useState(0); // red damage flash 0..1
  const [praiseText, setPraiseText] = useState<{ id: number; text: string } | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchProgress, setLaunchProgress] = useState(0);
  const stateRef = useRef({ score: 0, hp: 100, running: false });

  // Launch sequence: chimes + progress ticks + loading bar, then start the game
  const beginLaunch = () => {
    if (launching) return;
    setLaunching(true);
    setLaunchProgress(0);

    // Build a dedicated AudioContext for the launch SFX (the gameplay one is created on start)
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const actx = new AudioCtx();
    const master = actx.createGain();
    master.gain.value = 0.4;
    master.connect(actx.destination);

    const chime = (when: number, freq: number, dur = 0.35, type: OscillatorType = "triangle", gain = 0.25) => {
      const t = actx.currentTime + when;
      const osc = actx.createOscillator();
      const g = actx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    };

    const playTick = () => {
      const t = actx.currentTime;
      const osc = actx.createOscillator();
      const g = actx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(1800, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.06);
    };

    // Opening chime arpeggio (C5 → E5 → G5)
    chime(0.0, 523.25, 0.25, "triangle", 0.25);
    chime(0.12, 659.25, 0.25, "triangle", 0.25);
    chime(0.24, 783.99, 0.4, "triangle", 0.28);

    const start = performance.now();
    const duration = 1600;
    let lastTickStep = -1;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / duration);
      setLaunchProgress(t);
      // Tick at every 10% step
      const step = Math.floor(t * 10);
      if (step !== lastTickStep && step < 10) {
        lastTickStep = step;
        playTick();
      }
      if (t < 1) requestAnimationFrame(tick);
      else {
        // Triumphant launch chord (C6 + E6 + G6)
        chime(0.0, 1046.5, 0.5, "sawtooth", 0.18);
        chime(0.0, 1318.5, 0.5, "triangle", 0.18);
        chime(0.0, 1567.98, 0.6, "triangle", 0.22);
        setTimeout(() => actx.close().catch(() => {}), 800);
        setLaunching(false);
        setGameState("playing");
      }
    };
    requestAnimationFrame(tick);
  };


  // Decay red damage flash
  useEffect(() => {
    if (hitFlash <= 0) return;
    const id = setInterval(() => {
      setHitFlash((f) => {
        const nv = f - 0.08;
        if (nv <= 0) { clearInterval(id); return 0; }
        return nv;
      });
    }, 30);
    return () => clearInterval(id);
  }, [hitFlash]);

  useEffect(() => {
    if (gameState !== "playing" || !mountRef.current) return;

    const mount = mountRef.current;
    stateRef.current = { score: 0, hp: 100, running: true };
    setScore(0);
    setHp(100);

    // Audio (Web Audio API — synthesized SFX)
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtx();
    const masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.35;
    masterGain.connect(audioCtx.destination);

    // Engine hum (continuous)
    const engineOsc = audioCtx.createOscillator();
    engineOsc.type = "sawtooth";
    engineOsc.frequency.value = 60;
    const engineGain = audioCtx.createGain();
    engineGain.gain.value = 0.06;
    const engineFilter = audioCtx.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 220;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(masterGain);
    engineOsc.start();

    function playLaser() {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(1400, t);
      osc.frequency.exponentialRampToValueAtTime(180, t + 0.18);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.22);
    }

    function playExplosion() {
      const t = audioCtx.currentTime;
      const bufferSize = audioCtx.sampleRate * 0.5;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      const filter = audioCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1200, t);
      filter.frequency.exponentialRampToValueAtTime(80, t + 0.5);
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      noise.start(t);
    }

    function playHit() {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.25);
      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.32);
    }

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0420, 0.011);
    scene.background = new THREE.Color(0x06021a);

    const camera = new THREE.PerspectiveCamera(70, mount.clientWidth / mount.clientHeight, 0.1, 800);
    camera.position.set(0, 3, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    // Post-processing: bloom glow
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(mount.clientWidth, mount.clientHeight),
      0.9, 0.5, 0.2
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // Soft radial sprite texture for glows / nebula
    function makeGlowTexture(inner: string, outer: string) {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const g = c.getContext("2d")!;
      const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, inner);
      grd.addColorStop(0.35, outer);
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }
    const glowTex = makeGlowTexture("rgba(255,255,255,1)", "rgba(255,255,255,0.35)");

    // Lights
    scene.add(new THREE.HemisphereLight(0x8866ff, 0x220033, 0.7));
    const dir = new THREE.DirectionalLight(0x00ddff, 1.6);
    dir.position.set(5, 10, 7);
    scene.add(dir);
    const rim = new THREE.DirectionalLight(0xff44aa, 1.2);
    rim.position.set(-5, 3, -5);
    scene.add(rim);

    // Stars: multi-coloured, twinkling layers
    function makeStars(count: number, size: number, spread: number) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      const palette = [new THREE.Color(0xffffff), new THREE.Color(0x99ccff), new THREE.Color(0xffccee), new THREE.Color(0xffeeaa)];
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * spread;
        pos[i * 3 + 1] = (Math.random() - 0.5) * spread * 0.5 + 30;
        pos[i * 3 + 2] = (Math.random() - 0.5) * spread;
        const c = palette[(Math.random() * palette.length) | 0];
        col.set([c.r, c.g, c.b], i * 3);
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      return new THREE.Points(
        geo,
        new THREE.PointsMaterial({ size, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
      );
    }
    const stars = makeStars(2500, 0.9, 500);
    const starsFar = makeStars(1500, 2.2, 700);
    scene.add(stars, starsFar);

    // Nebula clouds
    const nebulaColors = [0xff33aa, 0x5522ff, 0x00ccff, 0xaa22ff];
    for (let i = 0; i < 9; i++) {
      const sm = new THREE.SpriteMaterial({
        map: glowTex,
        color: nebulaColors[i % nebulaColors.length],
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      const s = new THREE.Sprite(sm);
      s.position.set((Math.random() - 0.5) * 400, 20 + Math.random() * 80, -300 - Math.random() * 100);
      s.scale.setScalar(120 + Math.random() * 140);
      scene.add(s);
    }

    // Distant planet with ring
    const planet = new THREE.Group();
    const planetMesh = new THREE.Mesh(
      new THREE.SphereGeometry(40, 48, 32),
      new THREE.MeshStandardMaterial({ color: 0x6a2c9a, emissive: 0x2a0a4a, roughness: 0.8, fog: false })
    );
    planet.add(planetMesh);
    const atmo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, color: 0xff55cc, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
    );
    atmo.scale.setScalar(120);
    planet.add(atmo);
    const pRing = new THREE.Mesh(
      new THREE.RingGeometry(55, 80, 96),
      new THREE.MeshBasicMaterial({ color: 0xffaa66, side: THREE.DoubleSide, transparent: true, opacity: 0.35, fog: false })
    );
    pRing.rotation.x = Math.PI / 2.4;
    planet.add(pRing);
    planet.position.set(-140, 70, -420);
    scene.add(planet);

    // Ground grid (tron-like) + glowing horizon
    const grid = new THREE.GridHelper(800, 100, 0x00ffff, 0xff00ff);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    grid.position.y = -4;
    scene.add(grid);
    const horizon = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, color: 0xff2a88, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
    );
    horizon.position.set(0, -4, -350);
    horizon.scale.set(900, 60, 1);
    scene.add(horizon);

    // Wireframe mountains on both sides, scrolling
    const mountains: THREE.Mesh[] = [];
    const mtnMat = new THREE.MeshBasicMaterial({ color: 0xaa33ff, wireframe: true, transparent: true, opacity: 0.45 });
    const mtnFill = new THREE.MeshBasicMaterial({ color: 0x0a0322 });
    for (const side of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const g = new THREE.PlaneGeometry(80, 200, 16, 40);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i);
          const y = p.getY(i);
          const edge = Math.abs(x + side * 40) / 80; // higher away from track
          const h = (Math.sin(y * 0.15) + Math.cos(x * 0.3 + y * 0.07)) * 3 + Math.random() * 4;
          p.setZ(i, Math.max(0, h * edge * 2.2));
        }
        g.computeVertexNormals();
        const group = new THREE.Mesh(g, mtnFill);
        const wire = new THREE.Mesh(g, mtnMat);
        group.add(wire);
        group.rotation.x = -Math.PI / 2;
        group.position.set(side * 60, -4.1, -k * 200);
        scene.add(group);
        mountains.push(group);
      }
    }

    // Speed streaks
    const streakCount = 120;
    const streakGeo = new THREE.BufferGeometry();
    const streakPos = new Float32Array(streakCount * 6);
    function resetStreak(i: number, z?: number) {
      const x = (Math.random() - 0.5) * 60;
      const y = (Math.random() - 0.5) * 30 + 2;
      const zz = z ?? -150 * Math.random();
      streakPos.set([x, y, zz, x, y, zz - 3 - Math.random() * 4], i * 6);
    }
    for (let i = 0; i < streakCount; i++) resetStreak(i);
    streakGeo.setAttribute("position", new THREE.BufferAttribute(streakPos, 3));
    const streaks = new THREE.LineSegments(
      streakGeo,
      new THREE.LineBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending })
    );
    scene.add(streaks);

    // Player ship (Arwing-inspired, detailed)
    const ship = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8e8f4, metalness: 0.8, roughness: 0.25, emissive: 0x1a1a33 });
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x9aa0b8, metalness: 0.9, roughness: 0.35 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ccff, emissiveIntensity: 2.2 });
    const canopyMat = new THREE.MeshPhysicalMaterial({ color: 0x33ddff, emissive: 0x0066aa, emissiveIntensity: 0.8, metalness: 0.2, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.9 });
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x3a5cc0, metalness: 0.7, roughness: 0.3, emissive: 0x0a1030 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xff3355, emissive: 0xff1133, emissiveIntensity: 1.2 });

    const fuselage = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.2, 10), bodyMat);
    fuselage.rotation.x = -Math.PI / 2;
    fuselage.position.z = -0.1;
    ship.add(fuselage);
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.8, 10), panelMat);
    hull.rotation.x = Math.PI / 2;
    hull.position.z = 1.3;
    ship.add(hull);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 1.6), redMat);
    stripe.position.set(0, 0.3, 0.1);
    ship.add(stripe);

    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), canopyMat);
    cockpit.position.set(0, 0.24, 0.35);
    cockpit.scale.set(0.9, 0.6, 1.8);
    ship.add(cockpit);

    // Swept wings built from a shape
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(1.9, 0.55);
    wingShape.lineTo(1.9, 0.85);
    wingShape.lineTo(0, 1.1);
    wingShape.lineTo(0, 0);
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.07, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
    wingGeo.rotateX(Math.PI / 2);
    const rWing = new THREE.Mesh(wingGeo, wingMat);
    rWing.position.set(0.3, 0, 0.1);
    rWing.rotation.z = -0.12;
    ship.add(rWing);
    const lWing = rWing.clone();
    lWing.scale.x = -1;
    lWing.position.x = -0.3;
    lWing.rotation.z = 0.12;
    ship.add(lWing);

    // Vertical fins (G-diffusers)
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(0.6, 0);
    finShape.lineTo(0.2, 0.75);
    finShape.lineTo(0, 0.75);
    const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.05, bevelEnabled: false });
    finGeo.rotateY(-Math.PI / 2);
    for (const sx of [-1, 1]) {
      const fin = new THREE.Mesh(finGeo, panelMat);
      fin.position.set(sx * 1.55, 0.05, 0.4);
      fin.rotation.z = -sx * 0.25;
      ship.add(fin);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), sx < 0 ? redMat : accentMat);
      tip.position.set(sx * 2.15, 0.02, 0.85);
      ship.add(tip);
      const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6), panelMat);
      cannon.rotation.x = Math.PI / 2;
      cannon.position.set(sx * 1.2, -0.05, 0.05);
      ship.add(cannon);
    }

    // Engines with flames
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const flames: THREE.Mesh[] = [];
    for (const sx of [-0.28, 0.28]) {
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.25, 12, 1, true), panelMat);
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(sx, 0, 1.75);
      ship.add(nozzle);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), accentMat);
      core.position.set(sx, 0, 1.8);
      ship.add(core);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.15, 1, 12, 1, true), flameMat);
      flame.rotation.x = Math.PI / 2;
      flame.position.set(sx, 0, 2.3);
      ship.add(flame);
      flames.push(flame);
    }
    const engineLight = new THREE.PointLight(0x33ccff, 3, 6);
    engineLight.position.set(0, 0, 2.2);
    ship.add(engineLight);

    ship.scale.setScalar(0.75);
    ship.position.set(0, 0, 4);
    scene.add(ship);

    // Engine trail particles
    const trailCount = 60;
    const trailGeo = new THREE.BufferGeometry();
    const trailPos = new Float32Array(trailCount * 3);
    trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
    const trail = new THREE.Points(
      trailGeo,
      new THREE.PointsMaterial({ size: 0.35, map: glowTex, color: 0x55ddff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    scene.add(trail);
    let trailIdx = 0;

    // Lasers (core + glow)
    type Laser = { mesh: THREE.Object3D; vel: THREE.Vector3 };
    const lasers: Laser[] = [];
    const laserGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6);
    const laserMat = new THREE.MeshBasicMaterial({ color: 0xccffdd });
    const laserGlowGeo = new THREE.CylinderGeometry(0.16, 0.16, 1.8, 8);
    const laserGlowMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });

    function shoot() {
      for (const offset of [-0.9, 0.9]) {
        const m = new THREE.Mesh(laserGeo, laserMat);
        m.add(new THREE.Mesh(laserGlowGeo, laserGlowMat));
        m.rotation.x = Math.PI / 2;
        m.position.copy(ship.position);
        m.position.x += offset;
        m.position.z -= 0.5;
        scene.add(m);
        lasers.push({ mesh: m, vel: new THREE.Vector3(0, 0, -1.5) });
      }
      playLaser();
    }

    // Enemies: glowing core + armour + spinning ring
    type Enemy = { mesh: THREE.Object3D; hp: number; spin: number; ring: THREE.Object3D };
    const enemies: Enemy[] = [];
    const enemyCoreGeo = new THREE.IcosahedronGeometry(0.35, 1);
    const enemyCoreMat = new THREE.MeshStandardMaterial({ color: 0xff4488, emissive: 0xff0055, emissiveIntensity: 2.5 });
    const enemyShellGeo = new THREE.OctahedronGeometry(0.75, 0);
    const enemyShellMat = new THREE.MeshStandardMaterial({ color: 0x331122, metalness: 0.9, roughness: 0.3, wireframe: false, flatShading: true, transparent: true, opacity: 0.85 });
    const enemyEdgeMat = new THREE.LineBasicMaterial({ color: 0xff66aa });
    const enemyEdges = new THREE.EdgesGeometry(enemyShellGeo);
    const enemyRingGeo = new THREE.TorusGeometry(1.0, 0.04, 8, 48);
    const enemyRingMat = new THREE.MeshBasicMaterial({ color: 0xff88cc });

    function spawnEnemy() {
      const m = new THREE.Group();
      m.add(new THREE.Mesh(enemyCoreGeo, enemyCoreMat));
      m.add(new THREE.Mesh(enemyShellGeo, enemyShellMat));
      m.add(new THREE.LineSegments(enemyEdges, enemyEdgeMat));
      const ring = new THREE.Mesh(enemyRingGeo, enemyRingMat);
      ring.rotation.x = Math.PI / 2;
      m.add(ring);
      m.position.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 6 + 1, -80);
      scene.add(m);
      enemies.push({ mesh: m, hp: 1, spin: Math.random() * 0.05 + 0.02, ring });
    }

    // Asteroids: several lumpy variants with craters
    type Rock = { mesh: THREE.Mesh; spin: THREE.Vector3 };
    const rocks: Rock[] = [];
    const rockGeos: THREE.BufferGeometry[] = [];
    for (let v = 0; v < 5; v++) {
      const g = new THREE.IcosahedronGeometry(1.2, 2);
      const p = g.attributes.position;
      const tmp = new THREE.Vector3();
      const seed = Math.random() * 10;
      for (let i = 0; i < p.count; i++) {
        tmp.fromBufferAttribute(p, i);
        const n =
          Math.sin(tmp.x * 2.1 + seed) * Math.cos(tmp.y * 1.7 + seed) * 0.18 +
          Math.sin(tmp.z * 3.3 + seed * 2) * 0.1 +
          (Math.random() - 0.5) * 0.08;
        tmp.multiplyScalar(1 + n);
        p.setXYZ(i, tmp.x, tmp.y, tmp.z);
      }
      g.computeVertexNormals();
      rockGeos.push(g);
    }
    const rockMats = [0x7a5a4a, 0x5a4a44, 0x8a6a55].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0.1, flatShading: true, emissive: 0x110604 })
    );

    function spawnRock() {
      const m = new THREE.Mesh(
        rockGeos[(Math.random() * rockGeos.length) | 0],
        rockMats[(Math.random() * rockMats.length) | 0]
      );
      m.position.set((Math.random() - 0.5) * 25, (Math.random() - 0.5) * 8, -100);
      const s = 0.6 + Math.random() * 1.4;
      m.scale.set(s, s * (0.8 + Math.random() * 0.4), s);
      scene.add(m);
      rocks.push({
        mesh: m,
        spin: new THREE.Vector3(Math.random() * 0.03, Math.random() * 0.03, Math.random() * 0.03),
      });
    }

    // Explosions
    type Particle = { mesh: THREE.Mesh; vel: THREE.Vector3; life: number };
    const particles: Particle[] = [];
    const partGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    type Shockwave = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number };
    const shockwaves: Shockwave[] = [];

    function explode(pos: THREE.Vector3, color: number) {
      const mat = new THREE.MeshBasicMaterial({ color });
      for (let i = 0; i < 16; i++) {
        const p = new THREE.Mesh(partGeo, mat);
        p.position.copy(pos);
        scene.add(p);
        particles.push({
          mesh: p,
          vel: new THREE.Vector3(
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.3
          ),
          life: 1,
        });
      }
      playExplosion();
    }

    // Input
    const keys: Record<string, boolean> = {};
    let lastShot = 0;
    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = true;
      if (e.key === " ") e.preventDefault();
      // Keyboard takes over pointer steering
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", "a", "d", "w", "s"].includes(e.key.toLowerCase())) {
        usePointer = false;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let pointerX = 0;
    let pointerY = 0;
    let usePointer = false;
    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      // Deadzone in the center for stability
      const dz = 0.08;
      const apply = (v: number) => {
        const s = Math.sign(v);
        const a = Math.abs(v);
        if (a < dz) return 0;
        return s * ((a - dz) / (1 - dz));
      };
      pointerX = apply(nx);
      pointerY = apply(ny);
      usePointer = true;
    };
    const onPointerDown = () => {
      keys[" "] = true;
    };
    const onPointerUp = () => {
      keys[" "] = false;
    };
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      composer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    let spawnTimer = 0;
    let rockTimer = 0;
    let frame = 0;
    let raf = 0;
    let shakeTime = 0;
    let shakeAmp = 0;
    let praiseId = 0;
    const praises = ["NICE!", "BOOM!", "GOTCHA!", "DIRECT HIT!", "BULLSEYE!", "POW!", "BLAST!"];
    function affirm(scorePopup = true) {
      const text = praises[Math.floor(Math.random() * praises.length)];
      praiseId++;
      setPraiseText({ id: praiseId, text });
      if (scorePopup) {
        // schedule clear
        const myId = praiseId;
        setTimeout(() => {
          setPraiseText((p) => (p && p.id === myId ? null : p));
        }, 600);
      }
      // little affirmation chime
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(1760, t + 0.1);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.2);
    }
    function damageFx(amp: number) {
      shakeTime = 0.45;
      shakeAmp = amp;
      setHitFlash(1);
    }
    const clock = new THREE.Clock();

    function animate() {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      frame++;

      // Move grid for speed sensation
      grid.position.z = (grid.position.z + dt * 40) % 8;
      for (const m of mountains) {
        m.position.z += dt * 40;
        if (m.position.z > 150) m.position.z -= 400;
      }
      for (let i = 0; i < streakCount; i++) {
        const b = i * 6;
        streakPos[b + 2] += dt * 90;
        streakPos[b + 5] += dt * 90;
        if (streakPos[b + 5] > 15) resetStreak(i, -150);
      }
      streakGeo.attributes.position.needsUpdate = true;
      stars.rotation.z += dt * 0.004;
      planet.rotation.y += dt * 0.02;
      for (const e of enemies) e.ring.rotation.z += dt * 3;

      // Engine flicker + trail
      const fl = 0.8 + Math.random() * 0.5;
      for (const f of flames) f.scale.set(1, fl, 1);
      engineLight.intensity = 2.5 + Math.random();
      for (const sx of [-0.21, 0.21]) {
        trailPos.set([ship.position.x + sx, ship.position.y, ship.position.z + 1.5], trailIdx * 3);
        trailIdx = (trailIdx + 1) % trailCount;
      }
      for (let i = 0; i < trailCount; i++) trailPos[i * 3 + 2] += dt * 25;
      trailGeo.attributes.position.needsUpdate = true;

      // Player movement
      const speed = 12;
      let tx = ship.position.x;
      let ty = ship.position.y;
      if (usePointer) {
        tx = pointerX * 9;
        ty = pointerY * 4 + 1;
      }
      if (keys["arrowleft"] || keys["a"]) tx -= speed * dt;
      if (keys["arrowright"] || keys["d"]) tx += speed * dt;
      if (keys["arrowup"] || keys["w"]) ty += speed * dt;
      if (keys["arrowdown"] || keys["s"]) ty -= speed * dt;
      tx = Math.max(-9, Math.min(9, tx));
      ty = Math.max(-3, Math.min(5, ty));
      // Smoother pointer steering (eased follow)
      const followX = usePointer ? 0.08 : 0.18;
      const followY = usePointer ? 0.08 : 0.18;
      const dx = tx - ship.position.x;
      const dy = ty - ship.position.y;
      ship.position.x += dx * followX;
      ship.position.y += dy * followY;

      // Banking based on horizontal/vertical desired velocity (not residual)
      const targetBankZ = THREE.MathUtils.clamp(-dx * 0.25, -0.7, 0.7);
      const targetPitchX = THREE.MathUtils.clamp(-dy * 0.18, -0.4, 0.4);
      ship.rotation.z += (targetBankZ - ship.rotation.z) * 0.12;
      ship.rotation.x += (targetPitchX - ship.rotation.x) * 0.12;
      ship.rotation.y += (dx * 0.04 - ship.rotation.y) * 0.1;

      // Camera follow + shake
      const camTargetX = ship.position.x * 0.4;
      const camTargetY = ship.position.y * 0.3 + 3;
      camera.position.x += (camTargetX - camera.position.x) * 0.08;
      camera.position.y += (camTargetY - camera.position.y) * 0.08;
      if (shakeTime > 0) {
        shakeTime -= dt;
        const k = Math.max(0, shakeTime / 0.45) * shakeAmp;
        camera.position.x += (Math.random() - 0.5) * k;
        camera.position.y += (Math.random() - 0.5) * k;
      }
      camera.lookAt(ship.position.x * 0.5, ship.position.y * 0.5, ship.position.z - 10);

      // Shoot
      if (keys[" "] && performance.now() - lastShot > 140) {
        shoot();
        lastShot = performance.now();
      }

      // Update lasers
      for (let i = lasers.length - 1; i >= 0; i--) {
        const l = lasers[i];
        l.mesh.position.add(l.vel);
        if (l.mesh.position.z < -120) {
          scene.remove(l.mesh);
          lasers.splice(i, 1);
        }
      }

      // Spawn
      spawnTimer += dt;
      if (spawnTimer > 0.9) {
        spawnTimer = 0;
        spawnEnemy();
      }
      rockTimer += dt;
      if (rockTimer > 1.6) {
        rockTimer = 0;
        spawnRock();
      }

      // Update enemies
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        e.mesh.position.z += 30 * dt;
        e.mesh.rotation.x += e.spin;
        e.mesh.rotation.y += e.spin;
        // Wave motion
        e.mesh.position.x += Math.sin(frame * 0.04 + i) * 0.04;

        // Collide with ship
        if (e.mesh.position.distanceTo(ship.position) < 1.2) {
          explode(e.mesh.position, 0xff2266);
          scene.remove(e.mesh);
          enemies.splice(i, 1);
          stateRef.current.hp -= 20;
          setHp(stateRef.current.hp);
          playHit();
          damageFx(0.6);
          if (stateRef.current.hp <= 0) endGame();
          continue;
        }

        // Hit by laser
        let hit = false;
        let hitPos: THREE.Vector3 | null = null;
        for (let j = lasers.length - 1; j >= 0; j--) {
          if (e.mesh.position.distanceTo(lasers[j].mesh.position) < 1) {
            hitPos = lasers[j].mesh.position.clone();
            scene.remove(lasers[j].mesh);
            lasers.splice(j, 1);
            hit = true;
            break;
          }
        }
        if (hit) {
          explode(e.mesh.position, 0xffaa00);
          const ringGeo2 = new THREE.RingGeometry(0.3, 0.5, 24);
          const ringMat2 = new THREE.MeshBasicMaterial({ color: 0xffee44, side: THREE.DoubleSide, transparent: true, opacity: 1 });
          const ring = new THREE.Mesh(ringGeo2, ringMat2);
          ring.position.copy(hitPos ?? e.mesh.position);
          ring.lookAt(camera.position);
          scene.add(ring);
          shockwaves.push({ mesh: ring, mat: ringMat2, life: 1 });
          scene.remove(e.mesh);
          enemies.splice(i, 1);
          stateRef.current.score += 100;
          setScore(stateRef.current.score);
          affirm();
          continue;
        }

        if (e.mesh.position.z > 15) {
          scene.remove(e.mesh);
          enemies.splice(i, 1);
        }
      }

      // Rocks
      for (let i = rocks.length - 1; i >= 0; i--) {
        const r = rocks[i];
        r.mesh.position.z += 25 * dt;
        r.mesh.rotation.x += r.spin.x;
        r.mesh.rotation.y += r.spin.y;
        r.mesh.rotation.z += r.spin.z;

        if (r.mesh.position.distanceTo(ship.position) < 1.6 * r.mesh.scale.x) {
          explode(r.mesh.position, 0xffaa66);
          scene.remove(r.mesh);
          rocks.splice(i, 1);
          stateRef.current.hp -= 30;
          setHp(stateRef.current.hp);
          playHit();
          damageFx(1.0);
          if (stateRef.current.hp <= 0) endGame();
          continue;
        }

        // Lasers can chip rocks
        for (let j = lasers.length - 1; j >= 0; j--) {
          if (r.mesh.position.distanceTo(lasers[j].mesh.position) < 1.4 * r.mesh.scale.x) {
            const lp = lasers[j].mesh.position.clone();
            scene.remove(lasers[j].mesh);
            lasers.splice(j, 1);
            explode(lp, 0xffcc88);
            stateRef.current.score += 25;
            setScore(stateRef.current.score);
            break;
          }
        }

        if (r.mesh.position.z > 15) {
          scene.remove(r.mesh);
          rocks.splice(i, 1);
        }
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.mesh.position.add(p.vel);
        p.life -= dt * 1.5;
        p.mesh.scale.setScalar(Math.max(0.01, p.life));
        if (p.life <= 0) {
          scene.remove(p.mesh);
          particles.splice(i, 1);
        }
      }

      // Shockwaves
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const s = shockwaves[i];
        s.life -= dt * 2.5;
        const k = 1 - s.life;
        s.mesh.scale.setScalar(1 + k * 6);
        s.mat.opacity = Math.max(0, s.life);
        s.mesh.lookAt(camera.position);
        if (s.life <= 0) {
          scene.remove(s.mesh);
          s.mesh.geometry.dispose();
          s.mat.dispose();
          shockwaves.splice(i, 1);
        }
      }

      composer.render();
    }

    function endGame() {
      if (!stateRef.current.running) return;
      stateRef.current.running = false;
      setTimeout(() => setGameState("gameover"), 600);
    }

    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
      });
      try { engineOsc.stop(); } catch { /* already stopped */ }
      audioCtx.close();
    };
  }, [gameState]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-background">
      <div
        ref={mountRef}
        className="absolute inset-0 transition-transform"
        style={{
          transform: hitFlash > 0 ? `translate(${(Math.random() - 0.5) * hitFlash * 12}px, ${(Math.random() - 0.5) * hitFlash * 12}px)` : undefined,
        }}
      />
      {/* Red damage vignette */}
      {hitFlash > 0 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at center, transparent 30%, rgba(255,0,40,${0.55 * hitFlash}) 100%)`,
            boxShadow: `inset 0 0 120px rgba(255,0,40,${0.8 * hitFlash})`,
          }}
        />
      )}
      {/* Praise popup */}
      {praiseText && gameState === "playing" && (
        <div
          key={praiseText.id}
          className="pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 font-mono font-black text-4xl md:text-5xl tracking-[0.2em] text-neon-yellow"
          style={{
            textShadow: "0 0 12px var(--neon-yellow), 0 0 24px var(--neon-magenta)",
            animation: "praisePop 0.6s ease-out forwards",
          }}
        >
          {praiseText.text}
        </div>
      )}
      <style>{`
        @keyframes praisePop {
          0% { opacity: 0; transform: translate(-50%, 20px) scale(0.6); }
          30% { opacity: 1; transform: translate(-50%, 0) scale(1.15); }
          70% { opacity: 1; transform: translate(-50%, -8px) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -28px) scale(0.95); }
        }
      `}</style>


      {gameState === "playing" && (
        <>
          <div className="pointer-events-none absolute top-4 left-4 font-mono text-neon-cyan text-lg tracking-widest"
               style={{ textShadow: "var(--hud-glow)" }}>
            <div>SCORE: {score.toString().padStart(6, "0")}</div>
          </div>
          <div className="pointer-events-none absolute top-4 right-4 font-mono text-neon-cyan text-lg tracking-widest text-right"
               style={{ textShadow: "var(--hud-glow)" }}>
            <div>HULL</div>
            <div className="mt-1 w-40 h-3 border border-neon-cyan/70 bg-black/40">
              <div
                className="h-full transition-all"
                style={{
                  width: `${Math.max(0, hp)}%`,
                  background: hp > 50 ? "var(--neon-cyan)" : hp > 25 ? "var(--neon-yellow)" : "var(--neon-magenta)",
                  boxShadow: "var(--hud-glow)",
                }}
              />
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 font-mono text-xs text-neon-cyan/70 tracking-widest">
            WASD / ARROWS · MOVE   ·   SPACE / CLICK · FIRE
          </div>
          <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="w-8 h-8 border border-neon-cyan/60 rotate-45" style={{ boxShadow: "var(--hud-glow)" }} />
          </div>
        </>
      )}

      {gameState === "menu" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 overflow-hidden"
          style={{
            background:
              "radial-gradient(ellipse at 50% 30%, oklch(0.22 0.12 290) 0%, oklch(0.12 0.08 280) 45%, oklch(0.06 0.04 270) 100%)",
          }}
        >
          {/* animated star field */}
          <div className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              backgroundImage:
                "radial-gradient(1px 1px at 20% 30%, var(--neon-cyan) 50%, transparent 51%), radial-gradient(1px 1px at 70% 80%, var(--neon-magenta) 50%, transparent 51%), radial-gradient(1.5px 1.5px at 40% 60%, white 50%, transparent 51%), radial-gradient(1px 1px at 85% 20%, var(--neon-yellow) 50%, transparent 51%), radial-gradient(1px 1px at 10% 75%, white 50%, transparent 51%)",
              backgroundSize: "200px 200px, 250px 250px, 180px 180px, 220px 220px, 160px 160px",
              animation: "starfieldDrift 20s linear infinite",
            }}
          />
          {/* horizon glow */}
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-1/3"
            style={{ background: "linear-gradient(to top, oklch(0.4 0.25 340 / 0.35), transparent)" }}
          />

          <div className="relative z-10 flex flex-col items-center">
            <div className="font-mono text-xs text-neon-cyan/70 tracking-[0.5em] mb-4 animate-pulse">
              ◤ SECTOR 7 · CALL SIGN ARWING ◥
            </div>
            <h1 className="font-mono text-6xl md:text-8xl font-black tracking-[0.2em] mb-4"
                style={{
                  background: "linear-gradient(180deg, var(--neon-cyan), var(--neon-magenta))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 0 24px oklch(0.7 0.28 340 / 0.6)) drop-shadow(0 0 12px oklch(0.85 0.18 200 / 0.6))",
                }}>
              STAR<span style={{ WebkitTextFillColor: "var(--neon-yellow)" }}>·</span>RUNNER
            </h1>
            <p className="font-mono text-neon-cyan/90 max-w-md mb-10 tracking-wider">
              Pilot your fighter through hostile space. Destroy enemy crystals and dodge asteroids.
            </p>
            <button
              onClick={beginLaunch}
              disabled={launching}
              className="group relative px-12 py-4 font-mono text-xl tracking-[0.3em] text-neon-yellow border-2 border-neon-cyan transition-all disabled:opacity-80"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.25 0.18 200 / 0.6), oklch(0.25 0.22 340 / 0.6))",
                boxShadow:
                  "0 0 30px oklch(0.85 0.18 200 / 0.6), inset 0 0 20px oklch(0.7 0.28 340 / 0.4)",
                textShadow: "0 0 10px var(--neon-yellow), 0 0 20px var(--neon-yellow)",
              }}
            >
              {launching ? "◌ LAUNCHING…" : "▶ LAUNCH"}
            </button>
            <div className="mt-10 font-mono text-xs text-neon-cyan/60 tracking-widest space-y-1">
              <div>WASD / ARROW KEYS — STEER</div>
              <div>SPACE / CLICK — FIRE LASERS</div>
              <div>MOUSE — AIM</div>
            </div>
          </div>

          {launching && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/85 backdrop-blur-sm">
              <div className="font-mono text-neon-cyan tracking-[0.4em] text-sm mb-6 animate-pulse"
                style={{ textShadow: "var(--hud-glow)" }}>
                INITIALIZING FLIGHT SYSTEMS
              </div>
              <div className="w-72 h-2 border border-neon-cyan/60 relative overflow-hidden"
                style={{ boxShadow: "0 0 12px var(--neon-cyan)" }}>
                <div className="h-full transition-[width] duration-75"
                  style={{
                    width: `${Math.round(launchProgress * 100)}%`,
                    background: "linear-gradient(90deg, var(--neon-cyan), var(--neon-magenta))",
                    boxShadow: "0 0 12px var(--neon-magenta)",
                  }}
                />
              </div>
              <div className="mt-3 font-mono text-xs text-neon-cyan/70 tracking-widest">
                {Math.round(launchProgress * 100)}%
              </div>
            </div>
          )}

          <style>{`
            @keyframes starfieldDrift {
              0% { background-position: 0 0, 0 0, 0 0, 0 0, 0 0; }
              100% { background-position: -200px 100px, 250px -150px, -180px 200px, 220px -120px, -160px 180px; }
            }
          `}</style>
        </div>
      )}

      {gameState === "gameover" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 bg-background/80 backdrop-blur">
          <h2 className="font-mono text-5xl md:text-7xl font-black tracking-[0.2em] text-neon-magenta mb-4"
              style={{ textShadow: "0 0 20px var(--neon-magenta)" }}>
            MISSION FAILED
          </h2>
          <p className="font-mono text-2xl text-neon-cyan mb-8 tracking-widest"
             style={{ textShadow: "var(--hud-glow)" }}>
            FINAL SCORE: {score}
          </p>
          <button
            onClick={() => setGameState("menu")}
            className="px-12 py-4 font-mono text-xl tracking-[0.3em] text-neon-yellow border-2 border-neon-cyan transition-all"
            style={{
              background: "linear-gradient(135deg, oklch(0.25 0.18 200 / 0.6), oklch(0.25 0.22 340 / 0.6))",
              boxShadow: "0 0 30px oklch(0.85 0.18 200 / 0.6), inset 0 0 20px oklch(0.7 0.28 340 / 0.4)",
              textShadow: "0 0 10px var(--neon-yellow), 0 0 20px var(--neon-yellow)",
            }}
          >
            ▶ RETRY
          </button>
          <button
            onClick={() => setGameState("menu")}
            className="mt-4 font-mono text-sm tracking-widest text-neon-cyan/70 hover:text-neon-cyan"
          >
            ← MAIN MENU
          </button>
        </div>
      )}
    </div>
  );
}
