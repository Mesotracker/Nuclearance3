import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import FieldGuide from './components/FieldGuide.jsx';
import HUD from './components/HUD.jsx';
import { Game } from './game/Game.js';
import { audio } from './game/audio.js';
import { applyBunkerSupplyBonus, calculateScore } from './game/rules.js';
import { CLASSES, DIFFICULTIES, cloneStats, freshStats } from './game/types.js';

const CONTROLS = [
  ['WASD / Arrows', 'Move / Turn'],
  ['Shift / Space', 'Sprint / Jump'],
  ['Mouse', 'Aim / Fire'],
  ['F / Right-Click', 'Scope / ADS (+Wheel)'],
  ['1-5', 'Weapons / Grenade'],
  ['R / G', 'Reload / Frag'],
  ['E (hold)', 'Rob · Loot · Hack · Evac'],
  ['C / V', 'Eat Ration / Drink'],
  ['H / X', 'Medkit / Rad-X'],
  ['M / P', 'Field Guide / Pause'],
];

function Controls() {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
      {CONTROLS.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <span className="min-w-24 text-amber-300 font-bold">{k}</span>
          <span className="text-stone-300">{v}</span>
        </div>
      ))}
    </div>
  );
}

let msgId = 0;

export default function App() {
  const mountRef = useRef(null);
  const gameRef = useRef(null);
  const [screen, setScreen] = useState('menu');
  const [hud, setHud] = useState(null);
  const [log, setLog] = useState([]);
  const [damage, setDamage] = useState(0);
  const [flash, setFlash] = useState(0);
  const [deathReason, setDeathReason] = useState('');
  const [carry, setCarry] = useState(null);
  const [deadPhase, setDeadPhase] = useState('city');
  const [manualPause, setManualPause] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState('scavenger');
  const [selectedDifficulty, setSelectedDifficulty] = useState('normal');

  const eventHandlerRef = useRef(null);
  const onEvent = useCallback((e) => eventHandlerRef.current?.(e), []);

  const ensureGame = useCallback(() => {
    if (!gameRef.current && mountRef.current) {
      gameRef.current = new Game(mountRef.current, setHud, onEvent, freshStats());
    }
    return gameRef.current;
  }, [onEvent]);

  const startPhase = useCallback(
    (phase, stats, { autostart = false } = {}) => {
      audio.init();
      setLog([]);
      setManualPause(false);
      setScreen('play');
      const g = ensureGame();
      g.loadPhase(phase, stats, { autostart });
      if (!autostart) g.requestLock();
    },
    [ensureGame],
  );

  eventHandlerRef.current = (e) => {
    switch (e.type) {
      case 'message':
        setLog((l) => [...l, { id: msgId++, text: e.text, tone: e.tone ?? 'info', t: performance.now() }].slice(-6));
        break;
      case 'damage':
        setDamage((d) => d + 1);
        break;
      case 'flash':
        setFlash((f) => f + 1);
        break;
      case 'death':
        setDeathReason(e.reason);
        setDeadPhase(gameRef.current?.phase ?? 'city');
        setGuideOpen(false);
        setManualPause(false);
        setScreen('dead');
        break;
      case 'toggleGuide':
        setGuideOpen((open) => !open);
        break;
      case 'phaseComplete': {
        const g = gameRef.current;
        const s = cloneStats(g.stats);
        setCarry(s);
        setLog([]);
        if (e.phase === 'city') {
          const stocked = applyBunkerSupplyBonus(s, s.bunkerTier);
          startPhase('shelter', stocked, { autostart: g.allowUnlockedPlay });
        } else if (e.phase === 'shelter') {
          startPhase('wilderness', s, { autostart: g.allowUnlockedPlay });
        } else if (e.phase === 'wilderness') {
          setScreen('interlude');
        } else {
          setScreen('victory');
        }
        break;
      }
    }
  };

  const newGame = useCallback(
    (opts = {}) => {
      const stats = freshStats(selectedClass);
      stats.difficulty = selectedDifficulty;
      startPhase('city', stats, opts);
    },
    [startPhase, selectedClass, selectedDifficulty],
  );

  const retry = () => {
    const g = gameRef.current;
    if (!g) return newGame();
    audio.init();
    setLog([]);
    setManualPause(false);
    setScreen('play');
    g.retryPhase();
    if (!g.allowUnlockedPlay) g.requestLock();
  };

  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now();
      setLog((l) => (l.some((m) => now - m.t > 11000) ? l.filter((m) => now - m.t <= 11000) : l));
    }, 1000);
    return () => {
      clearInterval(id);
      gameRef.current?.dispose();
      gameRef.current = null;
    };
  }, []);

  // Optional autostart & phase/nuke query support for automated inspection
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      const phaseParam = params.get('phase');
      const phase =
        phaseParam === 'shelter' || phaseParam === 'wilderness' || phaseParam === 'winter'
          ? phaseParam
          : 'city';
      const tier = params.get('tier');
      const cls = params.get('class') || 'scavenger';
      let stats = freshStats(cls);
      const diffParam = params.get('difficulty');
      if (DIFFICULTIES[diffParam]) stats.difficulty = diffParam;
      if (tier === 'military' || tier === 'tunnel' || tier === 'public') {
        stats.bunkerTier = tier;
      }
      if (phase === 'shelter') {
        stats = applyBunkerSupplyBonus(stats, stats.bunkerTier);
      } else if (phase !== 'city') {
        stats.weapons = ['fists', 'pistol', 'shotgun', 'rifle'];
        stats.ammo = { pistol: 45, shotgun: 24, rifle: 72 };
      }
      startPhase(phase, stats, { autostart: true });
      const g = gameRef.current;
      const inspect = params.get('inspect');
      const moveToView = (v) => {
        if (!v || !g) return;
        g.pos.set(v.x, v.y ?? 0, v.z);
        g.yaw = v.yaw ?? 0;
        g.camera.position.set(g.pos.x, g.pos.y + 1.65, g.pos.z);
        g.camera.rotation.set(0, g.yaw, 0);
        g.emitHud();
      };
      if (g && phase === 'city' && params.get('mission') === 'hospital') {
        g.giveWeapon('rifle', 60);
        if (params.get('roof') === '1') {
          g.pos.set(25, 12.18, -22.4);
          g.yaw = -0.15;
        } else {
          g.pos.set(4, 0.18, -25);
          g.yaw = -Math.PI / 2;
        }
        g.camera.position.set(g.pos.x, g.pos.y + 1.65, g.pos.z);
        g.camera.rotation.set(0, g.yaw, 0);
        g.level?.startHospitalMission?.();
        g.emitHud();
      } else if (g && inspect === 'bunker' && g.level?.bunkerView) {
        moveToView(g.level.bunkerView);
      } else if (g && inspect === 'home' && g.level?.homeView) {
        moveToView(g.level.homeView);
      } else if (g && inspect === 'tunnel' && g.level?.tunnelView) {
        moveToView(g.level.tunnelView);
      } else if (g && inspect === 'garage' && g.level?.garageView) {
        moveToView(g.level.garageView);
      } else if (g && inspect === 'mine' && g.level?.mineView) {
        moveToView(g.level.mineView);
      } else if (g && inspect === 'ruin' && g.level?.ruinView) {
        moveToView(g.level.ruinView);
      } else if (g && inspect === 'tower' && g.level?.towerView) {
        moveToView(g.level.towerView);
      } else if (g && inspect === 'outpost' && g.level?.outpostView) {
        moveToView(g.level.outpostView);
      }
      if (g && params.get('scope') === '1') {
        if (!g.stats.weapons.includes('rifle')) g.giveWeapon('rifle', 60);
        else g.switchWeapon('rifle');
        g.scoped = true;
        g.emitHud();
      }
      if (params.get('guide') === '1') {
        setGuideOpen(true);
      }
      if (params.get('nuke') === '1' && g) {
        g.startNuke(new THREE.Vector3(0, 14, 100), new THREE.Vector3(0, 10, -520), true);
        for (let i = 0; i < 44; i++) g.cutscene?.update(0.05);
      }
    } else if (params.get('guide') === '1') {
      setGuideOpen(true);
    }
  }, [startPhase]);

  const g = gameRef.current;
  const paused =
    screen === 'play' &&
    hud &&
    g?.mode === 'play' &&
    !guideOpen &&
    (manualPause || (!hud.locked && !hud.allowUnlockedPlay));

  // Mirror UI state to body.dataset.state & support keyboard Enter/Space on menu + P pause toggle + M Field Guide
  useEffect(() => {
    const stateName =
      screen === 'menu'
        ? 'title'
        : screen === 'dead' || screen === 'victory'
          ? 'gameover'
          : paused || guideOpen
            ? 'paused'
            : 'playing';
    document.body.dataset.state = stateName;
  }, [screen, paused, guideOpen]);

  useEffect(() => {
    const onKey = (e) => {
      if (screen === 'menu' && !guideOpen && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        newGame();
      } else if (screen === 'play' && e.code === 'KeyP') {
        setManualPause((p) => !p);
      } else if (screen === 'menu' && (e.code === 'KeyM' || e.code === 'Tab')) {
        e.preventDefault();
        setGuideOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, guideOpen, newGame]);

  const closeGuide = useCallback(() => {
    setGuideOpen(false);
    const curG = gameRef.current;
    if (screen === 'play' && curG && !curG.allowUnlockedPlay && !manualPause) {
      curG.requestLock();
    }
  }, [screen, manualPause]);

  const score = carry ? calculateScore(carry) : 0;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      <div ref={mountRef} className="absolute inset-0" />

      {screen === 'play' && hud && (
        <HUD
          hud={{ ...hud, onOpenGuide: () => setGuideOpen(true) }}
          log={log}
          damage={damage}
          flash={flash}
          cinematic={g?.mode === 'cutscene'}
        />
      )}

      {guideOpen && <FieldGuide activePhase={hud?.phase || g?.phase || 'city'} onClose={closeGuide} />}

      {paused && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/70 font-mono text-white cursor-pointer"
          onClick={() => {
            setManualPause(false);
            g?.requestLock();
          }}
        >
          <div className="bg-black/85 border border-amber-500/45 rounded-lg p-8 flex flex-col items-center gap-5 fade-in">
            <div className="text-3xl font-black tracking-widest text-amber-300">PAUSED</div>
            <div className="text-sm text-stone-300">Click anywhere to resume</div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setGuideOpen(true);
              }}
              className="px-4 py-1.5 bg-stone-800 hover:bg-stone-700 border border-amber-400/50 rounded text-xs font-bold text-amber-300 cursor-pointer"
            >
              OPEN LEVEL FIELD GUIDE [M]
            </button>
            <Controls />
          </div>
        </div>
      )}

      {screen === 'menu' && (
        <div className="absolute inset-0 text-white overflow-y-auto">
          <img src="./images/title.jpg" alt="Smoldering skyline above a concrete fallout bunker" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/82 to-black/45" />
          <div className="relative min-h-full flex flex-col justify-center px-8 md:px-16 py-8 max-w-5xl gap-5 fade-in">
            <div className="flex items-center gap-4">
              <svg width="52" height="52" viewBox="0 0 64 64" fill="none" aria-hidden="true" className="shrink-0">
                <circle cx="32" cy="32" r="29" stroke="#f59e0b" strokeWidth="2.5" fill="#111315" />
                <path d="M32 32 L18 14 A22 22 0 0 1 46 14 Z" fill="#f59e0b" opacity="0.92" />
                <path d="M32 32 L54 34 A22 22 0 0 1 40 53 Z" fill="#f59e0b" opacity="0.92" />
                <path d="M32 32 L24 53 A22 22 0 0 1 10 34 Z" fill="#f59e0b" opacity="0.92" />
                <circle cx="32" cy="32" r="5.5" fill="#111315" stroke="#fbbf24" strokeWidth="2" />
              </svg>
              <div>
                <div className="font-mono text-xs tracking-[0.28em] text-amber-400">Civil Defense Broadcast · T-Minus 6:00</div>
                <h1 className="font-display text-6xl md:text-7xl font-extrabold leading-none tracking-tight text-white">
                  LAST <span className="text-amber-400">SHELTER</span>
                </h1>
              </div>
            </div>

            <p className="text-stone-300 text-sm md:text-base leading-relaxed max-w-2xl">
              Missiles are inbound. Scavenge weapons and rations across panicked city blocks, breach Mercy Hospital or underground tunnels, wait out fallout in a 3-level bunker, and fight north to Mount Ardent Vault.
            </p>

            {/* Interactive RPG Survivor Class Selection */}
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-stone-300 tracking-wide">Choose Survivor Loadout & Perk</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                {Object.values(CLASSES).map((cls) => {
                  const active = selectedClass === cls.id;
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedClass(cls.id)}
                      className={`text-left rounded-lg p-3 border transition cursor-pointer ${
                        active
                          ? 'bg-stone-900/95 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
                          : 'bg-black/75 border-white/15 hover:border-white/35'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-white">{cls.name}</span>
                        <span className="text-[11px] font-mono text-amber-300">{active ? 'Active' : 'Select'}</span>
                      </div>
                      <div className="text-[11px] text-stone-400 mt-0.5">{cls.role}</div>
                      <div className="text-xs text-amber-200/90 mt-1.5 leading-snug">{cls.perk}</div>
                      <div className="text-[11px] font-mono text-stone-300 mt-1.5">{cls.kit}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Difficulty selection */}
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-stone-300 tracking-wide">Choose Difficulty</div>
              <div className="grid grid-cols-3 gap-2.5 max-w-2xl">
                {Object.values(DIFFICULTIES).map((diff) => {
                  const active = selectedDifficulty === diff.id;
                  return (
                    <button
                      key={diff.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedDifficulty(diff.id)}
                      className={`text-left rounded-lg p-3 border transition cursor-pointer ${
                        active
                          ? 'bg-stone-900/95 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
                          : 'bg-black/75 border-white/15 hover:border-white/35'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-white">{diff.name}</span>
                        <span className="text-[11px] font-mono text-amber-300">{active ? 'Active' : 'Select'}</span>
                      </div>
                      <div className="text-[11px] text-stone-400 mt-0.5 leading-snug">{diff.blurb}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                data-start="true"
                onClick={() => newGame()}
                className="px-8 py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-display text-xl font-extrabold tracking-wider rounded shadow-[0_0_28px_rgba(245,158,11,0.45)] transition cursor-pointer whitespace-nowrap shrink-0"
              >
                Begin Survival — T-Minus 6:00
              </button>
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="px-5 py-3.5 bg-stone-900/90 hover:bg-stone-800 border border-amber-400/50 text-amber-300 font-mono text-xs font-bold tracking-wider rounded transition cursor-pointer whitespace-nowrap shrink-0"
              >
                LEVEL FIELD GUIDE [M]
              </button>
              <div className="text-xs text-stone-300 font-mono">
                I. Last Hour · II. 3-Level Bunker · III. Fallout · IV. Nuclear Winter
              </div>
            </div>

            <div className="bg-black/70 border border-white/15 rounded-lg p-3.5 max-w-2xl">
              <Controls />
            </div>
          </div>
        </div>
      )}

      {screen === 'interlude' && carry && (
        <div className="absolute inset-0 font-mono text-white">
          <img src="./images/winter.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/65 to-black/25" />
          <div className="relative h-full flex flex-col items-center justify-end pb-16 px-6 text-center gap-5 fade-in">
            <div className="text-xs tracking-[0.5em] text-sky-300">PHASE III</div>
            <h2 className="text-6xl font-black">NUCLEAR WINTER</h2>
            <p className="max-w-2xl text-stone-200 leading-relaxed">
              Soot from a thousand burning cities has blotted out the sun. Temperatures are collapsing. The radio spoke of one last place — <b className="text-amber-300">Mount Ardent Vault</b>, high in the pass. Stay near fires to keep warm. Raiders guard every flame.
            </p>
            <button
              onClick={() => startPhase('winter', { ...cloneStats(carry), warmth: 100 })}
              className="px-8 py-4 bg-sky-500 hover:bg-sky-400 text-black font-black tracking-widest rounded cursor-pointer"
            >
              INTO THE COLD →
            </button>
          </div>
        </div>
      )}

      {screen === 'dead' && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center font-mono text-white"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(45,8,8,0.28) 0%, rgba(28,4,4,0.58) 55%, rgba(0,0,0,0.82) 100%)',
          }}
        >
          <div className="bg-black/70 border border-red-500/45 rounded-lg px-8 py-7 flex flex-col items-center gap-4 text-center max-w-md shadow-[0_0_40px_rgba(185,28,28,0.35)]">
            <div className="text-xs tracking-[0.5em] text-red-400">SIGNAL LOST</div>
            <h2 className="text-6xl font-black text-red-500 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">YOU DIED</h2>
            <p className="text-stone-200 text-sm leading-relaxed">{deathReason || 'You succumbed to injuries'}</p>
            <div className="flex gap-4 mt-1">
              <button onClick={retry} className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-black rounded cursor-pointer">
                RETRY {deadPhase.toUpperCase()}
              </button>
              <button onClick={() => setScreen('menu')} className="px-6 py-3 bg-stone-800 hover:bg-stone-700 rounded border border-white/20 cursor-pointer">
                MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {screen === 'victory' && carry && (
        <div className="absolute inset-0 flex items-center justify-center bg-black font-mono text-white">
          <img src="./images/shelter.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-35" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/50" />
          <div className="relative flex flex-col items-center gap-6 text-center max-w-2xl px-6 fade-in">
            <div className="text-xs tracking-[0.5em] text-emerald-400">VAULT DOOR SEALED</div>
            <h2 className="text-5xl md:text-6xl font-black text-amber-300">YOU SURVIVED</h2>
            <p className="text-stone-300 leading-relaxed">
              The blast doors lock behind you with a thunderous hydraulic hiss. Inside, geothermal generators hum, clean water flows, and dozens of other survivors look up as you step out of the frost. Humanity lives to see another spring.
            </p>
            <div className="grid grid-cols-3 gap-4 w-full bg-black/75 border border-white/15 rounded-lg p-5 text-sm tabular-nums">
              {[
                ['Days underground', carry.shelterDays],
                ['Stores robbed', carry.storesRobbed],
                ['Crimes', carry.crimes],
                ['Enemies killed', carry.kills],
                ['Cash looted', `$${carry.cash}`],
                ['Radiation', `${Math.round(carry.radiation)} rads`],
              ].map(([k, v]) => (
                <div key={k}>
                  <div className="text-stone-400 text-xs">{k}</div>
                  <div className="text-xl font-bold">{v}</div>
                </div>
              ))}
            </div>
            <div className="text-2xl font-black text-amber-400 tabular-nums">SURVIVAL SCORE: {score}</div>
            <button onClick={() => newGame()} className="px-8 py-4 bg-amber-500 hover:bg-amber-400 text-black font-black tracking-widest rounded cursor-pointer">
              PLAY AGAIN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
