import { useState } from 'react';
import { applyBunkerSupplyBonus, doseRate, falloutExposureMult } from '../game/rules.js';
import { cloneStats } from '../game/types.js';

export default function Shelter({ initial, onLeave }) {
  const [s, setS] = useState(() => applyBunkerSupplyBonus(initial, initial.bunkerTier));
  const military = s.bunkerTier === 'military';
  const [day, setDay] = useState(0);
  const [ate, setAte] = useState(false);
  const [drank, setDrank] = useState(false);
  const [log, setLog] = useState(() => [
    {
      day: 0,
      text: military
        ? 'Medevac helicopter delivered you to Stocked Military Bunker 7. Armory lockers yield +6 rations, +6 water, +4 medkits, +4 Rad-X, +3 Frag Grenades, AR-15 ammo, HEPA shielding & Arctic Thermal Gear (-55% winter cold loss).'
        : 'The hatch is sealed. The ground shook for a full minute. You found 1 ration and 2 water jugs in the shelter stockpile.',
      tone: military ? 'good' : 'info',
    },
  ]);
  const [dead, setDead] = useState(null);

  const outside = doseRate(Math.max(day, 0.05));
  const mult = falloutExposureMult(outside);
  const risk = outside > 5 ? 'LETHAL' : outside > 2 ? 'SEVERE' : outside > 0.8 ? 'HIGH' : outside > 0.4 ? 'MODERATE' : 'SURVIVABLE';
  const riskCls = outside > 2 ? 'text-red-400' : outside > 0.8 ? 'text-orange-300' : outside > 0.4 ? 'text-yellow-300' : 'text-green-300';

  const add = (e) => setLog((l) => [e, ...l].slice(0, 30));

  const eat = () => {
    if (s.food <= 0 || ate) return;
    setS((p) => ({ ...p, food: p.food - 1, hunger: Math.min(100, p.hunger + 40) }));
    setAte(true);
  };
  const drink = () => {
    if (s.water <= 0 || drank) return;
    setS((p) => ({ ...p, water: p.water - 1, thirst: Math.min(100, p.thirst + 45) }));
    setDrank(true);
  };
  const med = () => {
    if (s.meds <= 0 || s.health >= 100) return;
    setS((p) => ({ ...p, meds: p.meds - 1, health: Math.min(100, p.health + 45) }));
  };
  const pill = () => {
    if (s.radpills <= 0 || s.radiation <= 0) return;
    setS((p) => ({ ...p, radpills: p.radpills - 1, radiation: Math.max(0, p.radiation - 30) }));
  };

  const wait = () => {
    if (dead) return;
    const nd = day + 1;
    const n = cloneStats(s);
    n.hunger = Math.max(0, n.hunger - 24);
    n.thirst = Math.max(0, n.thirst - 30);
    // Shielding factor ~ 1/400 (HEPA military bunker halves leaked radiation)
    n.radiation += doseRate(nd) * 24 * (military ? 0.005 : 0.012);
    if (n.hunger <= 0) n.health -= 18;
    if (n.thirst <= 0) n.health -= 25;
    if (n.hunger > 40 && n.thirst > 40 && n.radiation < 50) n.health = Math.min(100, n.health + (military ? 20 : 12));
    if (n.radiation > 70) n.health -= (n.radiation - 70) * 0.6;
    const r = Math.random();
    let ev = null;
    if (nd === 1) ev = { day: nd, text: 'Radio: "...multiple strikes confirmed nationwide. Stay underground for at least two weeks..."', tone: 'info' };
    else if (nd === 4) ev = { day: nd, text: 'Radio: "Evacuation checkpoint operating on Highway 9, north of the city. Military escort available."', tone: 'info' };
    else if (!military && r < 0.12 && n.food > 0) {
      n.food--;
      ev = { day: nd, text: 'Rats chewed through a can of rations. (-1 food)', tone: 'bad' };
    } else if (!military && r < 0.22) {
      n.radiation += 6;
      ev = { day: nd, text: 'The air filter clogged with fallout dust. You fix it, but take a dose. (+6 rads)', tone: 'bad' };
    } else if (r < 0.32) {
      n.food += 1;
      n.water += 1;
      ev = { day: nd, text: 'Behind a loose panel you find a forgotten civil-defense ration box. (+1 food, +1 water)', tone: 'good' };
    } else if (r < 0.40 && n.water > 0) {
      n.water--;
      n.meds++;
      ev = { day: nd, text: 'A wounded stranger begs at the hatch. You trade water for his medkit. (-1 water, +1 medkit)', tone: 'info' };
    } else if (r < 0.48) ev = { day: nd, text: 'Distant thunder… or more detonations. Dust falls from the ceiling.', tone: 'info' };
    else if (r < 0.55) {
      n.health -= 8;
      ev = { day: nd, text: 'Fever and nausea from the stale air. (-8 health)', tone: 'bad' };
    }
    n.shelterDays = nd;
    setDay(nd);
    setAte(false);
    setDrank(false);
    if (ev) add(ev);
    add({ day: nd, text: `Day ${nd} passes. Outside: ${doseRate(nd).toFixed(2)} R/hr.`, tone: 'info' });
    if (n.health <= 0) {
      n.health = 0;
      setDead(n.thirst <= 0 ? 'You died of thirst in the dark.' : n.hunger <= 0 ? 'You starved in the shelter.' : 'Radiation sickness took you in your sleep.');
    }
    setS(n);
    if (nd >= 21) add({ day: nd, text: 'The air recycler is failing. You must leave NOW.', tone: 'bad' });
  };

  const leave = () => {
    const n = cloneStats(s);
    n.exposureMult = mult;
    n.shelterDays = day;
    n.warmth = 100;
    onLeave(n);
  };

  const bar = (label, v, color) => (
    <div>
      <div className="flex justify-between text-xs text-stone-300 tabular-nums">
        <span>{label}</span>
        <span>{Math.round(v)}</span>
      </div>
      <div className="h-2 bg-black/70 rounded overflow-hidden">
        <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: color }} />
      </div>
    </div>
  );

  const btn = 'px-3 py-2 rounded border text-sm transition disabled:opacity-30 disabled:cursor-not-allowed';

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black font-mono text-stone-100">
      <img src="./images/shelter.jpg" className="absolute inset-0 w-full h-full object-cover opacity-40" alt="" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/65 to-black/35" />
      <div className="relative w-full max-w-5xl grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-6 p-6">
        <div className={`bg-black/75 border rounded-lg p-5 flex flex-col gap-3 ${military ? 'border-emerald-400/50' : 'border-amber-500/35'}`}>
          <div className={`text-xs tracking-[0.35em] ${military ? 'text-emerald-300' : 'text-amber-400'}`}>
            {military ? 'INTERMISSION · MILITARY BUNKER 7' : 'INTERMISSION · FALLOUT SHELTER'}
          </div>
          {military && (
            <div className="bg-emerald-950/75 border border-emerald-400/40 rounded px-2.5 py-1.5 text-[11px] text-emerald-200">
              HEPA Airlock + Arctic Thermal Gear (-55% Winter Cold Loss) · {s.grenades ?? 0} Grenades
            </div>
          )}
          <div className="text-5xl font-black tabular-nums">DAY {day}</div>
          <div className="bg-black/65 rounded p-3 border border-white/10 tabular-nums">
            <div className="text-[10px] tracking-widest text-stone-400">OUTSIDE DOSE RATE (7-10 RULE)</div>
            <div className={`text-3xl font-bold ${riskCls}`}>{outside.toFixed(2)} R/hr</div>
            <div className={`text-sm ${riskCls}`}>Exposure risk: {risk}</div>
          </div>
          {bar('❤ Health', s.health, '#ef4444')}
          {bar('🥫 Hunger', s.hunger, '#eab308')}
          {bar('💧 Thirst', s.thirst, '#38bdf8')}
          {bar('☢ Radiation', s.radiation, '#a3e635')}
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button className={`${btn} border-yellow-500/50 hover:bg-yellow-500/20`} disabled={s.food <= 0 || ate || !!dead} onClick={eat}>
              🥫 Eat ration ({s.food})
            </button>
            <button className={`${btn} border-sky-500/50 hover:bg-sky-500/20`} disabled={s.water <= 0 || drank || !!dead} onClick={drink}>
              💧 Drink water ({s.water})
            </button>
            <button className={`${btn} border-red-500/50 hover:bg-red-500/20`} disabled={s.meds <= 0 || s.health >= 100 || !!dead} onClick={med}>
              ✚ Medkit ({s.meds})
            </button>
            <button className={`${btn} border-lime-500/50 hover:bg-lime-500/20`} disabled={s.radpills <= 0 || s.radiation <= 0 || !!dead} onClick={pill}>
              💊 Rad-X ({s.radpills})
            </button>
          </div>
          <div className="text-[11px] text-stone-400">Each day costs ~24 hunger and ~30 thirst. One meal and one drink per day.</div>
        </div>
        <div className="bg-black/75 border border-white/15 rounded-lg p-5 flex flex-col gap-3">
          <div className="text-xs tracking-[0.35em] text-stone-400">SHELTER LOG</div>
          <div className="flex-1 min-h-64 max-h-80 overflow-y-auto flex flex-col gap-2 pr-2">
            {log.map((e, i) => (
              <div
                key={i}
                className={`text-sm border-l-2 pl-2 ${
                  e.tone === 'good' ? 'border-emerald-400 text-emerald-100' : e.tone === 'bad' ? 'border-red-500 text-red-200' : 'border-stone-500 text-stone-200'
                }`}
              >
                <span className="text-stone-500 mr-2">D{e.day}</span>
                {e.text}
              </div>
            ))}
          </div>
          {dead ? (
            <div className="text-center">
              <div className="text-red-400 text-xl font-bold mb-2">{dead}</div>
              <button className="px-5 py-3 bg-red-700 hover:bg-red-600 rounded font-bold" onClick={() => window.location.reload()}>
                Start over
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button className="px-5 py-3 bg-stone-700 hover:bg-stone-600 rounded font-bold disabled:opacity-30" disabled={day >= 21} onClick={wait}>
                😴 Wait out another day
              </button>
              <button className="px-5 py-3 bg-amber-600 hover:bg-amber-500 text-black rounded font-black tracking-wider" onClick={leave}>
                OPEN THE HATCH & HEAD NORTH →
              </button>
              <div className="text-[11px] text-stone-400 text-center tabular-nums">
                Leaving now: fallout outside will irradiate you at <span className={riskCls}>×{mult.toFixed(1)}</span> the baseline rate.
                {day < 7 && ' Experts say wait at least 1–2 weeks.'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
