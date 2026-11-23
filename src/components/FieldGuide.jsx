import { useEffect, useState } from 'react';

const PHASES = [
  {
    id: 'city',
    tab: 'I · City',
    title: 'Phase I — The Last Hour',
    timer: '6:00 Until Strike',
    accent: 'border-amber-500 text-amber-300',
    summary:
      'Ballistic missiles are inbound. Scavenge weapons, ammo, rations, Rad-X, and cash across panicked city blocks before the shockwave arrives.',
    routes: [
      ['Public Fallout Shelter', 'Outskirts beacon — solid steel door, baseline supplies.'],
      ['Mercy Hospital Rooftop Chopper', 'Enter lobby to trigger 90s rush up stair ramps -> unlocks Military Bunker 7.'],
      ['NW Quarantine Metro Tunnel', 'Guard-patrolled pit at NW corner descending into Sector-4 Deep Vault.'],
      ['Highway 9 Guard Convoy', 'Edge-of-town APC — neutralize raiders or pay $200 to ride to Military Bunker 7.'],
    ],
    landmarks: [
      'Mercy Hospital (4 levels + Bio-Lab rifle crate & Pharmacy)',
      'City Parking Deck (3-ramp concrete garage with SWAT rooftop armory)',
      'Downtown Stores (Gun Shop, Pharmacy, Grocery, Hardware, Bank) & Black-Market Van in Park',
      'Outer-block City Ruins & parked Police Cruisers (grenades, shotguns, 9mm)',
    ],
  },
  {
    id: 'shelter',
    tab: 'II · Bunker',
    title: 'Phase II — The 3-Level Bunker',
    timer: 'Wait Out Peak Fallout',
    accent: 'border-emerald-500 text-emerald-300',
    summary:
      'Walkable 3-story subterranean refuge. Use the 7-10 Fallout Decay Rule: every 7x in hours after detonation drops outside radiation 10x.',
    routes: [
      ['Upper Exit Airlock Hatch', 'North Mezzanine hatch — unseal anytime to climb out onto Highway 9 North.'],
      ['Bunk Bed / [B] Wait 1 Day', 'Advances fallout decay (+day), trades daily hunger/thirst, heals if well-fed.'],
    ],
    landmarks: [
      'Mezzanine Deck: Optics Calibration Bench (+accuracy & reload bonus), Wall Conduits & Exit Airlock',
      'Main Concourse: Bunk Bed, Ration Pantry, Water Purifier, Ham Radio & Locker Cache',
      'Lower Sub-Level: Diesel/Geothermal Reactor Generator & Basement Shotgun Ammo Spawn',
      'Military Bunker 7 / Sector-4 tiers grant extra MREs, AR-15 ammo, meds & Arctic cold insulation',
    ],
  },
  {
    id: 'wilderness',
    tab: 'III · Fallout',
    title: 'Phase III — The Irradiated Wilds',
    timer: '1,000m North Corridor',
    accent: 'border-orange-500 text-orange-300',
    summary:
      'Follow the wrecked highway north through ash clouds, crater hot zones, bomber ruins, and raider ambushes toward Checkpoint 9.',
    routes: [
      ['Checkpoint 9 Military Radio', 'North highway barricade — call extraction to Mount Ardent foothills.'],
      ['Old Mine Shaft (65m West)', 'Follow "OLD MINE SHAFT ↙" street sign past a hot crater into an underground service tunnel.'],
      ['East Snowcat Ridge', 'NE flank near goal — hotwire the tracked armored evacuation vehicle.'],
    ],
    landmarks: [
      '5 Enterable Outposts (Highway Service, Ranger, Grid Relay) — hack terminals for XP & +12% Rad Shield',
      'Wounded Caravan Scout (at Ranger Outpost): trade 1 Medkit for AR-15 Rifle, +90 XP & +10% Move Speed',
      '2-Level Ranger Watchtowers, Bombed City Ruins, Airdrop Supply Crates & Furnished Log Cabins',
      'Roadside ponds restore +30 thirst at the cost of +7 rads when desperate',
    ],
  },
  {
    id: 'winter',
    tab: 'IV · Winter',
    title: 'Phase IV — Nuclear Winter',
    timer: '-30°C Blizzard Pass',
    accent: 'border-sky-400 text-sky-300',
    summary:
      'Soot has collapsed global temperatures. Manage Warmth alongside Hunger, Thirst, and Radiation while fighting up the frozen mountain pass.',
    routes: [
      ['Mount Ardent Main Vault Gate', 'Follow the highway up the pass to the open circular blast door & inner airlock.'],
      ['Old Mine Geothermal Backdoor', 'Follow "OLD MINE SHAFT ↙" west into the heated tunnel -> breach vault sub-airlock.'],
      ['East Ridge Geothermal Bulkhead', 'Override the NE ridge vault hatch to bypass main pass defenders.'],
    ],
    landmarks: [
      'Barrel Fires & Cabin Woodstoves restore Warmth rapidly (+12/sec) and push back frostbite',
      'Frozen City Ruins, Homesteads & Outposts hold extra MREs, medkits, 5.56 ammo & grenades',
      'Use [F] / Right-Click Scope and the M24 Sniper (6x / 10x wheel zoom) to clear ridge raiders at long range',
    ],
  },
];

const QUICK_KEYS = [
  ['WASD / Shift / Space', 'Move / Sprint / Jump (drive when in a car)'],
  ['E (at a car)', 'Hijack / Exit vehicle'],
  ['F or Right-Click', 'Toggle Scope / ADS'],
  ['Mouse Wheel (Rifle / Sniper)', '2.25x / 3.0x or 6x / 10x Optic Zoom'],
  ['C / V', 'Eat Food / Drink Water'],
  ['H / X', 'Medkit / Rad-X Pills'],
  ['G / R', 'Throw Frag / Reload'],
];

export default function FieldGuide({ activePhase = 'city', onClose }) {
  const [tab, setTab] = useState(activePhase);

  useEffect(() => {
    setTab(activePhase);
  }, [activePhase]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Escape' || e.code === 'KeyM' || e.code === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const cur = PHASES.find((p) => p.id === tab) || PHASES[0];

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/82 p-4 md:p-8 font-mono text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Level Field Guide"
    >
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-stone-950 border border-amber-500/45 rounded-lg shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-white/15 bg-black/60">
          <div>
            <div className="text-[11px] uppercase tracking-[0.26em] text-amber-400">Civil Defense Field Manual</div>
            <h2 className="text-xl md:text-2xl font-black tracking-wide text-white">LEVEL & SURVIVAL FIELD GUIDE</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-black tracking-wider rounded cursor-pointer"
          >
            CLOSE [M / ESC]
          </button>
        </div>

        {/* Phase Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-white/15 bg-black/40">
          {PHASES.map((p) => {
            const active = p.id === cur.id;
            const isCurrent = p.id === activePhase;
            return (
              <button
                key={p.id}
                type="button"
                aria-selected={active}
                onClick={() => setTab(p.id)}
                className={`px-3 py-2.5 text-left border-b-2 transition cursor-pointer ${
                  active
                    ? 'border-amber-400 bg-stone-900/90 text-amber-300'
                    : 'border-transparent text-stone-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-xs font-bold">
                  <span>{p.tab}</span>
                  {isCurrent && <span className="text-[10px] uppercase tracking-wider text-emerald-400">Now</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-4">
          <div className={`border-l-4 pl-3.5 ${cur.accent}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-black">{cur.title}</h3>
              <span className="text-xs text-stone-300">{cur.timer}</span>
            </div>
            <p className="text-xs md:text-sm text-stone-300 mt-1 leading-relaxed">{cur.summary}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-black/55 border border-white/15 rounded p-3.5 flex flex-col gap-2">
              <div className="text-xs font-bold uppercase tracking-widest text-amber-300">Escape & Completion Routes</div>
              <div className="flex flex-col gap-2">
                {cur.routes.map(([name, desc]) => (
                  <div key={name} className="border-l-2 border-amber-500/50 pl-2.5">
                    <div className="text-xs font-bold text-white">{name}</div>
                    <div className="text-[11px] text-stone-300 leading-snug">{desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-black/55 border border-white/15 rounded p-3.5 flex flex-col gap-2">
              <div className="text-xs font-bold uppercase tracking-widest text-emerald-300">Landmarks, Ruins & Loot</div>
              <ul className="flex flex-col gap-1.5 text-[11px] text-stone-300 leading-snug">
                {cur.landmarks.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-emerald-400">▸</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Controls & Vitals Quick Reference */}
          <div className="bg-black/60 border border-white/15 rounded p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-widest text-stone-300 mb-2">
              Survival & Optics Quick Reference
            </div>
            <div className="grid sm:grid-cols-3 gap-x-4 gap-y-1 text-[11px]">
              {QUICK_KEYS.map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-amber-300 font-bold shrink-0">{k}</span>
                  <span className="text-stone-300">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
