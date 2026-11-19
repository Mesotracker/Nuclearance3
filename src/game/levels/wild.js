import * as THREE from 'three';
import { Actor } from '../entities.js';
import { audio } from '../audio.js';
import { resolveTerminalHack } from '../rules.js';
import { difficultyMods } from '../types.js';
import { asphaltPBR, barkPBR, concretePBR, droughtPBR, fbm, gravelPBR, groundPBR, mulberry32, signTexture } from '../textures.js';
import {
  beacon,
  Fire,
  isInPuddle,
  makeCar,
  makeCityRuin,
  makeCrate,
  makeEnterableCabin,
  makeForest,
  makeGroundClutter,
  makeHome,
  makeOutpost,
  makePuddles,
  makeRadSign,
  makeRocks,
  makeStreetSign,
  makeWatchtower,
  pbrMat,
} from '../props.js';

const SIZE = 1000;
const SEG = 200;
const HALF = SIZE / 2;

export function buildWild(game, winter) {
  const root = new THREE.Group();
  const colliders = [];
  const obstacles = [];
  const interactables = [];
  const fireObjs = [];
  const firePos = [];
  const interiorLights = [];
  const ammoSpawns = [];
  const rnd = mulberry32(winter ? 777 : 4242);
  const R = Math.random;

  if (winter) {
    game.setEnv({
      horizon: 0xb6c6d6,
      zenith: 0x1e3044,
      fog: 0xa6b6c6,
      fogDensity: 0.0112,
      sunColor: 0xe0efff,
      sunIntensity: 1.38,
      sunDir: [-0.45, 0.44, -0.65],
      rimColor: 0x8db8e8,
      rimIntensity: 0.68,
      hemiSky: 0xc6d6e8,
      hemiGround: 0x627080,
      hemiIntensity: 1.25,
      particles: 'snow',
      exposure: 1.0,
      cloudTint: 0x9ab0c4,
      cloudSecondary: 0x5e6e7e,
      cloudDensity: 0.88,
      cloudScale: 1.85,
      cloudSpeed: 0.024,
    });
  } else {
    game.setEnv({
      horizon: 0xc27e48,
      zenith: 0x241914,
      fog: 0x987255,
      fogDensity: 0.0066,
      sunColor: 0xff7b34,
      sunIntensity: 2.0,
      sunDir: [0.6, 0.3, -0.55],
      rimColor: 0x7a96b8,
      rimIntensity: 0.52,
      hemiSky: 0xb8906e,
      hemiGround: 0x382e25,
      hemiIntensity: 1.08,
      particles: 'ash',
      exposure: 1.02,
      cloudTint: 0x7c5842,
      cloudSecondary: 0x3b2a20,
      cloudDensity: 0.72,
      cloudScale: 1.55,
      cloudSpeed: 0.013,
    });
  }

  // ---- winding road + precomputed blast craters ----
  const roadX = (z) => Math.sin(z * 0.006) * 60 + Math.sin(z * 0.017 + 1) * 14;
  const mountain = (z) => (winter ? Math.pow(Math.max(0, (-z + 150) / 650), 2) * 90 : 0);

  const hotZones = [];
  const zoneCount = winter ? 4 : 6;
  for (let i = 0; i < zoneCount; i++) {
    const z = HALF - 120 - i * ((SIZE - 260) / zoneCount) - rnd() * 40;
    const x = roadX(z) + (rnd() < 0.5 ? -1 : 1) * (14 + rnd() * 32);
    const r = 24 + rnd() * 18;
    hotZones.push({ x, z, r, peak: winter ? 1.6 : 2.6 });
  }

  // Hard-to-get-to off-road Underground Mine Canyon coordinates & Watchtower pads
  const mineX = Math.round(roadX(-120) - 72);
  const mineMouthZ = -120;
  const mineTunnelEndZ = -210;
  // Intentional hot radiation crater guarding the canyon mouth approach to the mine
  hotZones.push({ x: mineX + 26, z: -102, r: 16, peak: winter ? 1.5 : 2.3 });

  const tower1X = Math.round(roadX(160) + 19);
  const tower1Z = 160;
  const tower2X = Math.round(roadX(-170) - 19);
  const tower2Z = -170;

  // Outpost & Highway Service Station coordinates (main road + alternate paths)
  const outpostSpecs = [
    { style: 'service', x: Math.round(roadX(320) + 17), z: 320, rotY: -Math.PI / 2 },
    { style: 'ranger', x: Math.round(roadX(35) - 17), z: 35, rotY: Math.PI / 2 },
    { style: 'relay', x: mineX + 18, z: mineMouthZ + 22, rotY: -Math.PI * 0.65 },
    { style: 'service', x: Math.round(roadX(-250) + 17), z: -250, rotY: -Math.PI / 2 },
    { style: 'ranger', x: Math.round(roadX(-HALF + 72) + 24), z: -HALF + 96, rotY: -Math.PI / 2 },
  ];

  const rawH = (x, z) => {
    let h = fbm(x * 0.0045 + (winter ? 50 : 10), z * 0.0045, 5) * 72 - 32;
    h += mountain(z);
    if (winter) h += Math.pow(fbm(x * 0.012 + 3, z * 0.012, 3), 2) * 30 * Math.min(1, Math.max(0, -z / 400));
    const edgeDist = Math.max(Math.abs(x), Math.abs(z)) / HALF;
    if (edgeDist > 0.85) {
      h += Math.pow((edgeDist - 0.85) / 0.15, 2) * 28;
    }
    return h;
  };

  const roadH = (z) => {
    let s = 0;
    for (let k = -2; k <= 2; k++) s += rawH(roadX(z + k * 12), z + k * 12);
    return Math.max(s / 5, winter ? -9 : -12);
  };

  const mineBaseY = Math.max(winter ? -11 : -10, roadH(mineMouthZ) + 2.5);
  const mineFloorY = mineBaseY - 5.2;

  const H = (x, z) => {
    const d = Math.abs(x - roadX(z));
    const base = rawH(x, z);
    const t = Math.min(1, Math.max(0, (d - 6) / 22));
    const tt = t * t * (3 - 2 * t);
    let h = roadH(z) * (1 - tt) + base * tt;

    // Flatten canyon pad at Underground Mine mouth & keep ground well above tunnel ceiling further north
    const dmX = Math.abs(x - mineX);
    if (dmX < 18 && z >= -138 && z <= -96) {
      const mDist = Math.hypot((x - mineX) / 14, (z - mineMouthZ) / 14);
      if (mDist < 1.35) {
        const mt = Math.max(0, Math.min(1, 1 - mDist / 1.35));
        const smooth = mt * mt * (3 - 2 * mt);
        h = h * (1 - smooth) + mineBaseY * smooth;
      }
    }
    if (dmX < 14 && z >= -215 && z <= -135) {
      h = Math.max(h, mineFloorY + 6.4);
    }

    // Flatten watchtower foundation pads
    for (const [tx, tz] of [
      [tower1X, tower1Z],
      [tower2X, tower2Z],
    ]) {
      const wd = Math.hypot(x - tx, z - tz);
      if (wd < 9.5) {
        const padH = Math.max(roadH(tz), -11);
        const wt = Math.max(0, Math.min(1, (9.5 - wd) / 4.5));
        const smooth = wt * wt * (3 - 2 * wt);
        h = h * (1 - smooth) + padH * smooth;
      }
    }

    // Flatten Outpost / Service Station foundation pads
    for (const op of outpostSpecs) {
      const od = Math.hypot(x - op.x, z - op.z);
      if (od < 13.5) {
        const padH = Math.max(roadH(op.z), -11);
        const ot = Math.max(0, Math.min(1, (13.5 - od) / 5.0));
        const smooth = ot * ot * (3 - 2 * ot);
        h = h * (1 - smooth) + padH * smooth;
      }
    }

    // Carve physical 3D blast craters with raised ejecta rims
    for (const hz of hotZones) {
      const cd = Math.hypot(x - hz.x, z - hz.z);
      const u = cd / (hz.r * 0.82);
      if (u < 1.35) {
        if (u < 0.85) {
          const bowl = 1 - Math.pow(u / 0.85, 2);
          h -= bowl * 6.8;
        } else {
          const rim = Math.sin(((u - 0.85) / 0.5) * Math.PI);
          h += Math.max(0, rim) * 1.9;
        }
      }
    }
    return h;
  };

  const WATER = winter ? -16 : -15;

  // ---- terrain mesh with slope, crater & shoreline PBR coloring ----
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const heights = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = H(x, z);
    heights[i] = h;
    pos.setY(i, h);
  }
  geo.computeVertexNormals();

  const norm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const cBase = new THREE.Color(winter ? 0xf2f6fa : 0x8c7b63);
  const cDrought = new THREE.Color(winter ? 0xcad6e2 : 0xb89668);
  const cRock = new THREE.Color(winter ? 0x626b75 : 0x4b433a);
  const cVeg = new THREE.Color(winter ? 0xd0dae5 : 0x525d36);
  const cChar = new THREE.Color(0x1e1915);
  const cWet = new THREE.Color(winter ? 0x9aaec0 : 0x2b2922);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ny = norm.getY(i); // 1 = flat, < 0.78 = steep rock face
    const n = fbm(x * 0.03, z * 0.03, 3);
    const dryPatch = fbm(x * 0.018 + 21, z * 0.018 - 9, 3);
    const c = cBase.clone().lerp(cVeg, Math.max(0, (n - 0.32) * 1.45));
    if (!winter && dryPatch < 0.48) {
      const dk = Math.min(1, (0.48 - dryPatch) * 2.6);
      c.lerp(cDrought, dk * 0.75);
    }

    // Steep slope granite exposure
    const slope = Math.max(0, Math.min(1, (0.86 - ny) / 0.25));
    c.lerp(cRock, slope);

    // Shoreline darkening
    if (y < WATER + 1.8) {
      const wet = Math.max(0, Math.min(1, 1 - (y - WATER) / 1.8));
      c.lerp(cWet, wet * 0.7);
    }

    // Crater scorch darkening
    for (const hz of hotZones) {
      const cd = Math.hypot(x - hz.x, z - hz.z);
      if (cd < hz.r * 1.1) {
        const scorch = Math.pow(1 - cd / (hz.r * 1.1), 1.4);
        c.lerp(cChar, scorch * (winter ? 0.65 : 0.88));
      }
    }

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const gPbr = groundPBR(winter ? 'snow' : 'burnt');
  const gMap = gPbr.map.clone();
  gMap.needsUpdate = true;
  gMap.repeat.set(140, 140);
  const gNorm = gPbr.normalMap.clone();
  gNorm.needsUpdate = true;
  gNorm.repeat.set(140, 140);
  const gRough = gPbr.roughnessMap.clone();
  gRough.needsUpdate = true;
  gRough.repeat.set(140, 140);

  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: gMap,
    normalMap: gNorm,
    normalScale: new THREE.Vector2(1.4, 1.4),
    roughnessMap: gRough,
    vertexColors: true,
    roughness: winter ? 0.88 : 1.0,
  });
  // Cut clean mine-shaft opening out of terrain mesh so player walks cleanly underground
  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uMineBounds = { value: new THREE.Vector4(mineX - 3.0, mineX + 3.0, -135.8, -120.2) };
    shader.vertexShader = 'varying vec3 vTerrainCut;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
       vTerrainCut = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );
    shader.fragmentShader = 'uniform vec4 uMineBounds;\nvarying vec3 vTerrainCut;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
       if (vTerrainCut.x > uMineBounds.x && vTerrainCut.x < uMineBounds.y && vTerrainCut.z > uMineBounds.z && vTerrainCut.z < uMineBounds.w) discard;`,
    );
  };
  const terrain = new THREE.Mesh(geo, terrainMat);
  terrain.receiveShadow = true;
  root.add(terrain);

  // Enterable cabins & homesteads sit on sloped hillsides: flatten a small terrain
  // pad under each one so the ground never cuts up through its interior floor.
  const flattenBuildingPad = (cx, cz, halfX, halfZ, rotY, padY, feather = 4) => {
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    for (let i = 0; i < heights.length; i++) {
      const wx = pos.getX(i);
      const wz = pos.getZ(i);
      const dx = wx - cx;
      const dz = wz - cz;
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      const ox = Math.max(0, Math.abs(lx) - halfX);
      const oz = Math.max(0, Math.abs(lz) - halfZ);
      const outside = Math.hypot(ox, oz);
      if (outside > feather) continue;
      const t = outside <= 0 ? 1 : 1 - outside / feather;
      const blend = t * t * (3 - 2 * t);
      const h = heights[i];
      const nh = h + (padY - h) * blend;
      if (Math.abs(nh - h) < 1e-4) continue;
      heights[i] = nh;
      pos.setY(i, nh);
    }
    pos.needsUpdate = true;
  };

  // Outer mountain/terrain skirt so horizon never cuts off
  const skirt = new THREE.Mesh(
    new THREE.RingGeometry(HALF * 0.98, 1600, 48),
    new THREE.MeshStandardMaterial({ color: winter ? 0x9aa8b6 : 0x5c4e3e, roughness: 1 }),
  );
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.y = WATER - 2;
  root.add(skirt);

  const watchtowers = [];
  const segW = SIZE / SEG;
  const heightAt = (x, z, curY = 0) => {
    // Check underground Mine Shaft Ramp & Tunnel Chamber first
    if (x >= mineX - 3.5 && x <= mineX + 3.5 && z >= mineTunnelEndZ - 1.5 && z <= mineMouthZ + 0.5) {
      if (z >= -136.0 && curY >= mineFloorY - 1.0) {
        const t = Math.max(0, Math.min(1, (mineMouthZ - z) / 16.0));
        const ry = mineBaseY * (1 - t) + mineFloorY * t;
        if (Math.abs(curY - ry) < 2.6 || curY < mineBaseY - 0.5) return ry;
      }
      if (z < -136.0 && curY < mineBaseY - 1.5) return mineFloorY;
    }

    // Check walkable 2-level Ranger Watchtowers
    for (const wt of watchtowers) {
      const wh = wt.heightAt(x, z, curY);
      if (wh !== null) return wh;
    }

    const u = (x + HALF) / segW;
    const v = (z + HALF) / segW;
    const ix = Math.max(0, Math.min(SEG - 1, Math.floor(u)));
    const iy = Math.max(0, Math.min(SEG - 1, Math.floor(v)));
    const fx = u - ix;
    const fy = v - iy;
    const a = heights[ix + (SEG + 1) * iy];
    const b = heights[ix + (SEG + 1) * (iy + 1)];
    const c = heights[ix + 1 + (SEG + 1) * (iy + 1)];
    const d = heights[ix + 1 + (SEG + 1) * iy];
    let h;
    if (fx + fy <= 1) h = a + (d - a) * fx + (b - a) * fy;
    else h = c + (b - c) * (1 - fx) + (d - c) * (1 - fy);
    const floorH = winter ? Math.max(h, WATER) : Math.max(h, WATER - 1.0);
    if (winter && Math.abs(x - roadX(-HALF + 40)) < 5.4 && z <= -HALF + 38 && z >= -HALF + 26) {
      return Math.min(floorH, roadH(-HALF + 40));
    }
    return floorH;
  };

  // ---- animated water / frozen ice ----
  const waterMat = winter
    ? new THREE.MeshStandardMaterial({
        color: 0xc2d8ea,
        normalMap: gNorm,
        normalScale: new THREE.Vector2(0.45, 0.45),
        roughness: 0.14,
        metalness: 0.25,
      })
    : new THREE.MeshStandardMaterial({
        color: 0x223328,
        normalMap: gNorm,
        normalScale: new THREE.Vector2(0.25, 0.25),
        roughness: 0.06,
        metalness: 0.72,
        transparent: true,
        opacity: 0.9,
      });

  if (!winter) {
    waterMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      waterMat.userData.shader = shader;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         transformed.z += sin(position.x * 0.15 + uTime * 1.4) * 0.12 + cos(position.y * 0.18 + uTime * 1.1) * 0.1;`,
      );
    };
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE, 48, 48), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER;
  water.receiveShadow = true;
  root.add(water);

  // ---- winding road ribbon + faded highway centerline ----
  const rp = [];
  const ruv = [];
  const ri = [];
  const linePos = [];
  const lineIdx = [];
  let n = 0;
  let ln = 0;
  for (let z = HALF; z >= -HALF; z -= 4) {
    const x = roadX(z);
    const dx = roadX(z - 1) - x;
    const len = Math.hypot(1, dx);
    const nx = 1 / len;
    const nz = dx / len;
    for (const s of [-4.8, 4.8]) {
      const px = x + nx * s;
      const pz = z + nz * s;
      rp.push(px, heightAt(px, pz) + 0.08, pz);
      ruv.push(s < 0 ? 0 : 1, (HALF - z) / 8);
    }
    if (n > 0) {
      const b = (n - 1) * 2;
      const c = n * 2;
      ri.push(b, b + 1, c, b + 1, c + 1, c);
    }
    // Dashed centerline segments
    if (n % 3 !== 0) {
      for (const s of [-0.14, 0.14]) {
        const px = x + nx * s;
        const pz = z + nz * s;
        linePos.push(px, heightAt(px, pz) + 0.1, pz);
      }
      if (ln > 0 && n % 3 === 2) {
        const b = (ln - 1) * 2;
        const c = ln * 2;
        lineIdx.push(b, b + 1, c, b + 1, c + 1, c);
      }
      ln++;
    }
    n++;
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  rg.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
  rg.setIndex(ri);
  rg.computeVertexNormals();
  const asp = asphaltPBR();
  const roadMesh = new THREE.Mesh(
    rg,
    new THREE.MeshStandardMaterial({
      map: asp.map,
      normalMap: asp.normalMap,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughnessMap: asp.roughnessMap,
      color: winter ? 0xb8c2cc : 0xa59a8e,
      roughness: 0.95,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  roadMesh.receiveShadow = true;
  root.add(roadMesh);

  if (lineIdx.length > 0) {
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    lg.setIndex(lineIdx);
    const lineMesh = new THREE.Mesh(
      lg,
      new THREE.MeshStandardMaterial({
        color: winter ? 0x9aa2a8 : 0xc8a440,
        roughness: 0.85,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      }),
    );
    lineMesh.receiveShadow = true;
    root.add(lineMesh);
  }

  // Weathered gravel road shoulders flanking both edges of highway ribbon + Mine Canyon Gravel Trail + Outpost/Tower Gravel Yards
  const gp = gravelPBR(winter);
  const gravelMat = new THREE.MeshStandardMaterial({
    map: gp.map,
    normalMap: gp.normalMap,
    roughnessMap: gp.roughnessMap,
    roughness: 0.96,
    side: THREE.DoubleSide,
  });
  for (const sideSign of [-1, 1]) {
    const sp = [];
    const suv = [];
    const si = [];
    let sn = 0;
    for (let z = HALF; z >= -HALF; z -= 8) {
      const x = roadX(z);
      const dx = roadX(z - 1) - x;
      const len = Math.hypot(1, dx);
      const nx = 1 / len;
      const nz = dx / len;
      for (const off of [4.6 * sideSign, 8.2 * sideSign]) {
        const px = x + nx * off;
        const pz = z + nz * off;
        sp.push(px, heightAt(px, pz) + 0.04, pz);
        suv.push(off > 0 ? 1 : 0, (HALF - z) / 12);
      }
      if (sn > 0) {
        const b = (sn - 1) * 2;
        const c = sn * 2;
        si.push(b, b + 1, c, b + 1, c + 1, c);
      }
      sn++;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2));
    sg.setIndex(si);
    sg.computeVertexNormals();
    const shoulder = new THREE.Mesh(sg, gravelMat);
    shoulder.receiveShadow = true;
    root.add(shoulder);
  }

  // Crushed Gravel Mine Haul Trail (winding from Hwy 9 near z=-92 to Old Mine mouth)
  const gravelPads = [];
  {
    const mp = [];
    const muv = [];
    const mi = [];
    const startX = roadX(-92) - 6.0;
    const startZ = -92;
    const steps = 22;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = startX * (1 - t) + mineX * t;
      const cz = startZ * (1 - t) + (mineMouthZ + 2) * t + Math.sin(t * Math.PI) * 5;
      const dx = (mineX - startX) / steps;
      const dz = (mineMouthZ + 2 - startZ) / steps;
      const l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l;
      const nz = dx / l;
      for (const w of [-3.4, 3.4]) {
        const px = cx + nx * w;
        const pz = cz + nz * w;
        mp.push(px, heightAt(px, pz) + 0.055, pz);
        muv.push(w > 0 ? 1.5 : 0, t * 9);
      }
      gravelPads.push({ x: cx, z: cz, r: 4.5 });
      if (i > 0) {
        const b = (i - 1) * 2;
        const c = i * 2;
        mi.push(b, b + 1, c, b + 1, c + 1, c);
      }
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3));
    mg.setAttribute('uv', new THREE.Float32BufferAttribute(muv, 2));
    mg.setIndex(mi);
    mg.computeVertexNormals();
    const mineTrail = new THREE.Mesh(mg, gravelMat);
    mineTrail.receiveShadow = true;
    root.add(mineTrail);
  }

  // Crushed Gravel Pads at Watchtowers & Outpost Service Stations
  for (const pad of [
    ...outpostSpecs.map((op) => ({ x: op.x, z: op.z, r: 10.5 })),
    { x: tower1X, z: tower1Z, r: 8.0 },
    { x: tower2X, z: tower2Z, r: 8.0 },
  ]) {
    gravelPads.push(pad);
    const pGeo = new THREE.CircleGeometry(pad.r, 20);
    pGeo.rotateX(-Math.PI / 2);
    const pa = pGeo.attributes.position;
    for (let k = 0; k < pa.count; k++) {
      const wx = pad.x + pa.getX(k);
      const wz = pad.z + pa.getZ(k);
      pa.setY(k, heightAt(wx, wz) + 0.05);
    }
    pGeo.computeVertexNormals();
    const gpMesh = new THREE.Mesh(pGeo, gravelMat);
    gpMesh.receiveShadow = true;
    root.add(gpMesh);
  }

  // Sun-Baked Cracked Drought Earth Flats along dry highway clearings & basins
  const droughtZones = [];
  if (!winter) {
    const dpPbr = droughtPBR();
    const dpMap = dpPbr.map.clone();
    dpMap.needsUpdate = true;
    dpMap.repeat.set(4, 4);
    const dpNorm = dpPbr.normalMap.clone();
    dpNorm.needsUpdate = true;
    dpNorm.repeat.set(4, 4);
    const droughtMat = new THREE.MeshStandardMaterial({
      map: dpMap,
      normalMap: dpNorm,
      normalScale: new THREE.Vector2(1.5, 1.5),
      roughness: 0.96,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    for (const [dz, side, r] of [
      [430, -1, 16],
      [370, 1, 18],
      [230, 1, 20],
      [95, -1, 19],
      [-55, 1, 22],
      [-235, -1, 18],
      [-340, 1, 20],
    ]) {
      const dx = roadX(dz) + side * (14 + r * 0.55);
      const dh = heightAt(dx, dz);
      if (dh < WATER + 1.0) continue;
      droughtZones.push({ x: dx, z: dz, r });
      const dGeo = new THREE.CircleGeometry(r, 20);
      dGeo.rotateX(-Math.PI / 2);
      const da = dGeo.attributes.position;
      for (let k = 0; k < da.count; k++) {
        const wx = dx + da.getX(k);
        const wz = dz + da.getZ(k);
        da.setY(k, heightAt(wx, wz) + 0.045);
      }
      dGeo.computeVertexNormals();
      const dMesh = new THREE.Mesh(dGeo, droughtMat);
      dMesh.receiveShadow = true;
      root.add(dMesh);
    }
  }

  // Reflective rainwater / frozen ice puddles along road depressions & spawn stretch
  const roadPuddles = [
    { x: roadX(HALF - 38) - 2.2, y: heightAt(roadX(HALF - 38) - 2.2, HALF - 38) + 0.1, z: HALF - 38, sx: 2.8, sz: 2.2, rotY: 0.4 },
    { x: roadX(HALF - 46) + 2.4, y: heightAt(roadX(HALF - 46) + 2.4, HALF - 46) + 0.1, z: HALF - 46, sx: 2.5, sz: 2.0, rotY: 1.2 },
  ];
  for (let z = HALF - 36; z >= -HALF + 36; z -= 30) {
    if (rnd() < 0.78) {
      const px = roadX(z) + (rnd() - 0.5) * 6.5;
      const py = heightAt(px, z);
      if (py > WATER + 0.8) {
        roadPuddles.push({ x: px, y: py + 0.1, z, sx: 1.9 + rnd() * 2.4, sz: 1.4 + rnd() * 1.9, rotY: rnd() * Math.PI });
      }
    }
  }
  root.add(makePuddles(roadPuddles, winter));

  // Roadside weathered utility poles
  const poleGeo = new THREE.CylinderGeometry(0.11, 0.15, 7.5, 6);
  poleGeo.translate(0, 3.75, 0);
  const poleCount = Math.floor(SIZE / 44);
  const utilPoles = new THREE.InstancedMesh(
    poleGeo,
    new THREE.MeshStandardMaterial({ color: 0x3b2c22, roughness: 0.95 }),
    poleCount,
  );
  const pm = new THREE.Matrix4();
  let pi = 0;
  for (let z = HALF - 30; z >= -HALF + 30 && pi < poleCount; z -= 44) {
    const px = roadX(z) + 7.2;
    pm.makeTranslation(px, heightAt(px, z) - 0.2, z);
    utilPoles.setMatrixAt(pi++, pm);
  }
  utilPoles.count = pi;
  utilPoles.castShadow = true;
  utilPoles.computeBoundingSphere();
  root.add(utilPoles);

  // ---- fallout crater signs & radioactive debris ----
  for (const hz of hotZones) {
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + rnd();
      const sx = hz.x + Math.cos(a) * (hz.r + 3);
      const sz = hz.z + Math.sin(a) * (hz.r + 3);
      const sgn = makeRadSign();
      sgn.position.set(sx, heightAt(sx, sz), sz);
      sgn.rotation.y = Math.atan2(sx - hz.x, sz - hz.z);
      root.add(sgn);
    }
    for (let k = 0; k < 6; k++) {
      const dx = hz.x + (rnd() - 0.5) * hz.r * 0.9;
      const dz = hz.z + (rnd() - 0.5) * hz.r * 0.9;
      const deb = new THREE.Mesh(
        new THREE.BoxGeometry(1 + rnd() * 2, 0.5 + rnd(), 1 + rnd() * 2),
        new THREE.MeshStandardMaterial({ color: 0x262422, roughness: 0.9, metalness: 0.4 }),
      );
      deb.position.set(dx, heightAt(dx, dz) + 0.15, dz);
      deb.rotation.set(rnd(), rnd() * 6, rnd());
      deb.castShadow = true;
      root.add(deb);
    }
  }

  // ---- dense pine & burnt woodland forests, rocks & ground scrub clutter ----
  const pineTrees = [];
  const burntTrees = [];
  const rocks = [];
  const clutter = [];
  const treeCount = winter ? 1850 : 2150;
  const isReservedPad = (x, z) =>
    (Math.abs(x - mineX) < 11 && z >= mineTunnelEndZ - 8 && z <= mineMouthZ + 12) ||
    Math.hypot(x - tower1X, z - tower1Z) < 10 ||
    Math.hypot(x - tower2X, z - tower2Z) < 10 ||
    droughtZones.some((dz) => Math.hypot(x - dz.x, z - dz.z) < dz.r * 0.9) ||
    outpostSpecs.some((op) => Math.hypot(x - op.x, z - op.z) < 13);

  const pushTree = (tx, tz, ts, nearCrater = false) => {
    const th = H(tx, tz);
    if (th < WATER + 1.0) return;
    if (Math.abs(tx - roadX(tz)) < 11.2 || isReservedPad(tx, tz)) return;
    const entry = { x: tx, y: th, z: tz, s: ts };
    if (winter || (!nearCrater && fbm(tx * 0.008 + 2, tz * 0.008 + 5, 2) > 0.42)) {
      pineTrees.push(entry);
    } else {
      burntTrees.push(entry);
    }
    colliders.push({ minX: tx - 0.35 * ts, maxX: tx + 0.35 * ts, minZ: tz - 0.35 * ts, maxZ: tz + 0.35 * ts });
  };

  for (let i = 0; i < treeCount * 2 && pineTrees.length + burntTrees.length < treeCount; i++) {
    const x = (rnd() - 0.5) * SIZE * 0.97;
    const z = (rnd() - 0.5) * SIZE * 0.97;
    if (hotZones.some((hz) => Math.hypot(x - hz.x, z - hz.z) < hz.r * 0.95)) continue;
    if (fbm(x * 0.01 + 7, z * 0.01, 2) < 0.22) continue;
    const s = 0.68 + rnd() * 0.78;
    const nearCrater = hotZones.some((hz) => Math.hypot(x - hz.x, z - hz.z) < hz.r * 2.2);
    pushTree(x, z, s, nearCrater);
    // Natural woodland groves: add 1-2 companion trees nearby
    if (rnd() < 0.42 && pineTrees.length + burntTrees.length < treeCount) {
      const a = rnd() * Math.PI * 2;
      const dist = 3.2 + rnd() * 4.5;
      pushTree(x + Math.cos(a) * dist, z + Math.sin(a) * dist, 0.58 + rnd() * 0.65, nearCrater);
    }
  }
  for (let i = 0; i < 320; i++) {
    const x = (rnd() - 0.5) * SIZE;
    const z = (rnd() - 0.5) * SIZE;
    if (Math.abs(x - roadX(z)) < 9.5 || isReservedPad(x, z)) continue;
    const s = 0.6 + rnd() * 2.4;
    rocks.push({ x, y: H(x, z), z, s });
    if (s > 1.2) colliders.push({ minX: x - s * 0.7, maxX: x + s * 0.7, minZ: z - s * 0.7, maxZ: z + s * 0.7 });
  }
  for (let i = 0; i < 1850; i++) {
    const x = (rnd() - 0.5) * SIZE * 0.95;
    const z = (rnd() - 0.5) * SIZE * 0.95;
    if (Math.abs(x - roadX(z)) < 5.5 || isReservedPad(x, z)) continue;
    const h = H(x, z);
    if (h < WATER + 0.8) continue;
    clutter.push({ x, y: h, z, s: 0.7 + rnd() * 0.85 });
  }
  for (let z = HALF - 20; z >= -HALF + 20; z -= 10) {
    for (const dir of [-1, 1]) {
      const gx = roadX(z) + dir * (6.2 + rnd() * 4.2);
      if (isReservedPad(gx, z)) continue;
      const gh = H(gx, z);
      if (gh > WATER + 0.6) clutter.push({ x: gx, y: gh, z, s: 0.75 + rnd() * 0.65 });
    }
  }

  root.add(makeForest(pineTrees, winter ? 'snow' : 'pine'));
  if (!winter && burntTrees.length) root.add(makeForest(burntTrees, 'burnt'));
  root.add(makeRocks(rocks, winter ? 0x868d94 : 0x5c5348));
  root.add(makeGroundClutter(clutter, winter ? 'snow' : 'burnt'));

  // ---- loot helpers ----
  const lootRoll = (tier) => {
    const s = game.stats;
    const got = [];
    const add = (cond, fn, label) => {
      if (cond) {
        fn();
        got.push(label);
      }
    };
    if (tier === 'crate') {
      if (!s.weapons.includes('rifle')) {
        game.giveWeapon('rifle', 36);
        got.push('AR-15 Rifle');
      }
      if (!s.weapons.includes('shotgun')) {
        game.giveWeapon('shotgun', 8);
        got.push('Shotgun');
      }
      add(true, () => (s.ammo.rifle += 45), '45 rds 5.56');
      add(true, () => (s.ammo.shotgun += 16), '16 shells');
      add(true, () => (s.ammo.pistol += 24), '24 rds 9mm');
      add(true, () => (s.radpills += 2), '2 Rad-X');
      add(true, () => (s.meds += 1), 'medkit');
      add(true, () => (s.grenades = (s.grenades ?? 0) + 3), '3 Frag Grenades');
      add(
        true,
        () => {
          s.food += 2;
          s.water += 2;
        },
        '2 MREs & 2 water',
      );
    } else if (tier === 'cabin') {
      add(R() < 0.75, () => (s.food += 1 + Math.floor(R() * 2)), 'canned food');
      add(R() < 0.75, () => (s.water += 1 + Math.floor(R() * 2)), 'water');
      add(R() < 0.45, () => (s.meds += 1), 'medkit');
      add(R() < 0.4, () => (s.radpills += 1), 'Rad-X');
      add(R() < 0.7, () => (s.ammo.shotgun += 12), '12 shells');
      add(R() < 0.65, () => (s.ammo.pistol += 18), '18 rds 9mm');
      add(R() < 0.35, () => (s.grenades = (s.grenades ?? 0) + 1), 'frag grenade');
      if (!s.weapons.includes('shotgun') && R() < 0.5) {
        game.giveWeapon('shotgun', 8);
        got.push('hunting shotgun');
      }
      if (!s.weapons.includes('pistol') && R() < 0.6) {
        game.giveWeapon('pistol', 15);
        got.push('9mm pistol');
      }
    } else {
      add(R() < 0.45, () => (s.water += 1), 'water');
      add(R() < 0.35, () => (s.food += 1), 'food');
      add(R() < 0.55, () => (s.ammo.pistol += 16), '16 rds 9mm');
      add(R() < 0.4, () => (s.ammo.shotgun += 8), '8 shells');
      add(R() < 0.25, () => (s.grenades = (s.grenades ?? 0) + 1), 'frag grenade');
      add(R() < 0.2, () => (s.meds += 1), 'first aid kit');
      add(R() < 0.18, () => (s.radpills += 1), 'Rad-X');
    }
    return got.length ? got.join(', ') : 'nothing useful';
  };

  const spawnGroup = (kind, x, z, count) => {
    for (let i = 0; i < count; i++) {
      const a = new Actor(kind, x + (R() - 0.5) * 10, z + (R() - 0.5) * 10);
      if (winter && kind === 'raider') a.health += 15;
      game.addActor(a);
    }
  };
  const spawnQueue = [];

  // ---- enterable furnished log cabins ----
  const cabinCount = winter ? 8 : 10;
  for (let i = 0; i < cabinCount; i++) {
    const z = HALF - 80 - (i + 0.5) * ((SIZE - 200) / cabinCount);
    const side = rnd() < 0.5 ? -1 : 1;
    const x = roadX(z) + side * (23 + rnd() * 18);
    const y = H(x, z);
    if (y < WATER + 1 || isReservedPad(x, z)) continue;
    const rotY = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    const cabin = makeEnterableCabin(colliders, obstacles, x, y - 0.18, z, rotY, winter);
    flattenBuildingPad(x, z, 4.2, 3.9, rotY, y - 0.18);
    root.add(cabin.group);
    interiorLights.push({ pos: cabin.lightPos, color: 0xffc878, intensity: 14 });
    ammoSpawns.push({
      pos: cabin.interactPos.clone().add(new THREE.Vector3(0, 0.25, 0)),
      kind: i % 2 === 0 ? 'shotgun' : 'pistol',
      amount: i % 2 === 0 ? 10 : 18,
    });
    interactables.push({
      pos: cabin.interactPos,
      radius: 2.8,
      label: 'Search log cabin supplies',
      hold: 1.8,
      action: () => {
        audio.pickup();
        game.gainXp(25);
        game.msg('Cabin: ' + lootRoll('cabin'), 'loot');
      },
    });
    if (winter && i % 2 === 0) {
      const f = new Fire(false);
      const fx = x - side * 7;
      const fz = z + 3;
      f.group.position.set(fx, H(fx, fz), fz);
      root.add(f.group);
      fireObjs.push(f);
      firePos.push(f.group.position);
    }
    if (rnd() < 0.55) spawnQueue.push(() => spawnGroup('raider', x - side * 8, z, 2 + Math.floor(R() * 2)));
  }

  // ---- 7 abandoned roadside homes with walkable furnished interiors ----
  const homeRoofMat = new THREE.MeshStandardMaterial({
    color: winter ? 0xd8e2ec : 0x3f362e,
    roughness: 0.9,
  });
  for (let i = 0; i < 7; i++) {
    const z = HALF - 95 - i * ((SIZE - 220) / 7);
    const side = i % 2 === 0 ? 1 : -1;
    const x = roadX(z) + side * 16.5;
    const y = heightAt(x, z);
    if (y < WATER + 1 || isReservedPad(x, z)) continue;
    const rotY = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    const home = makeHome(i + (winter ? 3 : 0), homeRoofMat, colliders, obstacles, x, y - 0.15, z, rotY, winter);
    flattenBuildingPad(x, z, 6.0, 5.0, rotY, y - 0.15, 3);
    root.add(home.group);
    interiorLights.push({ pos: home.interactPos.clone().add(new THREE.Vector3(0, 2.8, 0)), color: 0xffe0b0, intensity: 16 });
    interactables.push({
      pos: home.interactPos,
      radius: 2.8,
      label: 'Search homestead pantry',
      hold: 1.8,
      action: () => {
        audio.pickup();
        game.gainXp(30);
        game.msg('Homestead: ' + lootRoll('cabin'), 'loot');
      },
    });
    if (winter) {
      const f = new Fire(false);
      const fx = x - side * 8;
      const fz = z + 3.5;
      f.group.position.set(fx, heightAt(fx, fz), fz);
      root.add(f.group);
      fireObjs.push(f);
      firePos.push(f.group.position);
    }
  }

  // Recompute lighting on the flattened terrain pads now that every building is placed
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  // ---- Bombed-out suburban/industrial City Ruins flanking highway outskirts ----
  let firstRuinView = null;
  const ruinZs = [428, 355, 250, 118, -42, -205, -315];
  ruinZs.forEach((rz, idx) => {
    const side = idx % 2 === 0 ? -1 : 1;
    const rx = roadX(rz) + side * (16.5 + (idx % 2) * 3.5);
    if (isReservedPad(rx, rz)) return;
    const ry = heightAt(rx, rz);
    if (ry < WATER + 0.6) return;
    const rotY = side > 0 ? -Math.PI / 2 + 0.15 : Math.PI / 2 - 0.15;
    const ruin = makeCityRuin(idx + (winter ? 11 : 1), colliders, obstacles, rx, ry - 0.12, rz, rotY, winter);
    root.add(ruin.group);
    if (!firstRuinView) {
      const vx = roadX(rz + 10) - side * 2.5;
      firstRuinView = {
        x: vx,
        y: heightAt(vx, rz + 10),
        z: rz + 10,
        yaw: side > 0 ? -0.78 : 0.78,
      };
    }
    interactables.push({
      pos: ruin.lootPos,
      radius: 2.8,
      label: 'Scavenge ruined building rubble',
      hold: 1.5,
      action: () => {
        audio.pickup();
        game.gainXp(25);
        game.msg('City Ruin: ' + lootRoll('cabin'), 'loot');
      },
    });
  });

  // ---- Directional Highway & Landmark Street Signs (Old Mine, Outposts, Watchtower, Vault) ----
  const placeRoadSign = (sx, sz, title, subtitle, bg, fg, rotY) => {
    const sy = heightAt(sx, sz);
    if (sy < WATER + 0.2) return;
    const sgn = makeStreetSign(title, subtitle, { bg, fg, width: 3.4, height: 1.25, postH: 3.1 });
    sgn.position.set(sx, sy - 0.08, sz);
    sgn.rotation.y = rotY;
    root.add(sgn);
  };
  placeRoadSign(roadX(444) + 6.3, 444, 'OLD MINE TRAIL ↙', winter ? 'MT. ARDENT VAULT ↑' : 'CHECKPOINT 9 ↑', '#154734', '#f8fafc', -0.28);
  placeRoadSign(roadX(338) + 6.4, 338, 'HIGHWAY SERVICE', 'SUPPLIES & TERMINAL →', '#1e3a5f', '#f8fafc', -0.32);
  placeRoadSign(roadX(176) + 6.4, 176, 'RANGER WATCHTOWER', 'LOOKOUT & ARMORY ↗', '#154734', '#f8fafc', -0.3);
  placeRoadSign(roadX(52) - 6.4, 52, '← RANGER OUTPOST', 'SCOUT AID & CACHE', '#154734', '#f8fafc', 0.3);
  placeRoadSign(roadX(-92) - 6.3, -92, 'OLD MINE SHAFT ↙', '70m WEST · HOT ZONE ☢', '#78350f', '#fef08a', 0.34);
  placeRoadSign(roadX(-105) - 34, -108, '← OLD MINE CANYON', 'UNDERGROUND ESCAPE TUNNEL', '#78350f', '#fef08a', 0.2);
  placeRoadSign(mineX + 9.5, mineMouthZ + 12, 'GRID RELAY STATION', 'HAZMAT CALIBRATION ↗', '#0f3b4a', '#a5f3fc', -0.38);
  placeRoadSign(
    roadX(-368) + 6.4,
    -368,
    winter ? 'MT. ARDENT VAULT ↑' : 'CHECKPOINT 9 ↑',
    winter ? 'EAST BULKHEAD ↗' : 'EAST SNOWCAT TRAIL ↗',
    winter ? '#1b365d' : '#3e4a2a',
    '#f0e8c8',
    -0.28,
  );

  // ---- 5 Enterable Highway Service Stations, Ranger Outposts & Alternate-Path Relay Stations (FPS/RPG Encounters) ----
  let firstOutpostView = null;
  outpostSpecs.forEach((op, idx) => {
    const oy = heightAt(op.x, op.z);
    const out = makeOutpost(op.style, colliders, obstacles, op.x, oy - 0.1, op.z, op.rotY, winter);
    root.add(out.group);
    interiorLights.push({
      pos: out.lightPos,
      color: op.style === 'relay' ? 0x99f6e4 : op.style === 'ranger' ? 0xd9f99d : 0xffe4b8,
      intensity: 20,
    });
    if (!firstOutpostView) {
      const viewP = out.localToWorld(0, 0.15, 9.5);
      firstOutpostView = { x: viewP.x, y: oy, z: viewP.z, yaw: op.rotY };
    }
    ammoSpawns.push({
      pos: out.localToWorld(0, 0.15, 2.2),
      kind: idx % 2 === 0 ? 'rifle' : 'shotgun',
      amount: idx % 2 === 0 ? 28 : 12,
      grenade: 1,
    });

    interactables.push({
      pos: out.lootPos,
      radius: 2.9,
      label: `Loot ${op.style === 'ranger' ? 'Ranger Armory' : op.style === 'relay' ? 'Relay Lab Cache' : 'Service Locker'}`,
      hold: 1.2,
      action: () => {
        audio.pickup();
        game.gainXp(35);
        game.msg('Outpost Locker: ' + lootRoll('crate'), 'loot');
      },
    });

    // RPG Security Terminal Hack inside each Outpost
    interactables.push({
      pos: out.terminalPos,
      radius: 2.8,
      label:
        op.style === 'relay'
          ? 'Hack Relay Security Grid (+XP, Calibrate Hazmat & Unlock Cache)'
          : 'Override Outpost Terminal (+XP, Bonus Ammo & Decrypt Patrols)',
      hold: 1.1,
      action: () => {
        const res = resolveTerminalHack(game.stats, op.style === 'relay' ? 'overclock' : 'bypass');
        game.stats.hacksCompleted = (game.stats.hacksCompleted ?? 0) + 1;
        game.stats.ammo.rifle += res.bonusRifle;
        game.stats.ammo.shotgun += res.bonusShotgun;
        if (res.bonusGrenades) game.stats.grenades = (game.stats.grenades ?? 0) + res.bonusGrenades;
        if (op.style === 'relay') {
          game.stats.radResistMult = Math.max(0.55, (game.stats.radResistMult ?? 1) * 0.88);
        }
        audio.pickup();
        game.gainXp(res.xpGain);
        game.msg(
          `${res.summary} (+${res.bonusRifle} 5.56, +${res.bonusShotgun} shells${op.style === 'relay' ? ', +12% Rad Shield' : ''})`,
          'radio',
        );
      },
    });

    spawnQueue.push(() => spawnGroup('raider', op.x - Math.sin(op.rotY) * 7, op.z - Math.cos(op.rotY) * 7, 2 + (idx % 2)));
  });

  // RPG Field Quest NPC: Wounded Caravan Scout outside first Highway Ranger Outpost
  const scoutOp = outpostSpecs[1];
  const scoutY = heightAt(scoutOp.x, scoutOp.z);
  const scoutPos = new THREE.Vector3(scoutOp.x + 5.5, scoutY, scoutOp.z + 5.5);
  const scoutActor = new Actor('civilian', scoutPos.x, scoutPos.z, false);
  scoutActor.speed = 0;
  scoutActor.looted = true;
  scoutActor.update = () => {};
  scoutActor.group.position.set(scoutPos.x, scoutY, scoutPos.z);
  scoutActor.group.rotation.y = Math.PI * 0.25;
  root.add(scoutActor.group);
  interactables.push({
    pos: scoutPos.clone(),
    radius: 3.2,
    label: () =>
      game.stats.meds > 0
        ? 'Wounded Scout: Give 1 Medkit -> Reward: AR-15 Rifle, +90 XP & Recon Speed (+10%)'
        : 'Wounded Scout: Trade $50 for Trail Map & Emergency Shells (+35 XP)',
    hold: 0.9,
    action: () => {
      if (game.stats.meds > 0) {
        game.stats.meds--;
        game.stats.questsCompleted = (game.stats.questsCompleted ?? 0) + 1;
        game.stats.moveSpeedMult = Number(((game.stats.moveSpeedMult ?? 1) * 1.1).toFixed(3));
        if (!game.stats.weapons.includes('rifle')) game.giveWeapon('rifle', 45);
        else game.stats.ammo.rifle += 45;
        game.stats.grenades = (game.stats.grenades ?? 0) + 2;
        audio.pickup();
        game.gainXp(90);
        game.msg('SCOUT: "Thank God! Take my rifle, spare frags & the mountain ridge shortcuts!" (+10% Speed)', 'radio');
      } else if (game.stats.cash >= 50) {
        game.stats.cash -= 50;
        game.stats.questsCompleted = (game.stats.questsCompleted ?? 0) + 1;
        game.stats.ammo.shotgun += 16;
        game.stats.ammo.pistol += 24;
        audio.pickup();
        game.gainXp(35);
        game.msg('Scout traded trail intel & emergency shells (+16 12G, +24 9mm)', 'loot');
      } else {
        game.msg('Bring 1 Medkit or $50 to assist the wounded scout!', 'info');
      }
    },
  });

  // ---- wrecked cars along road ----
  for (let i = 0; i < 26; i++) {
    const z = HALF - 40 - rnd() * (SIZE - 100);
    const x = roadX(z) + (rnd() - 0.5) * 7;
    const car = makeCar([0x6a2020, 0x20406a, 0x777777, 0x2a2a2a, 0x5a5a20][Math.floor(rnd() * 5)], true);
    car.position.set(x, heightAt(x, z), z);
    car.rotation.y = rnd() * 6;
    if (winter) {
      const snowCap = new THREE.Mesh(
        new THREE.BoxGeometry(1.66, 0.22, 2.1),
        new THREE.MeshStandardMaterial({ color: 0xf4f7fa, roughness: 0.9 }),
      );
      snowCap.position.set(0, 1.48, -0.18);
      car.add(snowCap);
    }
    root.add(car);
    obstacles.push(car);
    colliders.push({ minX: x - 1.7, maxX: x + 1.7, minZ: z - 1.7, maxZ: z + 1.7 });
    interactables.push({
      pos: new THREE.Vector3(x + 2.4, 0, z),
      radius: 2.8,
      label: 'Search wrecked car',
      hold: 1.6,
      action: () => {
        audio.glass();
        game.msg('Wreck: ' + lootRoll('car'), 'loot');
      },
    });
  }

  // ---- military supply crates (airdrops) ----
  for (let i = 0; i < (winter ? 4 : 5); i++) {
    const z = HALF - 150 - i * ((SIZE - 300) / 5) - rnd() * 40;
    const x = roadX(z) + (rnd() < 0.5 ? -1 : 1) * (45 + rnd() * 60);
    const crate = makeCrate(true);
    crate.position.set(x, H(x, z), z);
    crate.rotation.y = rnd() * 6;
    root.add(crate);
    const chute = new THREE.Mesh(
      new THREE.SphereGeometry(2.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xc8b890, roughness: 1, side: THREE.DoubleSide }),
    );
    chute.scale.y = 0.3;
    chute.rotation.z = 1.3;
    chute.position.set(x + 2.5, H(x + 2.5, z) + 0.4, z);
    root.add(chute);
    const smoke = beacon(0xff6633);
    smoke.position.set(x, H(x, z), z);
    root.add(smoke);
    interactables.push({
      pos: crate.position.clone(),
      radius: 2.6,
      label: 'Open military supply drop',
      hold: 2.2,
      action: () => {
        audio.pickup();
        game.msg('Supply drop: ' + lootRoll('crate'), 'loot');
        smoke.visible = false;
      },
    });
    spawnQueue.push(() => spawnGroup('raider', x + 12, z + 6, winter ? 3 : 2));
  }

  // ---- raider camps with barrel fires ----
  const campCount = winter ? 7 : 4;
  for (let i = 0; i < campCount; i++) {
    const z = HALF - 110 - (i + 0.3) * ((SIZE - 220) / campCount);
    const x = roadX(z) + (rnd() < 0.5 ? -1 : 1) * (12 + rnd() * 14);
    const f = new Fire(true);
    f.group.position.set(x, H(x, z), z);
    root.add(f.group);
    fireObjs.push(f);
    firePos.push(f.group.position);
    colliders.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 });
    for (let t = 0; t < 2; t++) {
      const tx = x + (t ? 5 : -5);
      const tz = z + 3;
      const tent = new THREE.Mesh(
        new THREE.ConeGeometry(2, 2.2, 4),
        new THREE.MeshStandardMaterial({ color: winter ? 0x5a6a5a : 0x4a4a3a, roughness: 1, flatShading: true }),
      );
      tent.position.set(tx, H(tx, tz) + 1.1, tz);
      tent.rotation.y = Math.PI / 4;
      tent.castShadow = true;
      root.add(tent);
      colliders.push({ minX: tx - 1.4, maxX: tx + 1.4, minZ: tz - 1.4, maxZ: tz + 1.4 });
    }
    interactables.push({
      pos: new THREE.Vector3(x, 0, z + 3),
      radius: 3,
      label: 'Raid raider stash (crime)',
      hold: 2,
      action: () => {
        game.stats.crimes++;
        audio.pickup();
        game.msg('Raider stash: ' + lootRoll('cabin'), 'loot');
      },
    });
    spawnQueue.push(() => spawnGroup('raider', x, z, winter ? 3 : 2));
  }

  if (winter) {
    for (let i = 0; i < 6; i++) {
      const z = HALF - 60 - i * 150 - rnd() * 40;
      const x = roadX(z) + (rnd() - 0.5) * 16 + 8;
      const f = new Fire(true);
      f.group.position.set(x, H(x, z), z);
      root.add(f.group);
      fireObjs.push(f);
      firePos.push(f.group.position);
    }
  }

  for (let i = 0; i < (winter ? 4 : 6); i++) {
    const z = HALF - 160 - rnd() * (SIZE - 260);
    const x = roadX(z) + (rnd() - 0.5) * 200;
    spawnQueue.push(() => spawnGroup('wolf', x, z, 3 + Math.floor(R() * 2)));
  }

  // ---- goal ----
  const gz = -HALF + 40;
  const gx = roadX(gz);
  const gy = heightAt(gx, gz);
  const goalPos = new THREE.Vector3(gx, gy, gz);
  const cPbr = concretePBR();
  if (!winter) {
    const conc = new THREE.MeshStandardMaterial({
      map: cPbr.map,
      normalMap: cPbr.normalMap,
      roughnessMap: cPbr.roughnessMap,
      roughness: 0.92,
    });
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      const bx = gx + k * 3.2;
      const bz = gz + 12;
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 0.7), conc);
      barrier.position.set(bx, heightAt(bx, bz) + 0.55, bz);
      barrier.castShadow = barrier.receiveShadow = true;
      root.add(barrier);
      obstacles.push(barrier);
      colliders.push({ minX: bx - 1.5, maxX: bx + 1.5, minZ: bz - 0.35, maxZ: bz + 0.35 });
    }
    const truck = makeCar(0x3e4a2a, false);
    truck.scale.set(1.4, 1.5, 1.6);
    truck.position.set(gx + 10, heightAt(gx + 10, gz), gz);
    root.add(truck);
    obstacles.push(truck);
    colliders.push({ minX: gx + 8.4, maxX: gx + 11.6, minZ: gz - 3.6, maxZ: gz + 3.6 });
    const tent = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 6), new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 1 }));
    tent.position.set(gx - 10, heightAt(gx - 10, gz) + 1.5, gz);
    tent.castShadow = true;
    root.add(tent);
    colliders.push({ minX: gx - 14, maxX: gx - 6, minZ: gz - 3, maxZ: gz + 3 });
    const radio = makeCrate(true);
    radio.position.set(gx, gy, gz);
    root.add(radio);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    ant.position.set(gx + 0.5, gy + 2.6, gz);
    root.add(ant);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 1.2),
      new THREE.MeshBasicMaterial({ map: signTexture('CHECKPOINT 9', '#3e4a2a', '#f0e8c8'), side: THREE.DoubleSide }),
    );
    sign.position.set(gx, gy + 3.5, gz + 12);
    root.add(sign);
    spawnQueue.push(() => spawnGroup('raider', gx, gz + 4, 4));
    interactables.push({
      pos: goalPos.clone().add(new THREE.Vector3(0, 0, 1.6)),
      radius: 3,
      label: 'Use the military radio',
      hold: 2.5,
      action: () => {
        game.msg(
          'RADIO: "...Fort Haven has fallen. Nuclear winter is setting in. The last operating shelter is MOUNT ARDENT VAULT, north through the pass. Doors seal in 72 hours. God help you."',
          'radio',
        );
        setTimeout(() => game.completePhase(), 2500);
      },
    });
  } else {
    const conc = new THREE.MeshStandardMaterial({
      map: cPbr.map,
      normalMap: cPbr.normalMap,
      roughnessMap: cPbr.roughnessMap,
      color: 0x9a9894,
      roughness: 0.9,
    });
    const vaultWallMat = new THREE.MeshStandardMaterial({
      map: cPbr.map,
      normalMap: cPbr.normalMap,
      color: 0xb6bec4,
      emissive: 0x16242b,
      emissiveIntensity: 0.45,
      roughness: 0.85,
    });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x3b4248, metalness: 0.82, roughness: 0.35 });

    // Mountain bunker facade split around 4.8m wide x 4.6m tall open vault entrance
    const addVBox = (vx, vy, vz, vw, vh, vd, mat, collide = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(vw, vh, vd), mat);
      m.position.set(vx, vy, vz);
      m.castShadow = m.receiveShadow = true;
      root.add(m);
      obstacles.push(m);
      if (collide) colliders.push({ minX: vx - vw / 2, maxX: vx + vw / 2, minZ: vz - vd / 2, maxZ: vz + vd / 2 });
      return m;
    };

    // Flanking mountain bulkhead wings + upper header over open doorway
    addVBox(gx - 9.7, gy + 7, gz - 6, 14.6, 18, 6, conc);
    addVBox(gx + 9.7, gy + 7, gz - 6, 14.6, 18, 6, conc);
    addVBox(gx, gy + 10.3, gz - 6, 4.8, 11.4, 6, conc, false);

    // Rolled-aside circular vault blast door next to the open threshold
    const door = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 4.2, 0.9, 36),
      new THREE.MeshStandardMaterial({ color: 0x9a8a3a, metalness: 0.85, roughness: 0.3 }),
    );
    door.rotation.x = Math.PI / 2;
    door.position.set(gx - 5.4, gy + 4.3, gz - 2.2);
    door.castShadow = true;
    root.add(door);
    for (let k = 0; k < 8; k++) {
      const bolt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.5, 12),
        new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.9, roughness: 0.28 }),
      );
      const a = (k / 8) * Math.PI * 2;
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(gx - 5.4 + Math.cos(a) * 3.3, gy + 4.3 + Math.sin(a) * 3.3, gz - 1.7);
      root.add(bolt);
    }

    // Walkable interior geothermal vestibule behind entrance (z from gz - 3 down to gz - 13)
    const vFloor = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.25, 11), steelMat);
    vFloor.position.set(gx, gy - 0.08, gz - 8);
    vFloor.receiveShadow = true;
    root.add(vFloor);
    addVBox(gx - 5.2, gy + 2.4, gz - 8, 0.6, 5.0, 10.5, vaultWallMat);
    addVBox(gx + 5.2, gy + 2.4, gz - 8, 0.6, 5.0, 10.5, vaultWallMat);
    addVBox(gx, gy + 2.4, gz - 13.2, 11.0, 5.0, 0.6, vaultWallMat);
    addVBox(gx, gy + 4.8, gz - 8, 11.0, 0.5, 11.0, conc, false);

    // Interior ceiling strips, reactor console, supply crates & inner airlock wheel
    const intGlow = new THREE.MeshBasicMaterial({ color: 0xa5f3fc });
    for (const lz of [gz - 5.5, gz - 10.0]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 0.4), intGlow);
      strip.position.set(gx, gy + 4.5, lz);
      root.add(strip);
    }
    const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 0.8), steelMat);
    consoleBox.position.set(gx - 3.0, gy + 0.75, gz - 11.6);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), new THREE.MeshBasicMaterial({ color: 0x34d399 }));
    screen.position.set(gx - 3.0, gy + 1.15, gz - 11.18);
    const vCrate = makeCrate(true);
    vCrate.position.set(gx + 3.2, gy, gz - 11.2);
    const innerDoor = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.3, 20), new THREE.MeshStandardMaterial({ color: 0x9a8a3a, metalness: 0.85, roughness: 0.3 }));
    innerDoor.rotation.x = Math.PI / 2;
    innerDoor.position.set(gx + 0.5, gy + 1.8, gz - 12.8);
    root.add(consoleBox, screen, vCrate, innerDoor);

    const signTex = signTexture('MT. ARDENT VAULT', '#1b1f2a', '#f2c200');
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 2.4),
      new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.65 }),
    );
    sign.position.set(gx, gy + 12.5, gz - 2.95);
    root.add(sign);
    const lamp = new THREE.PointLight(0xffcc66, 30, 30, 1.5);
    lamp.position.set(gx, gy + 11, gz + 1);
    const intLamp = new THREE.PointLight(0x99f6e4, 20, 16, 1.5);
    intLamp.position.set(gx, gy + 3.8, gz - 8.5);
    root.add(lamp, intLamp);
    const bc = beacon(0x66ccff);
    bc.position.set(gx, gy, gz);
    root.add(bc);
    const f = new Fire(true);
    f.group.position.set(gx + 6, gy, gz + 4);
    root.add(f.group);
    fireObjs.push(f);
    firePos.push(f.group.position);
    spawnQueue.push(() => spawnGroup('raider', gx, gz + 30, 4));
    interactables.push({
      pos: new THREE.Vector3(gx, gy, gz - 9.5),
      radius: 3.8,
      label: 'Seal the inner airlock & enter MT. ARDENT VAULT',
      hold: 2.5,
      action: () => {
        game.msg('The inner vault hatch locks shut. Warm air. Lights. You made it.', 'radio');
        setTimeout(() => game.completePhase(), 1500);
      },
    });
  }
  const goalBeacon = beacon(winter ? 0x66ccff : 0x88ff66);
  goalBeacon.position.copy(goalPos);
  root.add(goalBeacon);

  // ---- 2-level Ranger Watchtowers + Roadside Ammo Caches ----
  for (const [tx, tz] of [
    [tower1X, tower1Z],
    [tower2X, tower2Z],
  ]) {
    const ty = heightAt(tx, tz);
    const wt = makeWatchtower(colliders, obstacles, tx, ty, tz, tx > roadX(tz) ? Math.PI : 0);
    root.add(wt.group);
    watchtowers.push(wt);
    interactables.push({
      pos: wt.cratePos,
      radius: 2.8,
      label: 'Loot Ranger Watchtower Armory',
      hold: 1.4,
      action: () => {
        audio.pickup();
        game.msg('Watchtower: ' + lootRoll('crate'), 'loot');
      },
    });
    spawnQueue.push(() => spawnGroup('raider', tx + 4, tz + 4, 2));
  }

  for (const zOff of [HALF - 85, HALF - 260, 10, -240]) {
    const cx = roadX(zOff) + (zOff > 0 ? 5.8 : -5.8);
    const cy = heightAt(cx, zOff);
    const ammoCrate = makeCrate(false);
    ammoCrate.position.set(cx, cy, zOff);
    root.add(ammoCrate);
    const ab = beacon(0x84cc16);
    ab.position.set(cx, cy, zOff);
    root.add(ab);
    interactables.push({
      pos: ammoCrate.position.clone(),
      radius: 2.8,
      label: 'Grab Roadside Military Ammo Cache',
      hold: 0.7,
      action: () => {
        const s = game.stats;
        s.ammo.pistol += 24;
        s.ammo.shotgun += 12;
        s.ammo.rifle += 36;
        s.grenades = (s.grenades ?? 0) + 1;
        ab.visible = false;
        audio.pickup();
        game.msg('Roadside Cache: +24 9mm, +12 shells, +36 5.56, +1 Frag Grenade!', 'loot');
      },
    });
  }

  // ---- Hard-to-get-to Underground Mountain Mine & Service Tunnel (Alternate Escape Route) ----
  const mineRockMat = pbrMat(concretePBR(), 12, 1.5, { color: winter ? 0x67727c : 0x5c4f42, roughness: 0.94 });
  const mineFloorMat = pbrMat(groundPBR(winter ? 'snow' : 'burnt'), 2, 14, { color: 0x544b40, roughness: 0.96 });
  const mineTimberMat = pbrMat(barkPBR(), 1, 3, { color: 0x6e4e32, roughness: 0.92 });
  const mineRailMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.85, roughness: 0.35 });
  const addMineBox = (mx, my, mz, mw, mh, md, mat, collide = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(mw, mh, md), mat);
    m.position.set(mx, my, mz);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    obstacles.push(m);
    if (collide) {
      colliders.push({
        minX: mx - mw / 2,
        maxX: mx + mw / 2,
        minZ: mz - md / 2,
        maxZ: mz + md / 2,
        minY: mineFloorY - 0.6,
        maxY: mineFloorY + 4.8,
      });
    }
    return m;
  };
  const rampDZ = -136.0 - mineMouthZ; // -16
  const rampDY = mineFloorY - mineBaseY; // -5.2
  const rampLen = Math.hypot(rampDZ, rampDY);
  const mineRamp = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.35, rampLen), mineFloorMat);
  mineRamp.position.set(mineX, (mineBaseY + mineFloorY) / 2 - 0.16, (mineMouthZ - 136.0) / 2);
  mineRamp.rotation.x = -Math.atan2(rampDY, Math.abs(rampDZ));
  mineRamp.receiveShadow = true;
  root.add(mineRamp);
  obstacles.push(mineRamp);

  // Ramp side walls
  addMineBox(mineX - 3.3, mineBaseY - 2.6, -128.0, 0.6, 5.8, 16.4, mineRockMat);
  addMineBox(mineX + 3.3, mineBaseY - 2.6, -128.0, 0.6, 5.8, 16.4, mineRockMat);

  // Underground Mine Tunnel Chamber (z from -136 down to -210)
  const tunLen = 75.0;
  const tunMidZ = -173.5;
  addMineBox(mineX, mineFloorY - 0.2, tunMidZ, 7.6, 0.4, tunLen, mineFloorMat, false);
  addMineBox(mineX, mineFloorY + 4.7, tunMidZ, 8.2, 0.7, tunLen + 2, mineRockMat, false);
  addMineBox(mineX - 3.6, mineFloorY + 2.25, tunMidZ, 0.7, 5.0, tunLen, mineRockMat);
  addMineBox(mineX + 3.6, mineFloorY + 2.25, tunMidZ, 0.7, 5.0, tunLen, mineRockMat);
  addMineBox(mineX, mineFloorY + 2.25, mineTunnelEndZ - 0.4, 8.0, 5.0, 0.8, mineRockMat);

  // Timber/steel ribs, narrow-gauge rails, wooden crossties & glowing mine lamps
  for (let mz = -140; mz >= -205; mz -= 13) {
    addMineBox(mineX - 2.9, mineFloorY + 2.1, mz, 0.36, 4.2, 0.36, mineTimberMat);
    addMineBox(mineX + 2.9, mineFloorY + 2.1, mz, 0.36, 4.2, 0.36, mineTimberMat);
    addMineBox(mineX, mineFloorY + 4.2, mz, 6.2, 0.36, 0.36, mineTimberMat, false);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.45), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
    bulb.position.set(mineX, mineFloorY + 4.0, mz);
    root.add(bulb);
    const pl = new THREE.PointLight(0xffb347, 11, 18, 1.5);
    pl.position.set(mineX, mineFloorY + 3.5, mz);
    root.add(pl);
  }
  for (const rx of [mineX - 0.85, mineX + 0.85]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 70), mineRailMat);
    rail.position.set(rx, mineFloorY + 0.05, tunMidZ);
    root.add(rail);
  }
  const tieGeo = new THREE.BoxGeometry(2.3, 0.08, 0.2);
  for (let tz = -138; tz >= -208; tz -= 2.4) {
    const tie = new THREE.Mesh(tieGeo, mineTimberMat);
    tie.position.set(mineX, mineFloorY + 0.03, tz);
    root.add(tie);
  }

  // Mine entrance sign & red distress beacon off-road
  const mineSign = new THREE.Mesh(
    new THREE.PlaneGeometry(5.8, 1.2),
    new THREE.MeshBasicMaterial({ map: signTexture('SECTOR 9 MINE SHAFT', '#1c1917', '#fbbf24'), side: THREE.DoubleSide }),
  );
  mineSign.position.set(mineX, mineBaseY + 2.6, mineMouthZ + 0.5);
  root.add(mineSign);
  const mineCrate = makeCrate(true);
  mineCrate.position.set(mineX - 2.0, mineFloorY, -162);
  root.add(mineCrate);
  const hatchRing = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 0.35, 18),
    new THREE.MeshStandardMaterial({ color: 0xca8a04, metalness: 0.8, roughness: 0.35 }),
  );
  hatchRing.rotation.x = Math.PI / 2;
  hatchRing.position.set(mineX, mineFloorY + 1.8, mineTunnelEndZ + 0.3);
  root.add(hatchRing);

  interactables.push(
    {
      pos: mineCrate.position.clone(),
      radius: 2.8,
      label: 'Loot Underground Spec-Ops Mine Cache',
      hold: 1.0,
      action: () => {
        audio.pickup();
        game.msg('Mine Spec-Ops Cache: ' + lootRoll('crate'), 'loot');
      },
    },
    {
      pos: new THREE.Vector3(mineX, mineFloorY, mineTunnelEndZ + 2.0),
      radius: 3.4,
      hold: 1.5,
      label: winter
        ? 'Breach Geothermal Service Airlock -> Enter MT. ARDENT VAULT'
        : 'Descend Deep Service Shaft -> Fast-Track to Mount Ardent Foothills',
      action: () => {
        audio.explosion(0.18);
        game.msg(
          winter
            ? 'Geothermal tunnel bypasses the blizzard ridge — straight into Mount Ardent Vault!'
            : 'Service shaft bypasses Checkpoint 9 — climbing out near Mount Ardent!',
          'radio',
        );
        setTimeout(() => game.completePhase(), 1100);
      },
    },
  );
  spawnQueue.push(() => {
    for (const [rx, ry, rz] of [
      [mineX - 4, mineBaseY, mineMouthZ + 7],
      [mineX + 5, mineBaseY, mineMouthZ + 5],
      [mineX, mineBaseY, mineMouthZ + 10],
      [mineX, mineFloorY, -155],
      [mineX, mineFloorY, -186],
    ]) {
      const mr = new Actor('raider', rx, rz);
      mr.range = 24;
      game.addActor(mr, ry);
    }
  });

  // ---- Alternative Surface Escape Route on East Ridge (Snowcat / Geothermal Backdoor) ----
  const altZ = -HALF + 72;
  const altX = roadX(altZ) + 42;
  const altY = heightAt(altX, altZ);
  const altObj = makeCar(winter ? 0xd97706 : 0x3b4d32, false);
  altObj.scale.set(1.25, 1.3, 1.35);
  altObj.position.set(altX, altY, altZ);
  altObj.rotation.y = -0.35;
  root.add(altObj);
  obstacles.push(altObj);
  colliders.push({ minX: altX - 2.2, maxX: altX + 2.2, minZ: altZ - 2.6, maxZ: altZ + 2.6 });
  const altBeacon = beacon(0xfbbf24);
  altBeacon.position.set(altX, altY, altZ);
  root.add(altBeacon);
  interactables.push({
    pos: new THREE.Vector3(altX - 2.8, altY, altZ),
    radius: 3.2,
    hold: 1.8,
    label: winter
      ? 'Override East Ridge Geothermal Bulkhead -> Enter MT. ARDENT VAULT'
      : 'Hotwire Armored Evacuation Snowcat -> Head North to Mt. Ardent Vault',
    action: () => {
      audio.pickup();
      game.msg(
        winter
          ? 'East Geothermal Bulkhead opens! Inside Mount Ardent Vault!'
          : 'Tracked Snowcat roars to life — tearing north toward Mount Ardent!',
        'radio',
      );
      setTimeout(() => game.completePhase(), 1100);
    },
  });
  spawnQueue.push(() => spawnGroup('raider', altX - 6, altZ + 6, 3));

  const phaseTag = winter ? 'winter' : 'wilderness';
  setTimeout(() => {
    if (game.phase !== phaseTag) return;
    spawnQueue.forEach((f) => f());
  }, 0);

  let spawnCd = 30;
  let tick = 0;
  const spawn = { x: roadX(HALF - 30), z: HALF - 30, yaw: 0 };

  return {
    root,
    colliders,
    obstacles,
    interactables,
    interiorLights,
    ammoSpawns,
    bounds: HALF - 5,
    spawn,
    mineView: { x: roadX(-92), y: heightAt(roadX(-92), -92), z: -78, yaw: 0.32 },
    ruinView: firstRuinView,
    towerView: { x: tower1X + 4, y: heightAt(tower1X, tower1Z), z: tower1Z + 6, yaw: 0.35 },
    outpostView: firstOutpostView,
    fires: firePos,
    objective: {
      pos: goalPos,
      label: winter
        ? 'Reach MT. ARDENT VAULT (Main Pass, Underground Mine Backdoor, or East Ridge Bulkhead)'
        : 'Reach CHECKPOINT 9 north — or escape via Off-Road Mine Tunnel / East Snowcat Ridge',
    },
    heightAt,
    waterLevel: WATER,
    terrain: true,
    surfaceAt: (x, z, curY = 0) => {
      if (curY < mineBaseY - 1.2 && x >= mineX - 4 && x <= mineX + 4 && z >= mineTunnelEndZ - 2 && z <= mineMouthZ + 2) {
        return 'concrete';
      }
      if (!winter && heightAt(x, z, curY) <= WATER + 0.38) return 'water';
      if (isInPuddle(roadPuddles, x, z, 0.15)) return 'puddle';
      const dxRoad = Math.abs(x - roadX(z));
      if (dxRoad <= 4.7) return 'asphalt';
      if (dxRoad <= 8.3 || gravelPads.some((gp2) => Math.hypot(x - gp2.x, z - gp2.z) <= gp2.r)) return 'gravel';
      if (!winter && droughtZones.some((dz) => Math.hypot(x - dz.x, z - dz.z) <= dz.r)) return 'drought';
      if (!winter && fbm(x * 0.018 + 21, z * 0.018 - 9, 3) < 0.45) return 'drought';
      return winter ? 'snow' : 'dirt';
    },
    ambientRad: (x, z) => {
      let r = winter ? 0.025 : 0.055;
      for (const hz of hotZones) {
        const d = Math.hypot(x - hz.x, z - hz.z);
        if (d < hz.r * 1.6) r += hz.peak * Math.pow(1 - d / (hz.r * 1.6), 2);
      }
      return r;
    },
    dynamicInteract: (p) => {
      if (winter) return null;
      const h = heightAt(p.x, p.z);
      if (h < WATER + 0.8) {
        return {
          key: 'pond',
          pos: p.clone(),
          radius: 3,
          label: 'Drink contaminated pond water (+rads)',
          hold: 1.2,
          repeat: true,
          action: () => {
            game.stats.thirst = Math.min(100, game.stats.thirst + 30);
            game.stats.radiation += 7;
            audio.eat();
            game.msg('You drink the gritty water. The Geiger counter chatters. (+30 thirst, +7 rads)', 'info');
          },
        };
      }
      return null;
    },
    update: (dt) => {
      tick += dt;
      if (waterMat.userData.shader) waterMat.userData.shader.uniforms.uTime.value = tick;
      fireObjs.forEach((f) => {
        if (f.group.position.distanceTo(game.pos) < 150) f.update(dt);
      });
      spawnCd -= dt;
      if (spawnCd <= 0) {
        spawnCd = (35 + R() * 25) * difficultyMods(game.stats).spawnRate;
        const hostiles = game.actors.filter((a) => !a.dead && a.pos.distanceTo(game.pos) < 120).length;
        if (hostiles < 4) {
          const ang = R() * Math.PI * 2;
          const sx = game.pos.x + Math.cos(ang) * 95;
          const sz = game.pos.z + Math.sin(ang) * 95;
          const kind = R() < (winter ? 0.6 : 0.5) ? 'raider' : 'wolf';
          spawnGroup(kind, Math.max(-HALF + 10, Math.min(HALF - 10, sx)), Math.max(-HALF + 10, Math.min(HALF - 10, sz)), kind === 'wolf' ? 3 : 2);
          if (kind === 'wolf') audio.growl();
        }
      }
      if (Math.floor(tick) % 45 === 0 && Math.floor(tick - dt) % 45 !== 0 && tick > 5) {
        const lines = winter
          ? ['Radio static: "...temperatures at minus 30... stay near fire..."', 'Your breath freezes on your scarf. Keep moving.', 'Distant gunfire echoes through the pass.']
          : ['Radio static: "...fallout plumes drifting east... avoid craters..."', 'Ash falls like grey snow. The sun is a dim red coin.', 'You hear wolves howling in the dead forest.'];
        game.msg(lines[Math.floor(R() * lines.length)], 'radio');
      }
    },
  };
}
