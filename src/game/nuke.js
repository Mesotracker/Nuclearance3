import * as THREE from 'three';
import { audio } from './audio.js';
import { flakeTexture, shockRingTexture, smokeTexture } from './textures.js';

const FIREBALL_VERT = /* glsl */ `
uniform float uTime;
uniform float uTurbulence;
varying vec3 vNormal;
varying vec3 vLocalPos;
varying vec3 vViewDir;

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
        mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
        mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

float fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise3(p);
    p = p * 2.04 + vec3(0.0, -uTime * 0.45, 0.0);
    a *= 0.5;
  }
  return v;
}

void main() {
  vLocalPos = position;
  vec3 samplePos = position * 2.4 + vec3(0.0, -uTime * 0.7, uTime * 0.28);
  float disp = fbm3(samplePos) - 0.45;
  vec3 displaced = position + normal * disp * uTurbulence;
  vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
  vViewDir = normalize(-mvPos.xyz);
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mvPos;
}
`;

const FIREBALL_FRAG = /* glsl */ `
uniform float uTime;
uniform float uHeat;
varying vec3 vNormal;
varying vec3 vLocalPos;
varying vec3 vViewDir;

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
        mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
        mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

void main() {
  vec3 p = vLocalPos * 3.1 + vec3(0.0, -uTime * 0.95, uTime * 0.32);
  float n1 = noise3(p);
  float n2 = noise3(p * 2.4);
  float n3 = noise3(p * 5.2);
  // Sharp convective plasma filaments & dark soot fissures
  float ridge = 1.0 - abs(n1 * 2.0 - 1.0);
  float cell = ridge * 0.55 + n2 * 0.3 + n3 * 0.15;
  float rim = pow(1.0 - max(0.0, dot(normalize(vNormal), normalize(vViewDir))), 1.8);
  float underHeat = clamp(0.55 - vLocalPos.y * 0.45, 0.0, 1.0);
  float temp = clamp(uHeat * (0.42 + cell * 0.85) + underHeat * 0.25 - rim * 0.32, 0.0, 1.45);

  vec3 charSoot = vec3(0.07, 0.05, 0.05);
  vec3 crimson = vec3(0.85, 0.16, 0.03);
  vec3 molten = vec3(1.45, 0.52, 0.08);
  vec3 coreWhite = vec3(2.35, 1.85, 1.25);

  vec3 col = mix(charSoot, crimson, smoothstep(0.18, 0.48, temp));
  col = mix(col, molten, smoothstep(0.46, 0.82, temp));
  col = mix(col, coreWhite, smoothstep(0.84, 1.22, temp));
  gl_FragColor = vec4(col, 1.0);
}
`;

const SHOCK_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vViewDir = normalize(-mvPos.xyz);
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mvPos;
}
`;

const SHOCK_FRAG = /* glsl */ `
uniform float uOpacity;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), 3.5);
  gl_FragColor = vec4(vec3(1.0, 0.92, 0.82), fres * uOpacity);
}
`;

export class NukeCutscene {
  game;
  t = 0;
  group = new THREE.Group();
  view;
  blast;
  survive;
  fireball;
  fireballMat;
  glow;
  wilsonRing;
  airShockShell;
  shockMat;
  groundRing;
  embers;
  emberVel;
  puffs = [];
  flashLight;
  groundGlowLight;
  shockDist;
  shockHit = false;
  ended = false;
  rumble = false;
  savedFog;
  _fbPos = new THREE.Vector3();
  _look = new THREE.Vector3();

  constructor(game, view, blast, survive) {
    this.game = game;
    this.view = view.clone();
    this.blast = blast.clone();
    this.survive = survive;
    this.shockDist = view.distanceTo(blast);
    this.savedFog = game.scene.fog || null;
    game.scene.fog = new THREE.FogExp2(this.savedFog ? this.savedFog.color.getHex() : 0x888888, 0.00014);

    // 1. Boiling 3D plasma fireball (high-contrast charred crust + incandescent plasma fissures)
    this.fireballMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uHeat: { value: 1.3 },
        uTurbulence: { value: 0.28 },
      },
      vertexShader: FIREBALL_VERT,
      fragmentShader: FIREBALL_FRAG,
      toneMapped: false,
      fog: false,
    });
    this.fireball = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 36), this.fireballMat);
    this.fireball.position.copy(blast);
    this.group.add(this.fireball);

    // 2. Subtle warm Rayleigh halo around plasma core (does NOT wash out detail)
    const tex = smokeTexture();
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        color: 0xff8c38,
        blending: THREE.AdditiveBlending,
        fog: false,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
      }),
    );
    this.glow.position.copy(blast);
    this.group.add(this.glow);

    // 3. Wilson condensation cloud collar (thin atmospheric belt around blast column)
    this.wilsonRing = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.09, 12, 48),
      new THREE.MeshBasicMaterial({
        color: 0xf4f7fc,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
      }),
    );
    this.wilsonRing.rotation.x = Math.PI / 2;
    this.wilsonRing.position.copy(blast).setY(115);
    this.group.add(this.wilsonRing);

    // 4. Fresnel-rim refractive air shockwave shell (sharp bright edge only)
    this.shockMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: SHOCK_VERT,
      fragmentShader: SHOCK_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.FrontSide,
      fog: false,
    });
    this.airShockShell = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), this.shockMat);
    this.airShockShell.position.copy(blast);
    this.group.add(this.airShockShell);

    // 5. Supersonic Mach-stem ground dust ring
    this.groundRing = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({
        map: shockRingTexture(),
        color: 0xdccbb8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    this.groundRing.rotation.x = -Math.PI / 2;
    this.groundRing.position.set(blast.x, 4, blast.z);
    this.group.add(this.groundRing);

    // 6. Radiating embers / debris sparks
    const emberCount = 260;
    const ePos = new Float32Array(emberCount * 3);
    this.emberVel = new Float32Array(emberCount * 3);
    for (let i = 0; i < emberCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 25 + Math.random() * 95;
      ePos[i * 3] = blast.x + (Math.random() - 0.5) * 30;
      ePos[i * 3 + 1] = blast.y + Math.random() * 20;
      ePos[i * 3 + 2] = blast.z + (Math.random() - 0.5) * 30;
      this.emberVel[i * 3] = Math.cos(a) * spd;
      this.emberVel[i * 3 + 1] = 40 + Math.random() * 140;
      this.emberVel[i * 3 + 2] = Math.sin(a) * spd;
    }
    const eGeo = new THREE.BufferGeometry();
    eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
    this.embers = new THREE.Points(
      eGeo,
      new THREE.PointsMaterial({
        map: flakeTexture(),
        size: 7.5,
        color: 0xffaa44,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    this.group.add(this.embers);

    // 7. Volumetric Mushroom Cloud Puffs (tight dark stem + billowing ash/fire toroidal cap + pileus + ring)
    const add = (kind, n) => {
      for (let i = 0; i < n; i++) {
        const s = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: tex,
            color: 0xffaa66,
            fog: false,
            depthWrite: false,
            transparent: true,
            opacity: 0,
          }),
        );
        s.material.rotation = Math.random() * 6.28;
        this.group.add(s);
        this.puffs.push({
          s,
          kind,
          a: Math.random() * Math.PI * 2,
          r: Math.random(),
          h: Math.random(),
          spin: (Math.random() - 0.5) * 0.4,
        });
      }
    };
    add('stem', 85);
    add('cap', 190);
    add('skirt', 40);
    add('pileus', 32);
    add('ring', 110);

    // Flash + fireball under-lighting
    this.flashLight = new THREE.DirectionalLight(0xffddb0, 0);
    this.flashLight.position.copy(blast).add(new THREE.Vector3(0, 320, 0));
    this.flashLight.target.position.copy(view);
    this.groundGlowLight = new THREE.PointLight(0xff6622, 0, 2600, 1.2);
    this.groundGlowLight.position.copy(blast).add(new THREE.Vector3(0, 120, 0));

    game.scene.add(this.group, this.flashLight, this.flashLight.target, this.groundGlowLight);
    game.onEvent({ type: 'flash' });
    audio.explosion(0.45);
  }

  update(dt) {
    if (this.ended) return;
    this.t += dt;
    const t = this.t;
    const g = this.game;

    // Double-pulse thermal flash without washing out scene contrast
    const pulse1 = Math.exp(-Math.pow((t - 0.08) / 0.14, 2)) * 1.0;
    const pulse2 = Math.exp(-Math.pow((t - 0.95) / 0.75, 2)) * 1.0;
    const flash = Math.min(1.15, pulse1 + pulse2);
    this.flashLight.intensity = 1.6 + flash * 3.8;
    g.renderer.toneMappingExposure = g.baseExposure * (1 + flash * 0.48);

    // Rising & cooling boiling plasma fireball
    const fr = Math.min(130, 34 + t * 52);
    const rise = Math.min(720, 58 + t * 76 + t * t * 2.5);
    this._fbPos.copy(this.blast).add(new THREE.Vector3(0, rise, 0));
    this.fireball.position.copy(this._fbPos);
    this.fireball.scale.set(fr * 1.15, fr * 0.92, fr * 1.15);

    const heat = Math.max(0.08, 1.28 - t * 0.095);
    this.fireballMat.uniforms.uTime.value = t;
    this.fireballMat.uniforms.uHeat.value = heat;
    this.fireballMat.uniforms.uTurbulence.value = 0.24 + Math.min(0.22, t * 0.03);

    this.groundGlowLight.position.copy(this._fbPos);
    this.groundGlowLight.intensity = Math.max(0, 28 * (1 - t / 14));

    this.glow.position.copy(this._fbPos);
    this.glow.scale.setScalar(fr * 3.2 * (0.45 + Math.min(0.75, heat)));
    this.glow.material.opacity = Math.min(0.32, 0.08 + heat * 0.18);

    // Crisp Fresnel-rim shockwave shell & Wilson condensation collar
    const shockR = t * 200;
    this.airShockShell.scale.setScalar(Math.max(1, shockR));
    this.shockMat.uniforms.uOpacity.value = t < 5 ? Math.max(0, 0.45 * (1 - t / 5)) : 0;

    const wilsonOp = Math.sin(Math.min(1, Math.max(0, (t - 0.4) / 3.2)) * Math.PI) * 0.34;
    this.wilsonRing.scale.setScalar(Math.max(1, shockR * 0.45));
    this.wilsonRing.material.opacity = t < 3.6 ? wilsonOp : 0;

    // Ground Mach-stem ring
    const ringR = Math.min(this.shockDist * 1.35, t * 210);
    this.groundRing.scale.setScalar(Math.max(1, ringR));
    this.groundRing.material.opacity = Math.min(0.72, t * 0.65) * Math.max(0, 1 - t / 14);

    // Update embers
    const ep = this.embers.geometry.attributes.position;
    for (let i = 0; i < ep.count; i++) {
      ep.setXYZ(
        i,
        ep.getX(i) + this.emberVel[i * 3] * dt,
        ep.getY(i) + this.emberVel[i * 3 + 1] * dt,
        ep.getZ(i) + this.emberVel[i * 3 + 2] * dt,
      );
      this.emberVel[i * 3 + 1] -= 28 * dt;
    }
    ep.needsUpdate = true;
    this.embers.material.opacity = Math.max(0, 1 - t / 8);

    // Sculpted mushroom cap sits slightly ABOVE plasma core so fireball illuminates underside
    const capR = fr * 1.45 + t * 14;
    const capCenterY = this._fbPos.y + fr * 0.58;
    const sootDark = new THREE.Color(0.11, 0.09, 0.09);
    const ashMid = new THREE.Color(0.32, 0.27, 0.25);
    const hotCore = new THREE.Color(1.0, 0.42, 0.08);
    const iceWhite = new THREE.Color(0.88, 0.91, 0.95);

    for (const p of this.puffs) {
      const m = p.s.material;
      m.rotation += p.spin * dt;
      let px, py, pz, size, warm;
      if (p.kind === 'cap') {
        const tor = capR * (0.58 + p.r * 0.56);
        const tube = capR * 0.36;
        const ang = p.a + t * 0.06;
        const v = p.h * Math.PI * 2 + t * 0.55;
        px = this._fbPos.x + Math.cos(ang) * (tor + Math.cos(v) * tube * 0.72);
        py = capCenterY + Math.sin(v) * tube * 0.52;
        pz = this._fbPos.z + Math.sin(ang) * (tor + Math.cos(v) * tube * 0.72);
        size = capR * (0.44 + p.r * 0.16);
        // Bottom/inner torus gets fierce incandescent orange glow from rising fireball
        const underside = Math.max(0, -Math.sin(v));
        warm = Math.max(0, (1 - t / 12) * (0.14 + underside * 0.86) - p.r * 0.18);
        m.opacity = Math.min(0.88, t * 0.7);
        m.color.copy(sootDark).lerp(ashMid, 0.32 + Math.sin(v) * 0.28).lerp(hotCore, warm);
      } else if (p.kind === 'stem') {
        const y = p.h * rise;
        const w = fr * (0.2 + (1 - p.h) * 0.22 + p.h * 0.16);
        px = this.blast.x + Math.cos(p.a) * w * p.r * 0.45;
        py = this.blast.y + y;
        pz = this.blast.z + Math.sin(p.a) * w * p.r * 0.45;
        size = w * 1.15;
        warm = Math.max(0, 1 - t / 8) * (p.h * 0.82);
        m.opacity = Math.min(0.84, Math.max(0, t - p.h * 0.6) * 0.65);
        m.color.copy(sootDark).lerp(hotCore, warm);
      } else if (p.kind === 'skirt') {
        const y = rise * 0.76;
        const rr = capR * (0.42 + p.r * 0.36);
        px = this.blast.x + Math.cos(p.a) * rr;
        py = this.blast.y + y - p.h * 25;
        pz = this.blast.z + Math.sin(p.a) * rr;
        size = capR * 0.32;
        m.opacity = Math.min(0.55, Math.max(0, t - 1.4) * 0.28);
        m.color.copy(ashMid).lerp(iceWhite, 0.45);
      } else if (p.kind === 'pileus') {
        const rr = capR * (0.35 + p.r * 0.55);
        px = this._fbPos.x + Math.cos(p.a) * rr;
        py = capCenterY + capR * 0.38 + (1 - p.r) * 28;
        pz = this._fbPos.z + Math.sin(p.a) * rr;
        size = capR * 0.38;
        m.opacity = Math.sin(Math.min(1, Math.max(0, (t - 1.1) / 5.5)) * Math.PI) * 0.55;
        m.color.copy(iceWhite);
      } else {
        const rr = Math.min(this.shockDist * 1.32, t * 210) * (0.86 + p.r * 0.28);
        px = this.blast.x + Math.cos(p.a) * rr;
        py = 14 + p.h * 45;
        pz = this.blast.z + Math.sin(p.a) * rr;
        size = 95 + t * 12;
        warm = Math.max(0, 0.5 - t / 4.5);
        m.opacity = Math.min(0.68, t * 0.55) * Math.max(0, 1 - t / 16);
        m.color.copy(ashMid).lerp(hotCore, warm);
      }
      p.s.position.set(px, py, pz);
      p.s.scale.setScalar(size);
    }

    // Shockwave arrives at camera
    const shockT = this.shockDist / 210;
    if (!this.rumble && t > shockT * 0.45) {
      this.rumble = true;
      audio.explosion(1);
    }
    if (!this.shockHit && t > shockT) {
      this.shockHit = true;
      g.shake = this.survive ? 2.6 : 4.5;
      audio.glass();
      if (!this.survive) {
        g.onEvent({ type: 'flash' });
        setTimeout(() => this.finish(), 650);
      }
    }

    // Camera shake & framing
    g.shake = Math.max(0, g.shake - dt * 0.5);
    const sh = g.shake * 0.35;
    const cam = g.camera;
    cam.position.set(
      this.view.x + (Math.random() - 0.5) * sh,
      this.view.y + (Math.random() - 0.5) * sh,
      this.view.z + (Math.random() - 0.5) * sh,
    );
    this._look.copy(this.blast).add(new THREE.Vector3(0, Math.min(rise * 0.82, 420), 0));
    cam.lookAt(this._look);
    g.viewModel.visible = false;

    if (this.survive && t > shockT + 4.2) this.finish();
  }

  finish() {
    if (this.ended) return;
    this.ended = true;
    const g = this.game;
    g.scene.remove(this.group, this.flashLight, this.flashLight.target, this.groundGlowLight);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    g.scene.fog = this.savedFog;
    g.renderer.toneMappingExposure = g.baseExposure;
    g.viewModel.visible = true;
    if (this.survive) g.completePhase();
    else g.die('Caught outside when the warheads detonated');
  }
}
