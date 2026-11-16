import { CLASSES, WEAPONS } from '../game/types.js';

function Bar({ label, value, color, icon, warn }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 text-center text-sm">{icon}</span>
      <div className="w-40">
        <div className="flex justify-between text-[10px] uppercase tracking-widest text-stone-300/85 tabular-nums">
          <span className={warn ? 'text-red-300 font-bold' : ''}>{label}</span>
          <span className={warn ? 'text-red-300 font-bold' : ''}>{Math.round(value)}</span>
        </div>
        <div className={`h-2 bg-black/70 border rounded-sm overflow-hidden ${warn ? 'border-red-500/70' : 'border-white/15'}`}>
          <div className="h-full transition-all duration-200" style={{ width: `${v}%`, background: color }} />
        </div>
      </div>
    </div>
  );
}

const toneCls = {
  radio: 'border-amber-400/70 text-amber-100',
  alert: 'border-red-500 text-red-100 bg-red-950/75',
  loot: 'border-emerald-400/70 text-emerald-100',
  info: 'border-stone-400/50 text-stone-200',
};

export default function HUD({ hud, log, damage, flash, cinematic }) {
  const s = hud.stats;
  const w = WEAPONS[hud.weapon];
  const mm = Math.floor(hud.timer / 60);
  const ss = Math.floor(hud.timer % 60).toString().padStart(2, '0');
  const bearingDeg = (hud.objectiveBearing * 180) / Math.PI;
  const radDisplay = hud.geiger * 100;
  const reserve = hud.weapon === 'fists' || hud.weapon === 'grenade' ? null : s.ammo[hud.weapon];
  const now = performance.now();

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-mono text-white">
      {/* environmental overlays */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 58%, rgba(0,0,0,0.52) 100%)' }} />
      {s.radiation > 40 && (
        <div
          className="absolute inset-0 mix-blend-screen"
          style={{ background: `radial-gradient(ellipse at center, transparent 42%, rgba(90,255,60,${Math.min(0.24, (s.radiation - 40) / 200)}) 100%)` }}
        />
      )}
      {hud.phase === 'winter' && s.warmth < 45 && (
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse at center, transparent 38%, rgba(200,230,255,${(45 - s.warmth) / 80}) 100%)` }}
        />
      )}
      {s.health < 30 && (
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 45%, rgba(160,0,0,0.42) 100%)' }} />
      )}
      {damage > 0 && (
        <div key={damage} className="absolute inset-0 dmg-flash" style={{ background: 'radial-gradient(ellipse at center, transparent 30%, rgba(200,0,0,0.55) 100%)' }} />
      )}
      {flash > 0 && <div key={'f' + flash} className="absolute inset-0 bg-white nuke-flash" />}

      {cinematic && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 text-center text-amber-200 text-lg tracking-[0.28em] fade-in drop-shadow">
          {log.length ? log[log.length - 1].text : ''}
        </div>
      )}

      <div className={`absolute inset-0 ${cinematic ? 'hidden' : ''}`}>
        {/* tactical optical scope / ADS reticle overlay */}
        {hud.scoped && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at center, rgba(16,185,129,0.02) 0%, rgba(0,0,0,0.06) 36%, rgba(0,0,0,0.68) 41%, rgba(0,0,0,0.82) 100%)',
              }}
            />
            <svg viewBox="0 0 400 400" className="relative w-[min(70vmin,520px)] h-[min(70vmin,520px)]">
              <circle cx="200" cy="200" r="186" fill="none" stroke="rgba(255,255,255,0.34)" strokeWidth="2" />
              <line x1="20" y1="200" x2="186" y2="200" stroke="rgba(255,255,255,0.8)" strokeWidth="1.4" />
              <line x1="214" y1="200" x2="380" y2="200" stroke="rgba(255,255,255,0.8)" strokeWidth="1.4" />
              <line x1="200" y1="20" x2="200" y2="186" stroke="rgba(255,255,255,0.8)" strokeWidth="1.4" />
              <line x1="200" y1="214" x2="200" y2="380" stroke="rgba(255,255,255,0.8)" strokeWidth="1.4" />
              {[-60, -40, -20, 20, 40, 60].map((d) => (
                <g key={d}>
                  <line x1={200 + d} y1="196" x2={200 + d} y2="204" stroke="rgba(255,255,255,0.75)" strokeWidth="1.2" />
                  <line x1="196" y1={200 + d} x2="204" y2={200 + d} stroke="rgba(255,255,255,0.75)" strokeWidth="1.2" />
                </g>
              ))}
              <circle cx="200" cy="200" r="2.2" fill="#ef4444" />
            </svg>
            <div className="absolute bottom-[12%] bg-black/80 border border-white/20 px-3 py-1 rounded text-xs text-amber-300 tabular-nums">
              OPTIC {hud.zoomLabel} · [F] / Right-Click Exit{hud.weapon === 'rifle' ? ' · Wheel Zoom' : ''}
            </div>
          </div>
        )}

        {/* crosshair */}
        {(hud.locked || hud.allowUnlockedPlay) && !hud.scoped && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="relative h-6 w-6">
              <div className="absolute left-1/2 top-0 h-2 w-[2px] -translate-x-1/2 bg-white/80" />
              <div className="absolute left-1/2 bottom-0 h-2 w-[2px] -translate-x-1/2 bg-white/80" />
              <div className="absolute top-1/2 left-0 w-2 h-[2px] -translate-y-1/2 bg-white/80" />
              <div className="absolute top-1/2 right-0 w-2 h-[2px] -translate-y-1/2 bg-white/80" />
            </div>
          </div>
        )}

        {/* top: countdown + mission rush + compass + objective */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
          {hud.phase === 'city' && (
            <div className={`text-4xl font-black tracking-widest drop-shadow tabular-nums ${hud.timer < 60 ? 'text-red-500' : 'text-amber-300'}`}>
              ☢ {mm}:{ss}
            </div>
          )}
          {hud.phase === 'shelter' && hud.shelter && (
            <div className="bg-black/80 border border-amber-400/50 px-4 py-1.5 rounded flex flex-col items-center gap-0.5 tabular-nums shadow-[0_0_20px_rgba(245,158,11,0.2)]">
              <div className="text-xs font-black tracking-[0.25em] text-amber-300">
                {hud.shelter.military
                  ? '★ MILITARY BUNKER 7 ★'
                  : hud.shelter.tunnel
                    ? '★ SECTOR-4 UNDERGROUND VAULT ★'
                    : 'FALLOUT SHELTER'}
                <span className="ml-3 text-white">DAY {hud.shelter.day}</span>
              </div>
              <div className="text-[11px] text-stone-300 flex gap-3">
                <span>
                  Outside: <b className="text-amber-200">{hud.shelter.outside.toFixed(2)} R/hr</b> ({hud.shelter.risk})
                </span>
                <span>
                  Exposure <b className="text-emerald-300">×{hud.shelter.mult.toFixed(1)}</b>
                </span>
              </div>
              <div className="text-[10px] text-stone-400">
                [E] Bunk or [B] Wait Day · Explore 3 Levels · [E] Upper Hatch to Head North
              </div>
            </div>
          )}
          {hud.missionTimer > 0 && (
            <div className="bg-red-950/90 border border-red-400 px-4 py-1 rounded text-sm font-black tracking-widest text-red-100 tabular-nums shadow-[0_0_18px_rgba(239,68,68,0.45)]">
              🚁 {hud.missionLabel || 'CHOPPER EVAC'} — {Math.ceil(hud.missionTimer)}s
            </div>
          )}
          <div className="relative w-80 h-7 bg-black/65 border border-white/20 rounded overflow-hidden">
            <div className="absolute inset-y-0 left-1/2 w-px bg-white/40" />
            {Math.abs(bearingDeg) < 75 ? (
              <div
                className="absolute top-0.5 text-lg text-yellow-300"
                style={{ left: `calc(50% + ${(bearingDeg / 75) * 150}px)`, transform: 'translateX(-50%)' }}
              >
                ▼
              </div>
            ) : (
              <div className={`absolute top-0.5 text-sm text-yellow-300 ${bearingDeg > 0 ? 'right-2' : 'left-2'}`}>
                {bearingDeg > 0 ? 'TURN ▶' : '◀ TURN'}
              </div>
            )}
          </div>
          <div className="text-xs text-stone-200 bg-black/65 px-3 py-1 rounded max-w-xl text-center tabular-nums">
            {hud.objective} — <span className="text-yellow-300">{Math.round(hud.objectiveDist)}m</span>
          </div>
          {hud.phase === 'city' && (
            <div className="text-2xl tracking-wider">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className={i < Math.floor(hud.wanted) ? 'text-red-500 drop-shadow-[0_0_6px_red]' : 'text-white/20'}>
                  ★
                </span>
              ))}
            </div>
          )}
        </div>

        {/* message log + RPG rank/XP header */}
        <div className="absolute top-4 left-4 w-[24rem] max-w-[34vw] flex flex-col gap-1.5">
          <div className="bg-black/70 border border-white/15 px-2.5 py-1.5 rounded flex flex-col gap-1 self-start min-w-64">
            <div className="text-[11px] uppercase tracking-[0.22em] text-stone-200">
              {hud.phase === 'city'
                ? 'Phase 1 · The Last Hour'
                : hud.phase === 'shelter'
                  ? 'Phase 2 · The Bunker'
                  : hud.phase === 'wilderness'
                    ? 'Phase 3 · Fallout'
                    : 'Phase 4 · Nuclear Winter'}
            </div>
            <div className="flex items-center justify-between gap-3 text-[11px] tabular-nums">
              <span className="text-amber-300 font-bold">
                LVL {s.level ?? 1} · {CLASSES[s.classId]?.name ?? 'Scavenger'}
              </span>
              <span className="text-stone-400">
                {s.xp ?? 0}/{s.xpToNext ?? 100} XP
              </span>
            </div>
            <div className="h-1 bg-white/10 rounded-sm overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-all duration-300"
                style={{ width: `${Math.min(100, ((s.xp ?? 0) / Math.max(1, s.xpToNext ?? 100)) * 100)}%` }}
              />
            </div>
          </div>
          {log.map((m) => (
            <div
              key={m.id}
              className={`text-xs border px-2.5 py-1 bg-black/70 rounded transition-opacity duration-1000 ${toneCls[m.tone] || toneCls.info}`}
              style={{ opacity: now - m.t > 9000 ? 0 : 1 }}
            >
              {m.tone === 'radio' && <span className="mr-1">📻</span>}
              {m.text}
            </div>
          ))}
        </div>

        {/* geiger + field guide */}
        <div className="absolute top-4 right-4 flex flex-col items-end gap-1.5">
          <div className="bg-black/70 border border-yellow-500/45 rounded px-3 py-2 text-right tabular-nums">
            <div className="text-[10px] tracking-[0.24em] text-yellow-400/85">GEIGER COUNTER</div>
            <div className={`text-xl font-bold ${radDisplay > 50 ? 'text-red-400' : radDisplay > 8 ? 'text-yellow-300' : 'text-green-300'}`}>
              {radDisplay.toFixed(1)} <span className="text-xs">mSv/h</span>
            </div>
            <div className="text-[10px] text-stone-400">Absorbed: {s.radiation.toFixed(0)} rads</div>
            {hud.phase === 'winter' && (
              <div className={`text-xs mt-1 ${hud.nearFire ? 'text-orange-300' : 'text-sky-300'}`}>
                {hud.nearFire ? '🔥 Warming up' : '❄ Freezing'}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={hud.onOpenGuide}
            className="pointer-events-auto bg-black/75 hover:bg-stone-900 border border-amber-400/45 rounded px-2.5 py-1 text-[11px] text-amber-300 font-bold tracking-wider cursor-pointer"
          >
            [M] FIELD GUIDE
          </button>
        </div>

        {/* interaction prompt */}
        {hud.prompt && (
          <div className="absolute left-1/2 top-[55%] -translate-x-1/2 flex flex-col items-center gap-1">
            <div className="bg-black/75 border border-white/25 px-4 py-2 rounded text-sm">
              <span className="bg-white text-black font-bold px-1.5 rounded mr-2">E</span>
              {hud.prompt}
            </div>
            {hud.progress > 0 && (
              <div className="w-64 h-1.5 bg-black/65 rounded overflow-hidden">
                <div className="h-full bg-amber-400" style={{ width: `${Math.min(100, hud.progress * 100)}%` }} />
              </div>
            )}
          </div>
        )}

        {/* vitals */}
        <div className="absolute bottom-4 left-4 bg-black/65 border border-white/15 rounded p-3 flex flex-col gap-1.5">
          <Bar label="Health" value={s.health} color="linear-gradient(90deg,#b91c1c,#ef4444)" icon="❤" warn={s.health < 30} />
          <Bar label="Hunger" value={s.hunger} color="linear-gradient(90deg,#a16207,#eab308)" icon="🥫" warn={s.hunger < 20} />
          <Bar label="Thirst" value={s.thirst} color="linear-gradient(90deg,#1d4ed8,#38bdf8)" icon="💧" warn={s.thirst < 20} />
          <Bar label="Radiation" value={s.radiation} color="linear-gradient(90deg,#3f6212,#a3e635)" icon="☢" warn={s.radiation > 60} />
          {hud.phase === 'winter' && <Bar label="Warmth" value={s.warmth} color="linear-gradient(90deg,#0ea5e9,#f97316)" icon="🌡" warn={s.warmth < 25} />}
        </div>

        {/* weapon + inventory */}
        <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2 tabular-nums">
          <div className="flex gap-2 text-xs">
            {[
              ['C', '🥫', s.food],
              ['V', '💧', s.water],
              ['H', '✚', s.meds],
              ['X', '💊', s.radpills],
              ['G', '💣', s.grenades ?? 0],
            ].map(([k, ic, n]) => (
              <div key={k} className={`bg-black/65 border rounded px-2 py-1 text-center ${n ? 'border-white/25' : 'border-white/10 opacity-50'}`}>
                <div className="text-base">{ic}</div>
                <div className="font-bold">{n}</div>
                <div className="text-[9px] text-stone-400">[{k}]</div>
              </div>
            ))}
            <div className="bg-black/65 border border-emerald-500/35 rounded px-2 py-1 text-center">
              <div className="text-base">💵</div>
              <div className="font-bold text-emerald-300">${s.cash}</div>
              <div className="text-[9px] text-stone-400">cash</div>
            </div>
          </div>
          <div className="bg-black/75 border border-white/20 rounded px-4 py-2 text-right min-w-56">
            <div className="flex items-center justify-end gap-2 text-sm text-stone-300">
              {(hud.weapon === 'pistol' || hud.weapon === 'shotgun' || hud.weapon === 'rifle') && (
                <span className="text-[10px] text-amber-300/90">[F] {hud.scoped ? hud.zoomLabel : 'Scope'}</span>
              )}
              <span>{w.name}</span>
            </div>
            <div className="text-3xl font-black">
              {hud.weapon === 'fists' ? (
                '—'
              ) : hud.weapon === 'grenade' ? (
                <span className="text-amber-300">{s.grenades ?? 0} left</span>
              ) : hud.reloading ? (
                <span className="text-amber-300 text-xl">RELOADING…</span>
              ) : (
                <>
                  <span className={hud.clip === 0 ? 'text-red-500' : ''}>{hud.clip}</span>
                  <span className="text-lg text-stone-400"> / {reserve}</span>
                </>
              )}
            </div>
            <div className="flex gap-1 justify-end mt-1">
              {['fists', 'pistol', 'shotgun', 'rifle', 'grenade'].map((id, i) => {
                const owned = id === 'grenade' ? (s.grenades ?? 0) > 0 : s.weapons.includes(id);
                return (
                  <span
                    key={id}
                    className={`text-[10px] px-1.5 rounded border ${
                      hud.weapon === id
                        ? 'border-amber-400 text-amber-300'
                        : owned
                          ? 'border-white/25 text-white/75'
                          : 'border-white/10 text-white/25'
                    }`}
                  >
                    {i + 1}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
