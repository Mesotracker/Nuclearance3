import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { audio } from './audio.js';
import { Actor } from './entities.js';
import { buildBunker } from './levels/bunker.js';
import { buildCity } from './levels/city.js';
import { buildWild } from './levels/wild.js';
import { NukeCutscene } from './nuke.js';
import {
  clampDeltaTime,
  computeFallDamage,
  computeGrenadeFalloff,
  computeObjectiveBearing,
  computeScopeFov,
  computeWeaponStats,
  generateAmmoDrop,
  grantXp,
  stepSurvivalStats,
} from './rules.js';
import {
  flakeTexture,
  footprintTexture,
  muzzleFlashTexture,
  polymerGripPBR,
  rippleRingTexture,
  setMaxAnisotropy,
  shockRingTexture,
  smokeTexture,
  weaponMetalPBR,
  woodGripPBR,
} from './textures.js';
import { makeAmmoPickup } from './props.js';
import { WEAPONS, cloneStats, difficultyMods } from './types.js';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uCloudTint;
uniform vec3 uCloudSecondary;
uniform float uCloudDensity;
uniform float uCloudScale;
uniform float uCloudSpeed;
uniform float uTime;
varying vec3 vDir;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2d(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm2(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise2d(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vDir);
  float h = clamp(dir.y, 0.0, 1.0);
  vec3 sky = mix(uHorizon, uZenith, pow(h, 0.48));
  if (dir.y < 0.0) sky = uHorizon;

  // Mie scattering + sun disc piercing smoke/ash
  float sunCos = max(0.0, dot(dir, normalize(uSunDir)));
  float mie = pow(sunCos, 5.0) * 0.46 + pow(sunCos, 38.0) * 0.55;
  float disc = smoothstep(0.9988, 0.9997, sunCos) * 1.4;
  sky += uSunColor * (mie + disc) * smoothstep(-0.05, 0.28, dir.y);

  // Two-layer atmospheric clouds (billowy lower deck + high wispy cirrus/ash streaks)
  if (dir.y > 0.01 && uCloudDensity > 0.01) {
    float horizonFade = smoothstep(0.01, 0.2, dir.y);
    vec2 baseUv = dir.xz / (dir.y + 0.16) * uCloudScale;

    vec2 uv1 = baseUv + vec2(uTime * uCloudSpeed, uTime * uCloudSpeed * 0.45);
    float c1 = fbm2(uv1);
    float cover1 = smoothstep(0.46 - uCloudDensity * 0.28, 0.84, c1);
    float selfShade = clamp(fbm2(uv1 + normalize(uSunDir).xz * 0.25) * 1.15, 0.0, 1.0);
    vec3 litCloud = mix(uCloudSecondary, uCloudTint, 0.35 + selfShade * 0.65);
    litCloud += uSunColor * pow(sunCos, 3.5) * 0.38;
    sky = mix(sky, litCloud, cover1 * uCloudDensity * horizonFade * 0.88);

    vec2 uv2 = baseUv * vec2(2.1, 0.95) - vec2(uTime * uCloudSpeed * 0.6, -uTime * uCloudSpeed * 0.25);
    float c2 = fbm2(uv2 + 4.3);
    float cover2 = smoothstep(0.55 - uCloudDensity * 0.18, 0.9, c2);
    vec3 highCol = mix(uCloudTint, uSunColor * 0.8 + uCloudTint * 0.4, pow(sunCos, 4.0) * 0.5);
    sky = mix(sky, highCol, cover2 * uCloudDensity * horizonFade * 0.36);
  }

  gl_FragColor = vec4(sky, 1.0);
  #include <colorspace_fragment>
}
`;

const MOUSE_SENSITIVITY = 0.0034;
const _aimTarget = new THREE.Vector3();

const _isSoftwareGl = (() => {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
})();

export class Game {
  container;
  renderer;
  scene = new THREE.Scene();
  camera;
  _lastTime = performance.now();
  onUpdate;
  onEvent;
  stats;
  phase = 'city';
  level = null;
  mode = 'idle';
  raf = 0;
  timerId = 0;
  disposed = false;
  allowUnlockedPlay = false;

  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  vy = 0;
  onGround = true;
  moving = false;
  keys = new Set();
  mouseDown = false;
  locked = false;
  eLatch = false;

  weapon = 'fists';
  clips = { fists: 0, pistol: 0, shotgun: 0, rifle: 0, grenade: 0 };
  fireCd = 0;
  reloadT = 0;
  scoped = false;
  scopeZoom = 0;
  viewModel = new THREE.Group();
  vmGuns = {};
  recoil = 0;
  bobT = 0;
  muzzleLight;
  muzzleFlash;

  actors = [];
  grenades = [];
  pickups = [];
  fx = [];
  interactT = 0;
  current = null;
  currentKey = null;
  alarm = 0;
  wanted = 0;
  timer = 0;
  grid = new Map();
  obstacleBounds = [];
  _rayCandidates = [];
  lightScanT = 0;
  nearFiresCached = [];
  nearIntCached = [];
  raycaster = new THREE.Raycaster();
  sun;
  rimLight;
  hemi;
  dome;
  particles = null;
  particleKind = null;
  hudAcc = 0;
  shake = 0;
  cutscene = null;
  geigerRate = 0;
  nearFire = false;
  phaseStart;
  fireLights = [];
  interiorLights = [];
  hurtCd = 0;
  baseExposure = 1;
  elapsed = 0;
  muzzleFlashT = 0;
  deathPoseT = 0;
  strideAcc = 0;
  footSide = 1;
  wetBootT = 0;
  fpMesh = null;
  fpHead = 0;
  fpMax = 180;
  fpDummy = new THREE.Object3D();
  fpCol = new THREE.Color();
  fpMeta = [];

  constructor(container, onUpdate, onEvent, stats) {
    this.container = container;
    this.onUpdate = onUpdate;
    this.onEvent = onEvent;
    this.stats = stats;
    this.phaseStart = cloneStats(stats);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !_isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(_isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = !_isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());

    // Studio/Sky IBL environment map so metallic surfaces and glass reflect light properly
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(72, container.clientWidth / container.clientHeight, 0.05, 4000);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -60;
    sc.right = sc.top = 60;
    sc.near = 1;
    sc.far = 400;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1);
    this.scene.add(this.hemi);

    // Secondary cool/warm fill & rim directional light for crisp silhouette separation
    this.rimLight = new THREE.DirectionalLight(0xaad4ff, 0.55);
    this.scene.add(this.rimLight, this.rimLight.target);

    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uHorizon: { value: new THREE.Color(0xd08860) },
        uZenith: { value: new THREE.Color(0x1b2a55) },
        uSunDir: { value: new THREE.Vector3(0.6, 0.4, 0.3).normalize() },
        uSunColor: { value: new THREE.Color(0xffb070) },
        uCloudTint: { value: new THREE.Color(0x9a8275) },
        uCloudSecondary: { value: new THREE.Color(0x6e5a52) },
        uCloudDensity: { value: 0.45 },
        uCloudScale: { value: 1.4 },
        uCloudSpeed: { value: 0.01 },
        uTime: { value: 0 },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), domeMat);
    this.dome.renderOrder = -1;
    this.scene.add(this.dome);

    const fireMax = _isSoftwareGl ? 2 : 3;
    const intMax = _isSoftwareGl ? 2 : 3;
    for (let i = 0; i < fireMax; i++) {
      const l = new THREE.PointLight(0xff8833, 0, 18, 1.6);
      this.fireLights.push(l);
      this.scene.add(l);
    }
    for (let i = 0; i < intMax; i++) {
      const il = new THREE.PointLight(0xffe4bd, 0, 18, 1.5);
      this.interiorLights.push(il);
      this.scene.add(il);
    }

    this.muzzleLight = new THREE.PointLight(0xffaa44, 0, 14, 1.8);
    this.muzzleFlash = new THREE.Group();
    const mfMat = new THREE.MeshBasicMaterial({
      map: muzzleFlashTexture(),
      color: 0xffe4a0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const mfFront = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), mfMat);
    const mfCross1 = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.2), mfMat);
    mfCross1.rotation.y = Math.PI / 2;
    mfCross1.position.z = -0.14;
    const mfCross2 = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.2), mfMat);
    mfCross2.rotation.y = Math.PI / 2;
    mfCross2.rotation.x = Math.PI / 2;
    mfCross2.position.z = -0.14;
    this.muzzleFlash.add(mfFront, mfCross1, mfCross2);
    this.muzzleFlash.userData.mat = mfMat;
    this.muzzleFlash.visible = false;

    this.buildViewModels();
    this.camera.add(this.viewModel);
    this.initFootprints();

    this.bindInput();
    window.addEventListener('resize', this.onResize);
    this.loop();
  }

  initFootprints() {
    const geo = new THREE.PlaneGeometry(0.25, 0.44);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      map: footprintTexture(),
      transparent: true,
      opacity: 0.78,
      alphaTest: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide,
      roughness: 0.85,
      polygonOffset: true,
      polygonOffsetFactor: -5,
    });
    this.fpMesh = new THREE.InstancedMesh(geo, mat, this.fpMax);
    this.fpMesh.frustumCulled = false;
    this.fpMesh.receiveShadow = true;
    const hideMat = new THREE.Matrix4().makeScale(0, 0, 0);
    const initCol = new THREE.Color(0x2a2520);
    for (let i = 0; i < this.fpMax; i++) {
      this.fpMesh.setMatrixAt(i, hideMat);
      this.fpMesh.setColorAt(i, initCol);
      this.fpMeta.push({ x: 0, y: -999, z: 0, rot: 0, sx: 0, age: 0, life: 22 });
    }
    this.fpMesh.instanceMatrix.needsUpdate = true;
    if (this.fpMesh.instanceColor) this.fpMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.fpMesh);
  }

  resetFootprints() {
    this.strideAcc = 0;
    this.footSide = 1;
    this.wetBootT = 0;
    this.fpHead = 0;
    if (!this.fpMesh) return;
    const hideMat = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.fpMax; i++) {
      this.fpMesh.setMatrixAt(i, hideMat);
      this.fpMeta[i].y = -999;
      this.fpMeta[i].sx = 0;
    }
    this.fpMesh.instanceMatrix.needsUpdate = true;
  }

  stampFootprint(x, y, z, yaw, surf, wet = false) {
    if (!this.fpMesh) return;
    const lvl = this.level;
    const idx = this.fpHead;
    this.fpHead = (this.fpHead + 1) % this.fpMax;
    const sideMirror = this.footSide;

    // Sample tiny tangent heights so bootprint sits flush along slopes
    const eps = 0.22;
    const hF = lvl ? lvl.heightAt(x - Math.sin(yaw) * eps, z - Math.cos(yaw) * eps, y) : y;
    const hB = lvl ? lvl.heightAt(x + Math.sin(yaw) * eps, z + Math.cos(yaw) * eps, y) : y;
    const pitchSlope = Math.atan2(hF - hB, eps * 2);

    const d = this.fpDummy;
    d.position.set(x, y + 0.032, z);
    d.rotation.set(pitchSlope, yaw, 0);
    d.scale.set(sideMirror, 1, 1);
    d.updateMatrix();
    this.fpMesh.setMatrixAt(idx, d.matrix);
    this.fpMesh.instanceMatrix.needsUpdate = true;

    this.fpMeta[idx] = { x, y: y + 0.032, z, yaw, pitchSlope, sx: sideMirror, age: 0, life: wet ? 18 : 28 };

    if (wet) {
      this.fpCol.setRGB(0.08, 0.11, 0.14);
    } else if (surf === 'snow') {
      this.fpCol.setRGB(0.36, 0.44, 0.56);
    } else if (surf === 'drought') {
      this.fpCol.setRGB(0.24, 0.17, 0.11);
    } else if (surf === 'gravel') {
      this.fpCol.setRGB(0.16, 0.15, 0.13);
    } else if (surf === 'grass' || surf === 'dirt') {
      this.fpCol.setRGB(0.16, 0.12, 0.08);
    } else {
      this.fpCol.setRGB(0.26, 0.24, 0.21);
    }
    this.fpMesh.setColorAt(idx, this.fpCol);
    if (this.fpMesh.instanceColor) this.fpMesh.instanceColor.needsUpdate = true;
  }

  spawnWaterRipple(x, y, z, scale = 1.0) {
    const mat = new THREE.MeshBasicMaterial({
      map: rippleRingTexture(),
      color: 0xdbeafe,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -5,
    });
    const geo = new THREE.PlaneGeometry(0.92 * scale, 0.92 * scale);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + 0.04, z);
    this.scene.add(mesh);
    this.fx.push({ obj: mesh, life: 0.85, max: 0.85, grow: 2.35 * scale });
  }

  // ---------------- input ----------------
  onKeyDown = (e) => {
    this.keys.add(e.code);
    if (this.mode !== 'play') return;
    const s = this.stats;
    switch (e.code) {
      case 'Digit1':
        this.switchWeapon('fists');
        break;
      case 'Digit2':
        this.switchWeapon('pistol');
        break;
      case 'Digit3':
        this.switchWeapon('shotgun');
        break;
      case 'Digit4':
        this.switchWeapon('rifle');
        break;
      case 'Digit5':
        this.switchWeapon('grenade');
        break;
      case 'KeyG':
        if (this.fireCd < 0.25) this.fireCd = 0;
        this.throwGrenade();
        break;
      case 'KeyR':
        this.reload();
        break;
      case 'KeyB':
        if (this.phase === 'shelter') this.level?.restDay?.();
        break;
      case 'KeyM':
      case 'Tab':
        e.preventDefault();
        if (document.pointerLockElement) document.exitPointerLock();
        this.onEvent({ type: 'toggleGuide' });
        break;
      case 'KeyF':
        if ((this.weapon === 'pistol' || this.weapon === 'shotgun' || this.weapon === 'rifle') && this.reloadT <= 0) {
          this.scoped = !this.scoped;
          audio.click();
          this.emitHud();
        }
        break;
      case 'KeyC':
        if (s.food <= 0) {
          this.msg('Out of rations — scavenge or harvest hydroponics', 'info');
        } else if (s.hunger >= 100) {
          this.msg('Already full — save your rations', 'info');
        } else {
          s.food--;
          s.hunger = Math.min(100, s.hunger + 38);
          audio.eat();
          this.msg('Ate canned food (+38 hunger)', 'info');
          this.emitHud();
        }
        break;
      case 'KeyV':
        if (s.water <= 0) {
          this.msg('Out of water — scavenge or purify water in the sub-level', 'info');
        } else if (s.thirst >= 100) {
          this.msg('Already hydrated — save your water', 'info');
        } else {
          s.water--;
          s.thirst = Math.min(100, s.thirst + 42);
          audio.eat();
          this.msg('Drank bottled water (+42 thirst)', 'info');
          this.emitHud();
        }
        break;
      case 'KeyH':
        if (s.meds > 0 && s.health < 100) {
          s.meds--;
          const gain = Math.round(45 * (s.healMult ?? 1));
          s.health = Math.min(100, s.health + gain);
          audio.pickup();
          this.msg(`Used a medkit (+${gain} health)`, 'info');
          this.emitHud();
        }
        break;
      case 'KeyX':
        if (s.radpills > 0 && s.radiation > 0) {
          s.radpills--;
          const clear = Math.round(30 * (s.healMult ?? 1));
          s.radiation = Math.max(0, s.radiation - clear);
          audio.pickup();
          this.msg(`Took potassium iodide / Rad-X (-${clear} rads)`, 'info');
          this.emitHud();
        }
        break;
    }
  };

  onKeyUp = (e) => {
    this.keys.delete(e.code);
    if (e.code === 'KeyE') this.eLatch = false;
  };

  onMouseMove = (e) => {
    if ((!this.locked && !this.allowUnlockedPlay) || this.mode !== 'play') return;
    const ads = this.scoped && this.reloadT <= 0;
    const sens = MOUSE_SENSITIVITY * computeScopeFov(this.weapon, ads, this.scopeZoom).sensMult;
    this.yaw -= e.movementX * sens;
    this.pitch -= e.movementY * sens;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  };

  onMouseDown = (e) => {
    if (e.button === 0) this.mouseDown = true;
    else if (e.button === 2 && this.mode === 'play') {
      if ((this.weapon === 'pistol' || this.weapon === 'shotgun' || this.weapon === 'rifle') && this.reloadT <= 0) {
        this.scoped = !this.scoped;
        audio.click();
        this.emitHud();
      }
    }
  };

  onMouseUp = (e) => {
    if (e.button === 0) this.mouseDown = false;
  };

  onWheel = (e) => {
    if (this.mode !== 'play' || !this.scoped || this.weapon !== 'rifle') return;
    const next = e.deltaY < 0 ? 1 : 0;
    if (next !== this.scopeZoom) {
      this.scopeZoom = next;
      audio.click();
      this.emitHud();
    }
  };

  onContextMenu = (e) => {
    e.preventDefault();
  };

  onClick = () => {
    audio.init();
    if (this.mode === 'play' && !this.locked) this.requestLock();
  };

  onLockChange = () => {
    this.locked = document.pointerLockElement === this.renderer.domElement;
    this.keys.clear();
    this.mouseDown = false;
    this.eLatch = false;
    this.emitHud();
  };

  onBlur = () => {
    this.keys.clear();
    this.mouseDown = false;
    this.eLatch = false;
  };

  onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.level) this.renderer.render(this.scene, this.camera);
  };

  bindInput() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onBlur);
    this.renderer.domElement.addEventListener('click', this.onClick);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  requestLock() {
    audio.init();
    if (this.mode !== 'play') return;
    try {
      const p = this.renderer.domElement.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* ignore */
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timerId);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onBlur);
    window.removeEventListener('resize', this.onResize);
    this.renderer.domElement.removeEventListener('click', this.onClick);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    if (document.pointerLockElement) document.exitPointerLock();
    audio.stopAll();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------------- view models (PBR textured multi-part assemblies) ----------------
  buildViewModels() {
    const darkPbr = weaponMetalPBR('dark');
    const gunPbr = weaponMetalPBR('gunmetal');
    const olivePbr = weaponMetalPBR('olive');
    const brassPbr = weaponMetalPBR('brass');
    const gripPbr = polymerGripPBR();
    const woodPbr = woodGripPBR();

    const pbr = (src, metalness = 0.85, roughness = 0.55) =>
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: src.map,
        normalMap: src.normalMap,
        normalScale: new THREE.Vector2(1.1, 1.1),
        roughnessMap: src.roughnessMap,
        metalness,
        roughness,
      });

    const darkMetal = pbr(darkPbr, 0.88, 0.45);
    const gunMetal = pbr(gunPbr, 0.9, 0.38);
    const oliveMetal = pbr(olivePbr, 0.45, 0.68);
    const brassMetal = pbr(brassPbr, 0.92, 0.25);
    const gripMat = pbr(gripPbr, 0.08, 0.85);
    const woodMat = pbr(woodPbr, 0.04, 0.62);
    const sightGreen = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
    const sightRed = new THREE.MeshBasicMaterial({ color: 0xff4422 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.72 });
    const glove = pbr(gripPbr, 0.05, 0.92);

    const box = (w, h, d, mat, x, y, z, rx = 0) => {
      const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mm.position.set(x, y, z);
      mm.rotation.x = rx;
      return mm;
    };

    const fists = new THREE.Group();
    fists.add(
      box(0.095, 0.095, 0.125, glove, -0.22, -0.2, -0.38),
      box(0.095, 0.095, 0.125, glove, 0.22, -0.2, -0.38),
      box(0.072, 0.072, 0.35, skin, -0.22, -0.23, -0.2),
      box(0.072, 0.072, 0.35, skin, 0.22, -0.23, -0.2),
    );

    const pistol = new THREE.Group();
    const pBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.25, 10), gunMetal);
    pBarrel.rotation.x = Math.PI / 2;
    pBarrel.position.set(0.16, -0.145, -0.4);
    pistol.add(
      pBarrel,
      box(0.042, 0.046, 0.23, darkMetal, 0.16, -0.142, -0.38), // serrated slide
      box(0.036, 0.025, 0.21, gunMetal, 0.16, -0.17, -0.38), // lower frame rail
      box(0.036, 0.125, 0.056, gripMat, 0.16, -0.225, -0.305, 0.26), // knurled grip
      box(0.008, 0.01, 0.012, sightGreen, 0.16, -0.114, -0.48), // tritium front sight
      box(0.014, 0.008, 0.008, sightGreen, 0.148, -0.114, -0.275),
      box(0.014, 0.008, 0.008, sightGreen, 0.172, -0.114, -0.275),
      box(0.058, 0.06, 0.24, glove, 0.16, -0.25, -0.18),
    );

    const shotgun = new THREE.Group();
    const sBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.72, 12), gunMetal);
    sBarrel.rotation.x = Math.PI / 2;
    sBarrel.position.set(0.17, -0.135, -0.62);
    const sTube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.56, 10), darkMetal);
    sTube.rotation.x = Math.PI / 2;
    sTube.position.set(0.17, -0.168, -0.56);
    shotgun.add(
      sBarrel,
      sTube,
      box(0.058, 0.072, 0.3, darkMetal, 0.17, -0.165, -0.29),
      box(0.012, 0.026, 0.07, brassMetal, 0.142, -0.155, -0.3), // brass ejection port
      box(0.056, 0.052, 0.21, woodMat, 0.17, -0.185, -0.58), // walnut pump
      box(0.048, 0.105, 0.33, woodMat, 0.17, -0.215, -0.04, -0.15), // walnut stock
      box(0.009, 0.011, 0.012, sightRed, 0.17, -0.114, -0.95), // fiber front bead
    );

    const rifle = new THREE.Group();
    const rBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.014, 0.52, 12), gunMetal);
    rBarrel.rotation.x = Math.PI / 2;
    rBarrel.position.set(0.16, -0.145, -0.74);
    const rBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.065, 10), darkMetal);
    rBrake.rotation.x = Math.PI / 2;
    rBrake.position.set(0.16, -0.145, -1.01);
    rifle.add(
      rBarrel,
      rBrake,
      box(0.052, 0.078, 0.42, darkMetal, 0.16, -0.16, -0.35), // upper/lower receiver
      box(0.048, 0.062, 0.26, gunMetal, 0.16, -0.155, -0.62), // quad-rail shroud
      box(0.036, 0.15, 0.064, gripMat, 0.16, -0.275, -0.34, 0.18), // curved 36rd mag
      box(0.034, 0.095, 0.048, gripMat, 0.16, -0.245, -0.22, 0.28), // pistol grip
      box(0.044, 0.085, 0.24, gripMat, 0.16, -0.18, -0.05), // stock
      box(0.03, 0.036, 0.11, darkMetal, 0.16, -0.104, -0.35), // holographic optic housing
      box(0.01, 0.01, 0.008, sightRed, 0.16, -0.102, -0.36), // glowing reticle dot
      box(0.012, 0.022, 0.045, brassMetal, 0.135, -0.148, -0.33), // bolt carrier accent
    );

    const grenade = new THREE.Group();
    const gBody = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), oliveMetal);
    gBody.scale.set(1, 1.28, 1);
    gBody.position.set(0.18, -0.18, -0.36);
    const gNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.04, 10), gunMetal);
    gNeck.position.set(0.18, -0.1, -0.36);
    const gRing = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 12), brassMetal);
    gRing.position.set(0.15, -0.09, -0.36);
    const gHand = box(0.075, 0.075, 0.22, glove, 0.18, -0.24, -0.24);
    grenade.add(gBody, gNeck, gRing, gHand);

    this.vmGuns = { fists, pistol, shotgun, rifle, grenade };
    for (const [k, grp] of Object.entries(this.vmGuns)) {
      grp.visible = k === 'fists';
      grp.traverse((o) => {
        if (o.isMesh) o.castShadow = false;
      });
      this.viewModel.add(grp);
    }
    this.muzzleFlash.position.set(0.16, -0.14, -1.04);
    this.muzzleLight.position.set(0.16, -0.14, -1.05);
    this.viewModel.add(this.muzzleFlash, this.muzzleLight);
  }

  switchWeapon(w) {
    if (w === 'grenade') {
      if ((this.stats.grenades ?? 0) <= 0) {
        this.msg('No frag grenades left', 'info');
        return;
      }
    } else if (!this.stats.weapons.includes(w)) {
      return;
    }
    if (w === this.weapon) return;
    this.weapon = w;
    this.reloadT = 0;
    this.scoped = false;
    this.scopeZoom = 0;
    this.fireCd = 0.1;
    for (const [k, grp] of Object.entries(this.vmGuns)) grp.visible = k === w;
    const tipZ = { fists: -0.4, pistol: -0.54, shotgun: -1.0, rifle: -1.05, grenade: -0.4 };
    this.muzzleFlash.position.z = tipZ[w];
    this.muzzleLight.position.z = tipZ[w] - 0.05;
    audio.click();
    this.emitHud();
  }

  giveWeapon(w, ammo) {
    const s = this.stats;
    if (w !== 'fists' && w !== 'grenade') s.ammo[w] += ammo;
    if (!s.weapons.includes(w)) {
      s.weapons.push(w);
      this.switchWeapon(w);
      if (w !== 'grenade' && this.clips[w] === 0) this.reload(true);
    }
  }

  reload(instant = false) {
    const w = this.weapon;
    if (w === 'fists' || w === 'grenade' || this.reloadT > 0) return;
    const wd = computeWeaponStats(w, this.stats);
    if (this.clips[w] >= wd.mag || this.stats.ammo[w] <= 0) return;
    if (instant) {
      const take = Math.min(wd.mag - this.clips[w], this.stats.ammo[w]);
      this.clips[w] += take;
      this.stats.ammo[w] -= take;
      return;
    }
    this.reloadT = wd.reloadTime || 0.9;
    this.scoped = false;
    audio.reload();
  }

  // ---------------- phase management ----------------
  loadPhase(phase, stats, { autostart = false } = {}) {
    this.clearLevel();
    this.stats = stats;
    this.phaseStart = cloneStats(stats);
    this.phase = phase;
    this.allowUnlockedPlay = autostart;
    this.wanted = 0;
    this.alarm = 0;
    this.shake = 0;
    this.scoped = false;
    this.scopeZoom = 0;
    this.lightScanT = 0;
    this.nearFiresCached = [];
    this.nearIntCached = [];
    this.viewModel.visible = true;
    this.camera.fov = 72;
    this.camera.updateProjectionMatrix();
    this.cutscene = null;
    this.clips = { fists: 0, pistol: 0, shotgun: 0, rifle: 0, grenade: 0 };
    for (const w of ['pistol', 'shotgun', 'rifle']) {
      if (stats.weapons.includes(w)) {
        const take = Math.min(WEAPONS[w].mag, stats.ammo[w]);
        this.clips[w] = take;
        stats.ammo[w] -= take;
      }
    }
    const best = ['rifle', 'shotgun', 'pistol', 'fists'].find((w) => stats.weapons.includes(w));
    this.weapon = 'fists';
    for (const [k, grp] of Object.entries(this.vmGuns)) grp.visible = k === 'fists';
    this.switchWeapon(best);
    this.level =
      phase === 'city'
        ? buildCity(this)
        : phase === 'shelter'
          ? buildBunker(this)
          : buildWild(this, phase === 'winter');
    this.scene.add(this.level.root);
    if (this.level.ammoSpawns) {
      for (const sp of this.level.ammoSpawns) {
        this.spawnAmmoDrop(sp.pos, sp.kind, sp.amount, sp.grenade ?? 0);
      }
    }
    this.buildGrid();
    this.buildObstacleCache();
    this.resetFootprints();
    const sp = this.level.spawn;
    this.pos.set(sp.x, this.level.heightAt(sp.x, sp.z, sp.y ?? 0), sp.z);
    this.yaw = sp.yaw;
    this.pitch = 0;
    this.vy = 0;
    this.deathPoseT = 0;
    this.camera.position.set(this.pos.x, this.pos.y + 1.65, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.mode = 'play';
    audio.stopAll();
    if (phase !== 'city' && phase !== 'shelter') audio.startWind(phase === 'winter' ? 0.3 : 0.12);
    if (!_isSoftwareGl) this.renderer.compile(this.scene, this.camera);
    this._lastTime = performance.now();
    this.emitHud();
    this.renderer.render(this.scene, this.camera);
  }

  clearLevel() {
    this.resetFootprints();
    if (this.level) {
      this.scene.remove(this.level.root);
      this.level.root.traverse((o) => {
        if (o.isMesh || o.isPoints) o.geometry?.dispose();
      });
    }
    for (const a of this.actors) this.scene.remove(a.group);
    this.actors = [];
    this.obstacleBounds = [];
    this._rayCandidates.length = 0;
    this.nearFiresCached = [];
    this.nearIntCached = [];
    for (const g of this.grenades) {
      this.scene.remove(g.mesh);
      g.mesh.traverse((o) => {
        if (o.isMesh) {
          o.geometry?.dispose();
          o.material?.dispose();
        }
      });
    }
    this.grenades = [];
    for (const pk of this.pickups) {
      this.scene.remove(pk.mesh);
      pk.mesh.traverse((o) => {
        if (o.isMesh) {
          o.geometry?.dispose();
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material?.dispose();
        }
      });
    }
    this.pickups = [];
    for (const f of this.fx) this.scene.remove(f.obj);
    this.fx = [];
    this.fireLights.forEach((l) => (l.intensity = 0));
    this.interiorLights.forEach((l) => (l.intensity = 0));
    this.level = null;
  }

  setEnv(o) {
    const dm = this.dome.material;
    dm.uniforms.uHorizon.value.set(o.horizon);
    dm.uniforms.uZenith.value.set(o.zenith);
    dm.uniforms.uSunDir.value.set(...o.sunDir).normalize();
    dm.uniforms.uSunColor.value.set(o.sunColor);
    dm.uniforms.uCloudTint.value.set(o.cloudTint ?? o.horizon);
    dm.uniforms.uCloudSecondary.value.set(o.cloudSecondary ?? o.cloudTint ?? o.fog);
    dm.uniforms.uCloudDensity.value = o.cloudDensity ?? 0.5;
    dm.uniforms.uCloudScale.value = o.cloudScale ?? 1.4;
    dm.uniforms.uCloudSpeed.value = o.cloudSpeed ?? 0.01;
    this.scene.fog = new THREE.FogExp2(o.fog, o.fogDensity);
    this.scene.background = new THREE.Color(o.fog);
    this.sun.color.set(o.sunColor);
    this.sun.intensity = o.sunIntensity;
    this.sun.userData.dir = new THREE.Vector3(...o.sunDir).normalize();
    this.rimLight.color.set(o.rimColor ?? o.hemiSky);
    this.rimLight.intensity = o.rimIntensity ?? 0.52;
    this.hemi.color.set(o.hemiSky);
    this.hemi.groundColor.set(o.hemiGround);
    this.hemi.intensity = o.hemiIntensity;
    this.renderer.toneMappingExposure = o.exposure;
    this.baseExposure = o.exposure;
    if (this.particles) {
      this.scene.remove(this.particles);
      this.particles.geometry.dispose();
      this.particles = null;
    }
    this.particleKind = o.particles;
    if (o.particles) {
      const n = o.particles === 'snow' ? 6000 : 3200;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = (Math.random() - 0.5) * 70;
        arr[i * 3 + 1] = Math.random() * 30;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 70;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const mat = new THREE.PointsMaterial({
        map: flakeTexture(),
        size: o.particles === 'snow' ? 0.17 : 0.11,
        color: o.particles === 'snow' ? 0xffffff : 0xa09488,
        transparent: true,
        depthWrite: false,
        opacity: o.particles === 'snow' ? 0.9 : 0.72,
      });
      this.particles = new THREE.Points(geo, mat);
      this.particles.frustumCulled = false;
      this.scene.add(this.particles);
    }
  }

  completePhase() {
    for (const w of ['pistol', 'shotgun', 'rifle']) {
      this.stats.ammo[w] += this.clips[w];
      this.clips[w] = 0;
    }
    this.mode = 'idle';
    if (document.pointerLockElement) document.exitPointerLock();
    audio.stopAll();
    this.onEvent({ type: 'phaseComplete', phase: this.phase });
  }

  retryPhase() {
    this.loadPhase(this.phase, cloneStats(this.phaseStart), { autostart: this.allowUnlockedPlay });
  }

  die(reason) {
    if (this.mode === 'dead') return;
    this.mode = 'dead';
    this.deathPoseT = 0;
    this.stats.health = 0;
    this.scoped = false;
    this.viewModel.visible = false;
    this.camera.fov = 72;
    this.camera.updateProjectionMatrix();
    this.renderer.toneMappingExposure = this.baseExposure;
    if (document.pointerLockElement) document.exitPointerLock();
    audio.stopAll();
    this.emitHud();
    this.onEvent({ type: 'death', reason });
  }

  startNuke(view, blast, survive) {
    this.mode = 'cutscene';
    if (document.pointerLockElement) document.exitPointerLock();
    audio.stopSiren();
    this.cutscene = new NukeCutscene(this, view, blast, survive);
  }

  startHeliEscape(heliGroup) {
    if (this.mode !== 'play') return;
    this.mode = 'cutscene';
    if (document.pointerLockElement) document.exitPointerLock();
    audio.stopSiren();
    audio.startHeli(0.26);
    this.stats.bunkerTier = 'military';
    this.msg('MEDEVAC AIRBORNE: Climbing clear of the city — en route to Stocked Military Bunker!', 'radio');
    const originPos = new THREE.Vector3();
    heliGroup.getWorldPosition(originPos);
    let t = 0;
    let announced = false;
    this.cutscene = {
      update: (dt) => {
        t += dt;
        if (heliGroup.userData.mainRotor) heliGroup.userData.mainRotor.rotation.y += dt * 28;
        if (heliGroup.userData.tailRotor) heliGroup.userData.tailRotor.rotation.x += dt * 36;
        const climb = Math.pow(Math.max(0, t), 1.45) * 4.5;
        const fwd = Math.max(0, t - 0.8) * 14.0;
        heliGroup.position.y += dt * (3.5 + Math.min(18, t * 4.2));
        heliGroup.position.x -= dt * Math.max(0, t - 0.6) * 8.5;
        heliGroup.position.z -= dt * Math.max(0, t - 0.6) * 6.5;
        heliGroup.rotation.z = Math.min(0.24, Math.max(0, t - 0.5) * 0.08);
        const worldH = new THREE.Vector3();
        heliGroup.getWorldPosition(worldH);
        this.camera.position.set(
          worldH.x + 11 + Math.sin(t * 0.6) * 3,
          worldH.y + 4.5 + climb * 0.04,
          worldH.z + 12 + fwd * 0.04,
        );
        this.camera.lookAt(worldH.x, worldH.y + 1.2, worldH.z);
        if (!announced && t > 2.6) {
          announced = true;
          this.msg('PILOT: "Bunker 7 doors are open — full rations, medical reserve & Arctic thermal gear waiting."', 'radio');
        }
        if (t > 5.8) {
          audio.stopHeli();
          this.completePhase();
        }
      },
    };
  }

  msg(text, tone = 'info') {
    this.onEvent({ type: 'message', text, tone });
  }

  // ---------------- collision ----------------
  buildGrid() {
    this.grid.clear();
    if (!this.level) return;
    for (const b of this.level.colliders) {
      for (let gx = Math.floor(b.minX / 10); gx <= Math.floor(b.maxX / 10); gx++) {
        for (let gz = Math.floor(b.minZ / 10); gz <= Math.floor(b.maxZ / 10); gz++) {
          const k = gx + ',' + gz;
          if (!this.grid.has(k)) this.grid.set(k, []);
          this.grid.get(k).push(b);
        }
      }
    }
  }

  collide(p, r) {
    const gx = Math.floor(p.x / 10);
    const gz = Math.floor(p.z / 10);
    const seen = new Set();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = this.grid.get(gx + dx + ',' + (gz + dz));
        if (!list) continue;
        for (const b of list) {
          if (seen.has(b)) continue;
          seen.add(b);
          if (b.minY !== undefined && p.y + 1.5 < b.minY) continue;
          if (b.maxY !== undefined && p.y >= b.maxY - 0.05) continue;
          const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
          const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
          const ddx = p.x - cx;
          const ddz = p.z - cz;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 < r * r) {
            if (d2 > 1e-8) {
              const d = Math.sqrt(d2);
              p.x = cx + (ddx / d) * r;
              p.z = cz + (ddz / d) * r;
            } else {
              const pen = [p.x - b.minX, b.maxX - p.x, p.z - b.minZ, b.maxZ - p.z];
              const i = pen.indexOf(Math.min(...pen));
              if (i === 0) p.x = b.minX - r;
              else if (i === 1) p.x = b.maxX + r;
              else if (i === 2) p.z = b.minZ - r;
              else p.z = b.maxZ + r;
            }
          }
        }
      }
    }
  }

  terrainHit(o, dir, far) {
    const lvl = this.level;
    if (!lvl || !lvl.terrain) return Infinity;
    const step = 1.5;
    for (let t = step; t <= far; t += step) {
      const x = o.x + dir.x * t;
      const y = o.y + dir.y * t;
      const z = o.z + dir.z * t;
      if (y < lvl.heightAt(x, z, y)) return t;
    }
    return Infinity;
  }

  buildObstacleCache() {
    this.obstacleBounds = [];
    if (!this.level?.obstacles?.length) return;
    this.level.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const obj of this.level.obstacles) {
      box.setFromObject(obj);
      if (box.isEmpty()) continue;
      const cx = (box.min.x + box.max.x) * 0.5;
      const cz = (box.min.z + box.max.z) * 0.5;
      const r = Math.hypot((box.max.x - box.min.x) * 0.5, (box.max.z - box.min.z) * 0.5) + 0.5;
      this.obstacleBounds.push({ obj, cx, cz, r });
    }
  }

  raycastObstacles(origin, dir, far) {
    if (!this.level) return [];
    const list = this._rayCandidates;
    list.length = 0;
    const ox = origin.x;
    const oz = origin.z;
    const dxz = Math.hypot(dir.x, dir.z);
    if (dxz < 1e-4) {
      for (let i = 0; i < this.obstacleBounds.length; i++) {
        const b = this.obstacleBounds[i];
        const rx = b.cx - ox;
        const rz = b.cz - oz;
        if (rx * rx + rz * rz <= b.r * b.r) list.push(b.obj);
      }
    } else {
      const ux = dir.x / dxz;
      const uz = dir.z / dxz;
      const maxProj = far * dxz;
      for (let i = 0; i < this.obstacleBounds.length; i++) {
        const b = this.obstacleBounds[i];
        const rx = b.cx - ox;
        const rz = b.cz - oz;
        const proj = rx * ux + rz * uz;
        if (proj < -b.r || proj > maxProj + b.r) continue;
        const perp2 = rx * rx + rz * rz - proj * proj;
        if (perp2 <= b.r * b.r) list.push(b.obj);
      }
    }
    if (list.length === 0) return [];
    this.raycaster.set(origin, dir);
    this.raycaster.far = far;
    return this.raycaster.intersectObjects(list, true);
  }

  hasLOS(from, to) {
    if (!this.level) return false;
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    if (dist < 0.01) return true;
    dir.normalize();
    if (this.terrainHit(from, dir, dist - 1) < Infinity) return false;
    return this.raycastObstacles(from, dir, dist).length === 0;
  }

  // ---------------- actors / fx ----------------
  addActor(a, yOverride) {
    const mods = difficultyMods(this.stats);
    a.health *= mods.enemyHealth;
    a.accuracy *= mods.enemyAccuracy;
    a.fireCdMult = mods.enemyFireRate;
    a.group.position.y = yOverride !== undefined ? yOverride : (this.level ? this.level.heightAt(a.pos.x, a.pos.z) : 0);
    this.actors.push(a);
    this.scene.add(a.group);
    return a;
  }

  damagePlayer(amount, reason) {
    if (this.mode !== 'play' || amount <= 0) return;
    const dealt = amount * difficultyMods(this.stats).incomingDamage;
    this.stats.health = Math.max(0, this.stats.health - dealt);
    this.shake = Math.max(this.shake, 0.35);
    if (this.hurtCd <= 0) {
      audio.hurt();
      this.hurtCd = 0.25;
    }
    this.onEvent({ type: 'damage' });
    this.emitHud();
    if (this.stats.health <= 0) this.die(reason);
  }

  shotFx(from, to, kind) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending }),
    );
    this.scene.add(line);
    this.fx.push({ obj: line, life: 0.06, max: 0.06 });
    audio.gunshot(kind, from.distanceTo(this.pos));
    this.alarm = Math.max(this.alarm, 6);
  }

  puff(at, color = 0xaaaaaa, size = 0.5) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture(), color, transparent: true, depthWrite: false }));
    s.position.copy(at);
    s.scale.setScalar(size);
    this.scene.add(s);
    this.fx.push({ obj: s, life: 0.6, max: 0.6, grow: size * 2 });
  }

  ctx() {
    const lvl = this.level;
    return {
      playerPos: this.pos,
      playerMoving: this.moving,
      hostileAll: this.wanted >= 1,
      alarm: this.alarm,
      heightAt: (x, z, curY = 0) => lvl.heightAt(x, z, curY),
      collide: (p, r) => this.collide(p, r),
      hasLOS: (a, b) => this.hasLOS(a, b),
      damagePlayer: (a, r) => this.damagePlayer(a, r),
      shotFx: (a, b, k) => this.shotFx(a, b, k),
      bounds: lvl.bounds,
    };
  }

  // ---------------- grenades & combat ----------------
  throwGrenade() {
    if (this.mode !== 'play' || this.fireCd > 0) return;
    if ((this.stats.grenades ?? 0) <= 0) {
      this.msg('Out of frag grenades', 'info');
      return;
    }
    this.stats.grenades--;
    this.fireCd = 0.65;
    this.recoil = 0.9;
    audio.throwGrenade();

    const gMesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x3b4d2b, roughness: 0.7, metalness: 0.25 }),
    );
    body.scale.y = 1.25;
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff2200 }),
    );
    led.position.y = 0.14;
    gMesh.add(body, led);

    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    gMesh.position.copy(origin).addScaledVector(fwd, 0.7).add(new THREE.Vector3(0, -0.1, 0));
    this.scene.add(gMesh);

    const vel = fwd.clone().multiplyScalar(18.5);
    vel.y += 4.8 * Math.max(0.15, 1 + Math.min(0, fwd.y));
    vel.addScaledVector(this.vel, 0.35);

    this.grenades.push({ mesh: gMesh, led, vel, fuse: 1.8 });

    if (this.weapon === 'grenade' && this.stats.grenades <= 0) {
      const next = ['rifle', 'shotgun', 'pistol', 'fists'].find((w) => this.stats.weapons.includes(w)) || 'fists';
      this.switchWeapon(next);
    }
    this.emitHud();
  }

  detonateGrenade(pos) {
    audio.explosion(0.72);
    this.shake = Math.max(this.shake, 0.95);
    this.alarm = Math.max(this.alarm, 10);

    const flashLight = new THREE.PointLight(0xff8833, 28, 22, 1.5);
    flashLight.position.copy(pos).add(new THREE.Vector3(0, 0.6, 0));
    this.scene.add(flashLight);
    this.fx.push({ obj: flashLight, life: 0.25, max: 0.25 });

    const fireball = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff9a33, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    fireball.position.copy(pos);
    this.scene.add(fireball);
    this.fx.push({ obj: fireball, life: 0.42, max: 0.42, grow: 5.5 });

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 1.8, 28),
      new THREE.MeshBasicMaterial({ map: shockRingTexture(), color: 0xffd28a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, pos.y + 0.15, pos.z);
    this.scene.add(ring);
    this.fx.push({ obj: ring, life: 0.45, max: 0.45, grow: 9.0 });

    for (let i = 0; i < 4; i++) {
      this.puff(
        pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.8, 0.5 + i * 0.45, (Math.random() - 0.5) * 1.8)),
        0x2b2724,
        1.4 + i * 0.35,
      );
    }

    for (const a of this.actors) {
      if (a.dead) continue;
      const d = a.pos.distanceTo(pos);
      const dmg = computeGrenadeFalloff(d, 9.5, 140);
      if (dmg > 0) {
        const dir = a.pos.clone().sub(pos);
        if (dir.lengthSq() > 0.0001) dir.normalize();
        const killed = a.takeDamage(dmg, dir, false);
        if (killed) this.onKill(a);
      }
    }

    const pDist = this.pos.distanceTo(pos);
    const selfDmg = computeGrenadeFalloff(pDist, 7.5, 55);
    if (selfDmg > 0) this.damagePlayer(selfDmg, 'Killed by frag grenade explosion');

    if (this.phase === 'city') {
      const copNear = this.actors.some((a) => !a.dead && a.kind === 'police' && a.pos.distanceTo(pos) < 95);
      if (copNear && this.wanted < 1) {
        this.wanted = 1;
        this.msg('Explosion reported — Police alerted!', 'alert');
      }
    } else {
      this.actors.forEach((a) => {
        if (!a.dead && a.kind !== 'civilian' && a.pos.distanceTo(pos) < 100) a.aggro = true;
      });
    }
  }

  updateGrenades(dt) {
    const lvl = this.level;
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;
      g.vel.y -= 20 * dt;
      const p = g.mesh.position;
      const prevX = p.x;
      const prevZ = p.z;
      p.addScaledVector(g.vel, dt);
      if (lvl) {
        this.collide(p, 0.22);
        if (Math.abs(p.x - prevX - g.vel.x * dt) > 0.01) g.vel.x *= -0.45;
        if (Math.abs(p.z - prevZ - g.vel.z * dt) > 0.01) g.vel.z *= -0.45;
        const fy = lvl.heightAt(p.x, p.z, p.y);
        if (p.y <= fy + 0.12) {
          p.y = fy + 0.12;
          if (Math.abs(g.vel.y) > 1.2) g.vel.y = Math.abs(g.vel.y) * 0.42;
          else g.vel.y = 0;
          g.vel.x *= 0.65;
          g.vel.z *= 0.65;
        }
      }
      g.mesh.rotation.x += dt * 8;
      g.mesh.rotation.z += dt * 6;
      g.led.visible = Math.floor(g.fuse * 12) % 2 === 0;
      if (g.fuse <= 0) {
        const blastPos = p.clone();
        this.scene.remove(g.mesh);
        g.mesh.traverse((o) => {
          if (o.isMesh) {
            o.geometry?.dispose();
            o.material?.dispose();
          }
        });
        this.grenades.splice(i, 1);
        this.detonateGrenade(blastPos);
      }
    }
  }

  gainXp(amount, label = null) {
    const res = grantXp(this.stats, amount);
    this.stats = res.stats;
    if (res.leveledUp) {
      audio.pickup();
      this.msg(`★ LEVEL UP! Rank ${res.newLevel} — +5% Weapon Damage, faster reload, +15 HP!`, 'radio');
    } else if (label) {
      this.msg(`${label} (+${res.gainedXp} XP)`, 'info');
    }
    this.emitHud();
  }

  spawnAmmoDrop(pos, kind, amount, grenade = 0) {
    const mesh = makeAmmoPickup(kind);
    const fy = this.level ? this.level.heightAt(pos.x, pos.z, pos.y) : pos.y;
    mesh.position.set(pos.x, fy, pos.z);
    this.scene.add(mesh);
    this.pickups.push({ mesh, pos: mesh.position.clone(), kind, amount, grenade });
  }

  aimAssistDir(origin, fwd, range, strength) {
    let bestDir = null;
    let bestAngle = 0.055;
    for (const a of this.actors) {
      if (a.dead || a.kind === 'civilian') continue;
      _aimTarget.set(a.pos.x, a.pos.y + (a.kind === 'wolf' ? 0.7 : 1.2), a.pos.z).sub(origin);
      const dist = _aimTarget.length();
      if (dist < 0.5 || dist > range) continue;
      _aimTarget.multiplyScalar(1 / dist);
      const ang = _aimTarget.angleTo(fwd);
      if (ang < bestAngle) {
        bestAngle = ang;
        bestDir = _aimTarget;
      }
    }
    if (!bestDir) return fwd;
    return fwd.clone().lerp(bestDir, strength).normalize();
  }

  fire() {
    if (this.weapon === 'grenade') {
      this.throwGrenade();
      return;
    }
    const w = computeWeaponStats(this.weapon, this.stats);
    if (this.fireCd > 0 || this.reloadT > 0) return;
    if (w.id !== 'fists') {
      if (this.clips[w.id] <= 0) {
        audio.click();
        this.fireCd = 0.28;
        this.reload();
        return;
      }
      this.clips[w.id]--;
    }
    const mods = difficultyMods(this.stats);
    this.fireCd = w.rate;
    this.recoil = w.id === 'shotgun' ? 0.85 : w.id === 'fists' ? 0.7 : w.id === 'rifle' ? 0.36 : 0.42;
    // Camera shake impulse per weapon when firing (kept light so aim stays on target)
    const fireShake = w.id === 'shotgun' ? 0.5 : w.id === 'rifle' ? 0.2 : w.id === 'pistol' ? 0.16 : 0.11;
    this.shake = Math.max(this.shake, fireShake);
    const ads = this.scoped && this.reloadT <= 0 && (w.id === 'pistol' || w.id === 'shotgun' || w.id === 'rifle');
    if (w.id !== 'fists') {
      const kickScale = ads ? 0.65 : 1;
      this.pitch += (w.id === 'shotgun' ? 0.028 : w.id === 'rifle' ? 0.009 : 0.011) * kickScale;
      this.yaw += (Math.random() - 0.5) * (w.id === 'shotgun' ? 0.012 : 0.004) * kickScale;
      this.muzzleLight.intensity = w.id === 'shotgun' ? 12 : 9;
      this.muzzleFlashT = w.id === 'rifle' ? 0.055 : 0.075;
      this.muzzleFlash.visible = true;
      this.muzzleFlash.userData.mat.opacity = 1;
      this.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
      const sc = (w.id === 'shotgun' ? 1.4 : w.id === 'rifle' ? 1.05 : 0.8) * (0.85 + Math.random() * 0.35);
      this.muzzleFlash.scale.set(sc, sc, 1.0 + Math.random() * 0.4);
      this.alarm = 8;
      audio.gunshot(w.id);

      // Muzzle smoke wisp
      const mPos = this.muzzleFlash.getWorldPosition(new THREE.Vector3());
      if (Math.random() < 0.7) this.puff(mPos, 0xcbd5e1, 0.18);

      if (this.phase === 'city') {
        const copNear = this.actors.some((a) => !a.dead && a.kind === 'police' && a.pos.distanceTo(this.pos) < 70);
        if (copNear && this.wanted < 1) {
          this.wanted = 1;
          this.msg('Police heard gunfire — you are WANTED', 'alert');
        }
      } else {
        this.actors.forEach((a) => {
          if (!a.dead && a.kind !== 'civilian' && a.pos.distanceTo(this.pos) < 90) a.aggro = true;
        });
      }
    } else audio.gunshot('fists');

    const targets = [];
    for (const a of this.actors) if (!a.dead) targets.push(...a.hit);
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    const muzzle = this.muzzleFlash.getWorldPosition(new THREE.Vector3());
    const spreadMul = (this.moving ? 1.3 : 1) * computeScopeFov(w.id, ads, this.scopeZoom).spreadMult * mods.spread;
    // Soft aim assist: nudge the shot cone toward a hostile under the reticle (walls still block the ray)
    const aimDir = this.aimAssistDir(origin, fwd, w.range, ads ? 0.55 : 0.3);
    const spread = w.spread * spreadMul;
    for (let i = 0; i < w.pellets; i++) {
      const dir = aimDir.clone();
      dir.x += (Math.random() - 0.5) * spread * 2;
      dir.y += (Math.random() - 0.5) * spread * 2;
      dir.z += (Math.random() - 0.5) * spread * 2;
      dir.normalize();
      this.raycaster.set(origin, dir);
      this.raycaster.far = w.range;
      const hitA = this.raycaster.intersectObjects(targets, false)[0];
      let hitW = this.level ? this.raycastObstacles(origin, dir, w.range)[0] : undefined;
      const tDist = this.terrainHit(origin, dir, w.range);
      if (tDist < Infinity && (!hitW || tDist < hitW.distance)) hitW = { distance: tDist, point: origin.clone().addScaledVector(dir, tDist) };
      let end = origin.clone().addScaledVector(dir, w.range);
      if (hitA && (!hitW || hitA.distance < hitW.distance)) {
        end = hitA.point;
        const actor = hitA.object.userData.actor;
        const head = !!hitA.object.userData.head;
        const falloff = w.id === 'shotgun' ? Math.max(0.3, 1 - hitA.distance / w.range) : 1;
        const killed = actor.takeDamage(w.damage * mods.playerDamage * (head ? 2.2 : 1) * falloff, dir, head);
        this.puff(hitA.point, 0x7a0a0a, 0.35);
        if (killed) this.onKill(actor);
      } else if (hitW) {
        end = hitW.point;
        if (w.id !== 'fists') this.puff(hitW.point, 0x9a9080, 0.4);
      }
      if (w.id !== 'fists' && i < 3) {
        const geo = new THREE.BufferGeometry().setFromPoints([muzzle, end]);
        const line = new THREE.Line(
          geo,
          new THREE.LineBasicMaterial({ color: 0xffe49e, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending }),
        );
        this.scene.add(line);
        this.fx.push({ obj: line, life: 0.055, max: 0.055 });
      }
    }
    if (w.id !== 'fists' && this.clips[w.id] === 0) this.reload();
  }

  onKill(a) {
    this.stats.kills++;
    if (a.kind === 'civilian') {
      this.stats.crimes++;
      this.wanted = Math.min(5, this.wanted + 1);
      this.msg('Civilian killed — Wanted level increased', 'alert');
    } else if (a.kind === 'police') {
      this.stats.crimes++;
      this.wanted = Math.min(5, this.wanted + 1);
      this.gainXp(25);
      const drop = generateAmmoDrop('police', this.stats);
      this.spawnAmmoDrop(a.pos, drop.ammoKind, drop.amount, drop.grenade);
      this.msg('Officer down — Wanted level increased', 'alert');
    } else if (a.kind === 'raider') {
      this.gainXp(35);
      const drop = generateAmmoDrop('raider', this.stats);
      this.spawnAmmoDrop(a.pos, drop.ammoKind, drop.amount, drop.grenade);
    } else if (a.kind === 'wolf') {
      this.gainXp(20);
    }
  }

  lootBody(a) {
    a.looted = true;
    const s = this.stats;
    const got = [];
    if (a.kind === 'wolf') {
      s.food += 1;
      got.push('raw meat (food)');
    } else if (a.kind === 'police') {
      s.ammo.pistol += 18 + Math.floor(Math.random() * 14);
      got.push('9mm rounds');
      if (!s.weapons.includes('pistol')) {
        this.giveWeapon('pistol', 15);
        got.push('9mm Pistol');
      }
      if (Math.random() < 0.35) {
        s.meds++;
        got.push('medkit');
      }
      if (Math.random() < 0.25) {
        this.giveWeapon('shotgun', 10);
        got.push('shotgun shells');
      }
      if (Math.random() < 0.35) {
        s.grenades = (s.grenades ?? 0) + 1;
        got.push('frag grenade');
      }
    } else if (a.kind === 'raider') {
      const r = Math.random();
      if (r < 0.4) {
        s.ammo.rifle += 24 + Math.floor(Math.random() * 18);
        got.push('5.56 rounds');
        if (!s.weapons.includes('rifle') && Math.random() < 0.55) {
          this.giveWeapon('rifle', 18);
          got.push('AR-15 Rifle');
        }
      } else if (r < 0.72) {
        s.ammo.shotgun += 8 + Math.floor(Math.random() * 8);
        got.push('shotgun shells');
        if (!s.weapons.includes('shotgun') && Math.random() < 0.55) {
          this.giveWeapon('shotgun', 8);
          got.push('Shotgun');
        }
      } else {
        s.ammo.pistol += 18 + Math.floor(Math.random() * 14);
        got.push('9mm rounds');
        if (!s.weapons.includes('pistol') && Math.random() < 0.65) {
          this.giveWeapon('pistol', 15);
          got.push('9mm Pistol');
        }
      }
      if (Math.random() < 0.45) {
        s.food++;
        got.push('food');
      }
      if (Math.random() < 0.45) {
        s.water++;
        got.push('water');
      }
      if (Math.random() < 0.3) {
        s.radpills++;
        got.push('rad pills');
      }
      if (Math.random() < 0.32) {
        s.grenades = (s.grenades ?? 0) + 1;
        got.push('frag grenade');
      }
    } else {
      const cash = 15 + Math.floor(Math.random() * 65);
      s.cash += cash;
      got.push('$' + cash);
      if (Math.random() < 0.35) {
        s.ammo.pistol += 6;
        got.push('6 rds 9mm');
      }
      if (Math.random() < 0.3) {
        s.water++;
        got.push('water');
      }
    }
    audio.pickup();
    this.msg('Looted: ' + got.join(', '), 'loot');
  }

  // ---------------- main loop + software-WebGL pacing ----------------
  afterDraw(cb) {
    const gl = this.renderer.getContext();
    const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
    if (!sync) {
      this.timerId = window.setTimeout(cb, 80);
      return;
    }
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        gl.deleteSync(sync);
        return;
      }
      const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.timerId = window.setTimeout(poll, 5);
      } else {
        gl.deleteSync(sync);
        this.timerId = window.setTimeout(cb, 80);
      }
    };
    this.timerId = window.setTimeout(poll, 5);
  }

  loop = () => {
    if (this.disposed) return;
    const now = performance.now();
    const dt = clampDeltaTime((now - this._lastTime) * 0.001);
    this._lastTime = now;
    this.elapsed += dt;
    if (this.level) {
      this.dome.material.uniforms.uTime.value = this.elapsed;
      if (this.mode === 'play' && (this.locked || this.allowUnlockedPlay)) this.updatePlay(dt);
      if (this.mode === 'cutscene' && this.cutscene) this.cutscene.update(dt);
      if (this.mode === 'dead') {
        this.deathPoseT = Math.min(1, this.deathPoseT + dt * 2.2);
        const e = 1 - Math.pow(1 - this.deathPoseT, 3);
        const groundY = this.level.heightAt(this.pos.x, this.pos.z, this.pos.y);
        const fallenEye = groundY + 0.38;
        this.camera.position.set(this.pos.x, this.pos.y + 1.65 + (fallenEye - (this.pos.y + 1.65)) * e, this.pos.z);
        this.camera.rotation.set(this.pitch * (1 - e) - 0.16 * e, this.yaw, 0.42 * e);
      }
      this.updateFx(dt);
      this.updateParticles(dt);
      const sd = this.sun.userData.dir || new THREE.Vector3(1, 2, 1).normalize();
      const focus = this.mode === 'cutscene' ? this.camera.position : this.pos;
      this.sun.position.copy(focus).addScaledVector(sd, 150);
      this.sun.target.position.copy(focus);
      this.rimLight.position.set(focus.x - sd.x * 90, focus.y + 70, focus.z - sd.z * 90);
      this.rimLight.target.position.copy(focus);
      this.dome.position.copy(this.camera.position);
    }
    this.hudAcc += dt;
    if (this.hudAcc > 0.1) {
      this.hudAcc = 0;
      this.emitHud();
    }
    this.renderer.render(this.scene, this.camera);
    if (_isSoftwareGl) this.afterDraw(this.loop);
    else this.raf = requestAnimationFrame(this.loop);
  };

  updateParticles(dt) {
    if (!this.particles) return;
    const arr = this.particles.geometry.attributes.position;
    const snow = this.particleKind === 'snow';
    const fall = snow ? 3.2 : 0.75;
    const wind = snow ? 4.5 : 0.85;
    const t = this.elapsed;
    const c = this.camera.position;
    for (let i = 0; i < arr.count; i++) {
      let x = arr.getX(i) + wind * dt + Math.sin(t + i) * dt * 0.3;
      let y = arr.getY(i) - fall * dt;
      let z = arr.getZ(i) + Math.cos(t * 0.7 + i) * dt * 0.3;
      if (y < c.y - 8) y += 30;
      if (x - c.x > 35) x -= 70;
      if (x - c.x < -35) x += 70;
      if (z - c.z > 35) z -= 70;
      if (z - c.z < -35) z += 70;
      arr.setXYZ(i, x, y, z);
    }
    arr.needsUpdate = true;
  }

  updateFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      const k = Math.max(0, f.life / f.max);
      if (f.obj.isLight) {
        f.obj.intensity = 28 * k;
      } else {
        const mat = f.obj.material;
        if (mat) mat.opacity = k * (f.grow ? 0.7 : 0.85);
        if (f.grow) f.obj.scale.setScalar(f.grow * (1.5 - k));
      }
      if (f.life <= 0) {
        this.scene.remove(f.obj);
        f.obj.geometry?.dispose();
        f.obj.material?.dispose();
        this.fx.splice(i, 1);
      }
    }
    this.muzzleLight.intensity *= Math.pow(0.0002, dt);
    if (this.muzzleFlashT > 0) {
      this.muzzleFlashT = Math.max(0, this.muzzleFlashT - dt);
      const k = this.muzzleFlashT / 0.065;
      this.muzzleFlash.userData.mat.opacity = Math.min(1, k * 1.4);
      if (this.muzzleFlashT <= 0) this.muzzleFlash.visible = false;
    }

    // Rotate & auto-collect physical world ammo drops
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.mesh.rotation.y += dt * 1.6;
      if (pk.mesh.userData.box) pk.mesh.userData.box.position.y = 0.22 + Math.sin(this.elapsed * 3.5 + i) * 0.05;
      if (this.mode === 'play' && Math.hypot(pk.pos.x - this.pos.x, pk.pos.z - this.pos.z) < 2.2 && Math.abs(pk.pos.y - this.pos.y) < 2.0) {
        if (pk.kind !== 'grenade') {
          this.stats.ammo[pk.kind] += pk.amount;
          if (!this.stats.weapons.includes(pk.kind) && Math.random() < 0.4) this.giveWeapon(pk.kind, 0);
        } else {
          this.stats.grenades = (this.stats.grenades ?? 0) + pk.amount;
        }
        if (pk.grenade > 0) this.stats.grenades = (this.stats.grenades ?? 0) + pk.grenade;
        audio.pickup();
        const label = pk.kind === 'shotgun' ? '12G shells' : pk.kind === 'pistol' ? '9mm rds' : pk.kind === 'grenade' ? 'Frag Grenade' : '5.56 rds';
        this.msg(`Picked up +${pk.amount} ${label}${pk.grenade ? ' & +1 Frag' : ''}`, 'loot');
        this.scene.remove(pk.mesh);
        this.pickups.splice(i, 1);
      }
    }
  }

  updatePlay(dt) {
    const lvl = this.level;
    const s = this.stats;
    this.hurtCd -= dt;
    this.alarm = Math.max(0, this.alarm - dt);

    // Keyboard turn fallback (arrow keys) — scaled proportionally when scoped for crisp tracking
    const k = this.keys;
    const ads = this.scoped && this.reloadT <= 0 && (this.weapon === 'pistol' || this.weapon === 'shotgun' || this.weapon === 'rifle');
    const scopeSpec = computeScopeFov(this.weapon, ads, this.scopeZoom);
    const turnScale = scopeSpec.sensMult;
    if (k.has('ArrowLeft')) this.yaw += 1.9 * turnScale * dt;
    if (k.has('ArrowRight')) this.yaw -= 1.9 * turnScale * dt;
    if (k.has('ArrowUp')) this.pitch = Math.min(1.45, this.pitch + 1.4 * turnScale * dt);
    if (k.has('ArrowDown')) this.pitch = Math.max(-1.45, this.pitch - 1.4 * turnScale * dt);

    // Movement
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    if (k.has('KeyW')) wish.add(fwd);
    if (k.has('KeyS')) wish.sub(fwd);
    if (k.has('KeyD')) wish.add(right);
    if (k.has('KeyA')) wish.sub(right);
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    const slowed = s.health < 25 || s.hunger <= 0 || s.thirst <= 0;
    let speed = (sprint ? 7.4 : 4.4) * (s.moveSpeedMult ?? 1);
    if (slowed) speed *= 0.7;
    if (this.phase === 'winter') speed *= 0.9;
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    this.vel.lerp(wish, Math.min(1, dt * (this.onGround ? 10 : 2)));
    this.moving = this.vel.lengthSq() > 1;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.collide(this.pos, 0.4);
    const b = lvl.bounds;
    this.pos.x = Math.max(-b, Math.min(b, this.pos.x));
    this.pos.z = Math.max(-b, Math.min(b, this.pos.z));
    const ground = lvl.heightAt(this.pos.x, this.pos.z, this.pos.y);
    const wasGrounded = this.onGround;
    if (k.has('Space') && this.onGround) {
      this.vy = 6.5;
      this.onGround = false;
    }
    this.vy -= 22 * dt;
    const prevVy = this.vy;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= ground || (this.onGround && this.pos.y - ground < 0.6)) {
      this.pos.y = ground;
      this.vy = 0;
      this.onGround = true;
      if (!wasGrounded && prevVy < -13.5) {
        const fallDmg = computeFallDamage(-prevVy);
        if (fallDmg > 0) this.damagePlayer(fallDmg, 'Fell to your death');
        this.triggerFootstepEffect(ground, true);
      }
    } else this.onGround = false;

    // Walking footprints, dust/gravel puffs & water splash ripples
    if (this.wetBootT > 0) this.wetBootT = Math.max(0, this.wetBootT - dt);
    const horizSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && horizSpeed > 0.65) {
      this.strideAcc += horizSpeed * dt;
      if (this.strideAcc >= 0.92) {
        this.strideAcc = 0;
        this.triggerFootstepEffect(ground, sprint);
      }
    }

    // Camera + firing shake (positional & rotational kick)
    this.bobT += dt * this.vel.length() * 1.6;
    const bob = this.onGround ? Math.sin(this.bobT) * 0.045 * Math.min(1, this.vel.length() / 4) : 0;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * 0.14;
    const rotSh = this.shake * 0.022;
    this.camera.position.set(
      this.pos.x + (Math.random() - 0.5) * sh,
      this.pos.y + 1.65 + bob + (Math.random() - 0.5) * sh,
      this.pos.z + (Math.random() - 0.5) * sh,
    );
    this.camera.rotation.set(
      this.pitch + (Math.random() - 0.5) * rotSh,
      this.yaw + (Math.random() - 0.5) * rotSh,
      (Math.random() - 0.5) * rotSh * 1.4,
    );
    this.recoil = Math.max(0, this.recoil - dt * 6);
    const targetFov = scopeSpec.fov;
    if (Math.abs(this.camera.fov - targetFov) > 0.02) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 14);
      this.camera.updateProjectionMatrix();
    }
    this.viewModel.visible = !ads || this.camera.fov > 58;
    this.viewModel.position.set(
      (ads ? -0.145 : 0) + Math.cos(this.bobT * 0.5) * (ads ? 0.003 : 0.012),
      bob * (ads ? 0.2 : 0.5) + (ads ? -0.06 : 0) - (this.reloadT > 0 ? 0.15 : 0),
      this.recoil * 0.08 + (ads ? 0.05 : 0),
    );
    this.viewModel.rotation.x = this.recoil * 0.15 + (this.reloadT > 0 ? -0.5 : 0);
    if (this.weapon === 'fists') {
      const f = this.vmGuns.fists;
      f.children[1].position.z = -0.38 - this.recoil * 0.3;
      f.children[3].position.z = -0.2 - this.recoil * 0.3;
    }

    // Weapons
    this.fireCd -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloadT = 0;
        const wd = WEAPONS[this.weapon];
        if (this.weapon !== 'fists' && this.weapon !== 'grenade') {
          const take = Math.min(wd.mag - this.clips[this.weapon], s.ammo[this.weapon]);
          this.clips[this.weapon] += take;
          s.ammo[this.weapon] -= take;
        }
      }
    }
    if (this.mouseDown && (this.locked || this.allowUnlockedPlay)) {
      this.fire();
      if (!WEAPONS[this.weapon].auto) this.mouseDown = false;
    }

    this.updateGrenades(dt);

    // Actors
    const ctx = this.ctx();
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      const d = a.pos.distanceTo(this.pos);
      if (d < 115 || a.aggro) a.update(dt, ctx);
      a.group.visible = d < 240;
      if (a.dead && d > 150) {
        this.scene.remove(a.group);
        this.actors.splice(i, 1);
      }
    }

    // Fire lights / warmth & dynamic interior lighting pool (throttled closest scan, zero per-frame sort)
    this.lightScanT -= dt;
    if (this.lightScanT <= 0) {
      this.lightScanT = 0.25;
      const fireCap = this.fireLights.length;
      const intCap = this.interiorLights.length;
      if (lvl.fires && lvl.fires.length) {
        const bestF = [];
        for (let i = 0; i < lvl.fires.length; i++) {
          const f = lvl.fires[i];
          const d2 = f.distanceToSquared(this.pos);
          if (bestF.length < fireCap || d2 < bestF[bestF.length - 1].d2) {
            bestF.push({ item: f, d2 });
            bestF.sort((a, b2) => a.d2 - b2.d2);
            if (bestF.length > fireCap) bestF.pop();
          }
        }
        this.nearFiresCached = bestF.map((x) => x.item);
      } else {
        this.nearFiresCached = [];
      }
      if (lvl.interiorLights && lvl.interiorLights.length) {
        const bestI = [];
        for (let i = 0; i < lvl.interiorLights.length; i++) {
          const item = lvl.interiorLights[i];
          const d2 = item.pos.distanceToSquared(this.pos);
          if (bestI.length < intCap || d2 < bestI[bestI.length - 1].d2) {
            bestI.push({ item, d2 });
            bestI.sort((a, b2) => a.d2 - b2.d2);
            if (bestI.length > intCap) bestI.pop();
          }
        }
        this.nearIntCached = bestI.map((x) => x.item);
      } else {
        this.nearIntCached = [];
      }
    }
    this.nearFire = false;
    if (this.nearFiresCached.length) {
      const t = this.elapsed;
      this.fireLights.forEach((l, i) => {
        const f = this.nearFiresCached[i];
        if (f && f.distanceToSquared(this.pos) < 14400) {
          l.position.set(f.x, f.y + 1.6, f.z);
          l.intensity = 14 + Math.sin(t * 13 + i) * 3 + Math.sin(t * 7.3 + i) * 2;
        } else l.intensity = 0;
      });
      this.nearFire = this.nearFiresCached[0].distanceToSquared(this.pos) < 20.25;
    } else {
      this.fireLights.forEach((l) => (l.intensity = 0));
    }
    if (this.nearIntCached.length) {
      this.interiorLights.forEach((il, i) => {
        const item = this.nearIntCached[i];
        if (item && item.pos.distanceToSquared(this.pos) < 1764) {
          il.position.copy(item.pos);
          il.color.set(item.color ?? 0xffe4bd);
          il.intensity = item.intensity ?? 18;
        } else il.intensity = 0;
      });
    } else {
      this.interiorLights.forEach((il) => (il.intensity = 0));
    }

    // Interactions
    let best = null;
    let bestD = Infinity;
    for (const it of lvl.interactables) {
      if (it.done) continue;
      if (Math.abs((it.pos.y ?? 0) - this.pos.y) > 2.8) continue;
      const dx = it.pos.x - this.pos.x;
      const dz = it.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < it.radius && d < bestD) {
        best = it;
        bestD = d;
      }
    }
    for (const a of this.actors) {
      const d = a.pos.distanceTo(this.pos);
      if (d > 2.6 || d > bestD) continue;
      if (a.dead && !a.looted) {
        best = {
          key: 'body' + a.id,
          pos: a.pos,
          radius: 2.6,
          label: a.kind === 'wolf' ? 'Butcher carcass' : 'Search body',
          hold: 1.2,
          action: () => this.lootBody(a),
        };
        bestD = d;
      } else if (!a.dead && a.kind === 'civilian' && !a.looted) {
        best = {
          key: 'mug' + a.id,
          pos: a.pos,
          radius: 2.6,
          label: 'Mug civilian (crime)',
          hold: 1.0,
          action: () => {
            a.looted = true;
            const cash = 20 + Math.floor(Math.random() * 90);
            s.cash += cash;
            s.crimes++;
            this.wanted = Math.min(5, this.wanted + 0.5);
            this.alarm = 6;
            let extra = '';
            if (Math.random() < 0.35) {
              s.water++;
              extra = ' + water';
            } else if (Math.random() < 0.3) {
              s.food++;
              extra = ' + snack';
            }
            audio.pickup();
            this.msg(`Mugged a civilian: $${cash}${extra}`, 'loot');
          },
        };
        bestD = d;
      }
    }
    if (!best && lvl.dynamicInteract) best = lvl.dynamicInteract(this.pos);
    const bkey = best ? best.key ?? best : null;
    if (bkey !== this.currentKey) this.interactT = 0;
    this.currentKey = bkey;
    this.current = best;
    if (best && k.has('KeyE') && !this.eLatch) {
      this.interactT += dt;
      if (this.interactT >= best.hold) {
        best.action();
        if (!best.repeat) best.done = true;
        this.interactT = 0;
        this.eLatch = true;
        this.emitHud();
      }
    } else this.interactT = 0;

    // Survival stats via pure rules module (read live this.stats so best.action() replacements are preserved)
    const ambient = lvl.ambientRad(this.pos.x, this.pos.z);
    const stepped = stepSurvivalStats(this.stats, {
      dt,
      phase: this.phase,
      sprint,
      ambientRad: ambient,
      nearFire: this.nearFire,
      drainMult: difficultyMods(s).survivalDrain,
    });
    this.stats = stepped.stats;
    this.geigerRate = stepped.geigerRate;
    audio.geiger(this.geigerRate, dt);
    if (stepped.deathReason) {
      this.die(stepped.deathReason);
      return;
    }

    lvl.update(dt);
  }

  triggerFootstepEffect(groundY, intense = false) {
    const lvl = this.level;
    if (!lvl) return;
    this.footSide *= -1;
    const latX = Math.cos(this.yaw) * 0.16 * this.footSide;
    const latZ = -Math.sin(this.yaw) * 0.16 * this.footSide;
    const fx = this.pos.x + latX;
    const fz = this.pos.z + latZ;
    const fy = lvl.heightAt(fx, fz, this.pos.y);
    const surf = lvl.surfaceAt ? lvl.surfaceAt(fx, fz, this.pos.y) : 'concrete';

    audio.footstep(surf);

    if (surf === 'water' || surf === 'puddle') {
      this.wetBootT = 6.0;
      const waterY = surf === 'water' && lvl.waterLevel !== undefined ? lvl.waterLevel + 0.06 : fy + 0.13;
      this.spawnWaterRipple(fx, waterY, fz, surf === 'water' ? 1.25 : 1.0);
      const splashCol = surf === 'water' ? 0xdbeafe : 0xcbd5e1;
      this.puff(new THREE.Vector3(fx, waterY + 0.12, fz), splashCol, intense ? 0.34 : 0.24);
      if (intense) {
        this.puff(new THREE.Vector3(fx + latX * 0.6, waterY + 0.2, fz + latZ * 0.6), 0xe2e8f0, 0.2);
      }
      return;
    }

    const wet = this.wetBootT > 0;
    const leaveDryPrint = surf === 'snow' || surf === 'drought' || surf === 'gravel' || surf === 'grass' || surf === 'dirt';
    if (wet || leaveDryPrint || surf === 'asphalt' || surf === 'concrete') {
      this.stampFootprint(fx, fy, fz, this.yaw, surf, wet);
    }

    if (surf === 'drought') {
      this.puff(new THREE.Vector3(fx, fy + 0.1, fz), 0xb89b72, intense ? 0.32 : 0.22);
    } else if (surf === 'gravel') {
      this.puff(new THREE.Vector3(fx, fy + 0.08, fz), 0x8e867c, intense ? 0.26 : 0.18);
    } else if (surf === 'snow') {
      this.puff(new THREE.Vector3(fx, fy + 0.08, fz), 0xeef6ff, intense ? 0.3 : 0.2);
    } else if (surf === 'dirt' || (surf === 'grass' && intense)) {
      this.puff(new THREE.Vector3(fx, fy + 0.08, fz), 0x7a6a58, 0.22);
    }
  }

  emitHud() {
    if (!this.level) return;
    const o = this.level.objective.pos;
    const { dist, bearing } = computeObjectiveBearing(this.yaw, this.pos.x, this.pos.z, o.x, o.z);
    const cur = this.current;
    const ads = this.scoped && this.reloadT <= 0 && (this.weapon === 'pistol' || this.weapon === 'shotgun' || this.weapon === 'rifle');
    this.onUpdate({
      phase: this.phase,
      stats: cloneStats(this.stats),
      difficulty: this.stats.difficulty ?? 'normal',
      weapon: this.weapon,
      clip: this.weapon === 'grenade' ? (this.stats.grenades ?? 0) : this.clips[this.weapon],
      timer: this.timer,
      missionTimer: this.level.missionTimer ?? 0,
      missionLabel: this.level.missionLabel ?? null,
      wanted: this.wanted,
      objective: this.level.objective.label,
      objectiveDist: dist,
      objectiveBearing: bearing,
      prompt: cur && this.mode === 'play' ? (typeof cur.label === 'function' ? cur.label() : cur.label) : null,
      progress: cur ? this.interactT / cur.hold : 0,
      geiger: this.geigerRate,
      locked: this.locked,
      allowUnlockedPlay: this.allowUnlockedPlay,
      nearFire: this.nearFire,
      reloading: this.reloadT > 0,
      scoped: ads,
      zoomLabel: computeScopeFov(this.weapon, ads, this.scopeZoom).zoomLabel,
      shelter: this.level.getShelterStatus ? this.level.getShelterStatus() : null,
    });
  }
}
