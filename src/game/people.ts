import { Rng, hashString } from '../engine/rng';
import {
  FIRST_NAMES,
  HAIR_COLORS,
  HAIR_STYLES,
  LAST_NAMES,
  PANTS_COLORS,
  SHIRT_COLORS,
  SKIN_TONES,
} from './data/people';
import type { Appearance, Applicant, Staff, StaffRole } from './types';

/** Build a stable appearance from any seed string. */
export function appearanceFrom(seed: string): Appearance {
  const r = new Rng(hashString(seed));
  return {
    skin: r.pick(SKIN_TONES),
    hair: r.pick(HAIR_COLORS),
    hairStyle: r.pick(HAIR_STYLES),
    shirt: r.pick(SHIRT_COLORS),
    pants: r.pick(PANTS_COLORS),
    build: r.range(0.9, 1.1),
  };
}

export function randomName(r: Rng): string {
  return `${r.pick(FIRST_NAMES)} ${r.pick(LAST_NAMES)}`;
}

/**
 * Applicants are drawn with one clear speciality so the player has a reason to
 * prefer one over another, and the hiring fee scales with that speciality.
 */
export function makeApplicant(id: number, level: number, r: Rng): Applicant {
  const roles: StaffRole[] = ['waiter', 'chef', 'cleaner'];
  const speciality = r.pick(roles);
  const ceiling = Math.min(7, 2 + Math.floor(level / 2));

  const skills: Record<StaffRole, number> = { waiter: 1, chef: 1, cleaner: 1 };
  for (const role of roles) {
    skills[role] = r.int(1, Math.max(2, ceiling - 1));
  }
  skills[speciality] = r.int(2, ceiling + 1);

  const best = Math.max(skills.waiter, skills.chef, skills.cleaner);
  const total = skills.waiter + skills.chef + skills.cleaner;
  return {
    id,
    name: randomName(r),
    look: appearanceFrom(`applicant-${id}-${level}`),
    skills,
    wage: 18 + total * 9 + best * 6,
    fee: 220 + total * 90 + best * 70,
  };
}

export function hireApplicant(
  applicant: Applicant,
  role: StaffRole,
  now: number,
  spawn: { tx: number; ty: number },
): Staff {
  return {
    id: applicant.id,
    name: applicant.name,
    role,
    look: applicant.look,
    skills: { ...applicant.skills },
    energy: 100,
    wage: applicant.wage,
    state: 'idle',
    tx: spawn.tx,
    ty: spawn.ty,
    path: [],
    timer: 0,
    targetCustomerId: null,
    targetOrderId: null,
    targetUid: null,
    carryDishId: null,
    hiredAt: now,
  };
}

/** Cost to raise a skill from `current` to `current + 1`. */
export function trainingCost(current: number): number {
  return Math.round(320 * Math.pow(1.62, current - 1));
}

export const MAX_SKILL = 10;

/** Effective skill of a staff member at the job they are assigned to. */
export function effectiveSkill(staff: Staff): number {
  return staff.skills[staff.role];
}

/**
 * Skill 1 is baseline; skill 10 is roughly 2.6x faster. Tired staff slow down
 * before they stop entirely, which gives the player a visible warning.
 */
export function workSpeed(staff: Staff): number {
  const skill = 1 + (effectiveSkill(staff) - 1) * 0.18;
  const fatigue = staff.energy < 25 ? 0.55 + (staff.energy / 25) * 0.45 : 1;
  return skill * fatigue;
}

/** Coins to instantly refill a staff member's energy. */
export function mealCost(staff: Staff): number {
  return Math.max(15, Math.round((100 - staff.energy) * 1.8));
}
