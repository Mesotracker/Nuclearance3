export const WEAPONS = {
  fists: { id: 'fists', name: 'Fists', damage: 22, range: 2.5, rate: 0.32, mag: 0, pellets: 1, spread: 0, auto: false, reload: 0 },
  pistol: { id: 'pistol', name: '9mm Pistol', damage: 36, range: 75, rate: 0.13, mag: 15, pellets: 1, spread: 0.011, auto: false, reload: 0.82 },
  shotgun: { id: 'shotgun', name: 'Pump Shotgun', damage: 17, range: 30, rate: 0.44, mag: 8, pellets: 9, spread: 0.068, auto: false, reload: 1.15 },
  rifle: { id: 'rifle', name: 'AR-15 Rifle', damage: 42, range: 145, rate: 0.07, mag: 36, pellets: 1, spread: 0.016, auto: true, reload: 1.0 },
  grenade: { id: 'grenade', name: 'Frag Grenade', damage: 140, range: 9.5, rate: 0.45, mag: 1, pellets: 0, spread: 0, auto: false, reload: 0 },
};

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
    health: 100,
    hunger: 85,
    thirst: 85,
    radiation: 0,
    warmth: 100,
    food: 0,
    water: 1,
    meds: 0,
    radpills: 0,
    grenades: 2,
    ammo: { pistol: 12, shotgun: 0, rifle: 0 },
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
    base.ammo.pistol = 30;
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
