import * as THREE from 'three';
import { audio } from '../audio.js';
import { doseRate, falloutExposureMult, stepShelterDay } from '../rules.js';
import { concretePBR, hazardTexture, signTexture, tileFloorPBR } from '../textures.js';
import { makeCrate, pbrMat } from '../props.js';

const std = (o) => new THREE.MeshStandardMaterial(o);

export function buildBunker(game) {
  const root = new THREE.Group();
  const colliders = [];
  const obstacles = [];
  const interactables = [];
  const ammoSpawns = [
    { pos: new THREE.Vector3(-5.8, 0, -9.2), kind: 'rifle', amount: 30, grenade: 1 },
    { pos: new THREE.Vector3(-2.2, -4.0, 9.8), kind: 'shotgun', amount: 12 },
  ];

  const tier = game.stats.bunkerTier || 'public';
  const military = tier === 'military';
  const tunnel = tier === 'tunnel';
  const fortified = military || tunnel;

  // Underground sealed environment (warm/cool industrial bunker lighting, no exterior sky)
  game.setEnv({
    horizon: 0x0b0f12,
    zenith: 0x050709,
    fog: 0x0d1216,
    fogDensity: 0.016,
    sunColor: 0x99b8d4,
    sunIntensity: 0.45,
    sunDir: [0.2, 1.0, 0.2],
    hemiSky: military ? 0x6ba59e : 0x9ca38c,
    hemiGround: 0x26292b,
    hemiIntensity: 1.05,
    particles: null,
    exposure: 1.05,
    cloudDensity: 0,
  });

  const cPbr = concretePBR();
  const wallMat = pbrMat(cPbr, 4, 2, {
    color: military ? 0x98a6a2 : tunnel ? 0x96938c : 0xa8a397,
    emissive: military ? 0x0d1a18 : 0x181510,
    emissiveIntensity: 0.35,
    roughness: 0.9,
  });
  const deckMat = pbrMat(tileFloorPBR('bunker'), 6, 6, {
    color: military ? 0xb4c2be : 0xbdb8ac,
    emissive: 0x0d1112,
    emissiveIntensity: 0.22,
  });
  const steelMat = std({ color: 0x374151, metalness: 0.78, roughness: 0.38 });
  const trimMat = std({ color: 0x1f2937, metalness: 0.65, roughness: 0.45 });
  const hazardMat = std({ map: hazardTexture(), roughness: 0.65 });
  const rampMat = pbrMat(cPbr, 2, 4, { color: 0x7d848b, roughness: 0.85 });

  const W = 28;
  const D = 28;
  const minY = -4.0;
  const maxY = 7.6;
  const totalH = maxY - minY; // 11.6

  const addBox = (x, y, z, w, h, d, mat, collide = true, cMinY = minY, cMaxY = maxY + 1) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    obstacles.push(m);
    if (collide) {
      colliders.push({
        minX: x - w / 2,
        maxX: x + w / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2,
        minY: cMinY,
        maxY: cMaxY,
      });
    }
    return m;
  };

  // Perimeter structural shell & ceiling vault
  addBox(-W / 2 - 0.3, (minY + maxY) / 2, 0, 0.6, totalH, D + 1.2, wallMat);
  addBox(W / 2 + 0.3, (minY + maxY) / 2, 0, 0.6, totalH, D + 1.2, wallMat);
  addBox(0, (minY + maxY) / 2, -D / 2 - 0.3, W + 1.2, totalH, 0.6, wallMat);
  addBox(0, (minY + maxY) / 2, D / 2 + 0.3, W + 1.2, totalH, 0.6, wallMat);
  addBox(0, maxY + 0.3, 0, W + 1.2, 0.6, D + 1.2, wallMat, false);

  // Lower Sub-Level Floor (y = -4.0)
  addBox(0, -4.15, 0, W, 0.3, D, deckMat, false);

  // Main Concourse Slab (y = 0.0) with cutout for West Lower Stair Ramp (x in [-13.8..-9.2], z in [-7.6..+7.6])
  addBox(2.4, -0.14, 0, 23.2, 0.28, D, deckMat, false); // x from -9.2 to +14
  addBox(-11.6, -0.14, 10.8, 4.8, 0.28, 6.4, deckMat, false); // West-South landing
  addBox(-11.6, -0.14, -10.8, 4.8, 0.28, 6.4, deckMat, false); // West-North landing
  // Stairwell safety railing on Main Deck
  addBox(-9.1, 0.55, 0, 0.2, 1.1, 14.8, steelMat, true, -0.3, 1.8);

  // Upper Control & Airlock Mezzanine (y = +3.8): North platform (z in [-14..-4.5]) + East landing (x in [+9.2..+14], z in [-4.5..+14])
  addBox(0, 3.66, -9.25, W, 0.28, 9.5, deckMat, false);
  // Mezzanine balcony guardrails overlooking Main Deck
  addBox(-2.2, 4.35, -4.5, 22.8, 1.0, 0.22, steelMat, true, 3.6, 5.8);
  addBox(9.2, 4.35, 1.5, 0.22, 1.0, 12.2, steelMat, true, 3.6, 5.8);

  // Structural columns supporting upper decks
  for (const cx of [-4.8, 4.8]) {
    for (const cz of [-4.6, 5.2]) {
      addBox(cx, 1.8, cz, 0.65, 11.4, 0.65, trimMat, true, minY, maxY);
    }
  }

  // Wide walkable ramps connecting Main <-> Lower & Main <-> Upper
  const addRamp = (rx, y0, y1, z0, z1) => {
    const dz = z1 - z0;
    const dy = y1 - y0;
    const len = Math.hypot(dz, dy);
    const ang = Math.atan2(dy, Math.abs(dz));
    const m = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.26, len), rampMat);
    m.position.set(rx, (y0 + y1) / 2 - 0.13, (z0 + z1) / 2);
    m.rotation.x = Math.sign(dz) > 0 ? -ang : ang;
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    obstacles.push(m);
  };
  // West Ramp: Main (0) down to Sub-Level (-4.0) going +Z -> -Z
  addRamp(-11.4, 0, -4.0, 7.5, -7.5);
  // East Ramp: Main (0) up to Upper Mezzanine (+3.8) going +Z -> -Z
  addRamp(11.4, 0, 3.8, 7.5, -7.5);

  // Fluorescent & emergency lighting across all 3 levels (emissive bars + bounded PointLights)
  const lightCol = military ? 0x99f6e4 : tunnel ? 0xfde68a : 0xfff3d1;
  const bulbMat = new THREE.MeshBasicMaterial({ color: lightCol });
  const lightZones = [
    [0, 3.45, 0],
    [7.2, 3.45, -7.5],
    [7.2, 3.45, 7.5],
    [-4.5, 3.45, 7.5],
    [-4.5, 3.45, -7.5],
    [0, 7.2, -9.5],
    [0, -0.45, -8.5],
    [0, -0.45, 7.5],
  ];
  for (const [lx, ly, lz] of lightZones) {
    const fix = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 0.38), bulbMat);
    fix.position.set(lx, ly, lz);
    root.add(fix);
  }
  const addPoint = (x, y, z, color, intensity, dist) => {
    const l = new THREE.PointLight(color, intensity, dist, 1.4);
    l.position.set(x, y, z);
    root.add(l);
  };
  addPoint(0, 3.1, 0, lightCol, 28, 26);
  addPoint(7.5, 3.0, -7, 0xffd599, 18, 18);
  addPoint(0, 6.8, -9.5, 0xa5f3fc, 22, 22);
  addPoint(0, -0.8, -4.0, 0xfbbf24, 22, 22);
  addPoint(4.0, -0.8, 4.0, 0xc084fc, 16, 18); // Hydroponic UV glow

  // Overhead ventilation ducts & industrial steel conduit pipes
  for (const dx of [-6.8, 6.8]) {
    const duct = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.45, 25), steelMat);
    duct.position.set(dx, 3.45, 0);
    root.add(duct);
  }
  const pipeMat = std({ color: 0xb45309, metalness: 0.65, roughness: 0.4 });
  for (const pz of [-13.5, 13.5]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 24, 10), pipeMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, 2.95, pz);
    root.add(pipe);
  }
  // Wall lockers along Bunk Quarters & Armory
  for (const lx of [1.2, 2.0]) {
    addBox(lx, 1.05, -13.1, 0.72, 2.1, 0.6, trimMat, true, -0.2, 2.5);
  }

  // Wall signage for every deck & room
  const addSign = (text, bg, fg, x, y, z, ry = 0, w = 3.8, h = 0.85) => {
    const sTex = signTexture(text, bg, fg);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: sTex, emissive: 0xffffff, emissiveMap: sTex, emissiveIntensity: 0.6 }),
    );
    m.position.set(x, y, z);
    m.rotation.y = ry;
    root.add(m);
  };
  const headerName = military ? 'MILITARY BUNKER 7' : tunnel ? 'SECTOR-4 VAULT' : 'FALLOUT SHELTER';
  addSign(headerName, '#111827', military ? '#34d399' : '#f59e0b', 0, 2.8, -4.3, 0, 5.2, 1.0);
  addSign('SUB-LEVEL: REACTOR & WATER ↓', '#1f2937', '#fbbf24', -8.9, 2.4, 5.5, Math.PI / 2, 3.8, 0.72);
  addSign('UPPER AIRLOCK & COMMS ↑', '#1f2937', '#38bdf8', 8.9, 2.4, 5.5, -Math.PI / 2, 3.8, 0.72);
  addSign('BUNK QUARTERS', '#292524', '#fde68a', 6.2, 2.7, -13.6, 0, 3.4, 0.7);
  addSign('GALLEY & RATIONS', '#292524', '#fb923c', 6.2, 2.7, 13.6, Math.PI, 3.4, 0.7);
  addSign('MEDBAY & DECON', '#ffffff', '#dc2626', -4.5, 2.7, 13.6, Math.PI, 3.4, 0.7);
  addSign('ARMORY', '#14532d', '#bbf7d0', -4.5, 2.7, -13.6, 0, 3.0, 0.7);

  // ---------------- MAIN DECK FURNISHINGS (y = 0) ----------------
  // 1. Bunk Quarters (NE: x in [3..8.5], z in [-13..-6])
  const mattressMat = std({ color: military ? 0x365314 : 0x4b5d46, roughness: 0.9 });
  const pillowMat = std({ color: 0xe5e7eb, roughness: 0.85 });
  for (const bx of [3.2, 7.0]) {
    for (const by of [0.55, 1.6]) {
      const bunk = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 2.3), mattressMat);
      bunk.position.set(bx, by, -10.5);
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.4), pillowMat);
      pil.position.set(bx, by + 0.12, -11.35);
      root.add(bunk, pil);
    }
    for (const pz of [-11.55, -9.45]) {
      for (const px of [bx - 0.55, bx + 0.55]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.2, 0.07), steelMat);
        post.position.set(px, 1.1, pz);
        root.add(post);
      }
    }
    colliders.push({ minX: bx - 0.65, maxX: bx + 0.65, minZ: -11.7, maxZ: -9.3, minY: -0.2, maxY: 2.8 });
  }

  // 2. Galley & Mess Hall (SE: x in [2..8], z in [6..13])
  const tableMat = std({ color: 0x785538, roughness: 0.75 });
  addBox(4.8, 0.4, 9.0, 3.0, 0.8, 1.2, tableMat, true, -0.2, 2.2);
  addBox(6.8, 1.1, 13.0, 2.4, 2.2, 1.0, std({ color: 0xd1d5db, roughness: 0.35, metalness: 0.4 }), true, -0.2, 2.6); // Fridge
  const cooler = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.2, 12), std({ color: 0x38bdf8, roughness: 0.25 }));
  cooler.position.set(3.2, 0.6, 13.0);
  root.add(cooler);

  // 3. Medical Bay (SW: x in [-8..-2], z in [6..13])
  addBox(-6.5, 0.45, 9.2, 1.4, 0.85, 2.5, std({ color: 0xe2e8f0, roughness: 0.65 }), true, -0.2, 2.2);
  const medCab = addBox(-4.2, 1.0, 13.2, 1.8, 2.0, 0.7, std({ color: 0xf8fafc, roughness: 0.4 }), true, -0.2, 2.5);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 0.06), std({ color: 0xdc2626, emissive: 0x991b1b, emissiveIntensity: 0.6 }));
  crossV.position.set(-4.2, 1.45, 12.82);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.22, 0.06), crossV.material);
  crossH.position.set(-4.2, 1.45, 12.82);
  root.add(crossV, crossH);
  void medCab;

  // 4. Armory & Gear Alcove (NW: x in [-8..-2], z in [-13..-6])
  addBox(-5.2, 0.5, -12.6, 3.8, 1.0, 0.9, trimMat, true, -0.2, 2.2);
  const armCrate = makeCrate(true);
  armCrate.position.set(-5.2, 0, -10.5);
  root.add(armCrate);
  if (military) {
    const suitRack = addBox(-2.2, 1.05, -13.1, 1.6, 2.1, 0.7, std({ color: 0x065f46, roughness: 0.6 }), true, -0.2, 2.5);
    void suitRack;
  }

  // ---------------- LOWER SUB-LEVEL (y = -4.0) ----------------
  // Geothermal Generator & Spinning Core (NW sub-level)
  addBox(-3.5, -3.2, -9.5, 3.2, 1.6, 2.4, steelMat, true, -4.2, -1.0);
  const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 2.0, 16), std({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 1.8, metalness: 0.7 }));
  rotor.rotation.z = Math.PI / 2;
  rotor.position.set(-3.5, -2.0, -9.5);
  const hazardTrim = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.06, 3.6), hazardMat);
  hazardTrim.position.set(-3.5, -3.98, -9.5);
  root.add(rotor, hazardTrim);

  // Water Filtration Bank (NE sub-level)
  const tankMat = std({ color: 0x1d4ed8, metalness: 0.45, roughness: 0.35 });
  for (const tx of [4.2, 5.8, 7.4]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.6, 14), tankMat);
    tank.position.set(tx, -2.7, -9.8);
    root.add(tank);
  }
  colliders.push({ minX: 3.4, maxX: 8.2, minZ: -10.6, maxZ: -9.0, minY: -4.2, maxY: -0.8 });

  // Hydroponic UV Grow Bay (SE sub-level)
  const uvMat = new THREE.MeshBasicMaterial({ color: 0xd946ef });
  const leafMat = std({ color: 0x22c55e, roughness: 0.8 });
  for (const hz of [3.5, 7.2]) {
    addBox(5.5, -3.4, hz, 5.0, 1.1, 1.2, trimMat, true, -4.2, -2.0);
    const leaves = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.35, 0.9), leafMat);
    leaves.position.set(5.5, -2.7, hz);
    const uv = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.08, 0.3), uvMat);
    uv.position.set(5.5, -1.6, hz);
    root.add(leaves, uv);
  }

  // Deep Sump Footlocker (SW sub-level)
  const sumpCrate = makeCrate(true);
  sumpCrate.position.set(-3.2, -4.0, 10.6);
  root.add(sumpCrate);

  // ---------------- UPPER MEZZANINE (y = +3.8) ----------------
  // Comms Desk & 7-10 Rule Console (x = -5.5, z = -11.5)
  addBox(-5.5, 4.3, -11.5, 3.2, 1.0, 1.0, steelMat, true, 3.6, 5.6);
  const crt1 = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
  crt1.position.set(-6.1, 5.1, -11.95);
  const crt2 = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
  crt2.position.set(-4.8, 5.1, -11.95);
  root.add(crt1, crt2);

  // RPG Tactical Optics & Radiation Calibration Bench (East Upper Mezzanine)
  addBox(4.8, 4.3, -12.8, 2.8, 1.0, 0.9, trimMat, true, 3.6, 5.6);
  const scopeUnit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.55), std({ color: 0x0f766e, metalness: 0.65, roughness: 0.35 }));
  scopeUnit.position.set(4.8, 5.02, -12.8);
  const benchScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.34), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
  benchScreen.position.set(4.8, 5.05, -12.51);
  root.add(scopeUnit, benchScreen);
  addSign('OPTICS & RAD-SEAL BENCH', '#0f172a', '#38bdf8', 4.8, 6.2, -13.6, 0, 3.6, 0.62);

  // Massive Outer Blast Airlock Door (x = 0, z = -13.3, y = 3.8)
  const airHatch = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.4, 24), std({ color: 0x6b7280, metalness: 0.85, roughness: 0.3 }));
  airHatch.rotation.x = Math.PI / 2;
  airHatch.position.set(0, 5.4, -13.65);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 8, 16), std({ color: 0xf59e0b, metalness: 0.8, roughness: 0.25 }));
  wheel.position.set(0, 5.4, -13.38);
  root.add(airHatch, wheel);
  addSign('AIRLOCK EXIT -> HEAD NORTH', '#7c2d12', '#fef3c7', 0, 7.25, -13.7, 0, 4.6, 0.72);

  // ---------------- INTERACTIVE BUNKER LOGIC & STATE ----------------
  let day = game.stats.shelterDays || 0;
  let ateToday = false;
  let drankToday = false;
  let waterRefilledDay = -1;
  let filterPurgedDay = -1;
  let hydroHarvestDay = -2;
  let armoryClaimed = false;
  let sumpLooted = false;
  let deadReason = null;

  const getStatus = () => {
    const outside = doseRate(Math.max(day, 0.05));
    const mult = falloutExposureMult(Math.max(day, 0.05));
    const risk = outside > 5 ? 'LETHAL' : outside > 2 ? 'SEVERE' : outside > 0.8 ? 'HIGH' : outside > 0.4 ? 'MODERATE' : 'SURVIVABLE';
    return { day, outside, mult, risk, bunkerTier: tier, military, tunnel };
  };

  const restDay = () => {
    if (deadReason || game.mode !== 'play') return;
    if (day >= 21) {
      game.msg('Air recyclers at critical limit — head to the Upper Airlock Hatch & exit north NOW!', 'alert');
      return;
    }
    const res = stepShelterDay(game.stats, day);
    game.stats = res.stats;
    day = res.day;
    ateToday = false;
    drankToday = false;
    audio.pickup();
    for (const ev of res.events) game.msg(ev.text, ev.tone);
    const out = doseRate(day);
    game.msg(`Day ${day} begins underground. Outside dose rate: ${out.toFixed(2)} R/hr`, 'info');
    if (day >= 21) game.msg('WARNING: Recycler failing — head to Upper Mezzanine Airlock to leave!', 'alert');
    if (res.deadReason) {
      deadReason = res.deadReason;
      game.die(res.deadReason);
      return;
    }
    game.emitHud();
  };

  // Interactive 3D stations across all 3 decks
  interactables.push(
    {
      pos: new THREE.Vector3(5.1, 0, -10.5),
      radius: 3.2,
      repeat: true,
      hold: 0.7,
      label: () => `Sleep in Bunk & Wait 1 Day (Day ${day} -> ${day + 1})`,
      action: restDay,
    },
    {
      pos: new THREE.Vector3(6.8, 0, 11.4),
      radius: 2.8,
      repeat: true,
      hold: 0.5,
      label: () => (ateToday ? 'Already ate a full meal today' : game.stats.food > 0 ? `Eat Shelter Ration (+40 Hunger · ${game.stats.food} left)` : 'No rations left — harvest Hydroponics below!'),
      action: () => {
        if (ateToday) return game.msg('Wait until tomorrow to eat another full meal (or press C anytime for snacks).', 'info');
        if (game.stats.food <= 0) return game.msg('Out of rations — check Hydroponics in the Sub-Level!', 'alert');
        if (game.stats.hunger >= 100) return game.msg('Already full — save your rations.', 'info');
        game.stats.food--;
        game.stats.hunger = Math.min(100, game.stats.hunger + 40);
        ateToday = true;
        audio.eat();
        game.msg('Ate hot ration meal in the galley (+40 hunger)', 'loot');
        game.emitHud();
      },
    },
    {
      pos: new THREE.Vector3(3.2, 0, 11.5),
      radius: 2.8,
      repeat: true,
      hold: 0.5,
      label: () => (drankToday ? 'Already drank today' : game.stats.water > 0 ? `Drink Clean Water (+45 Thirst · ${game.stats.water} left)` : 'No water — purify more in Sub-Level!'),
      action: () => {
        if (drankToday) return game.msg('Hydrated for today (or press V anytime).', 'info');
        if (game.stats.water <= 0) return game.msg('No water left — check the Sub-Level Water Filtration Bank!', 'alert');
        if (game.stats.thirst >= 100) return game.msg('Already hydrated — save your water.', 'info');
        game.stats.water--;
        game.stats.thirst = Math.min(100, game.stats.thirst + 45);
        drankToday = true;
        audio.eat();
        game.msg('Drank filtered cold water (+45 thirst)', 'loot');
        game.emitHud();
      },
    },
    {
      pos: new THREE.Vector3(-4.2, 0, 11.8),
      radius: 2.8,
      repeat: true,
      hold: 0.5,
      label: () => `Medbay Cabinet (Medkits: ${game.stats.meds} · Rad-X: ${game.stats.radpills})`,
      action: () => {
        if (game.stats.radiation > 10 && game.stats.radpills > 0) {
          game.stats.radpills--;
          game.stats.radiation = Math.max(0, game.stats.radiation - 30);
          audio.pickup();
          game.msg('Medbay Rad-X Decon (-30 rads)', 'loot');
        } else if (game.stats.health < 100 && game.stats.meds > 0) {
          game.stats.meds--;
          game.stats.health = Math.min(100, game.stats.health + 45);
          audio.pickup();
          game.msg('Medbay treatment (+45 health)', 'loot');
        } else {
          game.msg('Vitals are steady — press H (Medkit) or X (Rad-X) whenever needed.', 'info');
        }
      },
    },
    {
      pos: new THREE.Vector3(-5.2, 0, -10.5),
      radius: 3.0,
      hold: 0.9,
      label: 'Claim Bunker Armory Stock (Weapons, Ammo & Grenades)',
      action: () => {
        if (armoryClaimed) return;
        armoryClaimed = true;
        const s = game.stats;
        if (fortified) {
          if (!s.weapons.includes('shotgun')) game.giveWeapon('shotgun', 16);
          if (!s.weapons.includes('rifle')) game.giveWeapon('rifle', 36);
          s.ammo.rifle += 72;
          s.ammo.shotgun += 24;
          s.ammo.pistol += 30;
          s.grenades = (s.grenades ?? 0) + 2;
          game.msg('Armory Rack: +72 5.56, +24 shells, +30 9mm, +2 Frag Grenades!', 'loot');
        } else {
          if (!s.weapons.includes('pistol')) game.giveWeapon('pistol', 15);
          s.ammo.pistol += 30;
          s.ammo.shotgun += 12;
          s.grenades = (s.grenades ?? 0) + 1;
          game.msg('Shelter Locker: +30 9mm, +12 shells, +1 Frag Grenade!', 'loot');
        }
        audio.pickup();
      },
    },
    // Sub-Level Interactables (y = -4.0)
    {
      pos: new THREE.Vector3(-3.5, -4.0, -7.2),
      radius: 3.2,
      repeat: true,
      hold: 0.8,
      label: () => (filterPurgedDay === day ? 'Reactor & Air Recycler nominal today' : 'Purge Air Scrubber & Tune Reactor (-10 rads)'),
      action: () => {
        if (filterPurgedDay === day) return game.msg('Air scrubber already purged today.', 'info');
        filterPurgedDay = day;
        game.stats.radiation = Math.max(0, game.stats.radiation - 10);
        audio.pickup();
        game.msg('Purged HEPA dust collectors — ambient radiation dropped (-10 rads).', 'loot');
      },
    },
    {
      pos: new THREE.Vector3(5.8, -4.0, -7.6),
      radius: 3.2,
      repeat: true,
      hold: 0.8,
      label: () => (waterRefilledDay === day ? 'Filtration Tank recharging (Wait 1 Day)' : 'Purify & Bottle Reserve Water (+1 Water)'),
      action: () => {
        if (waterRefilledDay === day) return game.msg('Reserve tank refilling — come back tomorrow.', 'info');
        waterRefilledDay = day;
        game.stats.water += 1;
        audio.pickup();
        game.msg('Filled clean sealed water bottle from filtration bank (+1 water)', 'loot');
      },
    },
    {
      pos: new THREE.Vector3(5.5, -4.0, 5.2),
      radius: 3.2,
      repeat: true,
      hold: 0.9,
      label: () => (day - hydroHarvestDay < 2 ? 'Hydroponics maturing (Ready every 2 days)' : 'Harvest Hydroponic Greens (+1 Food Ration)'),
      action: () => {
        if (day - hydroHarvestDay < 2) return game.msg('Hydroponic trays need another day or two to grow.', 'info');
        hydroHarvestDay = day;
        game.stats.food += 1;
        audio.pickup();
        game.msg('Harvested fresh hydroponic produce (+1 food ration)', 'loot');
      },
    },
    {
      pos: new THREE.Vector3(-3.2, -4.0, 9.2),
      radius: 2.8,
      hold: 0.9,
      label: 'Open Deep Sump Footlocker (+Ammo & Grenades)',
      action: () => {
        if (sumpLooted) return;
        sumpLooted = true;
        game.stats.ammo.pistol += 24;
        game.stats.ammo.shotgun += 12;
        game.stats.grenades = (game.stats.grenades ?? 0) + 2;
        game.stats.meds += 1;
        audio.pickup();
        game.msg('Sump Footlocker: +24 9mm, +12 shells, +2 Frag Grenades, +1 Medkit!', 'loot');
      },
    },
    // Upper Mezzanine Interactables (y = +3.8)
    {
      pos: new THREE.Vector3(-5.5, 3.8, -10.0),
      radius: 3.0,
      repeat: true,
      hold: 0.5,
      label: 'Check Radio & 7-10 Rule Geiger Monitor',
      action: () => {
        const st = getStatus();
        audio.click();
        game.msg(
          `Day ${st.day}: Outside ${st.outside.toFixed(2)} R/hr (${st.risk}). Leaving now = x${st.mult.toFixed(1)} radiation exposure.`,
          'radio',
        );
      },
    },
    {
      pos: new THREE.Vector3(0, 3.8, -11.6),
      radius: 3.5,
      hold: 1.0,
      label: () => `Open Outer Blast Hatch & Head North -> Phase 3 (Day ${day}, Risk: ${getStatus().risk})`,
      action: () => {
        const st = getStatus();
        game.stats.exposureMult = st.mult;
        game.stats.shelterDays = day;
        game.stats.warmth = 100;
        audio.explosion(0.15);
        game.msg('Hydraulic bolts retract. Sunlight leaks in through ash clouds...', 'radio');
        game.completePhase();
      },
    },
    {
      pos: new THREE.Vector3(4.8, 3.8, -11.5),
      radius: 3.0,
      hold: 1.0,
      label: 'Calibrate Tactical Optics & Seal Hazmat Liners (+5% Dmg, -10% Rads, +45 XP)',
      action: () => {
        game.stats.damageMult = Number(((game.stats.damageMult ?? 1) + 0.05).toFixed(3));
        game.stats.radResistMult = Number(Math.max(0.45, (game.stats.radResistMult ?? 1) - 0.1).toFixed(3));
        game.gainXp(45, 'Optics & Hazmat Calibrated (+5% dmg, -10% rad uptake)');
        audio.pickup();
      },
    },
  );

  // Height resolver across Lower (-4.0), Main (0.0), and Upper (+3.8)
  const heightAt = (x, z, curY = 0) => {
    // West ramp: Main (0) <-> Lower (-4.0)
    if (x >= -13.7 && x <= -9.2 && z >= -7.8 && z <= 7.8) {
      const t = Math.max(0, Math.min(1, (7.5 - z) / 15.0));
      const ry = -4.0 * t;
      if (Math.abs(curY - ry) < 2.3) return ry;
    }
    // East ramp: Main (0) <-> Upper (+3.8)
    if (x >= 9.2 && x <= 13.7 && z >= -7.8 && z <= 7.8) {
      const t = Math.max(0, Math.min(1, (7.5 - z) / 15.0));
      const ry = 3.8 * t;
      if (Math.abs(curY - ry) < 2.3) return ry;
    }
    // Upper Mezzanine
    if (curY >= 2.4 && (z <= -4.5 || (x >= 9.2 && z >= 7.2))) {
      return 3.8;
    }
    // Main Concourse (skipping lower ramp shaft cutout)
    const inWestShaft = x < -9.2 && z > -7.8 && z < 7.8;
    if (curY >= -1.8 && !inWestShaft) {
      return 0.0;
    }
    return -4.0;
  };

  setTimeout(() => {
    if (game.phase !== 'shelter') return;
    game.msg(
      military
        ? 'MILITARY BUNKER 7: Explore all 3 levels! [E] Armory/Bunk/Sub-Level or press [B] anytime to rest 1 day.'
        : tunnel
          ? 'SECTOR-4 UNDERGROUND BUNKER: Stocked tunnel vault secured! Explore all 3 levels or press [B] to rest.'
          : 'FALLOUT SHELTER SEALED: Explore all 3 decks — [E] Bunk or [B] to wait out fallout, [E] Upper Hatch to leave.',
      'radio',
    );
  }, 50);

  let spin = 0;
  return {
    root,
    colliders,
    obstacles,
    interactables,
    ammoSpawns,
    bounds: 13.2,
    spawn: { x: 0, y: 0, z: 3.5, yaw: 0 },
    objective: {
      pos: new THREE.Vector3(0, 3.8, -12.0),
      label: 'Survive underground ([E] Bunk / [B] Wait Day), gear up & head to Upper Airlock Hatch',
    },
    heightAt,
    surfaceAt: () => 'bunker',
    ambientRad: () => 0,
    restDay,
    getShelterStatus: getStatus,
    update: (dt) => {
      spin += dt;
      rotor.rotation.x = spin * 5.5;
    },
  };
}
