export const WEAPONS = {
  fists: { id: 'fists', name: 'Fists', damage: 26, range: 2.5, rate: 0.32, mag: 0, pellets: 1, spread: 0, auto: false, reload: 0 },
  pistol: { id: 'pistol', name: '9mm Pistol', damage: 40, range: 75, rate: 0.13, mag: 15, pellets: 1, spread: 0.006, auto: false, reload: 0.82 },
  shotgun: { id: 'shotgun', name: 'Pump Shotgun', damage: 20, range: 30, rate: 0.44, mag: 8, pellets: 9, spread: 0.048, auto: false, reload: 1.15 },
  rifle: { id: 'rifle', name: 'AR-15 Rifle', damage: 46, range: 145, rate: 0.07, mag: 36, pellets: 1, spread: 0.007, auto: true, reload: 1.0 },
  sniper: { id: 'sniper', name: 'M24 Sniper Rifle', damage: 135, range: 420, rate: 1.15, mag: 5, pellets: 1, spread: 0.0015, auto: false, reload: 2.15 },
  grenade: { id: 'grenade', name: 'Frag Grenade', damage: 140, range: 9.5, rate: 0.45, mag: 1, pellets: 0, spread: 0, auto: false, reload: 0 },
};

export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    name: 'Easy',
    label: 'EASY',
    blurb: 'Half damage taken, soft aim from enemies, generous supplies',
    incomingDamage: 0.5,
    enemyHealth: 0.75,
    enemyAccuracy: 0.68,
    enemyFireRate: 1.6,
    playerDamage: 1.25,
    spread: 0.78,
    survivalDrain: 0.6,
    spawnRate: 1.7,
  },
  normal: {
    id: 'normal',
    name: 'Normal',
    label: 'NORMAL',
    blurb: 'Balanced wasteland — tuned friendlier than before',
    incomingDamage: 0.8,
    enemyHealth: 0.9,
    enemyAccuracy: 0.85,
    enemyFireRate: 1.2,
    playerDamage: 1.1,
    spread: 0.9,
    survivalDrain: 0.85,
    spawnRate: 1.3,
  },
  hard: {
    id: 'hard',
    name: 'Hard',
    label: 'HARD',
    blurb: 'Deadly patrols, scarce supplies, unforgiving fallout',
    incomingDamage: 1.5,
    enemyHealth: 1.3,
    enemyAccuracy: 1.15,
    enemyFireRate: 0.8,
    playerDamage: 0.9,
    spread: 1.15,
    survivalDrain: 1.35,
    spawnRate: 0.7,
  },
};

export function difficultyMods(statsOrId) {
  const id = typeof statsOrId === 'string' ? statsOrId : statsOrId?.difficulty;
  return DIFFICULTIES[id] || DIFFICULTIES.normal;
}

export const CLASSES = {
  scavenger: {
    id: 'scavenger',
    name: 'Scavenger',
    role: 'Looter & Rad-Shield',
    perk: 'Scavenger Instinct (+35% ammo yield, +15% rad resist)',
    kit: '$140 cash · 2 water · Rad-Skin',
    color: '#f59e0b',
  },
  trooper: {
    id: 'trooper',
    name: 'Shock Trooper',
    role: 'Heavy Arms & Breach',
    perk: 'Hollow Points (+15% dmg, -15% reload time)',
    kit: '9mm Pistol (30 rds) · +1 Frag Grenade',
    color: '#ef4444',
  },
  medic: {
    id: 'medic',
    name: 'Field Medic',
    role: 'Trauma & Hazmat',
    perk: 'Triage (+30% heal & Rad-X potency)',
    kit: '3 Medkits · 3 Rad-X · $75',
    color: '#10b981',
  },
  recon: {
    id: 'recon',
    name: 'Recon Marksman',
    role: 'Precision & Mobility',
    perk: 'Deadeye (-25% spread, +10% speed, +30% XP)',
    kit: '2 Extra Grenades · $110 · Fast Recon',
    color: '#38bdf8',
  },
};

export function freshStats(classId = 'scavenger') {
  const cid = CLASSES[classId] ? classId : 'scavenger';
  const base = {
    classId: cid,
    perkName: CLASSES[cid].perk.split(' (')[0],
    difficulty: 'normal',
    health: 100,
    hunger: 85,
    thirst: 85,
    radiation: 0,
    warmth: 100,
    food: 2,
    water: 2,
    meds: 1,
    radpills: 1,
    grenades: 2,
    ammo: { pistol: 24, shotgun: 0, rifle: 0, sniper: 0 },
    weapons: ['fists'],
    cash: 40,
    crimes: 0,
    kills: 0,
    storesRobbed: 0,
    shelterDays: 0,
    exposureMult: 1,
    coldMult: 1,
    bunkerTier: 'public',
    xp: 0,
    level: 1,
    xpToNext: 100,
    damageMult: 1,
    reloadMult: 1,
    spreadMult: 1,
    ammoYieldMult: 1,
    healMult: 1,
    radResistMult: 1,
    moveSpeedMult: 1,
    xpMult: 1,
    hacksCompleted: 0,
    questsCompleted: 0,
  };

  if (cid === 'scavenger') {
    base.cash = 140;
    base.water = 2;
    base.ammoYieldMult = 1.35;
    base.radResistMult = 0.85;
  } else if (cid === 'trooper') {
    base.weapons = ['fists', 'pistol'];
    base.ammo.pistol = 42;
    base.grenades = 3;
    base.damageMult = 1.15;
    base.reloadMult = 0.85;
  } else if (cid === 'medic') {
    base.meds = 3;
    base.radpills = 3;
    base.cash = 75;
    base.healMult = 1.3;
    base.radResistMult = 0.9;
  } else if (cid === 'recon') {
    base.cash = 110;
    base.grenades = 4;
    base.spreadMult = 0.75;
    base.moveSpeedMult = 1.1;
    base.xpMult = 1.3;
  }

  return base;
}

export function cloneStats(s) {
  return { ...s, ammo: { ...s.ammo }, weapons: [...s.weapons] };
}
