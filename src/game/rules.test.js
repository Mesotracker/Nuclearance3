import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, WEAPONS, freshStats } from './types.js';
import {
  aimAssistCone,
  applyBunkerSupplyBonus,
  calculateScore,
  clampDeltaTime,
  computeFallDamage,
  computeGrenadeFalloff,
  computeObjectiveBearing,
  computeRagdollImpulse,
  computeScopeFov,
  computeWeaponStats,
  doseRate,
  falloutExposureMult,
  generateAmmoDrop,
  grantXp,
  resolveTerminalHack,
  stepShelterDay,
  stepSurvivalStats,
} from './rules.js';

test('7-10 fallout rule decays over shelter days', () => {
  const day0 = doseRate(0.05);
  const day1 = doseRate(1);
  const day14 = doseRate(14);
  assert.ok(day0 > day1);
  assert.ok(day1 > day14);
  assert.ok(falloutExposureMult(0.05) > falloutExposureMult(14));
  assert.equal(falloutExposureMult(14) >= 0.7, true);
});

test('clampDeltaTime caps large spikes and rejects invalid dt', () => {
  assert.equal(clampDeltaTime(0.016), 0.016);
  assert.equal(clampDeltaTime(1.5), 0.05);
  assert.equal(clampDeltaTime(-0.1), 0);
  assert.equal(clampDeltaTime(Number.NaN), 0);
});

test('computeObjectiveBearing computes zero relative bearing when facing target', () => {
  const { dist, bearing } = computeObjectiveBearing(0, 0, 0, 0, -100);
  assert.equal(dist, 100);
  assert.ok(Math.abs(bearing) < 1e-6);
});

test('stepSurvivalStats warms near fire, cools away from fire, and applies radResistMult', () => {
  const base = freshStats('scavenger');
  base.warmth = 50;
  const warmed = stepSurvivalStats(base, {
    dt: 1,
    phase: 'winter',
    sprint: false,
    ambientRad: 0.02,
    nearFire: true,
  });
  assert.ok(warmed.stats.warmth > 50);

  const chilled = stepSurvivalStats(base, {
    dt: 1,
    phase: 'winter',
    sprint: false,
    ambientRad: 0.02,
    nearFire: false,
  });
  assert.ok(chilled.stats.warmth < 50);

  const trooper = stepSurvivalStats(freshStats('trooper'), {
    dt: 2,
    phase: 'wilderness',
    sprint: false,
    ambientRad: 1,
    nearFire: false,
  });
  const scav = stepSurvivalStats(freshStats('scavenger'), {
    dt: 2,
    phase: 'wilderness',
    sprint: false,
    ambientRad: 1,
    nearFire: false,
  });
  assert.ok(scav.stats.radiation < trooper.stats.radiation);

  const inBunker = stepSurvivalStats(base, {
    dt: 10,
    phase: 'shelter',
    sprint: false,
    ambientRad: 0,
    nearFire: false,
  });
  assert.ok(inBunker.stats.hunger < base.hunger);
  assert.ok(inBunker.stats.thirst < base.thirst);

  const inCity = stepSurvivalStats(base, {
    dt: 5,
    phase: 'city',
    sprint: false,
    ambientRad: 0,
    nearFire: false,
  });
  assert.ok(inCity.stats.hunger <= base.hunger - 1.5);
  assert.ok(inCity.stats.thirst <= base.thirst - 2.0);
});

test('computeGrenadeFalloff deals scaled blast damage within radius', () => {
  assert.equal(computeGrenadeFalloff(0, 9.5, 140), 140);
  assert.ok(computeGrenadeFalloff(4.75, 9.5, 140) > 65);
  assert.equal(computeGrenadeFalloff(9.5, 9.5, 140), 0);
  assert.equal(computeGrenadeFalloff(15, 9.5, 140), 0);
});

test('applyBunkerSupplyBonus stocks military and tunnel bunkers better than public shelter', () => {
  const pub = applyBunkerSupplyBonus(freshStats(), 'public');
  const tun = applyBunkerSupplyBonus(freshStats(), 'tunnel');
  const mil = applyBunkerSupplyBonus(freshStats(), 'military');
  assert.ok(mil.food > tun.food && tun.food > pub.food);
  assert.ok(mil.water > pub.water);
  assert.ok(mil.meds > pub.meds);
  assert.ok(mil.grenades > pub.grenades);
  assert.ok(tun.weapons.includes('rifle'));
  assert.ok(mil.weapons.includes('rifle'));
  assert.ok(mil.coldMult < tun.coldMult && tun.coldMult < pub.coldMult);
});

test('stepShelterDay advances day, drains hunger/thirst, and applies HEPA shielding', () => {
  const pub = applyBunkerSupplyBonus(freshStats('trooper'), 'public');
  const mil = applyBunkerSupplyBonus(freshStats('trooper'), 'military');
  const resPub = stepShelterDay(pub, 0, () => 0.99);
  const resMil = stepShelterDay(mil, 0, () => 0.99);
  assert.equal(resPub.day, 1);
  assert.equal(resPub.stats.shelterDays, 1);
  assert.ok(resPub.stats.hunger < pub.hunger);
  assert.ok(resPub.stats.thirst < pub.thirst);
  assert.ok(resMil.stats.radiation < resPub.stats.radiation);
  assert.equal(resPub.events.length, 1);
});

test('RPG classes, XP level-up, weapon scaling, terminal hacks, and ammo drops work cleanly', () => {
  assert.ok(Object.keys(CLASSES).length === 4);
  const trooper = freshStats('trooper');
  const recon = freshStats('recon');
  assert.ok(trooper.weapons.includes('pistol'));
  assert.ok(computeWeaponStats('rifle', trooper).damage > WEAPONS.rifle.damage);
  assert.ok(computeWeaponStats('rifle', trooper).reloadTime < WEAPONS.rifle.reload);
  assert.ok(computeWeaponStats('rifle', recon).spread < WEAPONS.rifle.spread);

  const { stats: lv2, leveledUp, newLevel, gainedXp } = grantXp(recon, 90);
  assert.equal(gainedXp, 117); // 90 * 1.3 recon XP bonus
  assert.equal(leveledUp, true);
  assert.equal(newLevel, 2);
  assert.ok(lv2.damageMult > recon.damageMult);

  const scavDrop = generateAmmoDrop('raider', freshStats('scavenger'), () => 0.1);
  const medDrop = generateAmmoDrop('raider', freshStats('medic'), () => 0.1);
  assert.ok(scavDrop.amount > medDrop.amount);

  const silentHack = resolveTerminalHack(lv2, 'overclock');
  assert.equal(silentHack.alertTriggered, false);
  assert.ok(silentHack.bonusRifle > 0);
});

test('weapons have fast responsive fire rates and larger magazines', () => {
  assert.ok(WEAPONS.pistol.rate <= 0.15);
  assert.ok(WEAPONS.shotgun.rate <= 0.5);
  assert.ok(WEAPONS.rifle.rate <= 0.08);
  assert.ok(WEAPONS.rifle.mag >= 36);
});

test('computeScopeFov and computeRagdollImpulse scale ADS optics and knockback accurately', () => {
  const hip = computeScopeFov('rifle', false);
  const ads = computeScopeFov('rifle', true, 0);
  const ads3x = computeScopeFov('rifle', true, 1);
  const fistsAds = computeScopeFov('fists', true);
  assert.equal(hip.fov, 72);
  assert.equal(ads.fov, 32);
  assert.equal(ads3x.fov, 24);
  assert.ok(ads.spreadMult < hip.spreadMult);
  assert.ok(ads.sensMult < hip.sensMult && ads.sensMult >= 0.7);
  assert.equal(fistsAds.fov, 72);

  const bodyHit = computeRagdollImpulse({ x: 3, z: 4 }, 42, false);
  const headHit = computeRagdollImpulse({ x: 3, z: 4 }, 90, true);
  assert.ok(Math.abs(bodyHit.nx - 0.6) < 1e-6);
  assert.ok(Math.abs(bodyHit.nz - 0.8) < 1e-6);
  assert.ok(headHit.headSnap > bodyHit.headSnap);
  assert.ok(Math.hypot(headHit.vx, headHit.vz) > Math.hypot(bodyHit.vx, bodyHit.vz));
});

test('M24 sniper is a high-damage long-range optic platform', () => {
  assert.ok(WEAPONS.sniper.damage > WEAPONS.rifle.damage);
  assert.ok(WEAPONS.sniper.range > WEAPONS.rifle.range);
  assert.ok(WEAPONS.sniper.mag <= 5);
  assert.equal(freshStats().ammo.sniper, 0);

  const rifleAds = computeScopeFov('rifle', true, 0);
  const sniper6x = computeScopeFov('sniper', true, 0);
  const sniper10x = computeScopeFov('sniper', true, 1);
  assert.ok(sniper6x.fov < rifleAds.fov);
  assert.ok(sniper10x.fov < sniper6x.fov);
  assert.ok(sniper10x.spreadMult < sniper6x.spreadMult);
  assert.ok(sniper10x.sensMult < sniper6x.sensMult);

  // Aim assist widens at distance but stays tighter than a very wide spray cone
  assert.ok(aimAssistCone(120) > aimAssistCone(5));
  assert.ok(aimAssistCone(1000) <= 0.15);
});

test('calculateScore rewards kills, cash, survival health, and low radiation', () => {
  const s = freshStats();
  s.kills = 4;
  s.crimes = 2;
  s.storesRobbed = 1;
  s.cash = 200;
  s.radiation = 20;
  s.health = 90;
  // 40 + 30 + 50 + 20 + 240 + 180 = 560
  assert.equal(calculateScore(s), 560);
});

test('computeFallDamage and starvation/dehydration visibly lower health', () => {
  assert.equal(computeFallDamage(8), 0);
  assert.equal(computeFallDamage(13.5), 0);
  assert.ok(computeFallDamage(18) >= 20);
  assert.equal(computeFallDamage(40), 100);

  const starving = freshStats('scavenger');
  starving.hunger = 0;
  starving.thirst = 0;
  const res = stepSurvivalStats(starving, {
    dt: 2,
    phase: 'wilderness',
    sprint: false,
    ambientRad: 0,
    nearFire: false,
  });
  assert.ok(res.stats.health <= starving.health - 9);
});

