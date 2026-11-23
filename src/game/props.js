import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ammoBoxTexture,
  barkPBR,
  cabinLogPBR,
  ceilingTilePBR,
  concretePBR,
  contactShadowTexture,
  facadePBR,
  hazardTexture,
  helipadTexture,
  industrialWallPBR,
  interiorWallPBR,
  mulberry32,
  needleBoughTexture,
  noise2,
  puddleMaskTexture,
  rugPBR,
  shinglePBR,
  sidingPBR,
  signTexture,
  smokeTexture,
  streetSignTexture,
  tileFloorPBR,
  woodFloorPBR,
} from './textures.js';

const std = (o) => new THREE.MeshStandardMaterial(o);

let wheelGeo = null;
let rimGeo = null;
const glassMat = std({ color: 0x0b121c, roughness: 0.08, metalness: 0.92 });
const tireMat = std({ color: 0x151515, roughness: 0.92, metalness: 0.05 });
const rimMat = std({ color: 0x8b9098, roughness: 0.3, metalness: 0.85 });
const bumperMat = std({ color: 0x1e1f22, roughness: 0.55, metalness: 0.4 });
const lightMat = std({ color: 0xffffee, emissive: 0xfff3c0, emissiveIntensity: 0.7 });
const tailMat = std({ color: 0x550000, emissive: 0xaa0000, emissiveIntensity: 0.45 });

export function addContactShadow(parent, radius = 1.2, y = 0.02, opacity = 0.45) {
  const mat = new THREE.MeshBasicMaterial({
    map: contactShadowTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 16), mat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = y;
  parent.add(disc);
  return disc;
}

export function makeCar(color, rusted = false, police = false) {
  const grp = new THREE.Group();
  const baseCol = rusted ? new THREE.Color(color).lerp(new THREE.Color(0x52341e), 0.68).getHex() : color;
  const paint = std({
    color: baseCol,
    roughness: rusted ? 0.94 : 0.28,
    metalness: rusted ? 0.25 : 0.65,
  });

  // Lower chassis + sculpted hood/trunk silhouette
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.54, 4.32), paint);
  chassis.position.y = 0.54;
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.16, 1.25), paint);
  hood.position.set(0, 0.84, 1.45);
  hood.rotation.x = 0.05;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.58, 0.56, 2.05),
    police ? std({ color: 0xf0f2f5, roughness: 0.28, metalness: 0.45 }) : paint,
  );
  cabin.position.set(0, 1.12, -0.18);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.42, 1.85), glassMat);
  glass.position.set(0, 1.12, -0.18);
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.2, 0.18), bumperMat);
  frontBumper.position.set(0, 0.34, 2.18);
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.2, 0.18), bumperMat);
  rearBumper.position.set(0, 0.34, -2.18);

  if (!wheelGeo) {
    const tParts = [];
    const rParts = [];
    for (const [x, z] of [
      [-0.88, 1.35],
      [0.88, 1.35],
      [-0.88, -1.35],
      [0.88, -1.35],
    ]) {
      const c = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 16);
      c.rotateZ(Math.PI / 2);
      c.translate(x, 0.36, z);
      tParts.push(c);

      const rm = new THREE.CylinderGeometry(0.21, 0.21, 0.28, 12);
      rm.rotateZ(Math.PI / 2);
      rm.translate(x, 0.36, z);
      rParts.push(rm);
    }
    wheelGeo = mergeGeometries(tParts);
    rimGeo = mergeGeometries(rParts);
  }
  const wheels = new THREE.Mesh(wheelGeo, tireMat);
  const rims = new THREE.Mesh(rimGeo, rusted ? bumperMat : rimMat);
  if (rusted) {
    wheels.position.y = -0.12;
    rims.position.y = -0.12;
  }
  grp.add(chassis, hood, cabin, glass, frontBumper, rearBumper, wheels, rims);

  for (const sx of [-0.66, 0.66]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.15, 0.06), rusted ? tireMat : lightMat);
    hl.position.set(sx, 0.62, 2.17);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.15, 0.06), tailMat);
    tl.position.set(sx, 0.62, -2.17);
    grp.add(hl, tl);
  }

  if (police) {
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.07, 0.28), bumperMat);
    barBase.position.set(0, 1.43, -0.2);
    const red = std({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 });
    const blue = std({ color: 0x0044ff, emissive: 0x0044ff, emissiveIntensity: 2 });
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.13, 0.24), red);
    r.position.set(-0.3, 1.5, -0.2);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.13, 0.24), blue);
    b.position.set(0.3, 1.5, -0.2);
    grp.add(barBase, r, b);
    grp.userData.siren = [red, blue];
  }

  grp.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  addContactShadow(grp, 2.5, 0.025, 0.42);
  return grp;
}

export function texturedBox(w, h, d, mats, tile = 16) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const dims = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * (dims[f][0] / tile), uv.getY(i) * (dims[f][1] / tile));
    }
  }
  const mesh = new THREE.Mesh(geo, mats);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------- Realistic Multi-Tier Conifer & Deadwood Forest ----------
function buildGnarledTrunkGeo() {
  // Lathe profile from y=0 (flared buttress root) to y=1 (tapered tip)
  const pts = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const rootFlare = Math.exp(-t * 8.5) * 0.22;
    const r = 0.24 * (1 - t * 0.78) + rootFlare;
    pts.push(new THREE.Vector2(r, t));
  }
  const geo = new THREE.LatheGeometry(pts, 9);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    // Subtle buttress ribs near ground + natural bend
    const rib = 1 + Math.sin(ang * 5 + y * 3) * (y < 0.2 ? 0.18 : 0.06);
    const bend = Math.sin(y * Math.PI) * 0.06;
    pos.setXYZ(i, x * rib + bend, y, z * rib);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildDeadBranchesGeo() {
  // Asymmetric forked bare limbs for burnt snags & under-canopy branches
  const parts = [];
  const specs = [
    { y: 0.42, yaw: 0.4, tilt: 1.05, len: 0.72, r: 0.05 },
    { y: 0.56, yaw: 2.3, tilt: 0.95, len: 0.65, r: 0.045 },
    { y: 0.68, yaw: 4.1, tilt: 0.85, len: 0.55, r: 0.04 },
    { y: 0.79, yaw: 5.4, tilt: 0.75, len: 0.42, r: 0.032 },
  ];
  for (const s of specs) {
    const limb = new THREE.CylinderGeometry(s.r * 0.35, s.r, s.len, 5);
    limb.translate(0, s.len * 0.5, 0);
    limb.rotateZ(-s.tilt);
    limb.rotateY(s.yaw);
    limb.translate(0, s.y, 0);
    parts.push(limb);

    // Forked sub-twig
    const sub = new THREE.CylinderGeometry(s.r * 0.2, s.r * 0.45, s.len * 0.5, 4);
    sub.translate(0, s.len * 0.25, 0);
    sub.rotateZ(-s.tilt - 0.35);
    sub.rotateY(s.yaw + 0.5);
    sub.translate(Math.cos(s.yaw) * s.len * 0.45, s.y + s.len * 0.25, -Math.sin(s.yaw) * s.len * 0.45);
    parts.push(sub);
  }
  return mergeGeometries(parts);
}

function buildBoughWhorlGeo() {
  // Creates one dense whorl of 6 drooping 3D conifer boughs using crossed angled cards
  // so trees have full volumetric needles from both eye level and above (zero flat disc look)
  const cards = [];
  const arms = 6;
  for (let i = 0; i < arms; i++) {
    const ang = (i / arms) * Math.PI * 2 + (i % 2) * 0.21;
    const tiltDown = 0.58 + (i % 3) * 0.07; // steep realistic spruce/pine droop (~33-41 deg)
    for (const roll of [-0.42, 0.42]) {
      const plane = new THREE.PlaneGeometry(0.92, 1.32, 2, 3);
      const p = plane.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const px = p.getX(v);
        const t = (p.getY(v) + 0.66) / 1.32; // 0 at trunk -> 1 at branch tip
        const arch = Math.sin(t * Math.PI) * 0.1 - t * t * 0.24;
        const radial = 0.04 + t * 1.18;
        p.setXYZ(v, px, arch, radial);
      }
      plane.rotateZ(roll);
      plane.rotateX(tiltDown);
      plane.rotateY(ang);
      cards.push(plane);
    }
  }
  const merged = mergeGeometries(cards);
  merged.computeVertexNormals();
  return merged;
}

let sharedTrunkGeo = null;
let sharedDeadBranchesGeo = null;
let sharedBoughWhorlGeo = null;

export function makeForest(trees, style) {
  const grp = new THREE.Group();
  if (!trees.length) return grp;

  if (!sharedTrunkGeo) sharedTrunkGeo = buildGnarledTrunkGeo();
  if (!sharedDeadBranchesGeo) sharedDeadBranchesGeo = buildDeadBranchesGeo();
  if (!sharedBoughWhorlGeo) sharedBoughWhorlGeo = buildBoughWhorlGeo();

  const bark = barkPBR(style);
  const trunkMat = std({
    map: bark.map,
    normalMap: bark.normalMap,
    normalScale: new THREE.Vector2(1.4, 1.4),
    color: 0xffffff,
    roughness: 0.94,
  });

  const needles = needleBoughTexture(style);
  const boughMat = std({
    map: needles,
    alphaTest: 0.28,
    side: THREE.DoubleSide,
    roughness: style === 'snow' ? 0.78 : 0.9,
    metalness: 0.0,
    color: 0xffffff,
  });

  const trunks = new THREE.InstancedMesh(sharedTrunkGeo, trunkMat, trees.length);
  const branches = new THREE.InstancedMesh(sharedDeadBranchesGeo, trunkMat, trees.length);
  const tiersPerTree = 8;
  const boughs = new THREE.InstancedMesh(sharedBoughWhorlGeo, boughMat, trees.length * tiersPerTree);

  const rnd = mulberry32(style === 'snow' ? 9123 : style === 'park' ? 7711 : style === 'pine' ? 5331 : 4567);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let bi = 0;

  for (let i = 0; i < trees.length; i++) {
    const t = trees[i];
    const h = (8.8 + rnd() * 2.8) * t.s;
    const girth = t.s * (0.9 + rnd() * 0.25);
    const leanX = (rnd() - 0.5) * 0.08;
    const leanZ = (rnd() - 0.5) * 0.08;
    const baseYaw = rnd() * Math.PI * 2;

    dummy.position.set(t.x, t.y - 0.25, t.z);
    dummy.rotation.set(leanX, baseYaw, leanZ);
    dummy.scale.set(girth, h * 0.91, girth);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);

    const barkShade = 0.78 + rnd() * 0.32;
    col.setRGB(barkShade, barkShade * 0.98, barkShade * 0.95);
    trunks.setColorAt(i, col);

    // Dead/exposed under-branches (mostly on burnt snags)
    const dead = style === 'burnt' && rnd() < 0.36;
    const brScale = dead ? girth * 1.15 : girth * 0.65;
    dummy.scale.set(brScale, dead ? h : h * 0.72, brScale);
    dummy.updateMatrix();
    branches.setMatrixAt(i, dummy.matrix);
    branches.setColorAt(i, col);

    for (let k = 0; k < tiersPerTree; k++) {
      const kt = k / (tiersPerTree - 1);
      // Cover from lower boughs all the way up to the top spire
      const tierY = t.y + h * (0.18 + kt * 0.79);
      const crownProfile = Math.pow(1 - kt * 0.86, 0.85);
      const radius = 2.15 * crownProfile * t.s * (style === 'burnt' ? 0.78 : 1.05) * (0.9 + rnd() * 0.2);
      const tierScaleY = t.s * (1.28 - kt * 0.52);

      if (dead) {
        dummy.position.set(t.x, tierY, t.z);
        dummy.scale.set(0.0001, 0.0001, 0.0001);
        dummy.updateMatrix();
        boughs.setMatrixAt(bi, dummy.matrix);
      } else {
        dummy.position.set(t.x + leanZ * (tierY - t.y) * 0.5, tierY, t.z - leanX * (tierY - t.y) * 0.5);
        dummy.rotation.set(leanX * 0.6, baseYaw + k * 0.48 + (rnd() - 0.5) * 0.35, leanZ * 0.6);
        dummy.scale.set(radius, tierScaleY, radius);
        dummy.updateMatrix();
        boughs.setMatrixAt(bi, dummy.matrix);

        if (style === 'snow') {
          const tint = 0.84 + rnd() * 0.22;
          col.setRGB(tint * 0.93, tint * 0.98, tint);
        } else if (style === 'park' || style === 'pine') {
          const tint = 0.8 + rnd() * 0.3;
          col.setRGB(tint * 0.92, tint, tint * 0.85);
        } else {
          const tint = 0.75 + rnd() * 0.32;
          col.setRGB(tint, tint * 0.9, tint * 0.8);
        }
        boughs.setColorAt(bi, col);
      }
      bi++;
    }
  }

  for (const im of [trunks, branches, boughs]) {
    // Alpha-tested needle boughs skip the expensive shadow-depth discard pass; trunks/branches still cast crisp shadows
    im.castShadow = im !== boughs;
    im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    grp.add(im);
  }
  return grp;
}

// ---------- Dense Multi-Blade Grass & Scrub Tuft Clutter ----------
export function makeGroundClutter(specs, style) {
  if (!specs.length) return new THREE.Group();
  const planes = [];
  const count = 4;
  for (let k = 0; k < count; k++) {
    const p = new THREE.PlaneGeometry(0.95, 0.68);
    p.translate(0, 0.32, 0);
    p.rotateX((k % 2 === 0 ? 1 : -1) * 0.16);
    p.rotateY((k * Math.PI) / count);
    planes.push(p);
  }
  const geo = mergeGeometries(planes);

  const tint =
    style === 'snow'
      ? 0xdce6f0
      : style === 'park' || style === 'grass'
        ? 0x6f9446
        : 0x9e8c68;

  const mat = std({
    map: needleBoughTexture(style === 'grass' ? 'park' : style),
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    roughness: 0.92,
    color: tint,
  });

  const im = new THREE.InstancedMesh(geo, mat, specs.length);
  const d = new THREE.Object3D();
  const col = new THREE.Color();
  const rnd = mulberry32(2026);

  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    d.position.set(s.x, s.y - 0.04, s.z);
    d.rotation.set((rnd() - 0.5) * 0.14, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.14);
    d.scale.set(s.s * (0.85 + rnd() * 0.55), s.s * (0.72 + rnd() * 0.55), s.s * (0.85 + rnd() * 0.55));
    d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
    const k = 0.78 + rnd() * 0.36;
    if (style === 'park' || style === 'grass') col.setRGB(k * 0.88, k * 1.05, k * 0.72);
    else col.setRGB(k, k * 0.94, k * 0.84);
    im.setColorAt(i, col);
  }
  im.receiveShadow = true;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}

// ---------- Reflective Street / Gravel Puddles ----------
export function makePuddles(list, frozen = false) {
  if (!list.length) return new THREE.Group();
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = std({
    map: puddleMaskTexture(),
    color: frozen ? 0xcbe0f2 : 0x566c7c,
    roughness: frozen ? 0.12 : 0.04,
    metalness: frozen ? 0.55 : 0.92,
    envMapIntensity: 2.1,
    transparent: true,
    opacity: frozen ? 0.78 : 0.84,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const d = new THREE.Object3D();
  list.forEach((p, i) => {
    d.position.set(p.x, (p.y ?? 0) + 0.024, p.z);
    d.rotation.set(0, p.rotY ?? p.rot ?? i * 1.1, 0);
    d.scale.set(p.sx ?? p.w ?? 3.5, 1, p.sz ?? p.d ?? 2.6);
    d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
  });
  im.receiveShadow = true;
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  im.userData.puddles = list;
  return im;
}

export function isInPuddle(puddles, x, z, pad = 0.05) {
  if (!puddles || !puddles.length) return null;
  for (let i = 0; i < puddles.length; i++) {
    const p = puddles[i];
    const rx = ((p.sx ?? p.w ?? 3.5) * 0.42) + pad;
    const rz = ((p.sz ?? p.d ?? 2.6) * 0.42) + pad;
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz > Math.max(rx, rz) * Math.max(rx, rz)) continue;
    const rot = p.rotY ?? p.rot ?? 0;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if ((lx * lx) / (rx * rx) + (lz * lz) / (rz * rz) <= 1.0) return p;
  }
  return null;
}

// ---------- Realistic Faceted Rocks with Micro-Relief ----------
export function makeRocks(list, color) {
  const geo = new THREE.DodecahedronGeometry(1, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = noise2(x * 2.1 + 4.3, z * 2.1 + y * 1.7);
    const scale = 0.72 + n * 0.48;
    pos.setXYZ(i, x * scale, y * scale * 0.68, z * scale);
  }
  geo.computeVertexNormals();

  const conc = concretePBR();
  const mat = std({
    color: 0xffffff,
    map: conc.map,
    normalMap: conc.normalMap,
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughness: 0.93,
    metalness: 0.04,
  });

  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const d = new THREE.Object3D();
  const baseCol = new THREE.Color(color);
  const col = new THREE.Color();
  const rnd = mulberry32(888);

  list.forEach((r, i) => {
    d.position.set(r.x, r.y - r.s * 0.15, r.z);
    d.rotation.set(rnd() * 0.8, rnd() * 6.28, rnd() * 0.8);
    d.scale.set(r.s * (0.9 + rnd() * 0.3), r.s * (0.75 + rnd() * 0.35), r.s * (0.9 + rnd() * 0.3));
    d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
    const shade = 0.78 + rnd() * 0.36;
    col.copy(baseCol).multiplyScalar(shade);
    im.setColorAt(i, col);
  });
  im.castShadow = true;
  im.receiveShadow = true;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}

// ---------- Realistic Barrel / Log Fires with Embers + Smoke ----------
export class Fire {
  group = new THREE.Group();
  flames = [];
  smokes = [];
  t = Math.random() * 10;
  base;

  constructor(barrel = true) {
    this.base = barrel ? 0.9 : 0.18;
    if (barrel) {
      const b = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.35, 0.95, 16, 1, true),
        std({ color: 0x452b1d, roughness: 0.85, metalness: 0.45, side: THREE.DoubleSide }),
      );
      b.position.y = 0.47;
      b.castShadow = true;
      this.group.add(b);

      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.355, 0.025, 8, 16), std({ color: 0x222222, roughness: 0.6, metalness: 0.7 }));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.94;
      this.group.add(rim);

      const embers = new THREE.Mesh(
        new THREE.CircleGeometry(0.33, 12),
        std({ color: 0xff4500, emissive: 0xff5500, emissiveIntensity: 2.5, roughness: 0.9 }),
      );
      embers.rotation.x = -Math.PI / 2;
      embers.position.y = 0.72;
      this.group.add(embers);
    } else {
      const logs = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.05, 7), std({ color: 0x24160d, roughness: 0.95 }));
        l.rotation.z = Math.PI / 2 - 0.12;
        l.rotation.y = (i * Math.PI) / 5;
        l.position.y = 0.12;
        logs.add(l);
      }
      const bed = new THREE.Mesh(
        new THREE.CircleGeometry(0.45, 12),
        std({ color: 0x220800, emissive: 0xff4400, emissiveIntensity: 1.8 }),
      );
      bed.rotation.x = -Math.PI / 2;
      bed.position.y = 0.03;
      this.group.add(logs, bed);
    }

    const tex = smokeTexture();
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, color: 0xff8a2a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
      );
      this.group.add(s);
      this.flames.push(s);
    }
    for (let i = 0; i < 4; i++) {
      const sm = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, color: 0x2c2826, depthWrite: false, transparent: true, opacity: 0.35 }),
      );
      this.group.add(sm);
      this.smokes.push(sm);
    }
  }

  update(dt) {
    this.t += dt;
    this.flames.forEach((s, i) => {
      const k = (this.t * 1.55 + i / 6) % 1;
      s.position.set(Math.sin(i * 3.1 + this.t * 3.5) * 0.12, this.base + k * 1.25, Math.cos(i * 2.4 + this.t * 3.1) * 0.12);
      const sc = (1 - k) * 1.15 + 0.22;
      s.scale.set(sc, sc * 1.35, 1);
      s.material.opacity = (1 - k) * 0.85;
      s.material.color.setHSL(0.05 + (1 - k) * 0.06, 1, 0.45 + (1 - k) * 0.2);
    });
    this.smokes.forEach((sm, i) => {
      const k = (this.t * 0.45 + i / 4) % 1;
      sm.position.set(Math.sin(i * 1.7 + this.t * 0.8) * 0.35 + k * 0.5, this.base + 1.0 + k * 3.2, Math.cos(i * 2.1 + this.t * 0.7) * 0.35);
      const sc = 0.7 + k * 2.1;
      sm.scale.set(sc, sc, 1);
      sm.material.opacity = Math.sin(k * Math.PI) * 0.32;
    });
  }
}

export function makeCrate(military = true) {
  const grp = new THREE.Group();
  const mat = std({ color: military ? 0x3e4a2a : 0x7a5a36, roughness: 0.88 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.75, 0.8), mat);
  box.position.y = 0.38;
  box.castShadow = box.receiveShadow = true;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.08, 0.86), mat);
  lid.position.y = 0.76;
  lid.castShadow = true;
  const strip = new THREE.Mesh(new THREE.BoxGeometry(1.33, 0.1, 0.83), std({ color: 0x222222, metalness: 0.7, roughness: 0.35 }));
  strip.position.y = 0.58;
  grp.add(box, lid, strip);
  if (military) {
    const s = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.22),
      new THREE.MeshBasicMaterial({ map: signTexture('U.S. ARMY', '#3e4a2a', '#e8e0c0') }),
    );
    s.position.set(0, 0.38, 0.41);
    grp.add(s);
  }
  addContactShadow(grp, 0.9, 0.02, 0.35);
  return grp;
}

export function makeRadSign() {
  const grp = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 2.05, 8), std({ color: 0x5c5c58, metalness: 0.75, roughness: 0.45 }));
  post.position.y = 1.02;
  post.castShadow = true;
  grp.add(post);

  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#e5b800';
  x.beginPath();
  x.moveTo(64, 4);
  x.lineTo(124, 120);
  x.lineTo(4, 120);
  x.closePath();
  x.fill();
  x.strokeStyle = '#111';
  x.lineWidth = 5;
  x.stroke();
  x.fillStyle = '#111';
  x.beginPath();
  x.arc(64, 82, 7, 0, Math.PI * 2);
  x.fill();
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
    x.beginPath();
    x.moveTo(64, 82);
    x.arc(64, 82, 30, a - 0.5, a + 0.5);
    x.closePath();
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.72, 0.72),
    new THREE.MeshStandardMaterial({ map: t, transparent: true, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.2 }),
  );
  sign.position.y = 2.05;
  grp.add(sign);
  return grp;
}

export function makeCabin() {
  const grp = new THREE.Group();
  const logPbr = cabinLogPBR();
  const wood = pbrMat(logPbr, 2, 1.5);
  const trim = std({ color: 0x2d2118, roughness: 0.88 });
  const conc = concretePBR();
  const stone = pbrMat(conc, 2, 1, { color: 0x908b83, roughness: 0.95 });

  // Stone foundation plinth
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.5, 5.3), stone);
  plinth.position.y = 0.25;
  // Timber walls
  const walls = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 5), wood);
  walls.position.y = 1.9;
  // Gabled pitched roof
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.9, 2.2, 4), pbrMat(shinglePBR(false), 2, 2, { flatShading: true }));
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.86;
  roof.position.y = 4.45;
  // Stone chimney
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.75, 2.6, 0.75), stone);
  chimney.position.set(-2.1, 4.4, -1.2);

  // Door frame & jambs
  const jamb = new THREE.Mesh(new THREE.BoxGeometry(1.22, 2.15, 0.16), trim);
  jamb.position.set(0, 1.45, 2.52);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.96, 2.0, 0.18), std({ color: 0x3b2414, roughness: 0.85 }));
  door.position.set(0, 1.4, 2.54);

  // Window with frame & faint amber glow
  const winFrame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 0.14), trim);
  winFrame.position.set(1.85, 2.05, 2.51);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.78), std({ color: 0x111111, emissive: 0x442200, emissiveIntensity: 0.65, roughness: 0.15 }));
  win.position.set(1.85, 2.05, 2.59);

  grp.add(plinth, walls, roof, chimney, jamb, door, winFrame, win);
  grp.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  return grp;
}

export function makeAmmoPickup(kind = 'rifle') {
  const grp = new THREE.Group();
  const boxTex = ammoBoxTexture(kind);
  const sideMat = std({
    color: kind === 'shotgun' ? 0x991b1b : kind === 'pistol' ? 0x1e3a5f : kind === 'sniper' ? 0x33404a : 0x3f4d28,
    roughness: 0.62,
    metalness: 0.3,
  });
  const labelMat = std({
    color: 0xffffff,
    map: boxTex,
    emissive: 0xffffff,
    emissiveMap: boxTex,
    emissiveIntensity: 0.25,
    roughness: 0.55,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.32, 0.36), [sideMat, sideMat, labelMat, sideMat, labelMat, labelMat]);
  body.position.y = 0.2;
  body.castShadow = body.receiveShadow = true;
  const latch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.39), std({ color: 0xd4af37, metalness: 0.85, roughness: 0.25 }));
  latch.position.y = 0.26;
  const ringMat = new THREE.MeshBasicMaterial({
    color: kind === 'shotgun' ? 0xf59e0b : kind === 'pistol' ? 0x60a5fa : kind === 'sniper' ? 0xe2e8f0 : kind === 'grenade' ? 0xef4444 : 0x84cc16,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.48, 20), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  grp.add(body, latch, ring);
  grp.userData.box = body;
  return grp;
}

export function makeTerminal(accent = '#38bdf8') {
  const grp = new THREE.Group();
  const hullMat = std({ color: 0x262b33, metalness: 0.72, roughness: 0.38 });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.05, 0.75), hullMat);
  desk.position.y = 0.525;
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.72, 0.52), hullMat);
  hood.position.set(0, 1.38, -0.06);
  const crt = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92, 0.5),
    new THREE.MeshBasicMaterial({ color: accent }),
  );
  crt.position.set(0, 1.4, 0.21);
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x4ade80 }),
  );
  led.position.set(0.45, 1.1, 0.24);
  grp.add(desk, hood, crt, led);
  grp.traverse((o) => {
    if (o.isMesh && o.material?.color) o.castShadow = o.receiveShadow = true;
  });
  return grp;
}

export function pbrMat(pbr, rx = 1, ry = 1, extra = {}) {
  const map = pbr.map.clone();
  map.needsUpdate = true;
  map.repeat.set(rx, ry);
  const normalMap = pbr.normalMap ? pbr.normalMap.clone() : null;
  if (normalMap) {
    normalMap.needsUpdate = true;
    normalMap.repeat.set(rx, ry);
  }
  const roughnessMap = pbr.roughnessMap ? pbr.roughnessMap.clone() : null;
  if (roughnessMap) {
    roughnessMap.needsUpdate = true;
    roughnessMap.repeat.set(rx, ry);
  }
  return std({
    color: 0xffffff,
    map,
    normalMap,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughnessMap,
    roughness: 1.0,
    ...extra,
  });
}

export function makeBunkerEntrance(label, colliders = null, obstacles = null, cx = 0, baseY = 0, cz = 0, rotY = 0) {
  const grp = new THREE.Group();
  grp.position.set(cx, baseY, cz);
  grp.rotation.y = rotY;

  const cPbr = concretePBR();
  const conc = pbrMat(cPbr, 3, 2, { color: 0xd0ccc4, roughness: 0.94 });
  const floorMat = pbrMat(tileFloorPBR('bunker'), 3.5, 3.5, { emissive: 0x101614, emissiveIntensity: 0.25 });
  const intWallMat = pbrMat(cPbr, 3, 1.5, { color: 0xc2c8c0, emissive: 0x1f2b24, emissiveIntensity: 0.35 });
  const steelMat = std({ color: 0x3b463c, metalness: 0.78, roughness: 0.42 });

  const w = 9.2;
  const d = 9.6;
  const h = 3.6;
  const wt = 0.5;
  const doorW = 2.8;
  const doorH = 2.7;

  const addWall = (lx, ly, lz, lw, lh, ld, mat, collide = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(lw, lh, ld), mat);
    m.position.set(lx, ly, lz);
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
    if (obstacles) obstacles.push(m);
    if (collide && colliders) pushRotatedBoxCollider(colliders, cx, cz, rotY, lx, lz, lw, ld, baseY, baseY + h);
    return m;
  };

  // Floor & heavy reinforced roof slab
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.14, d - 0.1), floorMat);
  floor.position.set(0, 0.07, 0);
  floor.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.45, d + 0.6), conc);
  roof.position.set(0, h + 0.2, 0);
  roof.castShadow = roof.receiveShadow = true;
  grp.add(floor, roof);

  // Exterior & interior concrete blast walls
  addWall(-w / 2 + wt / 2, h / 2, 0, wt, h, d, conc);
  addWall(w / 2 - wt / 2, h / 2, 0, wt, h, d, conc);
  addWall(0, h / 2, -d / 2 + wt / 2, w, h, wt, conc);

  const sideW = (w - doorW) / 2;
  addWall(-w / 2 + sideW / 2, h / 2, d / 2 - wt / 2, sideW, h, wt, conc);
  addWall(w / 2 - sideW / 2, h / 2, d / 2 - wt / 2, sideW, h, wt, conc);
  addWall(0, doorH + (h - doorH) / 2, d / 2 - wt / 2, doorW, h - doorH, wt, conc, false);

  // Wing walls & exterior hazard trim around open blast doorway
  const wingL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.8, 1.5), conc);
  wingL.position.set(-2.3, 1.4, d / 2 + 0.75);
  const wingR = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.8, 1.5), conc);
  wingR.position.set(2.3, 1.4, d / 2 + 0.75);
  const stripeTex = hazardTexture();
  const stripeMat = std({ map: stripeTex, roughness: 0.65 });
  for (const [sx, sy, sz, sw, sh, sd] of [
    [0, h - 0.14, d / 2 + 0.06, w + 0.12, 0.36, 0.08],
    [-w / 2 - 0.05, h - 0.14, 0, 0.08, 0.36, d + 0.12],
    [w / 2 + 0.05, h - 0.14, 0, 0.08, 0.36, d + 0.12],
    [0, h - 0.14, -d / 2 - 0.05, w + 0.12, 0.36, 0.08],
  ]) {
    const sb = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), stripeMat);
    sb.position.set(sx, sy, sz);
    grp.add(sb);
  }
  grp.add(wingL, wingR);

  // Heavy steel blast door swung open so player walks inside
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.4, doorH + 0.2, 0.3), steelMat);
  doorFrame.position.set(0, doorH / 2 + 0.1, d / 2 + 0.04);
  const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.1, doorH - 0.1, 0.24), steelMat);
  doorLeaf.position.set(-doorW * 0.52, doorH / 2, d / 2 + 1.15);
  doorLeaf.rotation.y = 0.88;
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 8, 16), std({ color: 0x9ca3af, metalness: 0.85, roughness: 0.3 }));
  wheel.position.set(-doorW * 0.38, 1.35, d / 2 + 1.38);
  wheel.rotation.y = 0.88;
  grp.add(doorFrame, doorLeaf, wheel);

  const signTex = signTexture(label, '#f2c200', '#111111');
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.98), new THREE.MeshBasicMaterial({ map: signTex }));
  sign.position.set(0, h - 0.2, d / 2 + 0.14);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 10, 8),
    std({ color: 0xff3300, emissive: 0xff2200, emissiveIntensity: 3 }),
  );
  lamp.position.set(0, h + 0.58, d / 2 + 0.06);
  grp.add(sign, lamp);

  // Interior concrete lining + interior ceiling slab + bulkhead lights
  const inL = new THREE.Mesh(new THREE.PlaneGeometry(d - wt * 2, h - 0.2), intWallMat);
  inL.position.set(-w / 2 + wt + 0.02, h / 2, 0);
  inL.rotation.y = Math.PI / 2;
  const inR = new THREE.Mesh(new THREE.PlaneGeometry(d - wt * 2, h - 0.2), intWallMat);
  inR.position.set(w / 2 - wt - 0.02, h / 2, 0);
  inR.rotation.y = -Math.PI / 2;
  const inB = new THREE.Mesh(new THREE.PlaneGeometry(w - wt * 2, h - 0.2), intWallMat);
  inB.position.set(0, h / 2, -d / 2 + wt + 0.02);
  const inCeil = new THREE.Mesh(new THREE.PlaneGeometry(w - wt * 2, d - wt * 2), intWallMat);
  inCeil.position.set(0, h - 0.04, 0);
  inCeil.rotation.x = Math.PI / 2;
  grp.add(inL, inR, inB, inCeil);

  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xbef29a });
  for (const lz of [-2.2, 1.6]) {
    const fix = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 0.35), bulbMat);
    fix.position.set(0, h - 0.12, lz);
    grp.add(fix);
  }

  // Interior shelter furnishings: double bunk bed, supply crates/drums, Geiger air-recycler console, rear airlock hatch
  const frameMat = std({ color: 0x374151, metalness: 0.7, roughness: 0.45 });
  const mattressMat = std({ color: 0x4b5d46, roughness: 0.9 });
  for (const by of [0.55, 1.65]) {
    const bunk = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.16, 2.2), mattressMat);
    bunk.position.set(-3.2, by, -1.2);
    grp.add(bunk);
  }
  for (const pz of [-2.25, -0.15]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), frameMat);
    post.position.set(-3.7, 1.1, pz);
    const post2 = post.clone();
    post2.position.x = -2.7;
    grp.add(post, post2);
  }
  if (colliders) pushRotatedBoxCollider(colliders, cx, cz, rotY, -3.2, -1.2, 1.25, 2.3, baseY, baseY + h);

  // Supply crates + water barrels on right wall
  const crateMat = std({ color: 0x4a5534, roughness: 0.85 });
  const drumMat = std({ color: 0x1d4ed8, roughness: 0.45, metalness: 0.2 });
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 1.1), crateMat);
  c1.position.set(3.15, 0.55, -2.0);
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.75, 0.9), crateMat);
  c2.position.set(3.2, 1.35, -2.0);
  const drum1 = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.05, 12), drumMat);
  drum1.position.set(3.25, 0.62, 0.1);
  const drum2 = drum1.clone();
  drum2.position.set(3.25, 0.62, 1.0);
  grp.add(c1, c2, drum1, drum2);
  if (colliders) pushRotatedBoxCollider(colliders, cx, cz, rotY, 3.2, -0.5, 1.4, 3.8, baseY, baseY + h);

  // Air-recycler / comms terminal + back vault hatch wheel
  const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.45, 0.7), frameMat);
  consoleBox.position.set(-1.7, 0.82, -d / 2 + wt + 0.5);
  const crt = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.42), new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
  crt.position.set(-1.7, 1.15, -d / 2 + wt + 0.86);
  const backHatch = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.28, 18), steelMat);
  backHatch.rotation.x = Math.PI / 2;
  backHatch.position.set(0.4, 1.45, -d / 2 + wt + 0.16);
  const backWheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.045, 8, 16), std({ color: 0xf59e0b, metalness: 0.8, roughness: 0.3 }));
  backWheel.position.set(0.4, 1.45, -d / 2 + wt + 0.35);
  grp.add(consoleBox, crt, backHatch, backWheel);

  const ip = localToWorld(cx, cz, rotY, 0, -2.1);
  grp.userData.lamp = lamp;
  grp.userData.interactPos = new THREE.Vector3(ip.x, baseY, ip.z);
  grp.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  return grp;
}

export function beacon(color) {
  const grp = new THREE.Group();
  const sTex = smokeTexture();
  // Ground flare / emergency signal smoke stack (no unnatural sci-fi laser columns)
  for (let i = 0; i < 4; i++) {
    const puff = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: sTex,
        color,
        transparent: true,
        opacity: 0.26 - i * 0.05,
        depthWrite: false,
      }),
    );
    puff.position.set((i % 2 ? 0.6 : -0.6) * i * 0.4, 3 + i * 5.5, 0);
    puff.scale.setScalar(4.5 + i * 2.5);
    grp.add(puff);
  }
  const flare = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 8),
    new THREE.MeshBasicMaterial({ color }),
  );
  flare.position.y = 0.35;
  grp.add(flare);
  return grp;
}

export function localToWorld(cx, cz, rotY, lx, lz) {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  return {
    x: cx + lx * cos + lz * sin,
    z: cz - lx * sin + lz * cos,
  };
}

export function pushRotatedBoxCollider(colliders, cx, cz, rotY, lx, lz, lw, ld, minY, maxY) {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const wx = cx + lx * cos + lz * sin;
  const wz = cz - lx * sin + lz * cos;
  const hw = (Math.abs(lw * cos) + Math.abs(ld * sin)) * 0.5;
  const hd = (Math.abs(lw * sin) + Math.abs(ld * cos)) * 0.5;
  const box = { minX: wx - hw, maxX: wx + hw, minZ: wz - hd, maxZ: wz + hd };
  if (minY !== undefined) box.minY = minY;
  if (maxY !== undefined) box.maxY = maxY;
  colliders.push(box);
}

// ---------- Enterable Store Building with Textured Interior, Doorway, Counter & Stock ----------
export function makeEnterableStore(def, extMat, roofMat, colliders, obstacles, cx, baseY, cz, rotY) {
  const grp = new THREE.Group();
  grp.position.set(cx, baseY, cz);
  grp.rotation.y = rotY;

  const w = 15;
  const d = 15;
  const h = 7.4;
  const wt = 0.45;
  const doorW = 3.4;
  const doorH = 3.2;

  const wallPbr = interiorWallPBR('store');
  const intWallMat = pbrMat(wallPbr, 3, 1.2, {
    emissive: 0x3b2c1a,
    emissiveMap: wallPbr.map,
    emissiveIntensity: 0.45,
  });
  const tilePbr = tileFloorPBR('store');
  const floorMat = pbrMat(tilePbr, 4, 4, {
    emissive: 0x1c1610,
    emissiveMap: tilePbr.map,
    emissiveIntensity: 0.25,
  });
  const trimMat = std({ color: 0x222428, metalness: 0.4, roughness: 0.6 });

  const addWall = (lx, ly, lz, lw, lh, ld, mat, collide = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(lw, lh, ld), mat);
    m.position.set(lx, ly, lz);
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
    obstacles.push(m);
    if (collide) pushRotatedBoxCollider(colliders, cx, cz, rotY, lx, lz, lw, ld);
    return m;
  };

  const ceilMat = pbrMat(ceilingTilePBR(), 3, 3, {
    emissive: 0x241d15,
    emissiveIntensity: 0.35,
  });

  // Floor & ceiling + roof
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.12, d - 0.1), floorMat);
  floor.position.set(0, 0.06, 0);
  floor.receiveShadow = true;
  grp.add(floor);

  const ceil = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.16, d - 0.2), ceilMat);
  ceil.position.set(0, h - 0.18, 0);
  grp.add(ceil);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.28, d + 0.3), roofMat);
  roof.position.set(0, h + 0.06, 0);
  roof.castShadow = roof.receiveShadow = true;
  grp.add(roof);

  // Exterior shell + warm interior lining
  addWall(-w / 2 + wt / 2, h / 2, 0, wt, h, d, extMat);
  addWall(w / 2 - wt / 2, h / 2, 0, wt, h, d, extMat);
  addWall(0, h / 2, -d / 2 + wt / 2, w, h, wt, extMat);

  // Inner bright drywall panels (non-colliding thin skin inside)
  const skinL = new THREE.Mesh(new THREE.PlaneGeometry(d - wt * 2, h - 0.3), intWallMat);
  skinL.position.set(-w / 2 + wt + 0.02, h / 2, 0);
  skinL.rotation.y = Math.PI / 2;
  const skinR = new THREE.Mesh(new THREE.PlaneGeometry(d - wt * 2, h - 0.3), intWallMat);
  skinR.position.set(w / 2 - wt - 0.02, h / 2, 0);
  skinR.rotation.y = -Math.PI / 2;
  const skinB = new THREE.Mesh(new THREE.PlaneGeometry(w - wt * 2, h - 0.3), intWallMat);
  skinB.position.set(0, h / 2, -d / 2 + wt + 0.02);
  grp.add(skinL, skinR, skinB);

  // Front wall split around wide 3.4m entrance doorway
  const sideW = (w - doorW) / 2;
  addWall(-w / 2 + sideW / 2, h / 2, d / 2 - wt / 2, sideW, h, wt, extMat);
  addWall(w / 2 - sideW / 2, h / 2, d / 2 - wt / 2, sideW, h, wt, extMat);
  addWall(0, doorH + (h - doorH) / 2, d / 2 - wt / 2, doorW, h - doorH, wt, extMat, false);

  // Door frame & storefront windows
  const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.16, doorH, wt + 0.08), trimMat);
  frameL.position.set(-doorW / 2, doorH / 2, d / 2 - wt / 2);
  const frameR = frameL.clone();
  frameR.position.x = doorW / 2;
  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.32, 0.16, wt + 0.08), trimMat);
  frameTop.position.set(0, doorH, d / 2 - wt / 2);
  grp.add(frameL, frameR, frameTop);

  const glassMat = std({
    color: 0x3b5870,
    emissive: 0xffb866,
    emissiveIntensity: 0.32,
    roughness: 0.05,
    metalness: 0.9,
    envMapIntensity: 1.9,
  });
  for (const sx of [-4.6, 4.6]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.4), glassMat);
    win.position.set(sx, 2.0, d / 2 + 0.03);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(3.85, 0.08, 0.08), trimMat);
    bar.position.set(sx, 2.0, d / 2 + 0.04);
    grp.add(win, bar);
  }

  // Sign & awning above doorway
  const sTex = signTexture(def.name, def.bg, def.fg);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(9.2, 2.0),
    new THREE.MeshStandardMaterial({ map: sTex, emissive: 0xffffff, emissiveMap: sTex, emissiveIntensity: 0.78 }),
  );
  sign.position.set(0, 5.1, d / 2 + 0.05);
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(12.4, 0.16, 1.7),
    std({ color: new THREE.Color(def.bg).lerp(new THREE.Color(0x444444), 0.25), roughness: 0.8 }),
  );
  awning.position.set(0, 3.65, d / 2 + 0.8);
  awning.castShadow = true;
  grp.add(sign, awning);

  // Overhead fluorescent light bars inside ceiling
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff0cc });
  for (const lz of [-3.2, 1.5]) {
    const fix = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.08, 0.45), bulbMat);
    fix.position.set(0, h - 0.32, lz);
    grp.add(fix);
  }

  // Interior Counter + Store-Specific Furnishings
  const counterMat = std({ color: 0x5c3e26, emissive: 0x1a1108, emissiveIntensity: 0.2, roughness: 0.75 });
  const shelfMat = std({ color: 0x3b4046, emissive: 0x101318, emissiveIntensity: 0.2, roughness: 0.7, metalness: 0.3 });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.05, 1.15), counterMat);
  counter.position.set(0, 0.58, -3.2);
  counter.castShadow = counter.receiveShadow = true;
  grp.add(counter);
  pushRotatedBoxCollider(colliders, cx, cz, rotY, 0, -3.2, 5.4, 1.15);

  const register = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.45), std({ color: 0x202224, metalness: 0.6, roughness: 0.4 }));
  register.position.set(-1.1, 1.32, -3.2);
  grp.add(register);

  if (def.name === 'BANK') {
    // Teller screen + massive vault door at back
    const screen = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.1, 0.08), std({ color: 0x88aabb, transparent: true, opacity: 0.35, roughness: 0.1 }));
    screen.position.set(0, 1.65, -2.7);
    const vaultDoor = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.45, 20), std({ color: 0x8a8e94, metalness: 0.85, roughness: 0.3 }));
    vaultDoor.rotation.x = Math.PI / 2;
    vaultDoor.position.set(0, 2.0, -d / 2 + wt + 0.22);
    grp.add(screen, vaultDoor);
  } else if (def.name === 'GUN SHOP') {
    const rack = new THREE.Mesh(new THREE.BoxGeometry(8.5, 2.4, 0.45), counterMat);
    rack.position.set(0, 1.3, -d / 2 + wt + 0.4);
    const crate1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.0), std({ color: 0x3d4a2e, roughness: 0.9 }));
    crate1.position.set(-4.6, 0.55, 0.4);
    grp.add(rack, crate1);
  } else {
    // Stocked merchandise shelves on left and right aisles
    for (const sx of [-4.6, 4.6]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 5.2), shelfMat);
      shelf.position.set(sx, 1.15, 0.6);
      shelf.castShadow = shelf.receiveShadow = true;
      grp.add(shelf);
      pushRotatedBoxCollider(colliders, cx, cz, rotY, sx, 0.6, 1.1, 5.2);
      // Colorful product boxes on shelves
      for (let b = 0; b < 4; b++) {
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.35, 0.7),
          std({ color: [0xb83828, 0x2a6898, 0xd49a28, 0x388a46][(b + (sx > 0 ? 1 : 0)) % 4], roughness: 0.7 }),
        );
        box.position.set(sx, 2.38, -1.2 + b * 1.15);
        grp.add(box);
      }
    }
  }

  // Return world interactable pos right in front of the interior counter
  const interactPos = localToWorld(cx, cz, rotY, 0, -1.5);
  return {
    group: grp,
    glassMat,
    interactPos: new THREE.Vector3(interactPos.x, baseY, interactPos.z),
  };
}

// ---------- Enterable Residential Home with Textured Siding, Shingle Roof & Furnished Interior ----------
export function makeHome(seed, roofMat, colliders, obstacles, cx, baseY, cz, rotY, snow = false) {
  const grp = new THREE.Group();
  grp.position.set(cx, baseY, cz);
  grp.rotation.y = rotY;

  const w = 10.6;
  const d = 9.4;
  const h = 3.8;
  const wt = 0.36;
  const doorW = 2.1;
  const doorH = 2.6;

  const extMat = pbrMat(sidingPBR(seed), 2.4, 1.2);
  const shMat = pbrMat(shinglePBR(snow), 2.5, 2.5, { flatShading: true });
  const intWallPbr = interiorWallPBR('home');
  const intWallMat = pbrMat(intWallPbr, 2.5, 1, {
    emissive: 0x352718,
    emissiveMap: intWallPbr.map,
    emissiveIntensity: 0.36,
  });
  const woodPbr = woodFloorPBR();
  const floorMat = pbrMat(woodPbr, 3, 3, {
    emissive: 0x1c1209,
    emissiveMap: woodPbr.map,
    emissiveIntensity: 0.22,
  });
  const trimMat = std({ color: 0xededeb, roughness: 0.75 });
  const cPbr = concretePBR();
  const stoneMat = pbrMat(cPbr, 2, 1, { color: 0xb8b2aa, roughness: 0.94 });

  // Foundation & front porch (plinth kept under 0.19m so hardwood floor shows cleanly)
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.18, d + 0.3), stoneMat);
  plinth.position.set(0, 0.09, 0);
  const porch = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.24, 2.0), stoneMat);
  porch.position.set(0, 0.12, d / 2 + 1.0);
  const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.18, 2.2), shMat || roofMat);
  porchRoof.position.set(0, 3.05, d / 2 + 1.05);
  grp.add(plinth, porch, porchRoof);

  for (const px of [-2.0, 2.0]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.8, 0.16), trimMat);
    post.position.set(px, 1.55, d / 2 + 1.9);
    grp.add(post);
  }

  // Interior textured hardwood floor & acoustic ceiling
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.12, d - 0.2), floorMat);
  floor.position.set(0, 0.24, 0);
  floor.receiveShadow = true;
  const ceilMat = pbrMat(ceilingTilePBR(), 2.5, 2.5, { emissive: 0x261d14, emissiveIntensity: 0.32 });
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.14, d - 0.2), ceilMat);
  ceil.position.set(0, h, 0);
  grp.add(floor, ceil);

  // Shingled pitched roof + brick chimney
  const gable = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 2.8, 4), shMat);
  gable.rotation.y = Math.PI / 4;
  gable.scale.set(1.06, 1, d / w);
  gable.position.set(0, h + 1.38, 0);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.8, 0.85), pbrMat(cPbr, 1, 2, { color: 0xa65c4a }));
  chimney.position.set(-3.0, h + 1.5, -2.0);
  grp.add(gable, chimney);

  const addWall = (lx, ly, lz, lw, lh, ld, collide = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(lw, lh, ld), extMat);
    m.position.set(lx, ly, lz);
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
    obstacles.push(m);
    if (collide) pushRotatedBoxCollider(colliders, cx, cz, rotY, lx, lz, lw, ld);
    return m;
  };

  addWall(-w / 2 + wt / 2, h / 2 + 0.15, 0, wt, h, d);
  addWall(w / 2 - wt / 2, h / 2 + 0.15, 0, wt, h, d);
  addWall(0, h / 2 + 0.15, -d / 2 + wt / 2, w, h, wt);

  const sideW = (w - doorW) / 2;
  addWall(-w / 2 + sideW / 2, h / 2 + 0.15, d / 2 - wt / 2, sideW, h, wt);
  addWall(w / 2 - sideW / 2, h / 2 + 0.15, d / 2 - wt / 2, sideW, h, wt);
  addWall(0, doorH + 0.15 + (h - doorH) / 2, d / 2 - wt / 2, doorW, h - doorH, wt, false);

  // Inner textured drywall + wainscot lining + baseboards + wall art
  const inL = new THREE.Mesh(new THREE.PlaneGeometry(d - wt * 2, h - 0.3), intWallMat);
  inL.position.set(-w / 2 + wt + 0.02, h / 2 + 0.15, 0);
  inL.rotation.y = Math.PI / 2;
  const inR = new THREE.Mesh(new THREE.PlaneGeometry(d - wt * 2, h - 0.3), intWallMat);
  inR.position.set(w / 2 - wt - 0.02, h / 2 + 0.15, 0);
  inR.rotation.y = -Math.PI / 2;
  const inB = new THREE.Mesh(new THREE.PlaneGeometry(w - wt * 2, h - 0.3), intWallMat);
  inB.position.set(0, h / 2 + 0.15, -d / 2 + wt + 0.02);
  const frameArt = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.95, 0.06),
    std({ color: 0xffffff, map: signTexture('HOME SWEET HOME', '#3a2a1e', '#e7d8c1'), roughness: 0.7 }),
  );
  frameArt.position.set(0.2, 2.35, -d / 2 + wt + 0.06);
  grp.add(inL, inR, inB, frameArt);

  // Windows on front & sides (reflective glass panes with mullions)
  const winGlass = std({
    color: 0x3a546a,
    emissive: 0xffc676,
    emissiveIntensity: 0.32,
    roughness: 0.05,
    metalness: 0.9,
    envMapIntensity: 1.9,
  });
  for (const sx of [-3.1, 3.1]) {
    const wf = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 0.12), trimMat);
    wf.position.set(sx, 2.0, d / 2 + 0.02);
    const wg = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 1.02), winGlass);
    wg.position.set(sx, 2.0, d / 2 + 0.09);
    const mullV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.04, 0.05), trimMat);
    mullV.position.set(sx, 2.0, d / 2 + 0.1);
    const mullH = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.06, 0.05), trimMat);
    mullH.position.set(sx, 2.0, d / 2 + 0.1);
    grp.add(wf, wg, mullV, mullH);
  }
  for (const sz of [-1.4, 1.4]) {
    for (const [lx, ry] of [
      [-w / 2 - 0.02, -Math.PI / 2],
      [w / 2 + 0.02, Math.PI / 2],
    ]) {
      const wf = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.2, 0.1), trimMat);
      wf.position.set(lx, 2.0, sz);
      wf.rotation.y = ry;
      const wg = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.96), winGlass);
      wg.position.set(lx + Math.sign(lx) * 0.06, 2.0, sz);
      wg.rotation.y = ry;
      grp.add(wf, wg);
    }
  }

  // Interior warm ceiling lamp + textured woven rug + furniture
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.22, 12), new THREE.MeshBasicMaterial({ color: 0xffe8b0 }));
  lamp.position.set(0, h - 0.18, 0);
  grp.add(lamp);

  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 2.8),
    std({ color: 0xffffff, map: rugPBR(seed), roughness: 0.94 }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(1.3, 0.31, 0.8);
  grp.add(rug);

  const woodMat = pbrMat(woodPbr, 1, 1, { color: 0xb89068, roughness: 0.68 });
  const fabricMat = std({ color: [0x783a32, 0x3b5868, 0x4b6248][seed % 3], roughness: 0.92 });
  const kitchen = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.95, 0.9), std({ color: 0xc2bab0, roughness: 0.7 }));
  kitchen.position.set(-2.6, 0.75, -d / 2 + wt + 0.6);
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.78, 1.1), woodMat);
  table.position.set(-2.4, 0.68, 0.5);
  const sofa = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.65, 0.95), fabricMat);
  sofa.position.set(2.6, 0.62, 0.6);
  const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 0.26), fabricMat);
  sofaBack.position.set(2.6, 1.02, 0.25);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 2.3), fabricMat);
  bed.position.set(2.9, 0.56, -d / 2 + wt + 1.4);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.18, 0.45), trimMat);
  pillow.position.set(2.9, 0.9, -d / 2 + wt + 0.6);
  grp.add(kitchen, table, sofa, sofaBack, bed, pillow);

  pushRotatedBoxCollider(colliders, cx, cz, rotY, -2.6, -d / 2 + wt + 0.6, 3.2, 0.9);
  pushRotatedBoxCollider(colliders, cx, cz, rotY, 2.6, 0.6, 2.4, 0.95);

  const interactPos = localToWorld(cx, cz, rotY, -1.6, -1.8);
  return {
    group: grp,
    interactPos: new THREE.Vector3(interactPos.x, baseY, interactPos.z),
  };
}

// ---------- Medevac Rescue Helicopter (Composite 3D Group) ----------
export function makeHelicopter() {
  const grp = new THREE.Group();
  const bodyMat = std({ color: 0xdce2e8, roughness: 0.45, metalness: 0.25 });
  const redMat = std({ color: 0xb91c1c, roughness: 0.4, metalness: 0.2 });
  const darkMetal = std({ color: 0x26292e, roughness: 0.45, metalness: 0.75 });
  const canopyMat = std({ color: 0x121d2a, roughness: 0.12, metalness: 0.7 });

  // Main cabin hull + nose canopy
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.7, 4.6), bodyMat);
  hull.position.set(0, 1.45, 0);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.36, 4.64), redMat);
  stripe.position.set(0, 1.28, 0);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.35, 1.5), canopyMat);
  nose.position.set(0, 1.38, 2.8);
  nose.rotation.x = 0.25;
  const cowl = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.65, 2.5), darkMetal);
  cowl.position.set(0, 2.55, -0.3);

  // Tail boom + vertical fin + tail rotor
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.36, 4.8, 10), bodyMat);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 1.85, -4.5);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.35, 0.85), redMat);
  fin.position.set(0, 2.35, -6.6);
  fin.rotation.x = -0.25;

  // Landing skids + struts
  for (const sx of [-1.25, 1.25]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.8, 8), darkMetal);
    skid.rotation.x = Math.PI / 2;
    skid.position.set(sx, 0.08, 0.2);
    for (const sz of [-1.0, 1.3]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.85, 8), darkMetal);
      strut.position.set(sx * 0.85, 0.45, sz);
      strut.rotation.z = sx > 0 ? -0.35 : 0.35;
      grp.add(strut);
    }
    grp.add(skid);
  }

  // Main spinning rotor assembly (4 long blades)
  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 3.05, -0.1);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.45, 10), darkMetal);
  mainRotor.add(mast);
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 5.2), darkMetal);
    blade.rotation.y = (i * Math.PI) / 2;
    blade.position.set(Math.sin(blade.rotation.y) * 2.6, 0.14, Math.cos(blade.rotation.y) * 2.6);
    mainRotor.add(blade);
  }

  // Tail rotor
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.22, 2.55, -6.7);
  for (let i = 0; i < 2; i++) {
    const tb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.25, 0.14), darkMetal);
    tb.rotation.x = (i * Math.PI) / 2;
    tailRotor.add(tb);
  }

  // Beacon strobe on tail
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3b2f }));
  strobe.position.set(0, 3.1, -6.7);

  grp.add(hull, stripe, nose, cowl, boom, fin, mainRotor, tailRotor, strobe);
  grp.userData.mainRotor = mainRotor;
  grp.userData.tailRotor = tailRotor;
  grp.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  return grp;
}

// ---------- Enterable 3-Story Mercy Hospital + Rooftop Helipad Mission ----------
export function makeHospital(colliders, obstacles, cx, baseY, cz, rotY) {
  const grp = new THREE.Group();
  grp.position.set(cx, baseY, cz);
  grp.rotation.y = rotY;

  const w = 28;
  const d = 28;
  const fh = 4.0;
  const stories = 3;
  const totalH = fh * stories; // 12.0
  const wt = 0.5;

  const cPbr = concretePBR();
  const extMat = pbrMat(cPbr, 4, 2, { color: 0xd8d5cc, roughness: 0.88 });
  const hospWallPbr = interiorWallPBR('hospital');
  const intWallMat = pbrMat(hospWallPbr, 4, 1, {
    emissive: 0x1b2b30,
    emissiveMap: hospWallPbr.map,
    emissiveIntensity: 0.42,
  });
  const tilePbr = tileFloorPBR('hospital');
  const floorMat = pbrMat(tilePbr, 6, 6, {
    emissive: 0x162226,
    emissiveMap: tilePbr.map,
    emissiveIntensity: 0.25,
  });
  const rampMat = pbrMat(cPbr, 2, 4, { color: 0x9aa2aa, emissive: 0x11181c, emissiveIntensity: 0.2 });
  const trimMat = std({ color: 0x1f2937, roughness: 0.5, metalness: 0.4 });
  const tealMat = std({ color: 0x0f766e, roughness: 0.65 });
  const redMat = std({ color: 0xdc2626, emissive: 0x991b1b, emissiveIntensity: 0.45, roughness: 0.5 });

  const addBox = (lx, ly, lz, lw, lh, ld, mat, collide = true, minY = baseY, maxY = baseY + totalH + 2) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(lw, lh, ld), mat);
    m.position.set(lx, ly, lz);
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
    obstacles.push(m);
    if (collide) pushRotatedBoxCollider(colliders, cx, cz, rotY, lx, lz, lw, ld, minY, maxY);
    return m;
  };

  // Ground floor slab
  const gFloor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), floorMat);
  gFloor.position.set(0, 0.07, 0);
  gFloor.receiveShadow = true;
  grp.add(gFloor);

  // Upper floor slabs (y=4, y=8, y=12 roof) leaving wide open stairwell cutouts:
  // Right stairwell (1->2 & 3->Roof): x in [8.4, 13.5], z in [-9.2, 9.2]
  // Left stairwell  (2->3):           x in [-13.5, -8.4], z in [-9.2, 9.2]
  const addCutFloor = (fy, cutoutSide) => {
    const y0 = baseY + fy - 0.6;
    const y1 = baseY + fy + 0.5;
    const mainW = w - 5.6; // 22.4 (leaves 5.6m strip on cutoutSide)
    const mainX = cutoutSide === 'right' ? -2.8 : 2.8;
    const slabMain = new THREE.Mesh(new THREE.BoxGeometry(mainW, 0.26, d), fy === 12 ? extMat : floorMat);
    slabMain.position.set(mainX, fy - 0.13, 0);
    slabMain.castShadow = slabMain.receiveShadow = true;
    grp.add(slabMain);
    obstacles.push(slabMain);

    // Front & back landings on the stairwell side (z > 9.2 and z < -9.2)
    const sx = cutoutSide === 'right' ? 11.2 : -11.2;
    for (const sz of [-11.6, 11.6]) {
      const land = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.26, 4.8), fy === 12 ? extMat : floorMat);
      land.position.set(sx, fy - 0.13, sz);
      land.castShadow = land.receiveShadow = true;
      grp.add(land);
      obstacles.push(land);
    }
    // Keep unused variable warning clean by placing stairwell edge curb collider
    const curbX = cutoutSide === 'right' ? 8.3 : -8.3;
    addBox(curbX, fy + 0.5, 0, 0.22, 1.0, 17.6, trimMat, true, y0, y1 + 1.5);
  };
  addCutFloor(4, 'right');
  addCutFloor(8, 'left');
  addCutFloor(12, 'right');

  // Exterior perimeter walls across all 3 stories (with wide +Z front entrance doorway on floor 1)
  addBox(-w / 2 + wt / 2, totalH / 2, 0, wt, totalH, d, extMat, true, baseY, baseY + totalH);
  addBox(w / 2 - wt / 2, totalH / 2, 0, wt, totalH, d, extMat, true, baseY, baseY + totalH);
  addBox(0, totalH / 2, -d / 2 + wt / 2, w, totalH, wt, extMat, true, baseY, baseY + totalH);

  // Front wall (+Z): open 5.6m entrance on Floor 1, solid across upper floors
  const fSideW = (w - 5.6) / 2;
  addBox(-w / 2 + fSideW / 2, fh / 2, d / 2 - wt / 2, fSideW, fh, wt, extMat, true, baseY, baseY + fh);
  addBox(w / 2 - fSideW / 2, fh / 2, d / 2 - wt / 2, fSideW, fh, wt, extMat, true, baseY, baseY + fh);
  addBox(0, fh + (totalH - fh) / 2, d / 2 - wt / 2, w, totalH - fh, wt, extMat, true, baseY + fh, baseY + totalH);

  // Interior textured wall skins + hospital window bands
  const innerSkin = new THREE.Mesh(new THREE.PlaneGeometry(w - wt * 2, totalH - 0.2), intWallMat);
  innerSkin.position.set(0, totalH / 2, -d / 2 + wt + 0.02);
  grp.add(innerSkin);

  const winMat = std({
    color: 0x385874,
    emissive: 0x7dd3fc,
    emissiveIntensity: 0.24,
    roughness: 0.05,
    metalness: 0.9,
    envMapIntensity: 1.95,
  });
  for (let fl = 0; fl < 3; fl++) {
    for (const sx of [-9.5, -5.5, 5.5, 9.5]) {
      const wg = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.5), winMat);
      wg.position.set(sx, fl * fh + 2.2, d / 2 + 0.03);
      grp.add(wg);
    }
  }

  // Front canopy + glowing MERCY HOSPITAL & Red Cross sign
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.25, 3.2), trimMat);
  canopy.position.set(0, 3.6, d / 2 + 1.5);
  const signTex = signTexture('MERCY HOSPITAL +', '#ffffff', '#dc2626');
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(11.5, 2.1),
    new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.75 }),
  );
  sign.position.set(0, 6.3, d / 2 + 0.08);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.2, 0.2), redMat);
  crossV.position.set(0, 9.6, d / 2 + 0.08);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 0.2), redMat);
  crossH.position.set(0, 9.6, d / 2 + 0.08);
  grp.add(canopy, sign, crossV, crossH);

  // Wide walkable ramps connecting Floor 1->2 (right), Floor 2->3 (left), Floor 3->Roof (right)
  const addRamp = (rx, yStart, yEnd, zStart, zEnd) => {
    const dz = zEnd - zStart;
    const dy = yEnd - yStart;
    const len = Math.hypot(dz, dy);
    const angle = Math.atan2(dy, Math.abs(dz));
    const dirSign = Math.sign(dz);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.28, len), rampMat);
    ramp.position.set(rx, (yStart + yEnd) / 2 - 0.14, (zStart + zEnd) / 2);
    ramp.rotation.x = dirSign > 0 ? -angle : angle;
    ramp.castShadow = ramp.receiveShadow = true;
    grp.add(ramp);
    obstacles.push(ramp);
  };
  // Ramp 1->2 on right (+X): walk +Z -> -Z from z=+8.5 up to z=-8.5
  addRamp(11.0, 0, 4, 8.5, -8.5);
  // Ramp 2->3 on left (-X): walk -Z -> +Z from z=-8.5 up to z=+8.5
  addRamp(-11.0, 4, 8, -8.5, 8.5);
  // Ramp 3->Roof on right (+X): walk +Z -> -Z from z=+8.5 up to z=-8.5
  addRamp(11.0, 8, 12, 8.5, -8.5);

  // Directional glowing STAIRS signs on each floor
  const stairTex = signTexture('STAIRS ↑ HELIPAD', '#065f46', '#ecfdf5');
  const stairSignMat = new THREE.MeshBasicMaterial({ map: stairTex });
  for (const [sx, sy, sz, ry] of [
    [8.1, 2.8, 7.2, -Math.PI / 2],
    [-8.1, 6.8, -7.2, Math.PI / 2],
    [8.1, 10.8, 7.2, -Math.PI / 2],
  ]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.75), stairSignMat);
    s.position.set(sx, sy, sz);
    s.rotation.y = ry;
    grp.add(s);
  }

  // Interior overhead fluorescent fixtures & floor props
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xe0f7fa });
  for (let fl = 0; fl < 3; fl++) {
    const fy = fl * fh;
    for (const bz of [-6, 0, 6]) {
      const fix = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.08, 0.45), bulbMat);
      fix.position.set(0, fy + fh - 0.25, bz);
      grp.add(fix);
    }
  }

  // Floor 1 Lobby furniture + Pharmacy supply counter
  addBox(-4.8, 0.55, 2.5, 4.2, 1.1, 1.1, tealMat, true, baseY, baseY + fh);
  addBox(-8.5, 0.55, -5.5, 3.6, 1.1, 1.2, trimMat, true, baseY, baseY + fh);
  const medCrate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.9), redMat);
  medCrate.position.set(-8.5, 1.45, -5.5);
  grp.add(medCrate);

  // Floor 2 Trauma Ward beds
  const bedMat = std({ color: 0xe2e8f0, roughness: 0.75 });
  for (const bx of [-4.2, 0.2, 4.4]) {
    addBox(bx, 0.5, -6.5, 1.4, 0.85, 2.5, bedMat, true, baseY + 4, baseY + 8);
  }

  // Floor 3 Bio Lab counters & tactical armory crate
  addBox(0, 4.0 + 4.55, -6.5, 6.5, 1.1, 1.2, tealMat, true, baseY + 8, baseY + 12);
  const armCrate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1.0), std({ color: 0x365314, roughness: 0.85 }));
  armCrate.position.set(0, 8.4, 1.5);
  grp.add(armCrate);

  // Rooftop Helipad + safety parapet walls + blinking corner beacons + Rescue Helicopter
  const roofY = totalH;
  const pH = 1.15;
  addBox(-w / 2 + 0.25, roofY + pH / 2, 0, 0.45, pH, d, extMat, true, baseY + roofY, baseY + roofY + 3);
  addBox(w / 2 - 0.25, roofY + pH / 2, 0, 0.45, pH, d, extMat, true, baseY + roofY, baseY + roofY + 3);
  addBox(0, roofY + pH / 2, -d / 2 + 0.25, w, pH, 0.45, extMat, true, baseY + roofY, baseY + roofY + 3);
  addBox(0, roofY + pH / 2, d / 2 - 0.25, w, pH, 0.45, extMat, true, baseY + roofY, baseY + roofY + 3);

  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.MeshStandardMaterial({ map: helipadTexture(), roughness: 0.82 }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(-1.5, roofY + 0.03, -1.0);
  pad.receiveShadow = true;
  grp.add(pad);

  const beacons = [];
  for (const [bx, bz] of [
    [-8.5, -8.0],
    [5.5, -8.0],
    [-8.5, 6.0],
    [5.5, 6.0],
  ]) {
    const bm = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      std({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 2.5 }),
    );
    bm.position.set(bx, roofY + 0.22, bz);
    grp.add(bm);
    beacons.push(bm);
  }

  const heli = makeHelicopter();
  heli.position.set(-1.5, roofY + 0.04, -1.0);
  heli.rotation.y = 0.35;
  grp.add(heli);

  // Height resolver in local hospital coordinates
  const cos = Math.cos(-rotY);
  const sin = Math.sin(-rotY);
  const heightAt = (wx, wz, curY = 0) => {
    const dx = wx - cx;
    const dz = wz - cz;
    const lx = dx * cos + dz * sin;
    const lz = -dx * sin + dz * cos;
    if (Math.abs(lx) > w / 2 + 0.3 || Math.abs(lz) > d / 2 + 0.3) return null;
    const relY = curY - baseY;

    // Right ramp (Floor 1 -> 2 and Floor 3 -> Roof): x in [8.5, 13.5], z in [-8.5, +8.5]
    if (lx >= 8.5 && lx <= 13.6 && lz >= -8.8 && lz <= 8.8) {
      const t = Math.max(0, Math.min(1, (8.5 - lz) / 17.0));
      const r12 = t * 4.0;
      const r34 = 8.0 + t * 4.0;
      if (relY >= 6.8 && Math.abs(relY - r34) < 2.2) return baseY + r34;
      if (Math.abs(relY - r12) < 2.2) return baseY + r12;
    }
    // Left ramp (Floor 2 -> 3): x in [-13.6, -8.5], z in [-8.5, +8.5]
    if (lx >= -13.6 && lx <= -8.5 && lz >= -8.8 && lz <= 8.8) {
      const t = Math.max(0, Math.min(1, (lz + 8.5) / 17.0));
      const r23 = 4.0 + t * 4.0;
      if (relY >= 2.8 && Math.abs(relY - r23) < 2.2) return baseY + r23;
    }

    // Floor slabs checking cutout openings
    const inRightCut = lx > 8.4 && lz > -9.2 && lz < 9.2;
    const inLeftCut = lx < -8.4 && lz > -9.2 && lz < 9.2;
    if (relY >= 10.6 && !inRightCut) return baseY + 12.0;
    if (relY >= 6.6 && !inLeftCut) return baseY + 8.0;
    if (relY >= 2.6 && !inRightCut) return baseY + 4.0;
    return baseY;
  };

  const medLoot = localToWorld(cx, cz, rotY, -6.5, -5.5);
  const labLoot = localToWorld(cx, cz, rotY, 0, 2.2);
  const heliWorld = localToWorld(cx, cz, rotY, -1.5, -1.0);
  const lobbyWorld = localToWorld(cx, cz, rotY, 0, 11.5);

  return {
    group: grp,
    heli,
    beacons,
    heightAt,
    medLootPos: new THREE.Vector3(medLoot.x, baseY, medLoot.z),
    labLootPos: new THREE.Vector3(labLoot.x, baseY + 8.0, labLoot.z),
    heliPos: new THREE.Vector3(heliWorld.x, baseY + 12.0, heliWorld.z),
    lobbyTriggerPos: new THREE.Vector3(lobbyWorld.x, baseY, lobbyWorld.z),
    localToWorld: (lx, ly, lz) => {
      const p = localToWorld(cx, cz, rotY, lx, lz);
      return new THREE.Vector3(p.x, baseY + ly, p.z);
    },
  };
}

// ---------- Multi-Level Walkable Concrete Parking Garage ----------
export function makeParkingGarage(colliders, obstacles, cx, baseY, cz, rotY = 0) {
  const grp = new THREE.Group();
  grp.position.set(cx, baseY, cz);
  grp.rotation.y = rotY;

  const w = 24;
  const d = 24;
  const fh = 3.8;
  const cPbr = concretePBR();
  const deckMat = pbrMat(cPbr, 5, 5, { color: 0xb4b0a8, roughness: 0.92 });
  const colMat = pbrMat(cPbr, 1, 2, { color: 0x8d8982, roughness: 0.95 });
  const rampMat = pbrMat(cPbr, 2, 4, { color: 0x9fa3a8, roughness: 0.9 });
  const railMat = std({ color: 0xd97706, roughness: 0.55, metalness: 0.4 });

  const addBox = (lx, ly, lz, lw, lh, ld, mat, collide = true, minY = baseY, maxY = baseY + fh * 3) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(lw, lh, ld), mat);
    m.position.set(lx, ly, lz);
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
    obstacles.push(m);
    if (collide) pushRotatedBoxCollider(colliders, cx, cz, rotY, lx, lz, lw, ld, minY, maxY);
    return m;
  };

  // Ground deck
  const gFloor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), deckMat);
  gFloor.position.set(0, 0.07, 0);
  gFloor.receiveShadow = true;
  grp.add(gFloor);

  // Upper decks at y=3.8 (cutout right ramp) and y=7.6 (cutout left ramp)
  const addCutDeck = (fy, cutoutSide) => {
    const mainW = w - 5.2; // 18.8
    const mainX = cutoutSide === 'right' ? -2.6 : 2.6;
    const slabMain = new THREE.Mesh(new THREE.BoxGeometry(mainW, 0.28, d), deckMat);
    slabMain.position.set(mainX, fy - 0.14, 0);
    slabMain.castShadow = slabMain.receiveShadow = true;
    grp.add(slabMain);
    obstacles.push(slabMain);

    const sx = cutoutSide === 'right' ? 9.4 : -9.4;
    for (const sz of [-10.0, 10.0]) {
      const land = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.28, 4.0), deckMat);
      land.position.set(sx, fy - 0.14, sz);
      land.castShadow = land.receiveShadow = true;
      grp.add(land);
      obstacles.push(land);
    }
    const curbX = cutoutSide === 'right' ? 6.7 : -6.7;
    addBox(curbX, fy + 0.45, 0, 0.24, 0.9, 15.8, railMat, true, baseY + fy - 0.3, baseY + fy + 2);
  };
  addCutDeck(fh, 'right');
  addCutDeck(fh * 2, 'left');

  // Structural pillars & perimeter parapet walls
  for (const px of [-5.8, 0.0, 5.8]) {
    for (const pz of [-9.5, 0.0, 9.5]) {
      if (px === 0 && pz === 0) continue;
      addBox(px, fh, pz, 0.65, fh * 2, 0.65, colMat, true, baseY, baseY + fh * 2);
    }
  }
  // Waist parapets on Levels 2 & 3 + exterior corner columns
  for (let fl = 1; fl <= 2; fl++) {
    const fy = fl * fh;
    addBox(-w / 2 + 0.22, fy + 0.55, 0, 0.44, 1.1, d, deckMat, true, baseY + fy, baseY + fy + 2.5);
    addBox(w / 2 - 0.22, fy + 0.55, 0, 0.44, 1.1, d, deckMat, true, baseY + fy, baseY + fy + 2.5);
    addBox(0, fy + 0.55, -d / 2 + 0.22, w, 1.1, 0.44, deckMat, true, baseY + fy, baseY + fy + 2.5);
    addBox(0, fy + 0.55, d / 2 - 0.22, w, 1.1, 0.44, deckMat, true, baseY + fy, baseY + fy + 2.5);
  }

  // Wide walkable ramps
  const addRamp = (rx, y0, y1, z0, z1) => {
    const dz = z1 - z0;
    const dy = y1 - y0;
    const len = Math.hypot(dz, dy);
    const ang = Math.atan2(dy, Math.abs(dz));
    const m = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.28, len), rampMat);
    m.position.set(rx, (y0 + y1) / 2 - 0.14, (z0 + z1) / 2);
    m.rotation.x = Math.sign(dz) > 0 ? -ang : ang;
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
    obstacles.push(m);
  };
  addRamp(9.2, 0, fh, 8.0, -8.0);
  addRamp(-9.2, fh, fh * 2, -8.0, 8.0);

  // Parked cars & top-deck tactical cruiser/crate
  const parked = [
    { x: -3.2, y: 0.14, z: -5.5, col: 0x3b4d63, police: false },
    { x: -3.2, y: fh, z: 4.5, col: 0x7c2d12, police: false },
    { x: 2.8, y: fh * 2, z: -4.2, col: 0x111111, police: true },
  ];
  for (const pk of parked) {
    const car = makeCar(pk.col, false, pk.police);
    car.position.set(pk.x, pk.y, pk.z);
    grp.add(car);
    obstacles.push(car);
    pushRotatedBoxCollider(colliders, cx, cz, rotY, pk.x, pk.z, 2.0, 4.4, baseY + pk.y, baseY + pk.y + 2.2);
  }

  const crate = makeCrate(true);
  crate.position.set(0, fh * 2, -6.5);
  grp.add(crate);

  const signTex = signTexture('CITY PARKING DECK', '#1f2937', '#f59e0b');
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9.0, 1.5), new THREE.MeshBasicMaterial({ map: signTex }));
  sign.position.set(0, 3.1, d / 2 + 0.05);
  grp.add(sign);

  const cos = Math.cos(-rotY);
  const sin = Math.sin(-rotY);
  const heightAt = (wx, wz, curY = 0) => {
    const dx = wx - cx;
    const dz = wz - cz;
    const lx = dx * cos + dz * sin;
    const lz = -dx * sin + dz * cos;
    if (Math.abs(lx) > w / 2 + 0.3 || Math.abs(lz) > d / 2 + 0.3) return null;
    const relY = curY - baseY;
    if (lx >= 6.8 && lx <= 11.6 && lz >= -8.2 && lz <= 8.2) {
      const t = Math.max(0, Math.min(1, (8.0 - lz) / 16.0));
      const ry = t * fh;
      if (Math.abs(relY - ry) < 2.2) return baseY + ry;
    }
    if (lx >= -11.6 && lx <= -6.8 && lz >= -8.2 && lz <= 8.2) {
      const t = Math.max(0, Math.min(1, (lz + 8.0) / 16.0));
      const ry = fh + t * fh;
      if (relY >= fh - 1.2 && Math.abs(relY - ry) < 2.2) return baseY + ry;
    }
    const inRightCut = lx > 6.8 && lz > -8.2 && lz < 8.2;
    const inLeftCut = lx < -6.8 && lz > -8.2 && lz < 8.2;
    if (relY >= fh * 2 - 1.3 && !inLeftCut) return baseY + fh * 2;
    if (relY >= fh - 1.3 && !inRightCut) return baseY + fh;
    return baseY;
  };

  const arm = localToWorld(cx, cz, rotY, 0, -5.0);
  return {
    group: grp,
    heightAt,
    armoryPos: new THREE.Vector3(arm.x, baseY + fh * 2, arm.z),
    localToWorld: (lx, ly, lz) => {
      const p = localToWorld(cx, cz, rotY, lx, lz);
      return new THREE.Vector3(p.x, baseY + ly, p.z);
    },
  };
}

// ---------- Walkable 2-Level Ranger / Radio Watchtower ----------
export function makeWatchtower(colliders, obstacles, cx, baseY, cz, rotY = 0) {
  const grp = new THREE.Group();
  grp.position.set(cx, baseY, cz);
  grp.rotation.y = rotY;

  const deckH = 4.2;
  const woodMat = std({ color: 0x5c422c, roughness: 0.92 });
  const roofMat = std({ color: 0x30363b, roughness: 0.85, metalness: 0.25 });
  const steelMat = std({ color: 0x4b5563, metalness: 0.65, roughness: 0.45 });

  // 4 corner legs + cross braces
  for (const [lx, lz] of [
    [-2.4, -2.4],
    [2.4, -2.4],
    [-2.4, 2.4],
    [2.4, 2.4],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.32, deckH + 3.0, 0.32), woodMat);
    leg.position.set(lx, (deckH + 3.0) / 2, lz);
    leg.castShadow = leg.receiveShadow = true;
    grp.add(leg);
    obstacles.push(leg);
    pushRotatedBoxCollider(colliders, cx, cz, rotY, lx, lz, 0.45, 0.45, baseY, baseY + deckH + 2.5);
  }

  // Elevated observation deck (6 x 6) + canopy roof + guardrails
  const deck = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.26, 5.6), woodMat);
  deck.position.set(0, deckH - 0.13, 0);
  deck.castShadow = deck.receiveShadow = true;
  grp.add(deck);
  obstacles.push(deck);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.4, 1.7, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.set(0, deckH + 3.4, 0);
  roof.castShadow = true;
  grp.add(roof);

  // Guardrails (leave +X stair landing gap open)
  for (const [rx, rz, rw, rd] of [
    [0, -2.6, 5.4, 0.16],
    [-2.6, 0, 0.16, 5.4],
    [-0.7, 2.6, 4.0, 0.16],
  ]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.95, rd), woodMat);
    r.position.set(rx, deckH + 0.48, rz);
    grp.add(r);
    pushRotatedBoxCollider(colliders, cx, cz, rotY, rx, rz, rw, rd, baseY + deckH, baseY + deckH + 2.2);
  }

  // Exterior stair ramp up the +X flank: z from +3.4 up to -2.2 at x = +3.5
  const rLen = Math.hypot(5.6, deckH);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.24, rLen), woodMat);
  ramp.position.set(3.5, deckH / 2 - 0.1, 0.6);
  ramp.rotation.x = Math.atan2(deckH, 5.6);
  ramp.castShadow = ramp.receiveShadow = true;
  grp.add(ramp);
  obstacles.push(ramp);

  // Supply crate + radio mast + glowing amber lantern on lookout deck
  const crate = makeCrate(true);
  crate.position.set(-1.3, deckH, -1.3);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.2, 6), steelMat);
  mast.position.set(-2.1, deckH + 5.2, -2.1);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
  lamp.position.set(0, deckH + 2.45, 0);
  grp.add(crate, mast, lamp);

  const cos = Math.cos(-rotY);
  const sin = Math.sin(-rotY);
  const heightAt = (wx, wz, curY = 0) => {
    const dx = wx - cx;
    const dz = wz - cz;
    const lx = dx * cos + dz * sin;
    const lz = -dx * sin + dz * cos;
    if (lx >= 2.5 && lx <= 4.6 && lz >= -2.5 && lz <= 3.7) {
      const t = Math.max(0, Math.min(1, (3.4 - lz) / 5.6));
      const ry = t * deckH;
      if (Math.abs(curY - baseY - ry) < 2.2) return baseY + ry;
    }
    if (Math.abs(lx) <= 2.9 && Math.abs(lz) <= 2.9 && curY - baseY >= deckH - 1.3) {
      return baseY + deckH;
    }
    return null;
  };

  const cp = localToWorld(cx, cz, rotY, -1.0, -0.5);
  return {
    group: grp,
    heightAt,
    cratePos: new THREE.Vector3(cp.x, baseY + deckH, cp.z),
  };
}

// ---------- Enterable Wilderness Log Cabin with Textured Interior & Woodstove ----------
export function makeEnterableCabin(colliders, obstacles, cx, baseY, cz, rotY = 0, snow = false) {
  const grp = new THREE.Group();
  grp.position.set(cx, baseY, cz);
  grp.rotation.y = rotY;

  const w = 7.4;
  const d = 6.4;
  const h = 3.2;
  const wt = 0.34;
  const doorW = 1.8;
  const doorH = 2.4;

  const logPbr = cabinLogPBR();
  const extMat = pbrMat(logPbr, 2.2, 1.2);
  const intLogMat = pbrMat(logPbr, 2.2, 1.2, { emissive: 0x2b1a0c, emissiveMap: logPbr.map, emissiveIntensity: 0.36 });
  const floorMat = pbrMat(woodFloorPBR(), 2.5, 2.5, { emissive: 0x1a1008, emissiveIntensity: 0.24 });
  const shMat = pbrMat(shinglePBR(snow), 2, 2, { flatShading: true });
  const stoneMat = pbrMat(concretePBR(), 1.5, 1, { color: 0x8a8278, roughness: 0.95 });

  const addWall = (lx, ly, lz, lw, lh, ld, collide = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(lw, lh, ld), extMat);
    m.position.set(lx, ly, lz);
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
    obstacles.push(m);
    if (collide) pushRotatedBoxCollider(colliders, cx, cz, rotY, lx, lz, lw, ld, baseY, baseY + h + 1);
    return m;
  };

  // Stone base + hardwood plank interior floor + porch deck
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.24, d + 0.3), stoneMat);
  plinth.position.set(0, 0.12, 0);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w - 0.16, 0.12, d - 0.16), floorMat);
  floor.position.set(0, 0.24, 0);
  floor.receiveShadow = true;
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.14, d - 0.2), intLogMat);
  ceil.position.set(0, h + 0.12, 0);
  grp.add(plinth, floor, ceil);

  // Outer & inner textured log walls
  addWall(-w / 2 + wt / 2, h / 2 + 0.18, 0, wt, h, d);
  addWall(w / 2 - wt / 2, h / 2 + 0.18, 0, wt, h, d);
  addWall(0, h / 2 + 0.18, -d / 2 + wt / 2, w, h, wt);
  const sideW = (w - doorW) / 2;
  addWall(-w / 2 + sideW / 2, h / 2 + 0.18, d / 2 - wt / 2, sideW, h, wt);
  addWall(w / 2 - sideW / 2, h / 2 + 0.18, d / 2 - wt / 2, sideW, h, wt);
  addWall(0, doorH + 0.18 + (h - doorH) / 2, d / 2 - wt / 2, doorW, h - doorH, wt, false);

  const inL = new THREE.Mesh(new THREE.PlaneGeometry(d - wt * 2, h - 0.2), intLogMat);
  inL.position.set(-w / 2 + wt + 0.02, h / 2 + 0.18, 0);
  inL.rotation.y = Math.PI / 2;
  const inR = new THREE.Mesh(new THREE.PlaneGeometry(d - wt * 2, h - 0.2), intLogMat);
  inR.position.set(w / 2 - wt - 0.02, h / 2 + 0.18, 0);
  inR.rotation.y = -Math.PI / 2;
  const inB = new THREE.Mesh(new THREE.PlaneGeometry(w - wt * 2, h - 0.2), intLogMat);
  inB.position.set(0, h / 2 + 0.18, -d / 2 + wt + 0.02);
  grp.add(inL, inR, inB);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 2.3, 4), shMat);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.06, 1, d / w);
  roof.position.set(0, h + 1.32, 0);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.75, 2.4, 0.75), stoneMat);
  chimney.position.set(-2.1, h + 1.4, -1.4);
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  lantern.position.set(0, h - 0.1, 0);
  grp.add(roof, chimney, lantern);

  // Cabin furnishings: woven rug, bunk, table, iron stove + glowing coals
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.0), std({ color: 0xffffff, map: rugPBR(1), roughness: 0.95 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0.4, 0.31, 0.3);
  const bunk = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 2.2), std({ color: 0x4b5d46, roughness: 0.9 }));
  bunk.position.set(2.3, 0.52, -1.6);
  const stove = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.95, 0.85), std({ color: 0x1e2022, metalness: 0.75, roughness: 0.5 }));
  stove.position.set(-2.1, 0.72, -1.6);
  const embers = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), new THREE.MeshBasicMaterial({ color: 0xff6a1a }));
  embers.position.set(-2.1, 0.65, -1.16);
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.76, 0.95), pbrMat(woodFloorPBR(), 1, 1, { color: 0xb08a64 }));
  table.position.set(-1.9, 0.64, 1.1);
  grp.add(rug, bunk, stove, embers, table);
  pushRotatedBoxCollider(colliders, cx, cz, rotY, 2.3, -1.6, 1.4, 2.2, baseY, baseY + h);
  pushRotatedBoxCollider(colliders, cx, cz, rotY, -2.1, -1.6, 0.9, 0.9, baseY, baseY + h);

  const ip = localToWorld(cx, cz, rotY, -0.5, -1.0);
  const lightW = localToWorld(cx, cz, rotY, 0, 0);
  return {
    group: grp,
    interactPos: new THREE.Vector3(ip.x, baseY, ip.z),
    lightPos: new THREE.Vector3(lightW.x, baseY + h - 0.4, lightW.z),
  };
}

// ---------- Enterable Highway Service Station / Ranger Outpost ----------
export function makeOutpost(style = 'service', colliders, obstacles, cx, baseY, cz, rotY = 0, snow = false) {
  const grp = new THREE.Group();
  grp.position.set(cx, baseY, cz);
  grp.rotation.y = rotY;

  const w = 13.4;
  const d = 11.4;
  const h = 4.2;
  const wt = 0.42;
  const doorW = 3.0;
  const doorH = 2.9;

  const isRanger = style === 'ranger';
  const isRelay = style === 'relay';
  const accent = isRanger ? '#22c55e' : isRelay ? '#38bdf8' : '#f59e0b';
  const extPbr = industrialWallPBR(accent);
  const extMat = pbrMat(extPbr, 3, 1);
  const intWallPbr = interiorWallPBR(isRelay ? 'hospital' : 'store');
  const intWallMat = pbrMat(intWallPbr, 3, 1, { emissive: isRelay ? 0x162830 : 0x2e2318, emissiveMap: intWallPbr.map, emissiveIntensity: 0.42 });
  const floorMat = pbrMat(tileFloorPBR(isRanger ? 'bunker' : 'store'), 4, 4, { emissive: 0x15181a, emissiveIntensity: 0.25 });
  const ceilMat = pbrMat(ceilingTilePBR(), 3, 3, { emissive: 0x202428, emissiveIntensity: 0.34 });
  const steelMat = std({ color: 0x333a42, metalness: 0.72, roughness: 0.42 });
  const shMat = pbrMat(shinglePBR(snow), 3, 3);

  const addWall = (lx, ly, lz, lw, lh, ld, mat = extMat, collide = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(lw, lh, ld), mat);
    m.position.set(lx, ly, lz);
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
    obstacles.push(m);
    if (collide) pushRotatedBoxCollider(colliders, cx, cz, rotY, lx, lz, lw, ld, baseY, baseY + h + 1);
    return m;
  };

  const floor = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.14, d - 0.1), floorMat);
  floor.position.set(0, 0.07, 0);
  floor.receiveShadow = true;
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.14, d - 0.2), ceilMat);
  ceil.position.set(0, h - 0.14, 0);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.34, d + 0.5), snow ? shMat : steelMat);
  roof.position.set(0, h + 0.1, 0);
  roof.castShadow = roof.receiveShadow = true;
  grp.add(floor, ceil, roof);

  addWall(-w / 2 + wt / 2, h / 2, 0, wt, h, d);
  addWall(w / 2 - wt / 2, h / 2, 0, wt, h, d);
  addWall(0, h / 2, -d / 2 + wt / 2, w, h, wt);
  const sideW = (w - doorW) / 2;
  addWall(-w / 2 + sideW / 2, h / 2, d / 2 - wt / 2, sideW, h, wt);
  addWall(w / 2 - sideW / 2, h / 2, d / 2 - wt / 2, sideW, h, wt);
  addWall(0, doorH + (h - doorH) / 2, d / 2 - wt / 2, doorW, h - doorH, wt, extMat, false);

  // Inner wall skins
  const inL = new THREE.Mesh(new THREE.PlaneGeometry(d - wt * 2, h - 0.25), intWallMat);
  inL.position.set(-w / 2 + wt + 0.02, h / 2, 0);
  inL.rotation.y = Math.PI / 2;
  const inR = new THREE.Mesh(new THREE.PlaneGeometry(d - wt * 2, h - 0.25), intWallMat);
  inR.position.set(w / 2 - wt - 0.02, h / 2, 0);
  inR.rotation.y = -Math.PI / 2;
  const inB = new THREE.Mesh(new THREE.PlaneGeometry(w - wt * 2, h - 0.25), intWallMat);
  inB.position.set(0, h / 2, -d / 2 + wt + 0.02);
  grp.add(inL, inR, inB);

  // Overhead canopy + glowing sign + interior fluorescent strips
  const title = isRanger ? 'RANGER OUTPOST' : isRelay ? 'GRID RELAY STATION' : 'HIGHWAY SERVICE';
  const sTex = signTexture(title, '#18181b', accent);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(7.2, 1.35),
    new THREE.MeshStandardMaterial({ map: sTex, emissive: 0xffffff, emissiveMap: sTex, emissiveIntensity: 0.72 }),
  );
  sign.position.set(0, h - 0.25, d / 2 + 0.1);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.22, 2.8), steelMat);
  canopy.position.set(0, 3.15, d / 2 + 1.4);
  for (const px of [-3.6, 3.6]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.1, 8), steelMat);
    col.position.set(px, 1.55, d / 2 + 2.5);
    grp.add(col);
  }
  const bulbMat = new THREE.MeshBasicMaterial({ color: isRelay ? 0xbef8ff : 0xffeacc });
  for (const lz of [-2.4, 1.8]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 0.36), bulbMat);
    bar.position.set(0, h - 0.26, lz);
    grp.add(bar);
  }
  grp.add(sign, canopy);

  // Interior service counter, lockers, terminal kiosk, and exterior fuel/power equipment
  addWall(-3.2, 0.55, -1.8, 3.6, 1.1, 0.9, std({ color: 0x5c3e26, roughness: 0.72 }), true);
  addWall(4.8, 1.1, -3.5, 2.2, 2.2, 0.9, steelMat, true);
  const term = makeTerminal(accent);
  term.position.set(3.2, 0.14, -4.2);
  const crate = makeCrate(true);
  crate.position.set(-4.6, 0.14, -4.0);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 1.05, 10), std({ color: isRanger ? 0x365314 : 0xb45309, roughness: 0.5 }));
  barrel.position.set(-4.8, 0.62, d / 2 + 1.1);
  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.65, 12), steelMat);
  dish.position.set(3.8, h + 1.1, -2.5);
  dish.rotation.x = 0.6;
  grp.add(term, crate, barrel, dish);

  const ip = localToWorld(cx, cz, rotY, -3.0, -0.4);
  const tp = localToWorld(cx, cz, rotY, 3.2, -3.0);
  const lp = localToWorld(cx, cz, rotY, 0, 0);
  return {
    group: grp,
    lootPos: new THREE.Vector3(ip.x, baseY, ip.z),
    terminalPos: new THREE.Vector3(tp.x, baseY, tp.z),
    lightPos: new THREE.Vector3(lp.x, baseY + h - 0.5, lp.z),
    localToWorld: (lx, ly, lz) => {
      const p = localToWorld(cx, cz, rotY, lx, lz);
      return new THREE.Vector3(p.x, baseY + ly, p.z);
    },
  };
}

// ---------- Directional Highway & City Street Signpost ----------
export function makeStreetSign(title, subtitle = '', opts = {}) {
  const {
    bg = '#154734',
    fg = '#f8fafc',
    width = 3.2,
    height = subtitle ? 1.2 : 0.9,
    postH = 3.0,
    doublePost = width >= 3.0,
    emissive = 0.22,
  } = opts;
  const grp = new THREE.Group();
  const postMat = std({ color: 0x3b3f46, metalness: 0.72, roughness: 0.45 });
  const backingMat = std({ color: 0x2a2f36, metalness: 0.6, roughness: 0.55 });
  const tex = streetSignTexture(title, subtitle, bg, fg);
  const faceMat = std({
    map: tex,
    roughness: 0.45,
    metalness: 0.15,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: emissive,
  });

  const postXs = doublePost ? [-width * 0.34, width * 0.34] : [0];
  for (const px of postXs) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.068, postH, 8), postMat);
    post.position.set(px, postH / 2, 0);
    post.castShadow = true;
    grp.add(post);
  }

  const plateY = postH - height * 0.35;
  const board = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.06), [
    backingMat,
    backingMat,
    backingMat,
    backingMat,
    faceMat,
    faceMat,
  ]);
  board.position.set(0, plateY, 0.04);
  board.castShadow = true;
  grp.add(board);
  return grp;
}

// ---------- Bombed-Out City Ruin Shell (Fractured Masonry, Rebar, Collapsed Roof & Rubble) ----------
export function makeCityRuin(seed = 0, colliders, obstacles, cx, baseY, cz, rotY = 0, snow = false) {
  const grp = new THREE.Group();
  grp.position.set(cx, baseY, cz);
  grp.rotation.y = rotY;
  const rnd = mulberry32(4100 + seed * 97);

  const w = 10.5 + (seed % 3) * 1.4;
  const d = 9.0 + (seed % 2) * 1.6;
  const wt = 0.42;

  const concPbr = concretePBR();
  const concMat = pbrMat(concPbr, 2.5, 1.5, { color: snow ? 0x9aa3ab : 0x7c766d, roughness: 0.94 });
  const wallPbr = facadePBR((seed * 3) % 8);
  const wallMat = pbrMat(wallPbr, 1.4, 0.9, { color: snow ? 0xb4bbc2 : 0x96897b, roughness: 0.9 });
  const rubbleMat = pbrMat(concPbr, 1, 1, { color: snow ? 0x8d959e : 0x5c554c, roughness: 0.96 });
  const rebarMat = std({ color: 0x4b3224, metalness: 0.72, roughness: 0.65 });

  const addSeg = (lx, ly, lz, lw, lh, ld, mat = wallMat, collide = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(lw, lh, ld), mat);
    m.position.set(lx, ly, lz);
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
    obstacles.push(m);
    if (collide) pushRotatedBoxCollider(colliders, cx, cz, rotY, lx, lz, lw, ld, baseY, baseY + lh + 0.5);
    return m;
  };

  // Fractured concrete foundation plinth anchored deep for sloped terrain
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 1.4, d + 0.6), concMat);
  floor.position.set(0, -0.48, 0);
  floor.receiveShadow = true;
  grp.add(floor);

  // Back wall stepped jagged sections + exposed rebar spikes along top break line
  const hBackL = 4.6 + rnd() * 2.2;
  const hBackR = 2.8 + rnd() * 2.0;
  addSeg(-w * 0.25, hBackL / 2 + 0.12, -d / 2 + wt / 2, w * 0.5, hBackL, wt);
  addSeg(w * 0.25, hBackR / 2 + 0.12, -d / 2 + wt / 2, w * 0.5, hBackR, wt);

  // Left side wall (tall shattered corner + lower waist ruin)
  const hLeft = 3.8 + rnd() * 2.0;
  addSeg(-w / 2 + wt / 2, hLeft / 2 + 0.12, -d * 0.18, wt, hLeft, d * 0.64);
  addSeg(-w / 2 + wt / 2, 0.9, d * 0.32, wt, 1.6, d * 0.36);

  // Right side wall broken pillars + open doorway gap
  const hRight = 3.2 + rnd() * 1.8;
  addSeg(w / 2 - wt / 2, hRight / 2 + 0.12, -d * 0.24, wt, hRight, d * 0.52);
  addSeg(w / 2 - wt / 2, 0.85, d * 0.3, wt, 1.5, d * 0.4);

  // Front blasted pier framing entrance opening
  addSeg(-w * 0.36, 1.85, d / 2 - wt / 2, w * 0.28, 3.5, wt);
  addSeg(w * 0.36, 1.15, d / 2 - wt / 2, w * 0.28, 2.1, wt);

  // Collapsed tilted roof slab resting on back-left wall down onto rubble
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, 0.28, d * 0.68), concMat);
  slab.position.set(-w * 0.14, 1.85, -d * 0.08);
  slab.rotation.set(0.32, 0.08, -0.26);
  slab.castShadow = slab.receiveShadow = true;
  grp.add(slab);
  obstacles.push(slab);

  // Exposed rusted steel rebar rods & I-beam stub poking from broken masonry
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.8, 0.24), rebarMat);
  beam.position.set(-w * 0.1, hBackL * 0.6, -d * 0.12);
  beam.rotation.set(0.45, 0.2, 0.35);
  grp.add(beam);
  for (let i = 0; i < 6; i++) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9 + rnd() * 0.8, 5), rebarMat);
    rod.position.set(-w * 0.42 + i * 1.2, (i < 3 ? hBackL : hBackR) + 0.25, -d / 2 + wt / 2);
    rod.rotation.set((rnd() - 0.5) * 0.5, 0, (rnd() - 0.5) * 0.6);
    grp.add(rod);
  }

  // Scattered concrete masonry rubble mounds inside & around footprint
  for (let i = 0; i < 9; i++) {
    const rw = 0.55 + rnd() * 1.1;
    const rh = 0.35 + rnd() * 0.65;
    const rd = 0.55 + rnd() * 1.0;
    const rb = new THREE.Mesh(new THREE.BoxGeometry(rw, rh, rd), rubbleMat);
    rb.position.set((rnd() - 0.5) * (w - 1.5), rh * 0.45 + 0.1, (rnd() - 0.5) * (d - 1.5));
    rb.rotation.set((rnd() - 0.5) * 0.5, rnd() * Math.PI, (rnd() - 0.5) * 0.5);
    rb.castShadow = rb.receiveShadow = true;
    grp.add(rb);
  }

  if (snow) {
    const drift = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.24, d * 0.55), std({ color: 0xeaf0f6, roughness: 0.92 }));
    drift.position.set(-w * 0.14, 2.02, -d * 0.08);
    drift.rotation.set(0.32, 0.08, -0.26);
    grp.add(drift);
  }

  const lootW = localToWorld(cx, cz, rotY, 1.2, 0.6);
  return {
    group: grp,
    lootPos: new THREE.Vector3(lootW.x, baseY + 0.22, lootW.z),
  };
}


