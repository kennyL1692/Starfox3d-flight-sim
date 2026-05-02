import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type GameState = "menu" | "playing" | "gameover";

export function StarfoxGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<GameState>("menu");
  const [score, setScore] = useState(0);
  const [hp, setHp] = useState(100);
  const stateRef = useRef({ score: 0, hp: 100, running: false });

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
    scene.fog = new THREE.FogExp2(0x0a0420, 0.012);
    scene.background = new THREE.Color(0x06021a);

    const camera = new THREE.PerspectiveCamera(70, mount.clientWidth / mount.clientHeight, 0.1, 500);
    camera.position.set(0, 3, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0x6644aa, 0.6));
    const dir = new THREE.DirectionalLight(0x00ddff, 1.2);
    dir.position.set(5, 10, 7);
    scene.add(dir);
    const rim = new THREE.DirectionalLight(0xff44aa, 0.8);
    rim.position.set(-5, 3, -5);
    scene.add(rim);

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1500;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 400;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 200 + 30;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 400;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.4, sizeAttenuation: true })
    );
    scene.add(stars);

    // Ground grid (tron-like)
    const grid = new THREE.GridHelper(800, 80, 0x00ffff, 0xff00ff);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.4;
    grid.position.y = -4;
    scene.add(grid);

    // Player ship (Arwing-inspired)
    const ship = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xddddee,
      metalness: 0.7,
      roughness: 0.3,
      emissive: 0x222244,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00aaff,
      emissiveIntensity: 1.5,
    });
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x4466aa,
      metalness: 0.6,
      roughness: 0.4,
    });

    const fuselage = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.8, 8), bodyMat);
    fuselage.rotation.x = -Math.PI / 2;
    ship.add(fuselage);

    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), accentMat);
    cockpit.position.set(0, 0.15, 0.1);
    cockpit.scale.set(1, 0.6, 1.4);
    ship.add(cockpit);

    const wingGeo = new THREE.BoxGeometry(1.6, 0.08, 0.6);
    const lWing = new THREE.Mesh(wingGeo, wingMat);
    lWing.position.set(-0.7, 0, 0.2);
    ship.add(lWing);
    const rWing = lWing.clone();
    rWing.position.x = 0.7;
    ship.add(rWing);

    const finL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.4), wingMat);
    finL.position.set(-1.3, 0.25, 0.2);
    ship.add(finL);
    const finR = finL.clone();
    finR.position.x = 1.3;
    ship.add(finR);

    // Engine glow
    const engineL = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), accentMat);
    engineL.position.set(-0.3, 0, 0.85);
    ship.add(engineL);
    const engineR = engineL.clone();
    engineR.position.x = 0.3;
    ship.add(engineR);

    ship.position.set(0, 0, 4);
    scene.add(ship);

    // Lasers
    type Laser = { mesh: THREE.Mesh; vel: THREE.Vector3 };
    const lasers: Laser[] = [];
    const laserGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6);
    const laserMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });

    function shoot() {
      for (const offset of [-0.3, 0.3]) {
        const m = new THREE.Mesh(laserGeo, laserMat);
        m.rotation.x = Math.PI / 2;
        m.position.copy(ship.position);
        m.position.x += offset;
        m.position.z -= 0.5;
        scene.add(m);
        lasers.push({ mesh: m, vel: new THREE.Vector3(0, 0, -1.5) });
      }
      playLaser();
    }

    // Enemies
    type Enemy = { mesh: THREE.Mesh; hp: number; spin: number };
    const enemies: Enemy[] = [];
    const enemyGeo = new THREE.OctahedronGeometry(0.7, 0);
    const enemyMat = new THREE.MeshStandardMaterial({
      color: 0xff2266,
      emissive: 0xff0044,
      emissiveIntensity: 0.6,
      metalness: 0.5,
      roughness: 0.4,
    });

    function spawnEnemy() {
      const m = new THREE.Mesh(enemyGeo, enemyMat);
      m.position.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 6 + 1, -80);
      scene.add(m);
      enemies.push({ mesh: m, hp: 1, spin: Math.random() * 0.05 + 0.02 });
    }

    // Asteroids
    type Rock = { mesh: THREE.Mesh; spin: THREE.Vector3 };
    const rocks: Rock[] = [];
    const rockGeo = new THREE.DodecahedronGeometry(1.2, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x886655,
      roughness: 0.9,
      flatShading: true,
    });

    function spawnRock() {
      const m = new THREE.Mesh(rockGeo, rockMat);
      m.position.set((Math.random() - 0.5) * 25, (Math.random() - 0.5) * 8, -100);
      const s = 0.6 + Math.random() * 1.4;
      m.scale.set(s, s, s);
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
    }

    // Input
    const keys: Record<string, boolean> = {};
    let lastShot = 0;
    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = true;
      if (e.key === " ") e.preventDefault();
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
      pointerX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
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
    };
    window.addEventListener("resize", onResize);

    let spawnTimer = 0;
    let rockTimer = 0;
    let frame = 0;
    let raf = 0;
    const clock = new THREE.Clock();

    function animate() {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      frame++;

      // Move grid for speed sensation
      grid.position.z = (grid.position.z + dt * 40) % 10;

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
      ship.position.x += (tx - ship.position.x) * 0.15;
      ship.position.y += (ty - ship.position.y) * 0.15;

      // Banking
      const bank = (tx - ship.position.x) * 0.5;
      ship.rotation.z += (-bank - ship.rotation.z) * 0.1;
      ship.rotation.x += (-(ty - ship.position.y) * 0.3 - ship.rotation.x) * 0.1;

      // Camera follow
      camera.position.x += (ship.position.x * 0.4 - camera.position.x) * 0.05;
      camera.position.y += (ship.position.y * 0.3 + 3 - camera.position.y) * 0.05;
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
          if (stateRef.current.hp <= 0) endGame();
          continue;
        }

        // Hit by laser
        let hit = false;
        for (let j = lasers.length - 1; j >= 0; j--) {
          if (e.mesh.position.distanceTo(lasers[j].mesh.position) < 1) {
            scene.remove(lasers[j].mesh);
            lasers.splice(j, 1);
            hit = true;
            break;
          }
        }
        if (hit) {
          explode(e.mesh.position, 0xffaa00);
          scene.remove(e.mesh);
          enemies.splice(i, 1);
          stateRef.current.score += 100;
          setScore(stateRef.current.score);
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
          if (stateRef.current.hp <= 0) endGame();
          continue;
        }

        // Lasers can chip rocks
        for (let j = lasers.length - 1; j >= 0; j--) {
          if (r.mesh.position.distanceTo(lasers[j].mesh.position) < 1.4 * r.mesh.scale.x) {
            scene.remove(lasers[j].mesh);
            lasers.splice(j, 1);
            explode(lasers[j]?.mesh.position ?? r.mesh.position, 0xffcc88);
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

      renderer.render(scene, camera);
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
    };
  }, [gameState]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-background">
      <div ref={mountRef} className="absolute inset-0" />

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
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 bg-gradient-to-b from-background via-background/90 to-background">
          <h1 className="font-mono text-6xl md:text-8xl font-black tracking-[0.2em] text-neon-cyan mb-4"
              style={{ textShadow: "0 0 20px var(--neon-cyan), 0 0 40px var(--neon-magenta)" }}>
            STAR<span className="text-neon-magenta">RUNNER</span>
          </h1>
          <p className="font-mono text-neon-cyan/80 max-w-md mb-10 tracking-wider">
            Pilot your fighter through hostile space. Destroy enemy crystals and dodge asteroids.
          </p>
          <button
            onClick={() => setGameState("playing")}
            className="px-10 py-4 font-mono text-xl tracking-[0.3em] text-background bg-neon-cyan hover:bg-neon-magenta hover:text-foreground transition-all border-2 border-neon-cyan hover:border-neon-magenta"
            style={{ boxShadow: "0 0 30px var(--neon-cyan)" }}
          >
            ▶ LAUNCH
          </button>
          <div className="mt-10 font-mono text-xs text-neon-cyan/50 tracking-widest space-y-1">
            <div>WASD / ARROW KEYS — STEER</div>
            <div>SPACE / CLICK — FIRE LASERS</div>
            <div>MOUSE — AIM</div>
          </div>
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
            onClick={() => setGameState("playing")}
            className="px-10 py-4 font-mono text-xl tracking-[0.3em] text-background bg-neon-cyan hover:bg-neon-magenta hover:text-foreground transition-all border-2 border-neon-cyan"
            style={{ boxShadow: "0 0 30px var(--neon-cyan)" }}
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
