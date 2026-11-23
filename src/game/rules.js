import { WEAPONS, cloneStats, difficultyMods } from './types.js';

// Fallout decay "7-10 rule": dose rate R(t) = R1 * t^-1.2 (t in hours)
export const R1 = 520;

export function doseRate(day) {
  return R1 * Math.pow(Math.max(1, day * 24), -1.2);
}

export function falloutExposureMult(day) {
  const outside = doseRate(Math.max(day, 0.05));
  return Math.max(0.7, Math.min(5, 0.5 + outside / 0.8));
}

export function clampDeltaTime(rawDt) {
  if (!Number.isFinite(rawDt) || rawDt <= 0) return 0;
  return Math.min(rawDt, 0.05);
}

export function computeObjectiveBearing(yaw, playerX, playerZ, targetX, targetZ) {
  const dx = targetX - playerX;
  const dz = targetZ - playerZ;
  const dist = Math.hypot(dx, dz);
  const af = Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
  let rel = af - Math.atan2(dx, dz);
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  return { dist, bearing: rel };
}

export function calculateScore(stats) {
  if (!stats) return 0;
  return (
    stats.kills * 10 +
    stats.crimes * 15 +
    stats.storesRobbed * 50 +
    Math.floor(stats.cash / 10) +
    Math.max(0, 100 - Math.round(stats.radiation)) * 3 +
    Math.round(stats.health) * 2 +
    Math.max(0, (stats.level ?? 1) - 1) * 75 +
    (stats.hacksCompleted ?? 0) * 40 +
    (stats.questsCompleted ?? 0) * 60
  );
}

export function grantXp(stats, rawAmount) {
  const s = cloneStats(stats);
  const amount = Math.max(0, Math.round(rawAmount * (s.xpMult ?? 1)));
  s.xp = (s.xp ?? 0) + amount;
  s.level = s.level ?? 1;
  s.xpToNext = s.xpToNext ?? 100;
  let leveledUp = false;
  while (s.xp >= s.xpToNext) {
    s.xp -= s.xpToNext;
    s.level += 1;
    s.xpToNext = Math.round(s.xpToNext * 1.45);
    s.damageMult = Number(((s.damageMult ?? 1) + 0.05).toFixed(3));
    s.reloadMult = Number(Math.max(0.55, (s.reloadMult ?? 1) * 0.96).toFixed(3));
    s.health = Math.min(100, (s.health ?? 100) + 15);
    leveledUp = true;
  }
  return { stats: s, gainedXp: amount, leveledUp, newLevel: s.level };
}

export function computeWeaponStats(weaponId, stats) {
  const w = WEAPONS[weaponId] || WEAPONS.fists;
  const dmgMul = stats?.damageMult ?? 1;
  const relMul = stats?.reloadMult ?? 1;
  const sprMul = stats?.spreadMult ?? 1;
  return {
    ...w,
    damage: Math.round(w.damage * dmgMul * 10) / 10,
    reloadTime: Number(((w.reload ?? 0) * relMul).toFixed(2)),
    spread: w.spread * sprMul,
  };
}

export function resolveTerminalHack(stats, mode = 'bypass') {
  const lvl = stats?.level ?? 1;
  const isTech = stats?.classId === 'recon' || stats?.classId === 'scavenger';
  if (mode === 'overclock') {
    const clean = lvl >= 2 || isTech;
    return {
      ok: true,
      mode,
      xpGain: 65,
      bonusRifle: 36,
      bonusShotgun: 12,
      bonusGrenades: 1,
      alertTriggered: !clean,
      summary: clean
        ? 'Firewall bypassed silently — armory unlocked & turret telemetry disabled.'
        : 'Security tripped alarm during override, but armory cache forced open!',
    };
  }
  if (mode === 'breach') {
    return {
      ok: true,
      mode,
      xpGain: 45,
      bonusRifle: 24,
      bonusShotgun: 16,
      bonusGrenades: 2,
      alertTriggered: true,
      summary: 'Bulkhead breached with shaped charge — heavy guard patrol alerted!',
    };
  }
  return {
    ok: true,
    mode: 'bypass',
    xpGain: 55,
    bonusRifle: 18,
    bonusShotgun: 8,
    bonusGrenades: 0,
    alertTriggered: false,
    summary: 'Backdoor grid routed cleanly — defense power rerouted and cache opened.',
  };
}

export function generateAmmoDrop(kind, stats, rng = Math.random) {
  const yld = stats?.ammoYieldMult ?? 1;
  const r = rng();
  if (kind === 'police') {
    const ammoKind = r < 0.28 ? 'shotgun' : 'pistol';
    const base = ammoKind === 'shotgun' ? 6 : 12;
    return {
      ammoKind,
      amount: Math.max(4, Math.round(base * yld)),
      grenade: rng() < 0.2 ? 1 : 0,
    };
  }
  if (kind === 'raider') {
    const ammoKind = r < 0.08 ? 'sniper' : r < 0.45 ? 'rifle' : r < 0.78 ? 'shotgun' : 'pistol';
    const base = ammoKind === 'sniper' ? 6 : ammoKind === 'rifle' ? 20 : ammoKind === 'shotgun' ? 8 : 14;
    return {
      ammoKind,
      amount: Math.max(4, Math.round(base * yld)),
      grenade: rng() < 0.24 ? 1 : 0,
    };
  }
  return { ammoKind: 'pistol', amount: Math.max(4, Math.round(6 * yld)), grenade: 0 };
}

export function stepSurvivalStats(stats, { dt, phase, sprint, ambientRad, nearFire, drainMult }) {
  const s = cloneStats(stats);
  const drainScale = drainMult ?? difficultyMods(s).survivalDrain;
  if (phase === 'shelter') {
    s.hunger = Math.max(0, s.hunger - dt * 0.12 * drainScale * (sprint ? 1.3 : 1));
    s.thirst = Math.max(0, s.thirst - dt * 0.15 * drainScale * (sprint ? 1.35 : 1));
    return { stats: s, geigerRate: ambientRad, deathReason: null };
  }
  const wild = phase !== 'city';
  s.hunger = Math.max(0, s.hunger - dt * (wild ? 0.46 : 0.36) * drainScale * (sprint ? 1.35 : 1));
  s.thirst = Math.max(0, s.thirst - dt * (wild ? 0.60 : 0.48) * drainScale * (sprint ? 1.4 : 1));

  let deathReason = null;
  const drain = (amount, reason) => {
    s.health -= amount;
    if (s.health <= 0 && !deathReason) deathReason = reason;
  };

  if (s.hunger <= 0) drain(dt * 2.6 * Math.max(0.35, drainScale), 'Starved to death');
  if (s.thirst <= 0) drain(dt * 3.2 * Math.max(0.35, drainScale), 'Died of dehydration');

  const radMult = s.radResistMult ?? 1;
  const geigerRate = ambientRad * s.exposureMult * radMult * Math.max(0.35, drainScale);
  s.radiation += geigerRate * dt;
  if (s.radiation > 60) drain(dt * ((s.radiation - 60) / 14), 'Acute radiation sickness');

  if (phase === 'winter') {
    const coldMult = s.coldMult ?? 1;
    if (nearFire) s.warmth = Math.min(100, s.warmth + dt * 12);
    else s.warmth = Math.max(0, s.warmth - dt * (sprint ? 0.75 : 1.0) * coldMult * Math.max(0.4, drainScale));
    if (s.warmth <= 0) drain(dt * 3.0 * Math.max(0.35, drainScale), 'Froze to death in the nuclear winter');
  }

  if (s.hunger > 80 && s.thirst > 80 && s.radiation < 20 && s.health < 100 && s.warmth > 35) {
    s.health = Math.min(100, s.health + dt * 0.14);
  }

  return { stats: s, geigerRate, deathReason };
}

export function computeFallDamage(impactSpeed) {
  if (!Number.isFinite(impactSpeed) || impactSpeed <= 13.5) return 0;
  return Math.min(100, Math.round((impactSpeed - 13.5) * 4.8));
}

export function computeGrenadeFalloff(dist, radius = 9.5, maxDamage = 140) {
  if (!Number.isFinite(dist) || dist >= radius || dist < 0) return 0;
  return maxDamage * (1 - dist / radius);
}

export function computeScopeFov(weaponId, scoped, zoomStep = 0) {
  if (!scoped || weaponId === 'fists' || weaponId === 'grenade') {
    return { fov: 72, spreadMult: 1, sensMult: 1, zoomLabel: '1.0x' };
  }
  if (weaponId === 'sniper') {
    if (zoomStep >= 1) {
      return { fov: 9, spreadMult: 0.035, sensMult: 0.2, zoomLabel: '10x' };
    }
    return { fov: 14, spreadMult: 0.06, sensMult: 0.28, zoomLabel: '6x' };
  }
  if (weaponId === 'rifle') {
    if (zoomStep >= 1) {
      return { fov: 24, spreadMult: 0.28, sensMult: 0.62, zoomLabel: '3.0x' };
    }
    return { fov: 32, spreadMult: 0.36, sensMult: 0.74, zoomLabel: '2.25x' };
  }
  if (weaponId === 'pistol') {
    return { fov: 48, spreadMult: 0.48, sensMult: 0.86, zoomLabel: '1.5x' };
  }
  return { fov: 52, spreadMult: 0.72, sensMult: 0.88, zoomLabel: '1.4x' };
}

// Aim-assist cone widens with distance so distant silhouettes are easier to track and hit.
export function aimAssistCone(distance) {
  const d = Math.max(0, Number.isFinite(distance) ? distance : 0);
  return 0.045 + Math.min(0.1, d * 0.00085);
}

export function computeRagdollImpulse(hitDir = null, damage = 30, isHead = false) {
  const dx = hitDir?.x ?? 0;
  const dz = hitDir?.z ?? 0;
  const len = Math.hypot(dx, dz) || 1;
  const nx = hitDir ? dx / len : 0;
  const nz = hitDir ? dz / len : -1;
  const mag = Math.min(8.5, 2.2 + damage * 0.045) * (isHead ? 1.25 : 1);
  return {
    vx: nx * mag,
    vy: Math.min(3.4, 1.0 + damage * 0.015),
    vz: nz * mag,
    nx,
    nz,
    headSnap: isHead ? 1.25 : 0.55,
  };
}

export function applyBunkerSupplyBonus(stats, tier = 'public') {
  const s = cloneStats(stats);
  s.bunkerTier = tier === 'military' || tier === 'tunnel' ? tier : 'public';
  if (s.bunkerTier === 'military') {
    s.food += 6;
    s.water += 6;
    s.meds += 4;
    s.radpills += 4;
    s.grenades = (s.grenades ?? 0) + 4;
    s.ammo.rifle += 90;
    s.ammo.shotgun += 24;
    s.ammo.pistol += 36;
    if (!s.weapons.includes('rifle')) s.weapons.push('rifle');
    s.coldMult = Math.min(s.coldMult ?? 1, 0.45);
  } else if (s.bunkerTier === 'tunnel') {
    s.food += 4;
    s.water += 4;
    s.meds += 3;
    s.radpills += 3;
    s.grenades = (s.grenades ?? 0) + 3;
    s.ammo.rifle += 72;
    s.ammo.shotgun += 24;
    s.ammo.pistol += 36;
    if (!s.weapons.includes('rifle')) s.weapons.push('rifle');
    s.coldMult = Math.min(s.coldMult ?? 1, 0.65);
  } else {
    s.food += 2;
    s.water += 3;
    s.meds += 1;
    s.radpills += 1;
    s.grenades = (s.grenades ?? 0) + 1;
    s.ammo.pistol += 24;
    s.ammo.shotgun += 12;
    s.coldMult = s.coldMult ?? 1;
  }
  return s;
}

export function stepShelterDay(stats, currentDay, rng = Math.random) {
  const nd = currentDay + 1;
  const n = cloneStats(stats);
  const fortified = n.bunkerTier === 'military' || n.bunkerTier === 'tunnel';
  const drainScale = difficultyMods(n).survivalDrain;
  n.hunger = Math.max(0, n.hunger - 22 * drainScale);
  n.thirst = Math.max(0, n.thirst - 26 * drainScale);
  n.radiation += doseRate(nd) * 24 * (fortified ? 0.004 : 0.011) * (n.radResistMult ?? 1);
  if (n.hunger <= 0) n.health -= 18;
  if (n.thirst <= 0) n.health -= 25;
  if (n.hunger > 40 && n.thirst > 40 && n.radiation < 50) {
    n.health = Math.min(100, n.health + (fortified ? 20 : 12));
  }
  if (n.radiation > 70) n.health -= (n.radiation - 70) * 0.6;

  const r = rng();
  const events = [];
  if (nd === 1) {
    events.push({ text: 'Radio: "...multiple strikes confirmed nationwide. Stay underground for at least two weeks..."', tone: 'radio' });
  } else if (nd === 4) {
    events.push({ text: 'Radio: "Evacuation checkpoint operating on Highway 9, north of the city."', tone: 'radio' });
  } else if (!fortified && r < 0.12 && n.food > 0) {
    n.food--;
    events.push({ text: 'Rats chewed through a ration can in the pantry. (-1 food)', tone: 'alert' });
  } else if (!fortified && r < 0.22) {
    n.radiation += 6;
    events.push({ text: 'Air filter clogged with fallout dust. (+6 rads)', tone: 'alert' });
  } else if (r < 0.34) {
    n.food += 1;
    n.water += 1;
    n.ammo.pistol += 12;
    events.push({ text: 'Found a sealed civil-defense locker behind wall panels! (+1 food, +1 water, +12 9mm)', tone: 'loot' });
  } else if (r < 0.42 && n.water > 0) {
    n.water--;
    n.meds++;
    events.push({ text: 'Traded a water jug through the airlock slot for a medkit. (-1 water, +1 medkit)', tone: 'info' });
  } else if (r < 0.5) {
    events.push({ text: 'Distant shockwaves rumble through the bedrock above.', tone: 'info' });
  }

  n.shelterDays = nd;
  n.exposureMult = falloutExposureMult(nd);
  let deadReason = null;
  if (n.health <= 0) {
    n.health = 0;
    deadReason = n.thirst <= 0 ? 'You died of thirst in the bunker.' : n.hunger <= 0 ? 'You starved in the bunker.' : 'Radiation sickness took you underground.';
  }
  return { stats: n, day: nd, events, deadReason };
}
