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
  hit = [];
  legs = [];
  arms = [];
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
    const skin = m(SKIN[Math.floor(Math.random() * SKIN.length)], 0.7);
    let shirt, pants;
    let hat = null;
    if (this.kind === 'police') {
      shirt = m(0x1c2a4a, 0.8);
      pants = m(0x111827, 0.8);
      hat = m(0x0f172a, 0.6);
    } else if (this.kind === 'raider') {
      shirt = m([0x3b3127, 0x2a2a2a, 0x4a4a32][Math.floor(Math.random() * 3)], 0.95);
      pants = m(0x2b2b26, 0.95);
    } else {
      shirt = m(SHIRTS[Math.floor(Math.random() * SHIRTS.length)], 0.85);
      pants = m([0x2c3e5c, 0x3a3a3a, 0x5a4a3a][Math.floor(Math.random() * 3)], 0.9);
    }
    this.legs.push(this.limb(0.17, 0.86, 0.2, pants, -0.12, 0.88, 0));
    this.legs.push(this.limb(0.17, 0.86, 0.2, pants, 0.12, 0.88, 0));
    const torso = new THREE.Mesh(g('torso', () => new THREE.BoxGeometry(0.48, 0.64, 0.26)), shirt);
    torso.position.y = 1.2;
    this.body.add(torso);
    this.hit.push(torso);
    this.arms.push(this.limb(0.13, 0.66, 0.15, shirt, -0.31, 1.48, 0));
    this.arms.push(this.limb(0.13, 0.66, 0.15, shirt, 0.31, 1.48, 0));

    // Articulated head pivot so head snaps & lolls naturally during ragdoll collapse
    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 1.56, 0);
    this.body.add(this.headPivot);

    const head = new THREE.Mesh(
      g('head', () => new THREE.SphereGeometry(0.13, 16, 12)),
      this.kind === 'raider' ? m(0x1a1a1a, 0.6) : skin,
    );
    head.position.y = 0.12;
    head.scale.y = 1.15;
    head.userData.head = true;
    this.headPivot.add(head);
    this.hit.push(head);
    if (hat) {
      const cap = new THREE.Mesh(g('cap', () => new THREE.CylinderGeometry(0.15, 0.15, 0.08, 16)), hat);
      cap.position.y = 0.26;
      this.headPivot.add(cap);
      const badge = new THREE.Mesh(g('badge', () => new THREE.BoxGeometry(0.06, 0.07, 0.02)), m(0xd4af37, 0.3, 0.9));
      badge.position.set(0.12, 1.36, 0.14);
      this.body.add(badge);
    }
    if (this.kind === 'raider') {
      const lensM = new THREE.MeshStandardMaterial({ color: 0x223322, emissive: 0x335533, roughness: 0.2 });
      for (const sx of [-0.05, 0.05]) {
        const lens = new THREE.Mesh(g('lens', () => new THREE.CircleGeometry(0.035, 12)), lensM);
        lens.position.set(sx, 0.15, 0.135);
        this.headPivot.add(lens);
      }
      const filt = new THREE.Mesh(g('filt', () => new THREE.CylinderGeometry(0.04, 0.05, 0.08, 10)), m(0x3a3a3a, 0.5, 0.5));
      filt.rotation.x = Math.PI / 2;
      filt.position.set(0, 0.04, 0.16);
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
    if (this.arms.length) {
      const aiming = hostile && this.armed && moveSpeed < 1.5;
      this.arms[0].rotation.x = aiming ? -1.2 : -Math.sin(this.walkPhase) * amp;
      this.arms[1].rotation.x = aiming ? -1.45 : Math.sin(this.walkPhase) * amp;
    }
  }
}
