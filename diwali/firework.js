// Diwali firework: an anar (flower pot) fountain, a launch trail, a
// sparkler burst and colour shells, all driven by one 0..1 "spark" value.
//
//   0     hands together -> a small flame flickers on the pot
//   0..1  hands apart    -> fountain, trail and burst grow with the distance
//   >shellAt arms wide   -> colour shells go off and keep repeating
//
// Every spark is a short streak (its position back along its velocity) plus
// a soft dot at the head, drawn additively so it feeds the bloom glow.

import * as THREE from 'three';
import { seededRandom } from '../shared/app.js';

export function createFirework({ scene, renderer, settings: fx }) {
  const fxGroup = new THREE.Group();
  scene.add(fxGroup);

  const fxRandom = seededRandom(2026);
  const rand = (min, max) => min + (max - min) * fxRandom();
  const pick = (list) => list[Math.floor(fxRandom() * list.length)];
  const smooth = (t) => t * t * (3 - 2 * t);
  const toColor = (hex) => new THREE.Color(hex);   // linear, ready for HDR math
  const paletteColors = fx.palette.map(toColor);
  const goldColors = fx.gold.map(toColor);
  const WHITE = new THREE.Color(1, 0.97, 0.9);

  // light adds up, and alpha is left alone so the composite can tell sparks
  // (glow over the video) from the solid pot (covers the video)
  const glowBlending = {
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    transparent: true, depthWrite: false,
  };

  function makeSoftDot(size = 64) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }
  const softDot = makeSoftDot();

  /* ---- spark pool ------------------------------------------------------ */

  const MAX_SPARKS = 14000;
  const CRACKLE = 1, GLITTER = 2, NO_CHILDREN = 4;
  const pos = new Float32Array(MAX_SPARKS * 3);
  const vel = new Float32Array(MAX_SPARKS * 3);
  const base = new Float32Array(MAX_SPARKS * 3);
  const age = new Float32Array(MAX_SPARKS);
  const life = new Float32Array(MAX_SPARKS);
  const drag = new Float32Array(MAX_SPARKS);
  const gravity = new Float32Array(MAX_SPARKS);
  const flags = new Uint8Array(MAX_SPARKS);
  let sparkCount = 0;

  const streakPositions = new Float32Array(MAX_SPARKS * 6);
  const streakColors = new Float32Array(MAX_SPARKS * 6);
  const streakGeometry = new THREE.BufferGeometry();
  streakGeometry.setAttribute('position', new THREE.BufferAttribute(streakPositions, 3).setUsage(THREE.DynamicDrawUsage));
  streakGeometry.setAttribute('color', new THREE.BufferAttribute(streakColors, 3).setUsage(THREE.DynamicDrawUsage));
  const streaks = new THREE.LineSegments(streakGeometry,
    new THREE.LineBasicMaterial({ vertexColors: true, ...glowBlending }));
  streaks.frustumCulled = false;
  fxGroup.add(streaks);

  const headPositions = new Float32Array(MAX_SPARKS * 3);
  const headColors = new Float32Array(MAX_SPARKS * 3);
  const headGeometry = new THREE.BufferGeometry();
  headGeometry.setAttribute('position', new THREE.BufferAttribute(headPositions, 3).setUsage(THREE.DynamicDrawUsage));
  headGeometry.setAttribute('color', new THREE.BufferAttribute(headColors, 3).setUsage(THREE.DynamicDrawUsage));
  const headMaterial = new THREE.PointsMaterial({
    size: 3.6 * renderer.getPixelRatio(), sizeAttenuation: false,
    map: softDot, vertexColors: true, ...glowBlending });
  const heads = new THREE.Points(headGeometry, headMaterial);
  heads.frustumCulled = false;
  fxGroup.add(heads);

  function spawn(x, y, z, vx, vy, vz, color, lifeSeconds, dragAmount, gravityAmount, flag = 0) {
    if (sparkCount >= MAX_SPARKS) return;
    const i = sparkCount++;
    const i3 = i * 3;
    pos[i3] = x; pos[i3 + 1] = y; pos[i3 + 2] = z;
    vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz;
    base[i3] = color.r; base[i3 + 1] = color.g; base[i3 + 2] = color.b;
    age[i] = 0;
    life[i] = lifeSeconds;
    drag[i] = dragAmount;
    gravity[i] = gravityAmount;
    flags[i] = flag;
  }

  function killSpark(i) {
    const last = --sparkCount;
    if (i === last) return;
    const i3 = i * 3, l3 = last * 3;
    for (let k = 0; k < 3; k++) {
      pos[i3 + k] = pos[l3 + k]; vel[i3 + k] = vel[l3 + k]; base[i3 + k] = base[l3 + k];
    }
    age[i] = age[last]; life[i] = life[last]; drag[i] = drag[last];
    gravity[i] = gravity[last]; flags[i] = flags[last];
  }

  const dir = new THREE.Vector3();
  function randomDirection(upBias = 0) {
    // uniform on a sphere, optionally nudged upward
    const z = rand(-1, 1), angle = rand(0, Math.PI * 2), r = Math.sqrt(1 - z * z);
    dir.set(r * Math.cos(angle), z, r * Math.sin(angle));
    dir.y += upBias;
    return dir.normalize();
  }

  function crackle(i) {
    // the branching you see in the reference: a dying spark splits in 3-5
    const i3 = i * 3;
    const children = 3 + Math.floor(rand(0, 3));
    for (let k = 0; k < children; k++) {
      const d = randomDirection();
      const speed = rand(0.7, 1.6);
      spawn(pos[i3], pos[i3 + 1], pos[i3 + 2],
            vel[i3] * 0.25 + d.x * speed, vel[i3 + 1] * 0.25 + d.y * speed, vel[i3 + 2] * 0.25 + d.z * speed,
            fxRandom() < 0.5 ? WHITE : pick(goldColors), rand(0.22, 0.42), 3.2, 1.2, NO_CHILDREN);
    }
  }

  /* ---- the pot, the trail, the light ------------------------------------ */

  const fxBase = new THREE.Vector3(...fx.base);

  const pot = (() => {
    const profile = [
      new THREE.Vector2(0.0, 0), new THREE.Vector2(0.2, 0), new THREE.Vector2(0.27, 0.12),
      new THREE.Vector2(0.24, 0.3), new THREE.Vector2(0.14, 0.42), new THREE.Vector2(0.06, 0.5),
      new THREE.Vector2(0.045, 0.5),
    ];
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 28),
      new THREE.MeshStandardMaterial({ color: fx.potColor, roughness: 0.8 }));
    group.add(body);
    // painted gold band, like the decorated anar shells
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.018, 8, 40),
      new THREE.MeshStandardMaterial({ color: 0xffc23a, emissive: 0xff9a1a, emissiveIntensity: 0.6, roughness: 0.4 }));
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.17;
    group.add(band);
    group.position.copy(fxBase);
    fxGroup.add(group);
    return group;
  })();
  const potMouth = fxBase.clone().add(new THREE.Vector3(0, 0.5, 0));

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const fireLight = new THREE.PointLight(0xffa040, 0, 6, 1.4);
  fxGroup.add(fireLight);
  const potLight = new THREE.PointLight(0xffb050, 0, 3, 1.5);
  potLight.position.copy(potMouth).add(new THREE.Vector3(0.2, 0.25, 0.6));
  fxGroup.add(potLight);

  function glowSprite(color) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softDot, color, ...glowBlending }));
    fxGroup.add(sprite);
    return sprite;
  }
  const flame = glowSprite(0xffb347);
  flame.position.copy(potMouth).add(new THREE.Vector3(0, 0.06, 0));
  const groundGlow = glowSprite(0xff6a10);
  groundGlow.position.copy(fxBase).add(new THREE.Vector3(0, 0.2, 0.1));
  const burstCore = glowSprite(0xffd27a);
  const flash = glowSprite(0xffffff);
  let flashLevel = 0;

  const trailPositions = new Float32Array(6);
  const trailColors = new Float32Array(6);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
  const trail = new THREE.LineSegments(trailGeometry,
    new THREE.LineBasicMaterial({ vertexColors: true, ...glowBlending }));
  trail.frustumCulled = false;
  fxGroup.add(trail);

  /* ---- emitters --------------------------------------------------------- */

  const burstPoint = new THREE.Vector3();
  const emitDebt = { core: 0, fountain: 0, trail: 0, idle: 0 };
  let accentIndex = 0;
  let accentClock = 0;
  let shellArmed = true;
  let nextShellAt = 0;
  let shellCount = 0;

  function emitCount(key, perSecond, dt) {
    emitDebt[key] += perSecond * dt;
    const whole = Math.floor(emitDebt[key]);
    emitDebt[key] -= whole;
    return whole;
  }

  function launchShell() {
    const main = paletteColors[shellCount % paletteColors.length];
    const second = paletteColors[(shellCount + 3) % paletteColors.length];
    shellCount++;
    // offset a little up and toward the outside, never toward your face
    const cx = burstPoint.x + rand(-0.4, 0.05);
    const cy = burstPoint.y + rand(0.05, 0.45);
    const cz = rand(-0.2, 0.2);
    const shellDrag = 1.9;
    const speed = fx.maxRadius * shellDrag * 0.92;
    for (let k = 0; k < fx.shellSparks; k++) {
      const d = randomDirection();
      const s = speed * rand(0.9, 1.0);
      const glitter = fxRandom() < 0.35 ? GLITTER : 0;
      spawn(cx, cy, cz, d.x * s, d.y * s, d.z * s, main, rand(1.3, 1.9), shellDrag, 0.9,
            glitter | (fxRandom() < 0.12 ? CRACKLE : 0));
    }
    // pistil: a tighter second colour inside
    for (let k = 0; k < fx.shellSparks * 0.25; k++) {
      const d = randomDirection();
      const s = speed * 0.45 * rand(0.85, 1.0);
      spawn(cx, cy, cz, d.x * s, d.y * s, d.z * s, second, rand(1.0, 1.4), shellDrag, 0.7, GLITTER);
    }
    flash.position.set(cx, cy, cz);
    flashLevel = 1;
  }

  function updateFirework(dt, time, spread) {
    const spreadEased = Math.pow(spread, 0.85);

    accentClock += dt;
    if (accentClock > 1.2) { accentClock = 0; accentIndex = (accentIndex + 1) % paletteColors.length; }
    const accent = paletteColors[accentIndex];

    burstPoint.set(0, THREE.MathUtils.lerp(fx.burstLowY, fx.burstHighY, spreadEased), 0);

    // idle flame on the pot: always on, a few lazy sparks
    const flicker = 0.75 + 0.25 * Math.sin(time * 23) * Math.sin(time * 7.3);
    flame.scale.setScalar((0.16 + 0.1 * spread) * flicker);
    flame.material.opacity = 1;
    flame.material.color.setRGB(1.1, 0.55, 0.15);
    for (let k = emitCount('idle', 26 + 40 * spread, dt); k > 0; k--) {
      const d = randomDirection(2.5);
      const s = rand(0.4, 0.9);
      spawn(potMouth.x, potMouth.y, potMouth.z, d.x * s, d.y * s, d.z * s,
            pick(goldColors), rand(0.25, 0.5), 2.2, 0.8, NO_CHILDREN);
    }

    // fountain out of the pot (anar)
    for (let k = emitCount('fountain', fx.fountainPerSecond * spreadEased, dt); k > 0; k--) {
      const cone = THREE.MathUtils.degToRad(rand(0, 24));
      const angle = rand(0, Math.PI * 2);
      const s = rand(2.2, 4.0) * (0.45 + 0.55 * spreadEased);
      spawn(potMouth.x, potMouth.y, potMouth.z,
            Math.sin(cone) * Math.cos(angle) * s, Math.cos(cone) * s, Math.sin(cone) * Math.sin(angle) * s,
            fxRandom() < 0.85 ? pick(goldColors) : accent, rand(0.7, 1.25), 1.1, 3.2,
            fxRandom() < fx.crackleChance ? CRACKLE : 0);
    }

    // launch trail: pot mouth up to the burst point, with embers along it
    const trailOn = smooth(THREE.MathUtils.clamp(spread / 0.12, 0, 1));
    const trailFlicker = 0.8 + 0.2 * Math.sin(time * 41);
    trailPositions.set([potMouth.x, potMouth.y, potMouth.z, burstPoint.x, burstPoint.y, burstPoint.z]);
    trailColors.set([2.2 * trailOn * trailFlicker, 0.55 * trailOn, 0.12 * trailOn,
                     1.6 * trailOn * trailFlicker, 0.12 * trailOn, 0.05 * trailOn]);
    trailGeometry.attributes.position.needsUpdate = true;
    trailGeometry.attributes.color.needsUpdate = true;
    for (let k = emitCount('trail', 160 * trailOn, dt); k > 0; k--) {
      const t = fxRandom();
      spawn(0, THREE.MathUtils.lerp(potMouth.y, burstPoint.y, t), 0,
            rand(-0.15, 0.15), rand(0.2, 0.7), rand(-0.15, 0.15),
            fxRandom() < 0.5 ? paletteColors[6] : paletteColors[1], rand(0.2, 0.45), 2.5, 0.3, NO_CHILDREN);
    }

    // the sparkler burst at the top
    const coreRate = fx.sparksPerSecond * Math.pow(spread, 1.4) * trailOn;
    const coreDrag = 1.4;
    const reach = 0.35 + (fx.maxRadius - 0.35) * spreadEased;
    for (let k = emitCount('core', coreRate, dt); k > 0; k--) {
      const d = randomDirection(0.12);
      const s = reach * 2.1 * rand(0.5, 1.0);
      const color = fxRandom() < 0.5 ? pick(goldColors) : (fxRandom() < 0.7 ? accent : pick(paletteColors));
      spawn(burstPoint.x, burstPoint.y, burstPoint.z, d.x * s, d.y * s, d.z * s,
            color, rand(0.6, 1.0), coreDrag, 0.55,
            fxRandom() < fx.crackleChance ? CRACKLE : 0);
    }
    burstCore.position.copy(burstPoint);
    burstCore.scale.setScalar((0.1 + 0.22 * spreadEased) * trailOn * (0.85 + 0.15 * Math.sin(time * 37)));
    burstCore.material.color.setRGB(0.8, 0.45, 0.15);

    // shells when the arms go wide
    if (spread > fx.shellAt) {
      if (shellArmed || time >= nextShellAt) {
        launchShell();
        shellArmed = false;
        nextShellAt = time + fx.shellRepeatSeconds;
      }
    } else if (spread < fx.shellAt - 0.2) {
      shellArmed = true;
    }
    flashLevel = Math.max(0, flashLevel - dt * 6);
    flash.scale.setScalar(0.3 + 1.1 * flashLevel);
    flash.material.color.setRGB(0.9 * flashLevel, 0.75 * flashLevel, 0.6 * flashLevel);

    groundGlow.scale.set(0.7 + 2.2 * spreadEased, 0.35 + 0.8 * spreadEased, 1);
    groundGlow.material.color.setRGB(0.55 * (0.2 + spreadEased), 0.16 * (0.2 + spreadEased), 0.02);

    fireLight.position.copy(burstPoint);
    fireLight.intensity = 6 * spreadEased;
    potLight.intensity = 1.2 + 4 * spreadEased;

    stepSparks(dt);
  }

  function stepSparks(dt) {
    const trailTime = fx.trailSeconds;
    const bright = fx.brightness;
    // small fixed steps so a slow frame doesn't shrink the bursts
    const substeps = Math.min(6, Math.max(1, Math.ceil(dt * 90)));
    const h = dt / substeps;
    let i = 0;
    while (i < sparkCount) {
      age[i] += dt;
      if (age[i] >= life[i]) {
        if ((flags[i] & CRACKLE) && !(flags[i] & NO_CHILDREN)) crackle(i);
        killSpark(i);
        continue;
      }
      const i3 = i * 3;
      for (let step = 0; step < substeps; step++) {
        const slow = Math.exp(-drag[i] * h);
        vel[i3] *= slow; vel[i3 + 1] = vel[i3 + 1] * slow - gravity[i] * h; vel[i3 + 2] *= slow;
        pos[i3] += vel[i3] * h; pos[i3 + 1] += vel[i3 + 1] * h; pos[i3 + 2] += vel[i3 + 2] * h;
      }

      const t = age[i] / life[i];
      const heat = 1 - smooth(Math.min(1, t / 0.22));            // white-hot at birth
      // stays bright most of its flight, then burns out fast
      let level = bright * (1 - smooth(Math.min(1, Math.max(0, (t - 0.55) / 0.45)))) * (1 - 0.3 * t);
      if (flags[i] & GLITTER) level *= (Math.sin(age[i] * 70 + i) > 0.2) ? 1.7 : 0.15;
      const r = (base[i3] + (WHITE.r - base[i3]) * heat * 0.45) * level;
      const g = (base[i3 + 1] + (WHITE.g - base[i3 + 1]) * heat * 0.45) * level;
      const b = (base[i3 + 2] + (WHITE.b - base[i3 + 2]) * heat * 0.45) * level;

      const s6 = i * 6;
      streakPositions[s6] = pos[i3]; streakPositions[s6 + 1] = pos[i3 + 1]; streakPositions[s6 + 2] = pos[i3 + 2];
      streakPositions[s6 + 3] = pos[i3] - vel[i3] * trailTime;
      streakPositions[s6 + 4] = pos[i3 + 1] - vel[i3 + 1] * trailTime;
      streakPositions[s6 + 5] = pos[i3 + 2] - vel[i3 + 2] * trailTime;
      streakColors[s6] = r; streakColors[s6 + 1] = g; streakColors[s6 + 2] = b;
      streakColors[s6 + 3] = r * 0.12; streakColors[s6 + 4] = g * 0.06; streakColors[s6 + 5] = b * 0.04;

      headPositions[i3] = pos[i3]; headPositions[i3 + 1] = pos[i3 + 1]; headPositions[i3 + 2] = pos[i3 + 2];
      headColors[i3] = r * 0.55; headColors[i3 + 1] = g * 0.55; headColors[i3 + 2] = b * 0.55;
      i++;
    }
    streakGeometry.setDrawRange(0, sparkCount * 2);
    streakGeometry.attributes.position.needsUpdate = true;
    streakGeometry.attributes.color.needsUpdate = true;
    headGeometry.setDrawRange(0, sparkCount);
    headGeometry.attributes.position.needsUpdate = true;
    headGeometry.attributes.color.needsUpdate = true;
  }

  return {
    update: updateFirework,
    get sparkCount() { return sparkCount; },
  };
}
