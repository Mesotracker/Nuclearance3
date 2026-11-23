import * as THREE from 'three';
import { addContactShadow } from './props.js';
import { computeRagdollImpulse } from './rules.js';

const geoCache = {};
function g(key, make) {
  return (geoCache[key] ||= make());
}
const matCache = {};
function m(color, rough = 0.85, metal = 0) {
  const k = `${color}-${rough}-${metal}`;
  return (matCache[k] ||= new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
}

const bloodPatchMat = new THREE.MeshBasicMaterial({
  color: 0x5a0707,
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -4,
});

const SKIN = [0xe0b394, 0xc68863, 0x8d5524, 0xf1c27d, 0x6b4226];
const SHIRTS = [0x8a2b2b, 0x2b4a8a, 0x3d6b3d, 0xb5a27a, 0x555555, 0x7a4e8a, 0xc8c8c8, 0x9a6a2a];

let uid = 0;

// Reusable scratch vectors (zero GC in loop)
const _toP = new THREE.Vector3();
const _away = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _pe = new THREE.Vector3();
const _strafe = new THREE.Vector3();
const _missTarget = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _moveDir = new THREE.Vector3();

export class Actor {
  id = uid++;
  kind;
  group = new THREE.Group();
  body = new THREE.Group();
  headPivot = null;
  torso = null;
  hit = [];
  legs = [];
  knees = [];
  arms = [];
  elbows = [];
  bloodHits = 0;
  buildScale = 1;
  health;
  speed;
  runSpeed;
  dead = false;
  deathT = 0;
  rag = null;
  looted = false;
  target = new THREE.Vector3();
  repath = Math.random() * 0.5;
  fireCd = 1 + Math.random();
  aggro = false;
  fireCdMult = 1;
  walkPhase = Math.random() * 10;
  armed;
  accuracy;
  damage;
  range;
  homePos = new THREE.Vector3();
  _see = false;

  constructor(kind, x, z, armed = true) {
    this.kind = kind;
    this.armed = kind === 'civilian' ? false : armed;
    this.group.position.set(x, 0, z);
    this.homePos.set(x, 0, z);
    this.group.add(this.body);
    if (kind === 'wolf') {
      this.health = 55;
      this.speed = 2.2;
      this.runSpeed = 8.5;
      this.accuracy = 1;
      this.damage = 10;
      this.range = 2.0;
      this.buildWolf();
      addContactShadow(this.group, 0.75, 0.03, 0.4);
    } else {
      this.health = kind === 'police' ? 90 : kind === 'raider' ? 80 : 40;
      this.speed = 1.4;
      this.runSpeed = kind === 'civilian' ? 5.2 : 4.8;
      this.accuracy = kind === 'police' ? 0.5 : 0.45;
      this.damage = 9;
      this.range = kind === 'raider' ? 42 : 38;
      this.buildHuman();
      addContactShadow(this.group, 0.55, 0.03, 0.38);
    }
    this.group.traverse((o) => {
      if (o.isMesh && o.material && o.material.depthWrite !== false) {
        o.castShadow = true;
        o.userData.actor = this;
      }
    });
    this.target.set(x, 0, z);
  }

  limb(w, h, d, mat, px, py, pz) {
    const pivot = new THREE.Group();
    pivot.position.set(px, py, pz);
    const mesh = new THREE.Mesh(g(`box${w}${h}${d}`, () => new THREE.BoxGeometry(w, h, d)), mat);
    mesh.position.y = -h / 2;
    pivot.add(mesh);
    this.body.add(pivot);
    this.hit.push(mesh);
    return pivot;
  }

  buildHuman() {
    const tone = SKIN[Math.floor(Math.random() * SKIN.length)];
    const skin = m(tone, 0.68);
    const hair = m([0x1b1512, 0x35251a, 0x5a4430, 0x8a6a45, 0x2b2b2b, 0x9a9a9a][Math.floor(Math.random() * 6)], 0.92);
    let shirt, pants, outer = null, hat = null;
    if (this.kind === 'police') {
      shirt = m(0x1c2a4a, 0.8);
      pants = m(0x111827, 0.8);
      hat = m(0x0f172a, 0.55);
    } else if (this.kind === 'raider') {
      shirt = m([0x3b3127, 0x2a2a2a, 0x4a4a32][Math.floor(Math.random() * 3)], 0.95);
      pants = m(0x2b2b26, 0.95);
      outer = m(0x1c1a16, 0.96);
    } else {
      shirt = m(SHIRTS[Math.floor(Math.random() * SHIRTS.length)], 0.85);
      pants = m([0x2c3e5c, 0x3a3a3a, 0x5a4a3a][Math.floor(Math.random() * 3)], 0.9);
      if (Math.random() < 0.45) outer = shirt;
    }
    const bootMat = m(0x241c16, 0.9);
    const beltMat = m(0x1a1612, 0.7, 0.15);
    this.buildScale = 0.93 + Math.random() * 0.13;
    this.body.scale.setScalar(this.buildScale);

    const hips = new THREE.Mesh(g('hips', () => new THREE.BoxGeometry(0.36, 0.16, 0.24)), pants);
    hips.position.y = 0.92;
    this.body.add(hips);
    this.hit.push(hips);

    // Two-segment legs with knees and proper boots
    for (const sx of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(sx * 0.11, 0.94, 0);
      const thighMesh = new THREE.Mesh(g('thigh', () => new THREE.BoxGeometry(0.155, 0.44, 0.18)), pants);
      thighMesh.position.y = -0.22;
      thigh.add(thighMesh);
      this.hit.push(thighMesh);
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      thigh.add(knee);
      const shin = new THREE.Mesh(g('shin', () => new THREE.BoxGeometry(0.135, 0.4, 0.16)), pants);
      shin.position.y = -0.2;
      knee.add(shin);
      this.hit.push(shin);
      const boot = new THREE.Mesh(g('boot', () => new THREE.BoxGeometry(0.16, 0.12, 0.27)), bootMat);
      boot.position.set(0, -0.455, 0.045);
      knee.add(boot);
      this.hit.push(boot);
      this.body.add(thigh);
      this.legs.push(thigh);
      this.knees.push(knee);
    }

    // Tailored torso stack: waist, chest, shoulders, belt, buckle & collar
    this.torso = new THREE.Mesh(g('torsoReal', () => new THREE.BoxGeometry(0.44, 0.6, 0.25)), shirt);
    this.torso.position.y = 1.24;
    this.body.add(this.torso);
    this.hit.push(this.torso);
    const chest = new THREE.Mesh(g('chest', () => new THREE.BoxGeometry(0.5, 0.22, 0.27)), outer || shirt);
    chest.position.y = 1.48;
    this.body.add(chest);
    this.hit.push(chest);
    const belt = new THREE.Mesh(g('belt', () => new THREE.BoxGeometry(0.46, 0.06, 0.27)), beltMat);
    belt.position.y = 1.02;
    const buckle = new THREE.Mesh(g('buckle', () => new THREE.BoxGeometry(0.07, 0.05, 0.02)), m(0xb08d3a, 0.3, 0.85));
    buckle.position.set(0, 1.02, 0.14);
    this.body.add(belt, buckle);
    const collar = new THREE.Mesh(g('collar', () => new THREE.BoxGeometry(0.28, 0.06, 0.2)), outer || shirt);
    collar.position.y = 1.59;
    this.body.add(collar);
    if (this.kind !== 'police' && Math.random() < 0.3) {
      const pack = new THREE.Mesh(g('pack', () => new THREE.BoxGeometry(0.3, 0.34, 0.14)), m(0x2f2a22, 0.95));
      pack.position.set(0, 1.34, -0.2);
      this.body.add(pack);
    }

    // Neck and two-segment arms with hands
    const neck = new THREE.Mesh(g('neck', () => new THREE.CylinderGeometry(0.055, 0.06, 0.1, 8)), skin);
    neck.position.y = 1.6;
    this.body.add(neck);
    for (const sx of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(sx * 0.27, 1.5, 0);
      const upper = new THREE.Mesh(g('upperArm', () => new THREE.BoxGeometry(0.115, 0.32, 0.14)), shirt);
      upper.position.y = -0.16;
      shoulder.add(upper);
      this.hit.push(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.32;
      shoulder.add(elbow);
      const fore = new THREE.Mesh(
        g('forearm', () => new THREE.BoxGeometry(0.1, 0.3, 0.12)),
        this.kind === 'raider' || this.kind === 'police' ? shirt : skin,
      );
      fore.position.y = -0.15;
      elbow.add(fore);
      this.hit.push(fore);
      const hand = new THREE.Mesh(g('hand', () => new THREE.BoxGeometry(0.095, 0.11, 0.1)), skin);
      hand.position.y = -0.34;
      elbow.add(hand);
      this.hit.push(hand);
      this.body.add(shoulder);
      this.arms.push(shoulder);
      this.elbows.push(elbow);
    }

    // Articulated head with facial structure, hair and eyes
    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 1.63, 0);
    this.body.add(this.headPivot);

    const head = new THREE.Mesh(
      g('head', () => new THREE.SphereGeometry(0.128, 16, 12)),
      this.kind === 'raider' ? m(0x1a1a1a, 0.6) : skin,
    );
    head.position.y = 0.1;
    head.scale.set(0.96, 1.14, 1.02);
    head.userData.head = true;
    this.headPivot.add(head);
    this.hit.push(head);

    const jaw = new THREE.Mesh(g('jaw', () => new THREE.BoxGeometry(0.14, 0.09, 0.15)), this.kind === 'raider' ? m(0x1a1a1a, 0.6) : skin);
    jaw.position.set(0, 0.02, 0.015);
    this.headPivot.add(jaw);
    this.hit.push(jaw);
    const nose = new THREE.Mesh(g('nose', () => new THREE.ConeGeometry(0.024, 0.06, 6)), skin);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.095, 0.135);
    this.headPivot.add(nose);

    if (this.kind !== 'raider') {
      const eyeMat = m(0x171210, 0.35);
      for (const sx of [-0.042, 0.042]) {
        const eye = new THREE.Mesh(g('eye', () => new THREE.SphereGeometry(0.016, 8, 6)), eyeMat);
        eye.position.set(sx, 0.132, 0.123);
        this.headPivot.add(eye);
      }
      for (const sx of [-0.125, 0.125]) {
        const ear = new THREE.Mesh(g('ear', () => new THREE.SphereGeometry(0.024, 8, 6)), skin);
        ear.position.set(sx, 0.11, 0);
        ear.scale.set(0.7, 1, 0.5);
        this.headPivot.add(ear);
      }
      const hairCap = new THREE.Mesh(g('hair', () => new THREE.SphereGeometry(0.132, 14, 10)), hair);
      hairCap.position.set(0, 0.145, -0.012);
      hairCap.scale.set(1, 0.62, 1.02);
      this.headPivot.add(hairCap);
    }

    if (hat) {
      const cap = new THREE.Mesh(g('cap', () => new THREE.CylinderGeometry(0.15, 0.155, 0.09, 16)), hat);
      cap.position.y = 0.215;
      this.headPivot.add(cap);
      const visor = new THREE.Mesh(g('visor', () => new THREE.BoxGeometry(0.2, 0.02, 0.08)), hat);
      visor.position.set(0, 0.19, 0.11);
      this.headPivot.add(visor);
      const badge = new THREE.Mesh(g('badge', () => new THREE.BoxGeometry(0.06, 0.07, 0.02)), m(0xd4af37, 0.3, 0.9));
      badge.position.set(0.12, 1.4, 0.145);
      this.body.add(badge);
    }
    if (this.kind === 'raider') {
      const lensM = new THREE.MeshStandardMaterial({ color: 0x223322, emissive: 0x335533, roughness: 0.2 });
      for (const sx of [-0.05, 0.05]) {
        const lens = new THREE.Mesh(g('lens', () => new THREE.CircleGeometry(0.035, 12)), lensM);
        lens.position.set(sx, 0.16, 0.142);
        this.headPivot.add(lens);
      }
      const filt = new THREE.Mesh(g('filt', () => new THREE.CylinderGeometry(0.04, 0.05, 0.08, 10)), m(0x3a3a3a, 0.5, 0.5));
      filt.rotation.x = Math.PI / 2;
      filt.position.set(0, 0.05, 0.165);
      this.headPivot.add(filt);
    }
    if (this.armed) {
      const gunGrp = new THREE.Group();
      const gunMat = m(0x1b1e23, 0.38, 0.82);
      if (this.kind === 'raider') {
        const rec = new THREE.Mesh(g('npc_r_rec', () => new THREE.BoxGeometry(0.055, 0.09, 0.42)), gunMat);
        const brl = new THREE.Mesh(g('npc_r_brl', () => new THREE.CylinderGeometry(0.015, 0.015, 0.34, 8)), gunMat);
        brl.rotation.x = Math.PI / 2;
        brl.position.z = 0.36;
        const mag = new THREE.Mesh(g('npc_r_mag', () => new THREE.BoxGeometry(0.04, 0.16, 0.07)), m(0x2d3238, 0.7));
        mag.position.set(0, -0.1, 0.06);
        gunGrp.add(rec, brl, mag);
      } else {
        const slide = new THREE.Mesh(g('npc_p_sld', () => new THREE.BoxGeometry(0.045, 0.06, 0.24)), gunMat);
        const grip = new THREE.Mesh(g('npc_p_grp', () => new THREE.BoxGeometry(0.038, 0.1, 0.06)), m(0x111111, 0.85));
        grip.position.set(0, -0.06, -0.06);
        gunGrp.add(slide, grip);
      }
      gunGrp.position.set(0, -0.62, 0.14);
      this.arms[1].add(gunGrp);
    }
  }

  buildWolf() {
    const fur = m([0x5a5550, 0x3d3a36, 0x6e6a62][Math.floor(Math.random() * 3)], 1);
    const torso = new THREE.Mesh(g('wbody', () => new THREE.BoxGeometry(0.38, 0.4, 1.05)), fur);
    torso.position.y = 0.72;
    this.body.add(torso);
    this.hit.push(torso);
    const head = new THREE.Mesh(g('whead', () => new THREE.BoxGeometry(0.26, 0.26, 0.32)), fur);
    head.position.set(0, 0.88, 0.65);
    this.body.add(head);
    this.hit.push(head);
    const snout = new THREE.Mesh(g('wsnout', () => new THREE.BoxGeometry(0.14, 0.12, 0.22)), fur);
    snout.position.set(0, 0.82, 0.88);
    this.body.add(snout);
    for (const sx of [-0.08, 0.08]) {
      const ear = new THREE.Mesh(g('wear', () => new THREE.ConeGeometry(0.05, 0.12, 4)), fur);
      ear.position.set(sx, 1.05, 0.6);
      this.body.add(ear);
      const eye = new THREE.Mesh(g('weye', () => new THREE.SphereGeometry(0.025, 6, 6)), new THREE.MeshBasicMaterial({ color: 0xffcc33 }));
      eye.position.set(sx, 0.92, 0.81);
      this.body.add(eye);
    }
    const tail = new THREE.Mesh(g('wtail', () => new THREE.BoxGeometry(0.1, 0.1, 0.45)), fur);
    tail.position.set(0, 0.78, -0.7);
    tail.rotation.x = 0.6;
    this.body.add(tail);
    for (const [x, z] of [
      [-0.13, 0.38],
      [0.13, 0.38],
      [-0.13, -0.38],
      [0.13, -0.38],
    ]) {
      this.legs.push(this.limb(0.09, 0.55, 0.1, fur, x, 0.55, z));
    }
  }

  addBloodHit(isHead = false) {
    if (this.kind === 'wolf' || this.bloodHits >= 5) return;
    this.bloodHits++;
    const patch = new THREE.Mesh(g('bloodPatch', () => new THREE.CircleGeometry(1, 8)), bloodPatchMat);
    patch.scale.setScalar(0.022 + Math.random() * 0.05);
    if (isHead && this.headPivot) {
      patch.position.set((Math.random() - 0.5) * 0.1, 0.1 + (Math.random() - 0.5) * 0.1, 0.131);
      this.headPivot.add(patch);
    } else if (this.torso) {
      patch.position.set((Math.random() - 0.5) * 0.34, (Math.random() - 0.45) * 0.44, 0.128);
      patch.rotation.z = Math.random() * Math.PI;
      this.torso.add(patch);
    }
  }

  get pos() {
    return this.group.position;
  }

  takeDamage(d, hitDir = null, isHead = false) {
    if (this.dead) return false;
    this.health -= d;
    this.aggro = true;
    if (this.health <= 0) {
      this.dead = true;
      const imp = computeRagdollImpulse(hitDir, d, isHead);
      const yaw = this.group.rotation.y;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const forwardDot = imp.nx * fx + imp.nz * fz;
      const sideDot = imp.nx * fz - imp.nz * fx;
      this.rag = {
        vx: imp.vx,
        vy: imp.vy,
        vz: imp.vz,
        fallPitch: forwardDot >= 0 ? 1.48 : -1.48,
        fallRoll: sideDot * 0.45 + (Math.random() - 0.5) * 0.32,
        armLX: (Math.random() - 0.5) * 1.1 - 0.7,
        armLZ: -0.45 - Math.random() * 0.65,
        armRX: (Math.random() - 0.5) * 1.1 - 0.5,
        armRZ: 0.45 + Math.random() * 0.65,
        legLX: (forwardDot >= 0 ? -0.35 : 0.45) + (Math.random() - 0.5) * 0.25,
        legRX: (forwardDot >= 0 ? 0.42 : -0.32) + (Math.random() - 0.5) * 0.25,
        legSpread: 0.14 + Math.random() * 0.18,
        headX: (forwardDot >= 0 ? -0.45 : 0.55) * imp.headSnap,
        headZ: (Math.random() - 0.5) * 0.65,
        settled: false,
      };
      return true;
    }
    return false;
  }

  update(dt, w) {
    if (this.dead && (!this.rag || this.rag.settled)) return;
    const p = this.group.position;
    if (this.dead) {
      if (this.rag && !this.rag.settled) {
        const rg = this.rag;
        this.deathT = Math.min(1, this.deathT + dt * 2.15);
        const e = 1 - Math.pow(1 - this.deathT, 3);
        const bounce = Math.sin(Math.min(1, this.deathT * 1.25) * Math.PI) * 0.08 * (1 - this.deathT);

        // Physics translational knockback + gravity + wall collision + floor clamp
        rg.vy -= 18 * dt;
        const prevX = p.x;
        const prevZ = p.z;
        p.x += rg.vx * dt;
        p.z += rg.vz * dt;
        w.collide(p, 0.35);
        if (Math.abs(p.x - prevX - rg.vx * dt) > 0.01) rg.vx *= -0.3;
        if (Math.abs(p.z - prevZ - rg.vz * dt) > 0.01) rg.vz *= -0.3;

        const floorY = w.heightAt(p.x, p.z, p.y);
        p.y += rg.vy * dt;
        if (p.y <= floorY) {
          p.y = floorY;
          if (Math.abs(rg.vy) > 1.4) rg.vy = Math.abs(rg.vy) * 0.24;
          else rg.vy = 0;
          rg.vx *= Math.pow(0.02, dt);
          rg.vz *= Math.pow(0.02, dt);
        }

        if (this.kind === 'wolf') {
          this.body.rotation.z = e * (Math.PI / 2);
          this.body.rotation.x = e * rg.fallRoll * 0.35;
          this.body.position.y = -e * 0.42;
          this.legs.forEach((l, i) => {
            l.rotation.z = e * (i % 2 === 0 ? -0.35 : 0.45);
          });
        } else {
          // Multi-jointed human ragdoll: body collapses toward impact vector while limbs buckle & splay
          this.body.rotation.x = e * rg.fallPitch + bounce;
          this.body.rotation.z = e * rg.fallRoll;
          this.body.position.y = e * 0.18 + Math.abs(Math.sin(e * Math.PI)) * 0.08;
          if (this.legs[0]) {
            this.legs[0].rotation.x = e * rg.legLX;
            this.legs[0].rotation.z = -e * rg.legSpread;
          }
          if (this.legs[1]) {
            this.legs[1].rotation.x = e * rg.legRX;
            this.legs[1].rotation.z = e * rg.legSpread;
          }
          if (this.arms[0]) {
            this.arms[0].rotation.x = e * rg.armLX;
            this.arms[0].rotation.z = e * rg.armLZ;
          }
          if (this.arms[1]) {
            this.arms[1].rotation.x = e * rg.armRX;
            this.arms[1].rotation.z = e * rg.armRZ;
          }
          if (this.headPivot) {
            this.headPivot.rotation.x = e * rg.headX;
            this.headPivot.rotation.z = e * rg.headZ;
          }
          this.knees.forEach((kn, i) => {
            kn.rotation.x = e * (0.45 + (i === 0 ? -0.25 : 0.3));
          });
          this.elbows.forEach((el, i) => {
            el.rotation.x = e * (i === 0 ? -1.15 : -0.85);
          });
        }
        if (this.deathT >= 1 && p.y <= floorY + 0.02 && Math.hypot(rg.vx, rg.vz) < 0.08) {
          rg.settled = true;
        }
      }
      return;
    }

    _toP.subVectors(w.playerPos, p);
    _toP.y = 0;
    const dist = _toP.length();
    let moveSpeed = 0;
    let face = null;

    let hostile = false;
    if (this.kind === 'police') hostile = w.hostileAll || this.aggro;
    else if (this.kind === 'raider') hostile = this.aggro || dist < 42;
    else if (this.kind === 'wolf') hostile = this.aggro || dist < 34;
    if (hostile && !this.aggro && this.kind !== 'police') this.aggro = true;
    if (dist > 160 && this.kind !== 'police') this.aggro = false;

    if (this.kind === 'civilian') {
      const flee = w.alarm > 0 && dist < 60;
      if (flee) {
        _away.copy(_toP).normalize().multiplyScalar(-1);
        this.target.copy(p).addScaledVector(_away, 10);
        moveSpeed = this.runSpeed;
      } else {
        this.repath -= dt;
        if (this.repath <= 0 || p.distanceTo(this.target) < 1) {
          this.repath = 4 + Math.random() * 6;
          this.target.set(p.x + (Math.random() - 0.5) * 30, 0, p.z + (Math.random() - 0.5) * 30);
        }
        moveSpeed = Math.random() < 0.002 ? 0 : this.speed * 1.6;
      }
    } else if (hostile) {
      this.fireCd -= dt;
      if (this.kind === 'wolf') {
        this.target.copy(w.playerPos);
        moveSpeed = dist > 1.4 ? this.runSpeed : 0;
        face = Math.atan2(_toP.x, _toP.z);
        if (dist < this.range && this.fireCd <= 0) {
          this.fireCd = (1.1 + Math.random() * 0.5) * this.fireCdMult;
          w.damagePlayer(this.damage, 'Mauled by wolves');
        }
      } else {
        _eye.copy(p);
        _eye.y += 1.6;
        _pe.copy(w.playerPos);
        _pe.y += 1.5;
        let canSee = false;
        if (dist < this.range + 10) {
          this.repath -= dt;
          if (this.repath <= 0) {
            this.repath = 0.5;
            canSee = w.hasLOS(_eye, _pe);
            this._see = canSee;
          } else {
            canSee = this._see;
          }
        }
        face = Math.atan2(_toP.x, _toP.z);
        if (canSee && dist < this.range && this.armed) {
          moveSpeed = dist < 8 ? 0 : 0.8;
          _strafe.set(-_toP.z, 0, _toP.x).normalize().multiplyScalar(Math.sin(performance.now() / 900 + this.id) * 3);
          this.target.copy(p).add(_strafe);
          if (this.fireCd <= 0) {
            this.fireCd = (0.9 + Math.random() * 0.9) * this.fireCdMult;
            let hitChance = Math.max(0.12, this.accuracy - dist / 95);
            if (w.playerMoving) hitChance *= 0.74;
            const miss = Math.random() > hitChance;
            _missTarget.copy(_pe);
            if (miss) _missTarget.add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3));
            _muzzle.copy(_eye).addScaledVector(_toP.clone().normalize(), 0.5);
            _muzzle.y -= 0.3;
            w.shotFx(_muzzle.clone(), _missTarget.clone(), this.kind === 'raider' ? 'rifle' : 'pistol');
            if (!miss) w.damagePlayer(this.damage + Math.random() * 5, this.kind === 'police' ? 'Gunned down by police' : 'Shot by raiders');
          }
        } else {
          this.target.copy(w.playerPos);
          moveSpeed = this.runSpeed;
        }
      }
    } else {
      this.repath -= dt;
      if (this.repath <= 0) {
        this.repath = 3 + Math.random() * 6;
        this.target.set(this.homePos.x + (Math.random() - 0.5) * 24, 0, this.homePos.z + (Math.random() - 0.5) * 24);
      }
      moveSpeed = p.distanceTo(this.target) > 1 ? this.speed : 0;
    }

    if (moveSpeed > 0) {
      _moveDir.set(this.target.x - p.x, 0, this.target.z - p.z);
      if (_moveDir.lengthSq() > 0.04) {
        _moveDir.normalize();
        p.addScaledVector(_moveDir, moveSpeed * dt);
        if (face === null) face = Math.atan2(_moveDir.x, _moveDir.z);
      } else {
        moveSpeed = 0;
      }
    }
    const b = w.bounds;
    p.x = Math.max(-b, Math.min(b, p.x));
    p.z = Math.max(-b, Math.min(b, p.z));
    w.collide(p, this.kind === 'wolf' ? 0.5 : 0.35);
    p.y = w.heightAt(p.x, p.z, p.y);
    if (face !== null) {
      let diff = face - this.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.group.rotation.y += diff * Math.min(1, dt * 8);
    }

    this.walkPhase += dt * moveSpeed * (this.kind === 'wolf' ? 2.2 : 2.6);
    const amp = Math.min(1, moveSpeed / 3) * (this.kind === 'wolf' ? 0.7 : 0.6);
    this.legs.forEach((l, i) => {
      l.rotation.x = Math.sin(this.walkPhase + (i % 2 === 0 ? 0 : Math.PI) + (i > 1 ? Math.PI : 0)) * amp;
    });
    this.knees.forEach((kn, i) => {
      const swing = Math.sin(this.walkPhase + (i % 2 === 0 ? 0 : Math.PI));
      kn.rotation.x = Math.max(0, -swing) * amp * 1.2;
    });
    if (this.arms.length) {
      const aiming = hostile && this.armed && moveSpeed < 1.5;
      this.arms[0].rotation.x = aiming ? -1.2 : -Math.sin(this.walkPhase) * amp;
      this.arms[1].rotation.x = aiming ? -1.45 : Math.sin(this.walkPhase) * amp;
      this.elbows.forEach((el, i) => {
        el.rotation.x = aiming ? (i === 0 ? -1.05 : -1.2) : -0.12 - Math.max(0, Math.sin(this.walkPhase + (i === 0 ? 0 : Math.PI))) * amp * 0.4;
      });
    }

    // Idle breathing, subtle weight shift and head tracking toward nearby people
    if (this.torso) {
      const t = performance.now() * 0.001;
      this.torso.scale.y = 1 + Math.sin(t * 1.5 + this.id) * 0.012;
      if (this.headPivot) {
        let look = 0;
        if (!hostile && dist < 22) {
          let rel = Math.atan2(_toP.x, _toP.z) - this.group.rotation.y;
          while (rel > Math.PI) rel -= Math.PI * 2;
          while (rel < -Math.PI) rel += Math.PI * 2;
          look = Math.max(-0.75, Math.min(0.75, rel));
        }
        this.headPivot.rotation.y += (look - this.headPivot.rotation.y) * Math.min(1, dt * 3.5);
      }
    }
  }
}
