import * as THREE from 'three';
import { Actor } from '../entities.js';
import { audio } from '../audio.js';
import { asphaltPBR, concretePBR, droughtPBR, facadePBR, gravelPBR, groundPBR, signTexture, smokeTexture } from '../textures.js';
import {
  beacon,
  Fire,
  isInPuddle,
  makeBunkerEntrance,
  makeCar,
  makeCityRuin,
  makeCrate,
  makeEnterableStore,
  makeForest,
  makeGroundClutter,
  makeHome,
  makeHospital,
  makeParkingGarage,
  makePuddles,
  makeRocks,
  makeStreetSign,
  pbrMat,
  texturedBox,
} from '../props.js';

const N = 6;
const CELL = 50;
const BLOCK = 36;
const HALF = (N * CELL) / 2; // 150
const STRIKE_TIME = 360;

const STORES = [
  {
    name: 'GUN SHOP',
    bg: '#161616',
    fg: '#ff3b2f',
    hold: 3.0,
    heat: 1.5,
    loot: (g) => {
      const s = g.stats;
      s.grenades = (s.grenades ?? 0) + 4;
      s.ammo.pistol += 36;
      if (!s.weapons.includes('shotgun')) {
        g.giveWeapon('shotgun', 24);
        return 'Pump Shotgun + 24 shells + 36 9mm + 4 Frag Grenades';
      }
      if (!s.weapons.includes('rifle')) {
        g.giveWeapon('rifle', 72);
        return 'AR-15 Rifle + 72 rounds + 36 9mm + 4 Frag Grenades';
      }
      s.ammo.rifle += 72;
      s.ammo.shotgun += 24;
      return 'Full Armory Cache + 4 Frag Grenades';
    },
  },
  {
    name: 'GROCERY',
    bg: '#1d6b2c',
    fg: '#ffffff',
    hold: 2.4,
    heat: 1,
    loot: (g) => {
      g.stats.food += 4;
      g.stats.water += 4;
      g.stats.cash += 140;
      return '4 canned food, 4 water, $140 from register';
    },
  },
  {
    name: 'PHARMACY',
    bg: '#ffffff',
    fg: '#0a7a3a',
    hold: 2.4,
    heat: 1,
    loot: (g) => {
      g.stats.meds += 3;
      g.stats.radpills += 3;
      return '3 medkits, 3 potassium iodide packs';
    },
  },
  {
    name: 'HARDWARE',
    bg: '#d65a12',
    fg: '#ffffff',
    hold: 2.4,
    heat: 1,
    loot: (g) => {
      g.stats.water += 2;
      g.stats.meds += 1;
      g.stats.ammo.shotgun += 16;
      g.stats.ammo.pistol += 15;
      g.stats.food += 1;
      g.stats.grenades = (g.stats.grenades ?? 0) + 2;
      return '2 water, medkit, 16 shells, 15 9mm, 2 grenades';
    },
  },
  {
    name: 'LIQUOR',
    bg: '#3a1650',
    fg: '#ffd84a',
    hold: 2.2,
    heat: 1,
    loot: (g) => {
      g.stats.water += 2;
      g.stats.food += 2;
      g.stats.cash += 260;
      return '$260, 2 drinks, 2 snacks';
    },
  },
  {
    name: 'PAWN SHOP',
    bg: '#0f2a4a',
    fg: '#f5c542',
    hold: 2.4,
    heat: 1,
    loot: (g) => {
      g.stats.cash += 180;
      if (!g.stats.weapons.includes('pistol')) {
        g.giveWeapon('pistol', 45);
        return '9mm Pistol, 45 rounds, $180';
      }
      g.stats.ammo.pistol += 45;
      g.stats.ammo.shotgun += 12;
      return '45 rds 9mm, 12 shells, $180';
    },
  },
  {
    name: 'BANK',
    bg: '#1b1f2a',
    fg: '#d4af37',
    hold: 5,
    heat: 2,
    loot: (g) => {
      g.stats.cash += 950;
      return '$950 from the vault';
    },
  },
];
const STORE_PLAN = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6];

function clonePbr(pbr, rx, ry) {
  const map = pbr.map.clone();
  map.needsUpdate = true;
  map.repeat.set(rx, ry);
  const normalMap = pbr.normalMap.clone();
  normalMap.needsUpdate = true;
  normalMap.repeat.set(rx, ry);
  const roughnessMap = pbr.roughnessMap ? pbr.roughnessMap.clone() : null;
  if (roughnessMap) {
    roughnessMap.needsUpdate = true;
    roughnessMap.repeat.set(rx, ry);
  }
  return { map, normalMap, roughnessMap };
}

export function buildCity(game) {
  const root = new THREE.Group();
  const colliders = [];
  const obstacles = [];
  const interactables = [];
  const policeCars = [];
  const fires = [];
  const skyPlumes = [];
  const interiorLights = [];
  const ammoSpawns = [];
  const hvacMats = [];
  const rnd = Math.random;

  const skyStart = {
    zenith: new THREE.Color(0x2563b8),
    horizon: new THREE.Color(0xc5e0f8),
    fog: new THREE.Color(0xb6cce0),
    cloudTint: new THREE.Color(0xffffff),
    cloudSecondary: new THREE.Color(0xa9c0d8),
  };
  const skyEnd = {
    zenith: new THREE.Color(0x3a4d74),
    horizon: new THREE.Color(0xe6b48c),
    fog: new THREE.Color(0x9f9288),
    cloudTint: new THREE.Color(0xf0dfd0),
    cloudSecondary: new THREE.Color(0x88766c),
  };

  game.setEnv({
    horizon: 0xc5e0f8,
    zenith: 0x2563b8,
    fog: 0xb6cce0,
    fogDensity: 0.0024,
    sunColor: 0xfff5dc,
    sunIntensity: 3.1,
    sunDir: [0.55, 0.72, 0.35],
    hemiSky: 0xd6eaff,
    hemiGround: 0x5c5346,
    hemiIntensity: 1.2,
    particles: null,
    exposure: 1.0,
    cloudTint: 0xffffff,
    cloudSecondary: 0xa9c0d8,
    cloudDensity: 0.44,
    cloudScale: 1.2,
    cloudSpeed: 0.008,
  });

  // Cutout shader helper so the NW Quarantine Underground Metro stairwell slices cleanly into the ground
  const applyPitCutout = (mat) => {
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = 'varying vec3 vCutPos;\n' + shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvCutPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
      shader.fragmentShader = 'varying vec3 vCutPos;\n' + shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\nif (vCutPos.x > -102.9 && vCutPos.x < -97.1 && vCutPos.z > -132.2 && vCutPos.z < -115.8) discard;',
      );
    };
  };

  // Ground: PBR asphalt & surrounding countryside (outskirts placed clearly below road to prevent depth bleed)
  const grPbr = clonePbr(groundPBR('grass'), 90, 90);
  const outskirtsMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: grPbr.map,
    normalMap: grPbr.normalMap,
    normalScale: new THREE.Vector2(1.4, 1.4),
    roughnessMap: grPbr.roughnessMap,
    roughness: 1.0,
  });
  applyPitCutout(outskirtsMat);
  const outskirts = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), outskirtsMat);
  outskirts.rotation.x = -Math.PI / 2;
  outskirts.position.y = -0.15;
  outskirts.receiveShadow = true;
  root.add(outskirts);

  const asp = clonePbr(asphaltPBR(), 44, 44);
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: asp.map,
    normalMap: asp.normalMap,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughnessMap: asp.roughnessMap,
    roughness: 1.0,
    metalness: 0.06,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  applyPitCutout(roadMat);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 24, HALF * 2 + 24), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  root.add(road);

  // Lane dashes + intersection crosswalk bars
  const dashGeo = new THREE.PlaneGeometry(0.22, 3);
  dashGeo.rotateX(-Math.PI / 2);
  const dashMat = new THREE.MeshStandardMaterial({
    color: 0xe6c34a,
    roughness: 0.8,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const dashes = [];
  for (let k = 0; k <= N; k++) {
    const c = -HALF + k * CELL;
    for (let z = -HALF; z < HALF; z += 7) {
      dashes.push(new THREE.Matrix4().makeTranslation(c, 0.02, z));
      dashes.push(new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(z, 0.02, c));
    }
  }
  const dashIM = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
  dashes.forEach((m, i) => dashIM.setMatrixAt(i, m));
  dashIM.receiveShadow = true;
  dashIM.computeBoundingSphere();
  root.add(dashIM);

  // Crosswalks at intersections
  const xwGeo = new THREE.PlaneGeometry(0.55, 2.8);
  xwGeo.rotateX(-Math.PI / 2);
  const xwMat = new THREE.MeshStandardMaterial({
    color: 0xc8c5bc,
    roughness: 0.85,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const xwMats = [];
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const ix = -HALF + i * CELL;
      const iz = -HALF + j * CELL;
      for (let s = -4; s <= 4; s += 2) {
        xwMats.push(new THREE.Matrix4().makeTranslation(ix + s, 0.022, iz + 6.5));
        xwMats.push(new THREE.Matrix4().makeTranslation(ix + s, 0.022, iz - 6.5));
      }
    }
  }
  const xwIM = new THREE.InstancedMesh(xwGeo, xwMat, xwMats.length);
  xwMats.forEach((m, i) => xwIM.setMatrixAt(i, m));
  xwIM.receiveShadow = true;
  xwIM.computeBoundingSphere();
  root.add(xwIM);

  // Reflective rainwater puddles across avenues & intersections (including spawn plaza puddles)
  const puddleList = [
    { x: -HALF + CELL * 3 + 2.8, y: 0.025, z: -HALF + CELL * 3 + 0.5, sx: 2.8, sz: 2.2, rotY: 0.35 },
    { x: -HALF + CELL * 3 - 4.2, y: 0.025, z: -HALF + CELL * 3 + 9.2, sx: 2.6, sz: 2.0, rotY: 1.1 },
  ];
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j < N; j++) {
      if (rnd() < 0.72) {
        const px = -HALF + i * CELL + (rnd() - 0.5) * 8;
        const pz = -HALF + CELL / 2 + j * CELL + (rnd() - 0.5) * 18;
        puddleList.push({ x: px, y: 0.025, z: pz, sx: 1.7 + rnd() * 2.3, sz: 1.3 + rnd() * 1.9, rotY: rnd() * Math.PI });
      }
      if (rnd() < 0.72) {
        const px = -HALF + CELL / 2 + j * CELL + (rnd() - 0.5) * 18;
        const pz = -HALF + i * CELL + (rnd() - 0.5) * 8;
        puddleList.push({ x: px, y: 0.025, z: pz, sx: 1.6 + rnd() * 2.2, sz: 1.3 + rnd() * 1.7, rotY: rnd() * Math.PI });
      }
    }
  }
  root.add(makePuddles(puddleList, false));

  // Crushed gravel shoulder aprons & utility gravel lots + sun-baked cracked drought earth patches
  const gravelZones = [];
  const droughtZones = [];
  const gravMat = pbrMat(gravelPBR(false), 32, 2, { roughness: 0.96 });
  const gravLotMat = pbrMat(gravelPBR(false), 6, 6, { roughness: 0.96 });
  const droughtMat = pbrMat(droughtPBR(), 7, 7, { roughness: 0.96 });

  const addGravelZone = (gx, gz, gw, gd, y = 0.015, mat = gravMat) => {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), mat);
    sh.rotation.x = -Math.PI / 2;
    sh.position.set(gx, y, gz);
    sh.receiveShadow = true;
    root.add(sh);
    gravelZones.push({ minX: gx - gw / 2, maxX: gx + gw / 2, minZ: gz - gd / 2, maxZ: gz + gd / 2 });
  };
  const addDroughtZone = (dx, dz, dw, dd, y = 0.012) => {
    const dp = new THREE.Mesh(new THREE.PlaneGeometry(dw, dd), droughtMat);
    dp.rotation.x = -Math.PI / 2;
    dp.position.set(dx, y, dz);
    dp.receiveShadow = true;
    root.add(dp);
    droughtZones.push({ minX: dx - dw / 2, maxX: dx + dw / 2, minZ: dz - dd / 2, maxZ: dz + dd / 2 });
  };

  for (const [gx, gz, gw, gd] of [
    [0, -HALF - 14.5, HALF * 2 + 24, 6.5],
    [0, HALF + 14.5, HALF * 2 + 24, 6.5],
    [-HALF - 14.5, 0, 6.5, HALF * 2 + 24],
    [HALF + 14.5, 0, 6.5, HALF * 2 + 24],
  ]) {
    addGravelZone(gx, gz, gw, gd);
  }
  // Visible gravel staging aprons & sun-baked cracked drought earth flats along road edges & city outskirts
  for (const [gx, gz, gw, gd] of [
    [4.4, -3.5, 4.4, 7.2],
    [-HALF - 26, -40, 18, 28],
    [HALF + 28, 35, 20, 26],
  ]) {
    addGravelZone(gx, gz, gw, gd, 0.018, gravLotMat);
  }
  for (const [dx, dz, dw, dd] of [
    [-4.4, -3.5, 4.4, 7.2],
    [-HALF - 42, 48, 34, 34],
    [HALF + 42, -55, 36, 32],
    [0, HALF + 36, 38, 28],
    [0, -HALF - 38, 36, 26],
  ]) {
    addDroughtZone(dx, dz, dw, dd, 0.016);
  }

  // Materials — 8 unique architectural facade styles with glossy window glazing roughnessMap
  const cPbr = concretePBR();
  const roofMat = new THREE.MeshStandardMaterial({
    map: cPbr.map,
    normalMap: cPbr.normalMap,
    roughnessMap: cPbr.roughnessMap,
    color: 0x6a6660,
    roughness: 1.0,
  });
  const facadeMats = [0, 1, 2, 3, 4, 5, 6, 7].map((s) => {
    const f = facadePBR(s);
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: f.map,
      normalMap: f.normalMap,
      normalScale: new THREE.Vector2(1.3, 1.3),
      roughnessMap: f.roughnessMap,
      emissiveMap: f.emissiveMap,
      emissive: 0xffffff,
      emissiveIntensity: 0.85,
      roughness: 1.0,
      metalness: 0.25,
      envMapIntensity: 1.8,
    });
  });
  const sidePbr = clonePbr(cPbr, 9, 9);
  const sideMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: sidePbr.map,
    normalMap: sidePbr.normalMap,
    roughnessMap: sidePbr.roughnessMap,
    roughness: 0.95,
  });

  // Shelter location (outskirts)
  const sides = [
    [0, HALF + 55, Math.PI],
    [0, -HALF - 55, 0],
    [HALF + 55, 0, -Math.PI / 2],
    [-HALF - 55, 0, Math.PI / 2],
  ];
  const side = sides[Math.floor(rnd() * 4)];
  const shelterPos = new THREE.Vector3(side[0] + (rnd() - 0.5) * 120, 0, side[1] + (rnd() - 0.5) * 120);
  if (Math.abs(side[0]) > 0) shelterPos.x = side[0];
  else shelterPos.z = side[1];
  const blastDir = shelterPos.clone().setY(0).normalize().multiplyScalar(-1);
  const blastPos = blastDir.clone().multiplyScalar(1250);

  // Dense perimeter greenwoods forest belt + curbside avenue trees so foliage frames the city
  const outerPineTrees = [];
  const outerBurntTrees = [];
  const outerRocks = [];
  const cityGroves = [];
  for (let i = 0; i < 620; i++) {
    const ang = (i / 620) * Math.PI * 2 + (rnd() - 0.5) * 0.08;
    const rad = HALF + 28 + rnd() * 235;
    const tx = Math.cos(ang) * rad;
    const tz = Math.sin(ang) * rad;
    if (Math.hypot(tx - shelterPos.x, tz - shelterPos.z) < 20) continue;
    if (Math.hypot(tx - convoyPosAvoid(shelterPos).x, tz - convoyPosAvoid(shelterPos).z) < 16) continue;
    if (Math.abs(tx + 100) < 10 && tz < -112 && tz > -220) continue;
    const tr = { x: tx, y: -0.15, z: tz, s: 0.8 + rnd() * 0.85 };
    if (i % 5 === 0) outerBurntTrees.push(tr);
    else {
      outerPineTrees.push(tr);
      if (i % 3 === 0) {
        cityGroves.push({ x: tx + (rnd() - 0.5) * 4, y: -0.15, z: tz + (rnd() - 0.5) * 4, s: 0.72 + rnd() * 0.65 });
      }
    }
  }
  // Avenue sidewalk planter trees throughout the downtown core
  const parkClutterOuter = [];
  for (let a = 1; a < N; a++) {
    for (let s = 0; s < N; s++) {
      const roadC = -HALF + a * CELL;
      const segC = -HALF + CELL / 2 + s * CELL;
      for (const sideS of [-1, 1]) {
        if (rnd() < 0.52) {
          const tx = roadC + sideS * 7.6;
          const tz = segC + (rnd() - 0.5) * 14;
          if (Math.abs(tx + 100) < 9 && tz < -110 && tz > -140) continue;
          outerPineTrees.push({ x: tx, y: 0.18, z: tz, s: 0.62 + rnd() * 0.25 });
          colliders.push({ minX: tx - 0.32, maxX: tx + 0.32, minZ: tz - 0.32, maxZ: tz + 0.32 });
        }
      }
    }
  }
  for (let i = 0; i < 240; i++) {
    const ang = rnd() * Math.PI * 2;
    const rad = HALF + 24 + rnd() * 190;
    parkClutterOuter.push({ x: Math.cos(ang) * rad, y: -0.15, z: Math.sin(ang) * rad, s: 0.8 + rnd() * 0.75 });
  }
  for (let i = 0; i < 85; i++) {
    const ang = rnd() * Math.PI * 2;
    const rad = HALF + 65 + rnd() * 190;
    const rx = Math.cos(ang) * rad;
    const rz = Math.sin(ang) * rad;
    if (Math.hypot(rx - shelterPos.x, rz - shelterPos.z) < 18) continue;
    outerRocks.push({ x: rx, y: -0.15, z: rz, s: 1.2 + rnd() * 3.0 });
  }
  root.add(makeForest([...outerPineTrees, ...cityGroves], 'pine'));
  root.add(makeForest(outerBurntTrees, 'burnt'));
  root.add(makeRocks(outerRocks, 0x625d56));
  root.add(makeGroundClutter(parkClutterOuter, 'grass'));

  const parkGrass = clonePbr(groundPBR('grass'), 8, 8);
  const lawnMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: parkGrass.map,
    normalMap: parkGrass.normalMap,
    roughness: 0.95,
  });

  // Park block, Mercy Hospital (3, 2), Parking Garage (1, 1), Quarantine Yard (0, 0)
  const hospI = 3;
  const hospJ = 2;
  const garageI = 1;
  const garageJ = 1;
  const yardI = 0;
  const yardJ = 0;
  const parkI = 1 + Math.floor(rnd() * 2);
  const parkJ = 3;
  const storeLots = [];
  const homeLots = [];
  let hospital = null;
  let garage = null;
  let heliInteract = null;
  let missionState = 'idle';
  let hospTimer = 0;

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const cx = -HALF + CELL / 2 + i * CELL;
      const cz = -HALF + CELL / 2 + j * CELL;
      const sw = texturedBox(BLOCK, 0.18, BLOCK, sideMat, 4);
      sw.position.set(cx, 0.09, cz);
      sw.castShadow = false;
      root.add(sw);

      if (i === yardI && j === yardJ) {
        // NW Quarantine Maintenance Yard (gravel + drought lot staging area for the underground metro shaft)
        addGravelZone(cx, cz, BLOCK - 4, BLOCK - 4, 0.21, gravLotMat);
        for (const [bx, bz] of [
          [cx - 12, cz - 12],
          [cx + 12, cz + 12],
          [cx - 12, cz + 12],
        ]) {
          const cr = makeCrate(true);
          cr.position.set(bx, 0.24, bz);
          root.add(cr);
        }
        interactables.push({
          pos: new THREE.Vector3(cx - 12, 0.24, cz + 12),
          radius: 3.0,
          label: 'Loot Quarantine Guard Crate (+36 5.56, +12 Shells, +2 Grenades)',
          hold: 1.2,
          action: () => {
            if (!game.stats.weapons.includes('rifle')) game.giveWeapon('rifle', 36);
            else game.stats.ammo.rifle += 36;
            game.stats.ammo.shotgun += 12;
            game.stats.grenades = (game.stats.grenades ?? 0) + 2;
            audio.pickup();
            game.msg('Quarantine Crate: +36 5.56, +12 shells, +2 Frag Grenades!', 'loot');
          },
        });
        continue;
      }

      if (i === garageI && j === garageJ) {
        garage = makeParkingGarage(colliders, obstacles, cx, 0.18, cz, 0);
        root.add(garage.group);
        interactables.push({
          pos: garage.armoryPos,
          radius: 3.2,
          label: 'Loot Rooftop SWAT Armory Crate (+60 5.56, +18 Shells, +2 Grenades, +2 Medkits)',
          hold: 1.4,
          action: () => {
            if (!game.stats.weapons.includes('rifle')) game.giveWeapon('rifle', 60);
            else game.stats.ammo.rifle += 60;
            game.stats.ammo.shotgun += 18;
            game.stats.grenades = (game.stats.grenades ?? 0) + 2;
            game.stats.meds += 2;
            audio.pickup();
            game.msg('SWAT Cache: +60 5.56, +18 shells, +2 Grenades, +2 Medkits!', 'loot');
          },
        });
        continue;
      }

      if (i === hospI && j === hospJ) {
        hospital = makeHospital(colliders, obstacles, cx, 0.18, cz, -Math.PI / 2);
        root.add(hospital.group);
        interiorLights.push(
          { pos: new THREE.Vector3(cx, 2.8, cz), color: 0xdbeafe, intensity: 22 },
          { pos: new THREE.Vector3(cx, 10.8, cz), color: 0xe0f2fe, intensity: 18 },
        );
        ammoSpawns.push({ pos: new THREE.Vector3(cx - 5, 0.18, cz - 2), kind: 'rifle', amount: 30, grenade: 1 });

        const amb = makeCar(0xf8fafc, false);
        amb.position.set(cx - 21.5, 0, cz + 6.5);
        amb.rotation.y = Math.PI * 0.06;
        root.add(amb);
        obstacles.push(amb);
        colliders.push({ minX: amb.position.x - 1.1, maxX: amb.position.x + 1.1, minZ: amb.position.z - 2.3, maxZ: amb.position.z + 2.3 });

        interactables.push({
          pos: hospital.medLootPos,
          radius: 3.0,
          label: 'Raid Hospital Pharmacy (+2 Medkits, +2 Rad-X)',
          hold: 1.4,
          action: () => {
            game.stats.meds += 2;
            game.stats.radpills += 2;
            audio.pickup();
            game.msg('Hospital Pharmacy: +2 medkits, +2 Rad-X packs', 'loot');
          },
        });

        interactables.push({
          pos: hospital.labLootPos,
          radius: 3.0,
          label: 'Loot Bio-Lab Security Crate (+3 Grenades, Rifle & +60 Ammo)',
          hold: 1.4,
          action: () => {
            game.stats.grenades = (game.stats.grenades ?? 0) + 3;
            if (!game.stats.weapons.includes('rifle')) game.giveWeapon('rifle', 60);
            else game.stats.ammo.rifle += 60;
            game.stats.ammo.shotgun += 24;
            audio.pickup();
            game.msg('Bio-Lab Cache: +3 Frag Grenades, +60 5.56 & +24 shells!', 'loot');
          },
        });

        heliInteract = {
          pos: hospital.heliPos,
          radius: 6.5,
          label: 'Board Medevac Helicopter -> Fly to Stocked Military Bunker',
          hold: 0.4,
          action: () => {
            missionState = 'done';
            levelObj.missionTimer = 0;
            levelObj.missionLabel = null;
            game.startHeliEscape(hospital.heli);
          },
        };
        interactables.push(heliInteract);
        continue;
      }

      if (i === parkI && j === parkJ) {
        const gp = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK - 4, BLOCK - 4), lawnMat);
        gp.rotation.x = -Math.PI / 2;
        gp.position.set(cx, 0.195, cz);
        gp.receiveShadow = true;
        root.add(gp);
        addGravelZone(cx, cz, BLOCK - 5, 3.6, 0.21, gravLotMat);
        addGravelZone(cx, cz, 3.6, BLOCK - 5, 0.21, gravLotMat);
        addDroughtZone(cx - 9.5, cz + 9.5, 9.5, 9.5, 0.205);

        const trees = [];
        const clutter = [];
        for (let t = 0; t < 16; t++) {
          const tx = cx + (rnd() - 0.5) * 27;
          const tz = cz + (rnd() - 0.5) * 27;
          if (Math.hypot(tx - cx, tz - cz) < 6) continue;
          trees.push({ x: tx, y: 0.18, z: tz, s: 0.72 + rnd() * 0.42 });
          colliders.push({ minX: tx - 0.4, maxX: tx + 0.4, minZ: tz - 0.4, maxZ: tz + 0.4 });
        }
        for (let c = 0; c < 40; c++) {
          const gx = cx + (rnd() - 0.5) * 29;
          const gz = cz + (rnd() - 0.5) * 29;
          if (Math.hypot(gx - cx, gz - cz) < 4.5) continue;
          clutter.push({ x: gx, y: 0.19, z: gz, s: 0.7 + rnd() * 0.6 });
        }
        root.add(makeForest(trees, 'park'));
        root.add(makeGroundClutter(clutter, 'park'));

        const fountain = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.8, 0.8, 24), sideMat);
        fountain.position.set(cx, 0.5, cz);
        fountain.castShadow = fountain.receiveShadow = true;
        const basinWater = new THREE.Mesh(
          new THREE.CircleGeometry(3.2, 24),
          new THREE.MeshStandardMaterial({ color: 0x26383a, roughness: 0.08, metalness: 0.65 }),
        );
        basinWater.rotation.x = -Math.PI / 2;
        basinWater.position.set(cx, 0.92, cz);
        root.add(fountain, basinWater);
        obstacles.push(fountain);
        colliders.push({ minX: cx - 3.3, maxX: cx + 3.3, minZ: cz - 3.3, maxZ: cz + 3.3 });

        const van = makeCar(0x111111);
        van.position.set(cx + BLOCK / 2 + 3, 0, cz + 8);
        root.add(van);
        obstacles.push(van);
        colliders.push({ minX: van.position.x - 1, maxX: van.position.x + 1, minZ: van.position.z - 2.2, maxZ: van.position.z + 2.2 });
        const dealer = new Actor('civilian', van.position.x - 2, van.position.z);
        dealer.speed = 0;
        dealer.looted = true;
        dealer.update = () => {};
        root.add(dealer.group);
        dealer.group.rotation.y = -Math.PI / 2;
        addDealer(game, interactables, new THREE.Vector3(van.position.x - 2, 0, van.position.z));
        continue;
      }

      for (let lx = 0; lx < 2; lx++) {
        for (let lz = 0; lz < 2; lz++) {
          const ox = cx + (lx - 0.5) * 18;
          const oz = cz + (lz - 0.5) * 18;
          const edge = i === 0 || j === 0 || i === N - 1 || j === N - 1;
          const outer = edge || i === 1 || j === 1 || i === N - 2 || j === N - 2;
          const face = rnd() < 0.5 ? [lx ? 1 : -1, 0] : [0, lz ? 1 : -1];
          if (rnd() < 0.34 && storeLots.length < 28) {
            storeLots.push({ x: ox, z: oz, face, outer });
            continue;
          }
          if ((edge && rnd() < 0.6) || (outer && rnd() < 0.25)) {
            homeLots.push({ x: ox, z: oz, face });
            continue;
          }
          if (outer && (i + j + lx + lz) % 5 === 0) {
            const [rfx, rfz] = face;
            const ruin = makeCityRuin(i * 7 + j * 3 + lx + lz, colliders, obstacles, ox, 0.18, oz, Math.atan2(rfx, rfz), false);
            root.add(ruin.group);
            interactables.push({
              pos: ruin.lootPos,
              radius: 2.8,
              label: 'Scavenge bombed ruin rubble',
              hold: 1.5,
              action: () => {
                audio.pickup();
                game.stats.ammo.pistol += 15;
                game.stats.food += 1;
                game.gainXp(25);
                game.msg('City Ruin: +15 9mm rounds, +1 canned food', 'loot');
              },
            });
            continue;
          }
          const dist = Math.hypot(cx, cz) / HALF;
          const w = 13 + rnd() * 3;
          const d = 13 + rnd() * 3;
          const h = 10 + rnd() * (edge ? 12 : 22) + Math.max(0, 1 - dist) * 45 * rnd();
          const mat = facadeMats[Math.floor(rnd() * facadeMats.length)];
          const b = texturedBox(w, h, d, [mat, mat, roofMat, roofMat, mat, mat]);
          b.position.set(ox, h / 2 + 0.18, oz);
          root.add(b);
          obstacles.push(b);
          colliders.push({ minX: ox - w / 2, maxX: ox + w / 2, minZ: oz - d / 2, maxZ: oz + d / 2 });

          if (h >= 12) {
            hvacMats.push(
              new THREE.Matrix4()
                .makeScale(2.1 + rnd() * 1.4, 1.1 + rnd() * 0.6, 1.8 + rnd() * 1.2)
                .setPosition(ox + (rnd() - 0.5) * 4, h + 0.7, oz + (rnd() - 0.5) * 4),
            );
          }

          if (h > 30 && rnd() < 0.5) {
            const ant = new THREE.Mesh(
              new THREE.CylinderGeometry(0.1, 0.15, 8),
              new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.4 }),
            );
            ant.position.set(ox, h + 4, oz);
            root.add(ant);
            const blink = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshBasicMaterial({ color: 0xff2200 }));
            blink.position.set(ox, h + 8.2, oz);
            root.add(blink);
          }
        }
      }
    }
  }

  // Enterable Stores with furnished interiors
  storeLots.sort(() => rnd() - 0.5);
  storeLots.forEach((lot, idx) => {
    const def = idx < STORE_PLAN.length ? STORES[STORE_PLAN[idx]] : null;
    if (!def) {
      if (lot.outer && homeLots.length < 22) {
        homeLots.push({ x: lot.x, z: lot.z, face: lot.face });
        return;
      }
      const w = 14.5;
      const d = 14.5;
      const h = 8 + rnd() * 6;
      const mat = facadeMats[Math.floor(rnd() * facadeMats.length)];
      const b = texturedBox(w, h, d, [mat, mat, roofMat, roofMat, mat, mat]);
      b.position.set(lot.x, h / 2 + 0.18, lot.z);
      root.add(b);
      obstacles.push(b);
      colliders.push({ minX: lot.x - w / 2, maxX: lot.x + w / 2, minZ: lot.z - d / 2, maxZ: lot.z + d / 2 });
      return;
    }

    const [fx, fz] = lot.face;
    const rotY = Math.atan2(fx, fz);
    const store = makeEnterableStore(def, facadeMats[idx % facadeMats.length], roofMat, colliders, obstacles, lot.x, 0.18, lot.z, rotY);
    root.add(store.group);
    interiorLights.push({ pos: new THREE.Vector3(lot.x, 3.2, lot.z), color: 0xfff0d4, intensity: 16 });

    interactables.push({
      pos: store.interactPos,
      radius: 3.4,
      label: `Rob ${def.name} (crime)`,
      hold: def.hold,
      action: () => {
        const got = def.loot(game);
        game.stats.crimes++;
        game.stats.storesRobbed++;
        game.wanted = Math.min(5, game.wanted + def.heat);
        game.alarm = 10;
        audio.glass();
        audio.alarm();
        store.glassMat.emissiveIntensity = 0.05;
        store.glassMat.color.set(0x050505);
        game.msg(`Robbed ${def.name}: ${got}`, 'loot');
        if (game.wanted >= 1) game.msg(`Alarm tripped! Wanted level ${Math.floor(game.wanted)}`, 'alert');
      },
    });
  });

  // Residential Homes with porches, lawns & walkable furnished interiors
  let firstHomeView = null;
  const addHomeLot = (lot, seed) => {
    const [fx, fz] = lot.face;
    const rotY = Math.atan2(fx, fz);
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), lawnMat);
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(lot.x, 0.19, lot.z);
    lawn.receiveShadow = true;
    root.add(lawn);

    const home = makeHome(seed, roofMat, colliders, obstacles, lot.x, 0.18, lot.z, rotY);
    root.add(home.group);
    interiorLights.push({ pos: new THREE.Vector3(lot.x, 2.7, lot.z), color: 0xffdeb0, intensity: 15 });
    const hGrass = [];
    for (let g = 0; g < 16; g++) {
      hGrass.push({ x: lot.x + (rnd() - 0.5) * 14, y: 0.19, z: lot.z + (rnd() - 0.5) * 14, s: 0.65 + rnd() * 0.45 });
    }
    root.add(makeGroundClutter(hGrass, 'park'));
    if (!firstHomeView) {
      firstHomeView = {
        x: lot.x + Math.sin(rotY) * 2.5,
        y: 0.18,
        z: lot.z + Math.cos(rotY) * 2.5,
        yaw: rotY,
      };
    }

    interactables.push({
      pos: home.interactPos,
      radius: 2.8,
      label: 'Search home pantry & drawers',
      hold: 2.0,
      action: () => {
        audio.pickup();
        const s = game.stats;
        const got = [];
        if (rnd() < 0.78) {
          const f = 1 + Math.floor(rnd() * 2);
          s.food += f;
          got.push(`${f} canned food`);
        }
        if (rnd() < 0.78) {
          const w = 1 + Math.floor(rnd() * 2);
          s.water += w;
          got.push(`${w} bottled water`);
        }
        if (rnd() < 0.45) {
          s.meds += 1;
          got.push('first aid kit');
        }
        if (rnd() < 0.35) {
          s.radpills += 1;
          got.push('Rad-X pills');
        }
        if (rnd() < 0.65) {
          const c = 25 + Math.floor(rnd() * 75);
          s.cash += c;
          got.push(`$${c}`);
        }
        if (!s.weapons.includes('pistol') && rnd() < 0.45) {
          game.giveWeapon('pistol', 24);
          got.push('bedside 9mm Pistol + 24 rds');
        } else if (rnd() < 0.65) {
          s.ammo.pistol += 24;
          s.ammo.shotgun += 8;
          got.push('24 9mm + 8 shells');
        }
        game.msg('Home: ' + (got.length ? got.join(', ') : 'already picked clean'), got.length ? 'loot' : 'info');
      },
    });
  };
  homeLots.forEach((lot, i) => addHomeLot(lot, i + 1));

  // Parked cars along roads
  const carColors = [0x8a1c1c, 0x1c3a8a, 0xdedede, 0x222222, 0x6a6a6a, 0x2a5a3a, 0xa08a3a, 0x5a2a6a];
  for (let k = 0; k <= N; k++) {
    const c = -HALF + k * CELL;
    for (let seg = 0; seg < N; seg++) {
      const base = -HALF + CELL / 2 + seg * CELL;
      for (let n = 0; n < 2; n++) {
        if (rnd() < 0.45) continue;
        const along = base + (rnd() - 0.5) * 26;
        const lane = rnd() < 0.5 ? -4.6 : 4.6;
        const vertical = rnd() < 0.5;
        const x = vertical ? c + lane : along;
        const z = vertical ? along : c + lane;
        if (Math.abs(x + 100) < 6 && z < -110 && z > -138) continue;
        const police = rnd() < 0.08;
        const car = makeCar(police ? 0x111111 : carColors[Math.floor(rnd() * carColors.length)], false, police);
        car.position.set(x, 0, z);
        car.rotation.y = (vertical ? 0 : Math.PI / 2) + (rnd() < 0.5 ? Math.PI : 0) + (rnd() - 0.5) * 0.15;
        root.add(car);
        obstacles.push(car);
        if (police) policeCars.push(car);
        const hw = vertical ? 1.05 : 2.2;
        const hd = vertical ? 2.2 : 1.05;
        colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
        const side2 = vertical ? new THREE.Vector3(Math.sign(-lane) * 1.8, 0, 0) : new THREE.Vector3(0, 0, Math.sign(-lane) * 1.8);
        interactables.push({
          pos: car.position.clone().add(side2),
          radius: 2.5,
          label: police ? 'Break into police cruiser (crime)' : 'Break into car (crime)',
          hold: 1.2,
          action: () => {
            audio.glass();
            game.stats.crimes++;
            game.wanted = Math.min(5, game.wanted + (police ? 1 : 0.25));
            game.alarm = 4;
            const s = game.stats;
            const r = rnd();
            let got = '';
            if (police) {
              s.grenades = (s.grenades ?? 0) + 2;
              s.ammo.pistol += 24;
              if (!s.weapons.includes('shotgun')) {
                game.giveWeapon('shotgun', 18);
                got = 'Shotgun + 18 shells + 24 9mm + 2 Frag Grenades';
              } else {
                s.ammo.shotgun += 16;
                s.meds++;
                got = '24 9mm, 16 shells, medkit, 2 Frag Grenades';
              }
            } else if (r < 0.15) got = '';
            else if (r < 0.35) {
              s.water++;
              s.ammo.pistol += 15;
              got = 'bottle of water + 15 rds 9mm';
            } else if (r < 0.5) {
              s.food++;
              got = 'granola bars';
            } else if (r < 0.65) {
              const c2 = 30 + Math.floor(rnd() * 80);
              s.cash += c2;
              got = '$' + c2;
            } else if (r < 0.9) {
              s.ammo.pistol += 24;
              got = '24 rounds 9mm';
              if (!s.weapons.includes('pistol')) {
                game.giveWeapon('pistol', 15);
                got = 'Glovebox 9mm Pistol + 39 rds!';
              }
            } else {
              s.meds++;
              s.ammo.shotgun += 8;
              got = 'first aid kit + 8 shells';
            }
            if (got) {
              audio.pickup();
              game.msg('Car break-in: ' + got, 'loot');
            } else game.msg('Car break-in: nothing useful', 'info');
          },
        });
      }
    }
  }

  // Street lamps
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 7, 6);
  poleGeo.translate(0, 3.5, 0);
  const poles = new THREE.InstancedMesh(
    poleGeo,
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.75, roughness: 0.4 }),
    (N + 1) * (N + 1),
  );
  const lampGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const lamps = new THREE.InstancedMesh(
    lampGeo,
    new THREE.MeshStandardMaterial({ color: 0xf8f3e4, emissive: 0xffd080, emissiveIntensity: 0.45 }),
    (N + 1) * (N + 1),
  );
  let li = 0;
  for (let a = 0; a <= N; a++) {
    for (let c = 0; c <= N; c++) {
      const x = -HALF + a * CELL + 8;
      const z = -HALF + c * CELL + 8;
      poles.setMatrixAt(li, new THREE.Matrix4().makeTranslation(x, 0, z));
      lamps.setMatrixAt(li, new THREE.Matrix4().makeTranslation(x, 7.1, z));
      li++;
    }
  }
  poles.castShadow = true;
  poles.computeBoundingSphere();
  lamps.computeBoundingSphere();
  root.add(poles, lamps);

  // Rooftop HVAC chiller units & corner sidewalk steel bollards
  if (hvacMats.length > 0) {
    const hvacGeo = new THREE.BoxGeometry(1, 1, 1);
    const hvacIM = new THREE.InstancedMesh(hvacGeo, new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.65, roughness: 0.48 }), hvacMats.length);
    hvacMats.forEach((m, i) => hvacIM.setMatrixAt(i, m));
    hvacIM.castShadow = true;
    hvacIM.computeBoundingSphere();
    root.add(hvacIM);
  }
  const bolGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.85, 8);
  bolGeo.translate(0, 0.425, 0);
  const bolIM = new THREE.InstancedMesh(bolGeo, new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.5, roughness: 0.4 }), (N + 1) * (N + 1) * 2);
  let bi = 0;
  for (let a = 0; a <= N; a++) {
    for (let c = 0; c <= N; c++) {
      const x = -HALF + a * CELL;
      const z = -HALF + c * CELL;
      bolIM.setMatrixAt(bi++, new THREE.Matrix4().makeTranslation(x - 7.4, 0.18, z - 7.4));
      bolIM.setMatrixAt(bi++, new THREE.Matrix4().makeTranslation(x + 7.4, 0.18, z + 7.4));
    }
  }
  bolIM.count = bi;
  bolIM.computeBoundingSphere();
  root.add(bolIM);

  // Burning wrecks + distant smoke plumes
  const smokeTex = smokeTexture();
  for (let f = 0; f < 5; f++) {
    const fx = -HALF + Math.floor(rnd() * (N + 1)) * CELL + (rnd() - 0.5) * 6;
    const fz = -HALF + CELL / 2 + Math.floor(rnd() * N) * CELL + (rnd() - 0.5) * 20;
    const wreck = makeCar(0x333333, true);
    wreck.position.set(fx, 0, fz);
    wreck.rotation.y = rnd() * 6;
    root.add(wreck);
    obstacles.push(wreck);
    colliders.push({ minX: fx - 1.8, maxX: fx + 1.8, minZ: fz - 1.8, maxZ: fz + 1.8 });
    const fire = new Fire(false);
    fire.group.position.set(fx, 0.55, fz);
    fire.group.scale.setScalar(1.85);
    root.add(fire.group);
    fires.push(fire);

    // Tall rising smoke column visible over rooftops
    const plume = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: smokeTex, color: 0x221d1b, transparent: true, opacity: 0.42, depthWrite: false }),
    );
    plume.position.set(fx, 18, fz);
    plume.scale.set(16, 36, 1);
    root.add(plume);
    skyPlumes.push({ sprite: plume, baseX: fx, baseZ: fz, phase: rnd() * 6 });
  }

  // Street Military Ammo Drops (make ammo easy to gather across town)
  for (const [ax, az] of [
    [-HALF + CELL * 3 + 9, -HALF + CELL * 3 + 7], // right near player spawn!
    [-HALF + CELL * 2 + 8, -HALF + CELL * 2 - 8],
    [-HALF + CELL * 4 - 8, -HALF + CELL * 2 + 8],
    [-HALF + CELL * 2 - 8, -HALF + CELL * 4 + 8],
    [-HALF + CELL * 4 + 8, -HALF + CELL * 4 - 8],
    [-106, -112], // outside Quarantine Tunnel approach
  ]) {
    const cr = makeCrate(true);
    cr.position.set(ax, 0, az);
    root.add(cr);
    const flare = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
    flare.position.set(ax, 0.9, az);
    root.add(flare);
    interactables.push({
      pos: new THREE.Vector3(ax, 0, az),
      radius: 2.6,
      label: 'Loot Street Military Ammo Crate (+Gun/Ammo + Grenade)',
      hold: 0.7,
      action: () => {
        const s = game.stats;
        if (!s.weapons.includes('pistol')) game.giveWeapon('pistol', 30);
        else s.ammo.pistol += 30;
        s.ammo.shotgun += 12;
        s.ammo.rifle += 36;
        s.grenades = (s.grenades ?? 0) + 1;
        flare.visible = false;
        audio.pickup();
        game.msg('Ammo Crate: +30 9mm, +12 shells, +36 5.56, +1 Frag Grenade!', 'loot');
      },
    });
  }

  ammoSpawns.push(
    { pos: new THREE.Vector3(-HALF + CELL * 3 + 5, 0, -HALF + CELL * 3 - 4), kind: 'pistol', amount: 24 },
    { pos: new THREE.Vector3(-75, 0.18, -62), kind: 'shotgun', amount: 12 },
    { pos: new THREE.Vector3(-100, -5.6, -155), kind: 'rifle', amount: 36, grenade: 1 },
  );

  // ---------------- HARD-TO-GET-TO UNDERGROUND METRO & UTILITY TUNNELS (x = -100, z = -116 -> -215, y = -5.6) ----------------
  const tunX = -100;
  const tunFloorY = -5.6;
  const tunWallMat = pbrMat(cPbr, 14, 1.4, {
    color: 0x868a86,
    emissive: 0x161410,
    emissiveIntensity: 0.35,
    roughness: 0.92,
  });
  const tunFloorMat = pbrMat(cPbr, 2, 16, { color: 0x4b4e4a, roughness: 0.92 });
  const tunRibMat = new THREE.MeshStandardMaterial({ color: 0x2f3337, roughness: 0.85, metalness: 0.25 });
  const railSteel = new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.85, roughness: 0.35 });
  const addTunBox = (tx, ty, tz, tw, th, td, mat, collide = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(tw, th, td), mat);
    m.position.set(tx, ty, tz);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    obstacles.push(m);
    if (collide) {
      colliders.push({
        minX: tx - tw / 2,
        maxX: tx + tw / 2,
        minZ: tz - td / 2,
        maxZ: tz + td / 2,
        minY: tunFloorY - 0.5,
        maxY: 2.0,
      });
    }
    return m;
  };

  // Perimeter barricades & toxic barrels around the NW Quarantine Tunnel Pit (hard-to-get-to approach!)
  for (const [bx, bz, bw, bd] of [
    [tunX - 4.2, -124, 0.8, 17],
    [tunX + 4.2, -124, 0.8, 17],
    [tunX, -133, 9.2, 0.8],
    [tunX - 3.0, -115.2, 3.2, 1.0],
    [tunX + 3.0, -115.2, 3.2, 1.0],
  ]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, 1.25, bd), sideMat);
    bar.position.set(bx, 0.62, bz);
    root.add(bar);
    obstacles.push(bar);
    colliders.push({ minX: bx - bw / 2, maxX: bx + bw / 2, minZ: bz - bd / 2, maxZ: bz + bd / 2, minY: 0, maxY: 2.4 });
  }
  const radZonePos = new THREE.Vector3(tunX - 4.5, 0, -117);
  for (const [rx, rz] of [
    [tunX - 4.5, -117],
    [tunX + 4.5, -118],
    [tunX - 5.2, -121],
  ]) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 10), new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.5 }));
    drum.position.set(rx, 0.55, rz);
    root.add(drum);
  }
  const gantry = new THREE.Mesh(new THREE.BoxGeometry(8.8, 1.4, 0.5), new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.7 }));
  gantry.position.set(tunX, 3.2, -115.5);
  const gTex = signTexture('QUARANTINE METRO TUNNEL ↓', '#7c2d12', '#fef3c7');
  const gSign = new THREE.Mesh(
    new THREE.PlaneGeometry(7.2, 1.1),
    new THREE.MeshStandardMaterial({ map: gTex, emissive: 0xffffff, emissiveMap: gTex, emissiveIntensity: 0.65 }),
  );
  gSign.position.set(tunX, 3.2, -115.2);
  root.add(gantry, gSign);

  // Concrete Descent Ramp: z from -116 (y = 0) down to -132 (y = -5.6)
  const rampLen = Math.hypot(16.0, 5.6);
  const rampMesh = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.35, rampLen), tunFloorMat);
  rampMesh.position.set(tunX, tunFloorY / 2 - 0.16, -124.0);
  rampMesh.rotation.x = Math.atan2(5.6, 16.0);
  rampMesh.receiveShadow = true;
  root.add(rampMesh);
  obstacles.push(rampMesh);
  // Pit retaining side walls
  addTunBox(tunX - 3.1, -2.8, -124.0, 0.6, 5.8, 16.4, tunWallMat, true);
  addTunBox(tunX + 3.1, -2.8, -124.0, 0.6, 5.8, 16.4, tunWallMat, true);

  // Enclosed Subterranean Metro Tunnel Hall: x in [-103.5..-96.5], z in [-132..-215], floor y = -5.6, ceil y = -1.6
  addTunBox(tunX, tunFloorY - 0.15, -173.5, 8.2, 0.3, 84, tunFloorMat, false);
  addTunBox(tunX, -1.45, -173.5, 8.2, 0.4, 84, tunWallMat, false);
  addTunBox(tunX - 3.8, -3.5, -173.5, 0.6, 4.4, 84, tunWallMat, true);
  addTunBox(tunX + 3.8, -3.5, -173.5, 0.6, 4.4, 84, tunWallMat, true);
  addTunBox(tunX, -3.5, -215.5, 8.2, 4.4, 0.6, tunWallMat, true);

  // Subway steel rails, crossties, concrete rib arches & ceiling lights along underground tunnel
  for (const rx of [tunX - 1.1, tunX + 1.1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 82), railSteel);
    rail.position.set(rx, tunFloorY + 0.06, -173);
    root.add(rail);
  }
  const tieGeo = new THREE.BoxGeometry(2.8, 0.08, 0.22);
  for (let tz = -134; tz >= -212; tz -= 2.4) {
    const tie = new THREE.Mesh(tieGeo, tunRibMat);
    tie.position.set(tunX, tunFloorY + 0.03, tz);
    root.add(tie);
  }
  const tBulb = new THREE.MeshBasicMaterial({ color: 0xfca5a5 });
  for (let lz = -138; lz >= -210; lz -= 14) {
    addTunBox(tunX - 3.3, -3.5, lz, 0.36, 4.0, 0.45, tunRibMat);
    addTunBox(tunX + 3.3, -3.5, lz, 0.36, 4.0, 0.45, tunRibMat);
    addTunBox(tunX, -1.75, lz, 6.8, 0.35, 0.45, tunRibMat, false);
    const fix = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.3), tBulb);
    fix.position.set(tunX, -1.94, lz);
    root.add(fix);
    if (lz === -145 || lz === -173 || lz === -205) {
      const pl = new THREE.PointLight(0xffb478, 18, 22, 1.4);
      pl.position.set(tunX, -2.5, lz);
      root.add(pl);
    }
  }

  // Subterranean Armory Cache inside Tunnel + Sector-4 Deep Blast Door (Escape Route 3!)
  const tunCrate = makeCrate(true);
  tunCrate.position.set(tunX + 2.3, tunFloorY, -172);
  root.add(tunCrate);
  interactables.push({
    pos: new THREE.Vector3(tunX + 2.0, tunFloorY, -172),
    radius: 3.0,
    label: 'Loot Metro Spec-Ops Crate (+72 5.56, +24 Shells, +3 Grenades, +2 Medkits)',
    hold: 1.0,
    action: () => {
      if (!game.stats.weapons.includes('rifle')) game.giveWeapon('rifle', 72);
      else game.stats.ammo.rifle += 72;
      game.stats.ammo.shotgun += 24;
      game.stats.grenades = (game.stats.grenades ?? 0) + 3;
      game.stats.meds += 2;
      audio.pickup();
      game.msg('Metro Spec-Ops Cache: +72 5.56, +24 shells, +3 Frag Grenades!', 'loot');
    },
  });

  const secDoor = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.35, 22), railSteel);
  secDoor.rotation.x = Math.PI / 2;
  secDoor.position.set(tunX, tunFloorY + 1.85, -214.9);
  const secWheel = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 8, 16), new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.85 }));
  secWheel.position.set(tunX, tunFloorY + 1.85, -214.65);
  root.add(secDoor, secWheel);

  interactables.push({
    pos: new THREE.Vector3(tunX, tunFloorY, -212.5),
    radius: 3.6,
    label: 'Seal Sector-4 Deep Vault Hatch -> Escape Underground',
    hold: 1.4,
    action: () => {
      game.stats.bunkerTier = 'tunnel';
      game.stats.health = Math.max(game.stats.health, 1);
      audio.explosion(0.18);
      game.msg('You breach and seal the Sector-4 Deep Underground Vault! Safe beneath the metro.', 'radio');
      game.completePhase();
    },
  });

  // ---------------- ESCAPE ROUTE 4: HIGHWAY 9 ARMORED NATIONAL GUARD CONVOY ----------------
  const convoyPos = new THREE.Vector3(-shelterPos.x, 0, -shelterPos.z);
  const convoyRot = Math.atan2(-convoyPos.x, -convoyPos.z);
  const convoyGrp = new THREE.Group();
  convoyGrp.position.copy(convoyPos);
  convoyGrp.rotation.y = convoyRot;
  const apcMat = new THREE.MeshStandardMaterial({ color: 0x3f4a32, roughness: 0.78, metalness: 0.25 });
  const apcHull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 6.8), apcMat);
  apcHull.position.set(0, 1.4, 0);
  const apcTurret = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.8), apcMat);
  apcTurret.position.set(0, 2.8, 0.6);
  const cCrate = makeCrate(true);
  cCrate.position.set(-2.6, 0, 1.5);
  convoyGrp.add(apcHull, apcTurret, cCrate);
  root.add(convoyGrp);
  obstacles.push(convoyGrp);
  colliders.push({ minX: convoyPos.x - 2.6, maxX: convoyPos.x + 2.6, minZ: convoyPos.z - 2.6, maxZ: convoyPos.z + 2.6, minY: 0, maxY: 4 });
  const cBeacon = beacon(0x38bdf8);
  cBeacon.position.copy(convoyPos).add(new THREE.Vector3(3.5, 0, 0));
  root.add(cBeacon);

  const convoyGuards = [];
  interactables.push({
    pos: convoyPos.clone().add(new THREE.Vector3(0, 0, 0).addScaledVector(new THREE.Vector3(-convoyPos.x, 0, -convoyPos.z).normalize(), 4.2)),
    radius: 3.8,
    repeat: true,
    hold: 1.2,
    label: () => {
      const aliveGuards = convoyGuards.filter((a) => !a.dead).length;
      if (aliveGuards === 0) return 'Board Armored Guard APC -> Evacuate to Military Bunker 7';
      return game.stats.cash >= 200
        ? `Bribe Convoy Escort ($200) or kill ${aliveGuards} scavengers -> Evacuate`
        : `Clear ${aliveGuards} scavengers (or bring $200) to board Guard APC`;
    },
    action: () => {
      const aliveGuards = convoyGuards.filter((a) => !a.dead).length;
      if (aliveGuards > 0) {
        if (game.stats.cash < 200) {
          game.msg(`Neutralize the ${aliveGuards} hostile scavengers or bring $200!`, 'alert');
          return;
        }
        game.stats.cash -= 200;
      }
      game.stats.bunkerTier = 'military';
      audio.pickup();
      game.msg('Armored Convoy departs Highway 9 — delivering you to Military Bunker 7!', 'radio');
      game.completePhase();
    },
  });

  // Shelter (walkable reinforced bunker interior)
  const bunkerRotY = Math.atan2(-shelterPos.x, -shelterPos.z);
  const bunker = makeBunkerEntrance('FALLOUT SHELTER', colliders, obstacles, shelterPos.x, 0, shelterPos.z, bunkerRotY);
  root.add(bunker);
  const toCity = new THREE.Vector3(-shelterPos.x, 0, -shelterPos.z).normalize();
  const bc = beacon(0xffcc33);
  bc.position.copy(shelterPos).addScaledVector(toCity, 6.4);
  root.add(bc);
  interactables.push({
    pos: bunker.userData.interactPos,
    radius: 3.4,
    label: () => (game.timer > 60 ? `Seal Fallout Shelter hatch — ${Math.ceil(game.timer)}s of looting left!` : 'Seal Fallout Shelter hatch & go underground'),
    hold: 1.5,
    action: () => {
      game.stats.health = Math.max(game.stats.health, 1);
      const view = shelterPos.clone().addScaledVector(toCity, 6).setY(6);
      game.msg('You seal the bunker blast hatch as the sky turns white...', 'alert');
      game.startNuke(view, blastPos, true);
    },
  });

  // City intersection & evacuation street signs
  const citySigns = [
    { x: -HALF + CELL * 3 - 6.6, z: -HALF + CELL * 3 - 8.5, t: 'MERCY HOSPITAL ↗', s: 'ROOFTOP HELIPAD EVAC', bg: '#1e3a8a', fg: '#ffffff', rot: -0.35 },
    { x: -HALF + CELL * 3 + 6.6, z: -HALF + CELL * 3 - 8.5, t: 'MAIN ST & 3RD AVE', s: 'DOWNTOWN CORE', bg: '#154734', fg: '#f8fafc', rot: 0.35 },
    { x: -91, z: -96, t: 'QUARANTINE METRO ↓', s: 'SECTOR-4 TUNNEL AHEAD', bg: '#7c2d12', fg: '#fef3c7', rot: -0.25 },
    { x: -64, z: -50, t: 'CITY PARKING DECK ←', s: 'SWAT ROOFTOP CACHE', bg: '#1f2937', fg: '#fbbf24', rot: 0.35 },
    { x: shelterPos.x * 0.65, z: shelterPos.z * 0.65, t: 'FALLOUT SHELTER ↑', s: 'CIVIL DEFENSE BUNKER', bg: '#3f3f1d', fg: '#fde047', rot: Math.atan2(-shelterPos.x, -shelterPos.z) },
    { x: convoyPos.x * 0.68, z: convoyPos.z * 0.68, t: 'HWY 9 EVAC CONVOY ↑', s: 'NATIONAL GUARD APC', bg: '#1e3a5f', fg: '#e0f2fe', rot: Math.atan2(-convoyPos.x, -convoyPos.z) },
  ];
  for (const cs of citySigns) {
    const sgn = makeStreetSign(cs.t, cs.s, { bg: cs.bg, fg: cs.fg, width: 3.1, height: 1.15, postH: 3.0 });
    sgn.position.set(cs.x, 0, cs.z);
    sgn.rotation.y = cs.rot;
    root.add(sgn);
  }

  // NPCs
  const randomStreetPos = (minD, maxD) => {
    for (let tries = 0; tries < 40; tries++) {
      const k = Math.floor(rnd() * (N + 1));
      const along = (rnd() - 0.5) * HALF * 2;
      const pos =
        rnd() < 0.5
          ? new THREE.Vector3(-HALF + k * CELL + (rnd() - 0.5) * 8, 0, along)
          : new THREE.Vector3(along, 0, -HALF + k * CELL + (rnd() - 0.5) * 8);
      const d = pos.distanceTo(game.pos);
      if (d >= minD && d <= maxD) return pos;
    }
    return new THREE.Vector3(-HALF, 0, -HALF);
  };

  const spawnX = -HALF + CELL * 3;
  const spawnZ = -HALF + CELL * 3 + 4;
  game.pos.set(spawnX, 0, spawnZ);
  const startHospitalMission = () => {
    if (missionState !== 'idle' || !hospital) return;
    missionState = 'active';
    hospTimer = 90;
    levelObj.missionTimer = hospTimer;
    levelObj.missionLabel = 'CHOPPER EVAC RUSH';
    levelObj.objective = {
      pos: hospital.heliPos,
      label: 'TIME RUSH: Fight up Mercy Hospital stair ramps -> board Rooftop Helicopter!',
    };
    audio.alarm();
    game.msg('MEDEVAC CHOPPER ON HOSPITAL ROOF DEPARTS IN 90s! Invade Mercy Hospital to evacuate to Military Bunker 7!', 'alert');
  };

  setTimeout(() => {
    if (game.phase !== 'city') return;
    for (let c = 0; c < 26; c++) {
      const p = randomStreetPos(8, 200);
      game.addActor(new Actor('civilian', p.x, p.z));
    }
    for (let c = 0; c < 2; c++) {
      const p = randomStreetPos(50, 200);
      game.addActor(new Actor('police', p.x, p.z));
    }
    // 4 Quarantine Yard Raiders guarding the Underground Tunnel Pit
    for (const [qx, qz] of [
      [-108, -118],
      [-105, -128],
      [-115, -120],
      [-94, -120],
    ]) {
      const qr = new Actor('raider', qx, qz);
      qr.range = 24;
      game.addActor(qr, 0);
    }
    // 3 Tunnel Raiders patrolling underground in Sector 4 Metro Tunnel
    for (const tz of [-148, -172, -196]) {
      const tr = new Actor('raider', tunX, tz);
      tr.range = 28;
      game.addActor(tr, tunFloorY);
    }
    // 3 Convoy Raiders at Highway 9 APC
    for (const [dx, dz] of [
      [-4, 4],
      [4, 4],
      [0, -5],
    ]) {
      const cr = new Actor('raider', convoyPos.x + dx, convoyPos.z + dz);
      convoyGuards.push(game.addActor(cr, 0));
    }
    // Parking Garage top-deck Raiders
    if (garage) {
      for (const [gx, gy, gz] of [
        [2, 7.6, 4],
        [-3, 7.6, -3],
      ]) {
        const gp = garage.localToWorld(gx, gy, gz);
        game.addActor(new Actor('raider', gp.x, gp.z), gp.y);
      }
    }
    if (hospital) {
      const guardSpots = [
        [-4, 0.18, 4],
        [4, 0.18, -4],
        [-3, 4.18, 2],
        [3, 4.18, -4],
        [-4, 8.18, 3],
        [3, 8.18, -3],
        [-4, 12.18, 4],
        [4, 12.18, -5],
      ];
      for (const [lx, ly, lz] of guardSpots) {
        const wp = hospital.localToWorld(lx, ly, lz);
        const r = new Actor('raider', wp.x, wp.z);
        r.range = 24;
        r.accuracy = 0.35;
        game.addActor(r, wp.y);
      }
    }
  }, 0);

  game.timer = STRIKE_TIME;
  const broadcasts = [
    [STRIKE_TIME - 0.5, 'EMERGENCY ALERT SYSTEM: Ballistic missile threat inbound. Seek shelter immediately. THIS IS NOT A DRILL.', 'alert'],
    [STRIKE_TIME - 6, 'Radio KXRN: 4 ESCAPE ROUTES — Public Fallout Shelter, Mercy Hospital Chopper, NW Quarantine Metro Tunnels, or Highway 9 Guard Convoy!', 'radio'],
    [STRIKE_TIME - 20, 'Radio KXRN: A Medevac chopper just landed on MERCY HOSPITAL ROOF! Enter Mercy Hospital to trigger the 90s evac rush!', 'radio'],
    [STRIKE_TIME - 38, 'Radio KXRN: Rumors say the heavily guarded NW Quarantine Metro Tunnel leads straight to Deep Sector-4 Vault.', 'radio'],
    [STRIKE_TIME - 75, 'National Guard: Highway 9 APC Convoy holding at the far edge of town. Watch for looters near the Parking Deck.', 'radio'],
    [180, 'AIR RAID SIRENS ACTIVATED. Three minutes to estimated impact.', 'alert'],
    [90, 'NORAD: Launch confirmed. Impact in 90 seconds. Get underground NOW.', 'alert'],
    [30, '30 SECONDS. TAKE COVER. TAKE COVER.', 'alert'],
  ];
  let bIdx = 0;
  let spawnCd = 3;
  let flick = 0;
  let sirenOn = false;

  const levelObj = {
    root,
    colliders,
    obstacles,
    interactables,
    interiorLights,
    ammoSpawns,
    bounds: HALF + 120,
    spawn: { x: spawnX, z: spawnZ, yaw: 0 },
    bunkerView: {
      x: bunker.userData.interactPos.x + Math.sin(bunkerRotY) * 4.5,
      y: 0,
      z: bunker.userData.interactPos.z + Math.cos(bunkerRotY) * 4.5,
      yaw: bunkerRotY,
    },
    tunnelView: {
      x: tunX,
      y: tunFloorY,
      z: -140,
      yaw: 0,
    },
    garageView: {
      x: -75,
      y: 0.18,
      z: -56,
      yaw: 0,
    },
    homeView: firstHomeView,
    missionTimer: 0,
    missionLabel: null,
    startHospitalMission,
    objective: { pos: shelterPos, label: 'Loot weapons & ammo, invade Mercy Hospital, brave NW Underground Tunnels, or reach Fallout Shelter / Highway Convoy' },
    heightAt: (x, z, curY = 0) => {
      // Underground Metro Tunnel & Stair Ramp (x in [-103.5..-96.5], z in [-215..-115.8])
      if (x >= tunX - 3.6 && x <= tunX + 3.6 && z >= -215.2 && z <= -115.6) {
        if (z >= -132.0 && curY >= -6.2) {
          const t = Math.max(0, Math.min(1, (-116.0 - z) / 16.0));
          const ry = t * tunFloorY;
          if (Math.abs(curY - ry) < 2.6 || curY < -0.5) return ry;
        }
        if (z < -132.0 && curY < -1.5) return tunFloorY;
      }
      const hh = hospital ? hospital.heightAt(x, z, curY) : null;
      if (hh !== null) return hh;
      const gh = garage ? garage.heightAt(x, z, curY) : null;
      if (gh !== null) return gh;
      const lx = (((x + HALF) % CELL) + CELL) % CELL;
      const lz = (((z + HALF) % CELL) + CELL) % CELL;
      const inCity = Math.abs(x) < HALF && Math.abs(z) < HALF;
      return inCity && lx > (CELL - BLOCK) / 2 && lx < CELL - (CELL - BLOCK) / 2 && lz > (CELL - BLOCK) / 2 && lz < CELL - (CELL - BLOCK) / 2 ? 0.18 : 0;
    },
    surfaceAt: (x, z, curY = 0) => {
      if (curY < -0.5 || curY > 1.0) return 'concrete';
      if (isInPuddle(puddleList, x, z, 0.15)) return 'puddle';
      for (const gz of gravelZones) {
        if (x >= gz.minX && x <= gz.maxX && z >= gz.minZ && z <= gz.maxZ) return 'gravel';
      }
      for (const dz of droughtZones) {
        if (x >= dz.minX && x <= dz.maxX && z >= dz.minZ && z <= dz.maxZ) return 'drought';
      }
      const inCity = Math.abs(x) < HALF && Math.abs(z) < HALF;
      if (!inCity) return 'grass';
      const lx = (((x + HALF) % CELL) + CELL) % CELL;
      const lz = (((z + HALF) % CELL) + CELL) % CELL;
      const onBlock = lx > (CELL - BLOCK) / 2 && lx < CELL - (CELL - BLOCK) / 2 && lz > (CELL - BLOCK) / 2 && lz < CELL - (CELL - BLOCK) / 2;
      if (onBlock) {
        const bi = Math.floor((x + HALF) / CELL);
        const bj = Math.floor((z + HALF) / CELL);
        if (bi === parkI && bj === parkJ) return 'grass';
        return 'concrete';
      }
      return 'asphalt';
    },
    ambientRad: (x, z) => {
      const d = Math.hypot(x - radZonePos.x, z - radZonePos.z);
      if (d < 16) return 0.25 * (1 - d / 16);
      return 0;
    },
    update: (dt) => {
      game.timer -= dt;
      while (bIdx < broadcasts.length && game.timer <= broadcasts[bIdx][0]) {
        game.msg(broadcasts[bIdx][1], broadcasts[bIdx][2]);
        if (broadcasts[bIdx][2] === 'alert') audio.alarm();
        bIdx++;
      }
      if (game.timer < 180 && !sirenOn) {
        sirenOn = true;
        audio.startSiren();
      }
      if (sirenOn) audio.setSiren(0.06 + (1 - game.timer / 180) * 0.12);
      if (game.timer <= 0) {
        game.timer = 0;
        const view = game.pos.clone().setY(game.pos.y + 1.65);
        game.startNuke(view, blastPos, false);
        return;
      }

      if (missionState === 'idle' && hospital && hospital.lobbyTriggerPos.distanceTo(game.pos) < 10.5) {
        startHospitalMission();
      }
      if (missionState === 'active') {
        hospTimer -= dt;
        levelObj.missionTimer = Math.max(0, hospTimer);
        if (hospTimer <= 0) {
          missionState = 'missed';
          levelObj.missionTimer = 0;
          levelObj.missionLabel = null;
          if (hospital) hospital.heli.visible = false;
          if (heliInteract) heliInteract.done = true;
          levelObj.objective = { pos: shelterPos, label: 'Chopper departed! Reach the FALLOUT SHELTER before the strike' };
          audio.alarm();
          game.msg('MEDEVAC CHOPPER DEPARTED WITHOUT YOU! Head to the outskirts FALLOUT SHELTER!', 'alert');
        }
      }

      flick += dt;
      const on = Math.floor(flick * 6) % 2 === 0;
      for (const pc of policeCars) {
        const [r, b] = pc.userData.siren;
        r.emissiveIntensity = on ? 3 : 0.1;
        b.emissiveIntensity = on ? 0.1 : 3;
      }
      if (hospital) {
        if (hospital.heli.visible) {
          hospital.heli.userData.mainRotor.rotation.y += dt * (missionState === 'active' ? 18 : 7);
          hospital.heli.userData.tailRotor.rotation.x += dt * 24;
        }
        for (const bm of hospital.beacons) bm.material.emissiveIntensity = on ? 3.2 : 0.4;
      }
      fires.forEach((f) => f.update(dt));
      skyPlumes.forEach((sp) => {
        sp.sprite.position.x = sp.baseX + Math.sin(flick * 0.4 + sp.phase) * 2.5;
        sp.sprite.position.y = 18 + Math.sin(flick * 0.6 + sp.phase) * 1.5;
      });
      bunker.userData.lamp.material.emissiveIntensity = Math.floor(flick * 2) % 2 ? 4 : 0.5;

      const prog = Math.min(1, Math.max(0, 1 - game.timer / STRIKE_TIME));
      const dm = game.dome?.material;
      if (dm) {
        dm.uniforms.uZenith.value.copy(skyStart.zenith).lerp(skyEnd.zenith, prog);
        dm.uniforms.uHorizon.value.copy(skyStart.horizon).lerp(skyEnd.horizon, prog);
        dm.uniforms.uCloudTint.value.copy(skyStart.cloudTint).lerp(skyEnd.cloudTint, prog);
        dm.uniforms.uCloudSecondary.value.copy(skyStart.cloudSecondary).lerp(skyEnd.cloudSecondary, prog);
        dm.uniforms.uCloudDensity.value = 0.44 + prog * 0.22;
        dm.uniforms.uCloudSpeed.value = 0.008 + prog * 0.008;
      }
      if (game.scene.fog) {
        game.scene.fog.color.copy(skyStart.fog).lerp(skyEnd.fog, prog);
        if (game.scene.background instanceof THREE.Color) game.scene.background.copy(game.scene.fog.color);
      }

      if (game.alarm <= 0 && game.wanted > 0) game.wanted = Math.max(0, game.wanted - dt * 0.035);
      spawnCd -= dt;
      const cops = game.actors.filter((a) => a.kind === 'police' && !a.dead).length;
      const target = game.wanted >= 1 ? Math.min(5, Math.ceil(game.wanted)) : 2;
      if (spawnCd <= 0 && cops < target) {
        spawnCd = game.wanted >= 3 ? 6 : 10;
        const p = randomStreetPos(55, 110);
        const cop = game.addActor(new Actor('police', p.x, p.z));
        if (game.wanted >= 1) cop.aggro = true;
      }
      const civs = game.actors.filter((a) => a.kind === 'civilian' && !a.dead).length;
      if (civs < 20 && rnd() < dt * 0.5) {
        const p = randomStreetPos(70, 140);
        game.addActor(new Actor('civilian', p.x, p.z));
      }
    },
  };
  return levelObj;
}

function addDealer(game, list, pos) {
  const s = () => game.stats;
  const offers = [
    { name: 'AR-15 Rifle + 45 rds', price: 240, ok: () => !s().weapons.includes('rifle'), give: () => game.giveWeapon('rifle', 45) },
    { name: 'Pump Shotgun + 16 shells', price: 140, ok: () => !s().weapons.includes('shotgun'), give: () => game.giveWeapon('shotgun', 16) },
    { name: 'Frag Grenades x3', price: 75, ok: () => (s().grenades ?? 0) < 10, give: () => (s().grenades = (s().grenades ?? 0) + 3) },
    { name: '9mm Pistol + 30 rds', price: 70, ok: () => !s().weapons.includes('pistol'), give: () => game.giveWeapon('pistol', 30) },
    { name: 'Gas mask filters & Rad-X x3', price: 65, ok: () => s().radpills < 6, give: () => (s().radpills += 3) },
    { name: '45 rds 5.56', price: 45, ok: () => s().weapons.includes('rifle'), give: () => (s().ammo.rifle += 45) },
    { name: '16 shotgun shells', price: 35, ok: () => s().weapons.includes('shotgun'), give: () => (s().ammo.shotgun += 16) },
    {
      name: 'Military MRE x2 + water x2',
      price: 45,
      ok: () => true,
      give: () => {
        s().food += 2;
        s().water += 2;
      },
    },
  ];
  const next = () => offers.find((o) => o.ok() && o.price <= s().cash) || null;
  list.push({
    pos,
    radius: 3,
    repeat: true,
    hold: 0.6,
    label: () => {
      const o = next();
      return o ? `Black-market dealer: buy ${o.name} ($${o.price})` : `Dealer: "Come back with more cash." (you have $${s().cash})`;
    },
    action: () => {
      const o = next();
      if (!o) return;
      s().cash -= o.price;
      o.give();
      audio.pickup();
      game.msg(`Bought ${o.name} for $${o.price}`, 'loot');
    },
  });
}

function convoyPosAvoid(shelterPos) {
  return { x: -shelterPos.x, z: -shelterPos.z };
}

