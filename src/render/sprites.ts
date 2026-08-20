/**
 * The people sheet, as sprites, plus the small 2D icons the shop lists use.
 *
 * The approved drawing is a cast of rounded toys: a big squoval head about as
 * tall as the body under it, a soft barrel of a chest, stubby capsule limbs with
 * nubs for hands and feet, no elbow or knee anywhere, one bold warm line round
 * every silhouette. Three of them are staff — a chef in a toque with a
 * moustache, a waiter in a sky-blue waistcoat and a peaked cap with a D on it,
 * a cleaner in a mint apron and headscarf — and the rest are guests, who between
 * them wear a flower, a flat cap, a hood, a scarf and a striped shirt.
 *
 * Everything is assembled in the figure's own frame rather than mirrored, so the
 * two facings that look away really do show the back of a head, and every piece
 * of detail is painted on the surface of the part it belongs to.
 */

import { lerp, TILE_H, TILE_W, TILE_Z, type Facing } from '../engine/iso';
import { hashString } from '../engine/rng';
import type { Dish } from '../game/data/dishes';
import type { Ingredient } from '../game/data/ingredients';
import type { Appearance } from '../game/types';
import { inkOf, LINE, SHEET } from './art';
import { drawTray } from './plates';
import {
  isoCylinder,
  mix,
  roundRect,
  shade,
  softShadow,
  softVolume,
  withAlpha,
  type RoundedVolume,
} from './shapes';

/** Overall figure scale, on top of each character's own build. */
const PERSON_SCALE = 1.1;

export interface PersonOptions {
  facing: Facing;
  /** Seconds; drives the walk cycle and idle breathing. */
  time: number;
  walking: boolean;
  sitting: boolean;
  /** Overrides the shirt colour, for staff uniforms. */
  uniform?: { shirt: string; trim: string };
  /** Job, which decides the headgear and trimmings that name it at a glance. */
  role?: 'waiter' | 'chef' | 'cleaner';
  /** Dish carried on a tray. */
  carrying?: Dish | null;
  /** Small prop in hand. */
  prop?: 'notepad' | 'cloth' | 'pan' | null;
  /** Out of energy: the figure slumps instead of standing to attention. */
  exhausted?: boolean;
  /** Fade the whole figure. */
  alpha?: number;
}

/** One of the two faces of a box the camera can see. */
type Plane = 'left' | 'right';

/**
 * Which way a figure is turned, said in the terms its body is built from: the
 * grid axis it faces, the axis across its shoulders — always chosen to point at
 * the camera, so "near arm" needs no special case per facing — and which of a
 * box's two visible faces its front and back land on.
 */
interface Frame {
  fwd: readonly [number, number];
  side: readonly [number, number];
  /** Null on the two facings where the figure has its back to the camera. */
  front: Plane | null;
  /** Set instead of `front` on those two facings. */
  back: Plane | null;
  /** The flank towards the camera, in view whichever way the figure is turned. */
  flank: Plane;
}

const FRAMES: Record<Facing, Frame> = {
  se: { fwd: [1, 0], side: [0, 1], front: 'right', back: null, flank: 'left' },
  sw: { fwd: [0, 1], side: [1, 0], front: 'left', back: null, flank: 'right' },
  ne: { fwd: [0, -1], side: [1, 0], front: null, back: 'left', flank: 'right' },
  nw: { fwd: [-1, 0], side: [0, 1], front: null, back: 'right', flank: 'left' },
};

interface Figure extends Frame {
  ctx: CanvasRenderingContext2D;
  /** Centre of the tile the figure is standing on. */
  cx: number;
  cy: number;
  /** Build scale, applied to every measurement below. */
  s: number;
}

/**
 * One rounded piece of a body, in the figure's own frame: `u` runs across the
 * body towards the camera, `v` runs the way the figure faces, `y` is the lift off
 * the floor and `h` the height. `r` is the half width at the base and `rTop` at
 * the top, so a single piece can be a pill, a barrel or a bell. Tile units,
 * before the build scale, exactly like the furniture.
 */
interface Part {
  u: number;
  v: number;
  y: number;
  h: number;
  r: number;
  rTop?: number;
  roundTop?: number;
  roundBottom?: number;
  bulge?: number;
}

/** Where a point in the figure's frame lands on screen. */
function spot(f: Figure, u: number, v: number, y = 0): { x: number; y: number } {
  const gx = (f.side[0] * u + f.fwd[0] * v) * f.s;
  const gy = (f.side[1] * u + f.fwd[1] * v) * f.s;
  return {
    x: f.cx + (gx - gy) * (TILE_W / 2),
    y: f.cy + (gx + gy) * (TILE_H / 2) - y * f.s * TILE_Z,
  };
}

/** Where a part lands on screen, in the terms the shape helpers paint in. */
function volumeOf(f: Figure, p: Part): RoundedVolume {
  const at = spot(f, p.u, p.v);
  const bottom = at.y - p.y * f.s * TILE_Z;
  const across = (r: number): number => (TILE_W / 2) * r * f.s;
  return {
    cx: at.x,
    bottom,
    top: bottom - p.h * f.s * TILE_Z,
    half: across(p.r),
    halfTop: across(p.rTop ?? p.r),
    roundTop: p.roundTop,
    roundBottom: p.roundBottom,
    bulge: across(p.bulge ?? 0),
  };
}

/**
 * One rounded body part: soft ramp, lit crown, shaded flank, and the sheet's
 * bold warm line round the silhouette.
 */
function paint(
  f: Figure,
  p: Part,
  base: string,
  opts: { light?: number; outline?: string } = {},
): void {
  softVolume(f.ctx, volumeOf(f, p), base, {
    line: LINE * f.s,
    light: opts.light,
    outline: opts.outline ?? inkOf(base),
  });
}

/** A stubby capsule with a nub of an end: the shape every limb is made of. */
function pill(u: number, v: number, y: number, h: number, r: number): Part {
  return { u, v, y, h, r, rTop: r * 0.94, roundTop: 0.9, roundBottom: 0.9, bulge: r * 0.14 };
}

/**
 * A local frame laid on the surface of a rounded part: the origin sits `out`
 * tiles in front of its axis, `up` of the way up it; local x runs across the
 * surface, local y straight down the screen, and the whole frame is sheared with
 * the facing. A face or a row of buttons painted here leans with the body it
 * belongs to instead of floating flat across the front of the figure — which is
 * the whole difference between a painted face and a decal.
 *
 * The part's half width at that height and its full height come back to the
 * caller, so a feature can be sized against the piece it sits on.
 */
function onSurface(
  f: Figure,
  p: Part,
  which: Plane | null,
  out: number,
  up: number,
  paintOn: (half: number, height: number) => void,
): void {
  if (!which) return;
  const at = spot(f, p.u, p.v + out, p.y + p.h * up);
  const half = (TILE_W / 2) * lerp(p.r, p.rTop ?? p.r, up) * f.s;
  const { ctx } = f;
  ctx.save();
  ctx.transform(1, which === 'right' ? -0.5 : 0.5, 0, 1, at.x, at.y);
  paintOn(half, p.h * f.s * TILE_Z);
  ctx.restore();
}

/**
 * Lift of the hips, which every other measurement hangs off. Seats in this game
 * stand half a tile-height off the floor, which on a body this short is already
 * hip height — so sitting down folds the legs up rather than lowering the head.
 */
const HIP_STAND = 0.28;
const HIP_SIT = 0.4;
/** How far the legs and the arms sit either side of the middle. */
const LEG_U = 0.115;
const ARM_U = 0.3;
/** Shoe leather, which every foot and every seated ankle is painted in. */
const SHOE = '#42332a';

/** What one guest wears that the staff never do. */
type GuestExtra = 'flower' | 'scarf' | 'flatCap' | 'hood' | 'moustache' | null;

/**
 * Which of the sheet's guests this appearance is. Derived from the colours a
 * save already holds rather than from a new field, so nothing migrates: the same
 * walk-in always turns up in the same hat.
 */
function guestExtra(look: Appearance): GuestExtra {
  if (look.hairStyle === 'bald') return 'moustache';
  const pick = hashString(look.shirt + look.pants + look.hairStyle) % 5;
  if (pick === 0) return look.hairStyle === 'short' ? 'flatCap' : 'flower';
  if (pick === 1) return 'scarf';
  if (pick === 2) return 'hood';
  return null;
}

/** A striped shirt, which on the sheet is what the smallest guest wears. */
const wearsStripes = (look: Appearance): boolean => look.build < 0.97;

/**
 * Small deterministic variation so a crowd does not look cloned. Derived from
 * the existing colours rather than a stored field, so saves need no migration.
 */
function wearsGlasses(look: Appearance): boolean {
  return hashString(look.skin + look.hair + look.shirt) % 5 === 0;
}

/**
 * People are the rounded toys off the approved sheet. Every piece is a soft
 * capsule with a lit crown where the light catches the turn of it, a shaded
 * flank down the away side and one bold warm line round its silhouette — the
 * same three-tone ramp the furniture is lit with, so a figure standing on the
 * tiles belongs to the chair beside it rather than to a different game.
 *
 * Proportions are deliberately top-heavy — a squoval head about as tall as the
 * whole body under it, stubby pill limbs with nubs for hands and feet and no
 * elbow or knee anywhere — because that is what keeps a face readable when a
 * tile is 64px wide on a phone.
 */
export function drawPerson(
  ctx: CanvasRenderingContext2D,
  look: Appearance,
  cx: number,
  cy: number,
  opts: PersonOptions,
): void {
  const f: Figure = { ctx, cx, cy, s: look.build * PERSON_SCALE, ...FRAMES[opts.facing] };
  const shirt = opts.uniform?.shirt ?? look.shirt;
  const trim = opts.uniform?.trim ?? shade(shirt, 0.7);
  const extra = opts.role ? null : guestExtra(look);

  const stride = opts.walking ? Math.sin(opts.time * 9) : 0;
  // Breathing when still, a bounce when walking; either way the whole upper body
  // rides it, which is what stops a figure looking like it is sliding along.
  const bob = opts.walking
    ? Math.abs(Math.cos(opts.time * 9)) * 0.05
    : Math.sin(opts.time * 1.6) * 0.012;
  // Spent staff settle onto their hips and lean over their toes.
  const lean = opts.exhausted ? 0.05 : 0;
  const settle = opts.exhausted ? 0.05 : 0;
  const sway = opts.walking ? -stride * 0.015 : 0;
  const hip = (opts.sitting ? HIP_SIT : HIP_STAND) + bob - settle;

  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  // A small translucent disc on the floor, spreading as the figure lifts off,
  // which is what plants a rounded sprite on the tiles instead of over them.
  softShadow(ctx, cx, cy, (opts.sitting ? 0.3 : 0.34) + bob * 0.4, 0.2);

  drawLeg(f, look, -1, hip, stride, opts.sitting);
  drawLeg(f, look, 1, hip, stride, opts.sitting);
  drawArm(f, look, opts, -1, hip, stride, lean, shirt);
  drawTorso(f, look, opts, hip, lean, sway, shirt, trim, extra);
  drawHeadGroup(f, look, opts, hip, lean, sway, extra);
  const hand = drawArm(f, look, opts, 1, hip, stride, lean, shirt);
  drawHeld(f, opts, hand, extra);

  ctx.restore();
}

/**
 * One stubby leg with a nub of a foot. Standing, it is a single pill from the hip
 * to the floor with no knee in it, which is most of what separates a rounded toy
 * from a stack of boxes; seated, it folds forward off the chair.
 */
function drawLeg(
  f: Figure,
  look: Appearance,
  side: 1 | -1,
  hip: number,
  stride: number,
  sitting: boolean,
): void {
  const u = side * LEG_U;

  if (sitting) {
    // Shin dropped to the floor in front of the seat, then the thigh laid over
    // the top of it, so the fold reads without a hard joint showing.
    paint(f, pill(u, 0.26, 0.02, hip - 0.1, 0.1), look.pants);
    paint(f, pill(u, 0.3, 0, 0.085, 0.115), SHOE);
    paint(
      f,
      { u, v: 0.14, y: hip - 0.14, h: 0.17, r: 0.12, rTop: 0.115, roundTop: 0.9, roundBottom: 0.9, bulge: 0.02 },
      look.pants,
    );
    return;
  }

  const swing = side * stride;
  // The leading foot clears the tiles, so a stride is a step and not a shuffle.
  const raise = Math.max(0, swing) * 0.03;
  paint(f, pill(u, swing * 0.07, raise + 0.02, hip - raise + 0.03, 0.105), look.pants);
  paint(f, pill(u, swing * 0.1 + 0.05, raise, 0.085, 0.115), SHOE);
}

/**
 * One stubby arm with a nub of a hand, again a single pill so there is no elbow
 * to read. Returns the hand, so whatever is being carried can be placed on it
 * rather than near it.
 */
function drawArm(
  f: Figure,
  look: Appearance,
  opts: PersonOptions,
  side: 1 | -1,
  hip: number,
  stride: number,
  lean: number,
  shirt: string,
): Part {
  // Arms swing against the leg on the same side. The near arm is the one that
  // carries, so a tray is always on the side the camera can see.
  const swing = -side * stride;
  const carrying = side === 1 && !!opts.carrying;
  const u = side * ARM_U;

  if (carrying) {
    // The arm folds up and forward so the tray rides flat on the palm, out where
    // the plate on it can be seen rather than tucked against the chest.
    paint(f, pill(u * 0.96, 0.04, hip + 0.06, 0.28, 0.09), shirt);
    paint(f, pill(u * 0.92, 0.22, hip + 0.24, 0.18, 0.088), shirt);
    const hand = pill(u * 0.88, 0.3, hip + 0.4, 0.09, 0.1);
    paint(f, hand, look.skin);
    return hand;
  }

  // Seated, the hands come forward onto the table, which is most of what tells a
  // seated figure apart from one standing with its knees bent.
  const arm = opts.sitting
    ? pill(u * 0.96, 0.08, hip + 0.02, 0.3, 0.09)
    : pill(u, swing * 0.08 + lean * 0.6, hip + 0.02, 0.32, 0.09);
  const hand = opts.sitting
    ? pill(u * 0.9, 0.2, hip - 0.03, 0.1, 0.1)
    : pill(u, swing * 0.11 + lean * 0.6, hip - 0.08, 0.1, 0.1);

  paint(f, arm, shirt);
  // Staff work in long sleeves; guests turn up in short ones, so a bare forearm
  // shows below the cuff.
  if (!opts.role) paint(f, { ...arm, h: arm.h * 0.45, r: arm.r * 0.96, rTop: arm.r * 0.96 }, look.skin);
  paint(f, hand, look.skin);
  return hand;
}

/**
 * The body: one soft barrel a little wider at the shoulders than at the waist,
 * plus whatever the figure is wearing over it. Uniforms are garments with their
 * own thickness standing off the chest, not a pattern painted on it, so a
 * waistcoat still reads as worn from any angle.
 */
function drawTorso(
  f: Figure,
  look: Appearance,
  opts: PersonOptions,
  hip: number,
  lean: number,
  sway: number,
  shirt: string,
  trim: string,
  extra: GuestExtra,
): void {
  const { ctx } = f;
  const torso: Part = {
    u: sway,
    v: lean,
    y: hip - 0.05,
    h: 0.42,
    r: 0.225,
    rTop: 0.235,
    roundTop: 0.8,
    roundBottom: 0.5,
    bulge: 0.03,
  };

  paint(f, torso, shirt);
  // The sheet's smallest guest wears a striped tee. Bands painted on the surface
  // of the barrel wrap with it rather than sitting flat across the front.
  if (!opts.role && wearsStripes(look)) {
    onSurface(f, torso, f.front ?? f.back, f.front ? 0.16 : -0.16, 0.5, (half, height) => {
      ctx.save();
      ctx.globalAlpha *= 0.9;
      ctx.fillStyle = SHEET.cream;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.ellipse(0, i * height * 0.2, half * 0.94, height * 0.07, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }
  // Hem: the same body a shade wider and much shorter, so the shirt ends in a
  // band that wraps the figure whichever way it is turned.
  paint(
    f,
    { ...torso, y: hip - 0.06, h: 0.13, r: torso.r * 1.05, rTop: torso.r * 1.02, roundTop: 0.2, roundBottom: 0.8 },
    trim,
    { light: 0.7 },
  );
  // Collar at the throat, which does the same job at the other end.
  paint(
    f,
    { u: torso.u, v: torso.v, y: hip + 0.31, h: 0.08, r: 0.145, rTop: 0.12, roundTop: 0.6, roundBottom: 0.4 },
    trim,
    { light: 0.7 },
  );

  if (opts.role === 'chef') {
    // Neckerchief, knotted at the throat.
    paint(
      f,
      { u: torso.u, v: torso.v, y: hip + 0.29, h: 0.11, r: 0.175, rTop: 0.13, roundTop: 0.7, roundBottom: 0.5 },
      SHEET.tomato,
      { light: 0.7 },
    );
    onSurface(f, torso, f.front, 0.13, 0.55, (half, height) => {
      // Double-breasted buttons.
      ctx.fillStyle = '#d8cfbb';
      for (let i = -1; i <= 1; i++) {
        for (const dx of [-0.3, 0.3]) {
          ctx.beginPath();
          ctx.arc(dx * half, i * height * 0.19, 0.8 * f.s, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }

  if (opts.role === 'waiter' && f.front) {
    // Waistcoat: a rounded sky-blue panel standing off the chest, with its
    // buttons and a bow tie painted on its own face.
    const vest: Part = {
      u: torso.u,
      v: torso.v + 0.1,
      y: hip + 0.02,
      h: 0.3,
      r: 0.135,
      rTop: 0.15,
      roundTop: 0.7,
      roundBottom: 0.7,
      bulge: 0.012,
    };
    paint(f, vest, trim);
    onSurface(f, vest, f.front, 0.06, 0.5, (_half, height) => {
      ctx.fillStyle = 'rgba(255, 248, 232, 0.92)';
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.arc(0, height * (i * 0.26 - 0.06), 0.7 * f.s, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    onSurface(f, vest, f.front, 0.07, 1.02, () => {
      // Bow tie: two soft wings and a knot, all rounded, because nothing on a
      // figure in this game is allowed to be a hard-edged shape.
      const w = 2.3 * f.s;
      ctx.fillStyle = SHEET.ink;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * w * 0.72, 0, w * 0.78, w * 0.5, side * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.34, w * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  if (opts.uniform) {
    // Aprons: a bib for the kitchen and the cleaner, a short bistro apron for
    // the floor. Behind the figure there is nothing to see but the straps.
    const apronColour = opts.role === 'cleaner' ? SHEET.mint : '#f7f2e6';
    if (f.front) {
      const apron: Part = {
        u: 0,
        v: lean + 0.1,
        y: hip - 0.05,
        h: opts.role === 'waiter' ? 0.2 : 0.31,
        r: 0.155,
        rTop: 0.13,
        roundTop: 0.35,
        roundBottom: 0.6,
      };
      paint(f, apron, apronColour, { light: 0.7 });
      onSurface(f, apron, f.front, 0.05, 0.9, (half) => {
        ctx.strokeStyle = withAlpha(shade(apronColour, 0.66), 0.75);
        ctx.lineWidth = 0.9 * f.s;
        ctx.beginPath();
        ctx.moveTo(-half * 0.7, 0);
        ctx.lineTo(half * 0.7, 0);
        ctx.stroke();
      });
      // The cleaner keeps a cloth tucked into the apron, which is the one cue
      // that survives being seen from the far side of the room.
      if (opts.role === 'cleaner') {
        onSurface(f, apron, f.front, 0.06, 0.3, (half) => {
          ctx.fillStyle = SHEET.butter;
          ctx.beginPath();
          ctx.ellipse(half * 0.6, 0, 2.2 * f.s, 1.6 * f.s, 0.3, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    } else {
      onSurface(f, torso, f.back, -0.16, 0.5, (half, height) => {
        ctx.strokeStyle = 'rgba(240, 234, 220, 0.85)';
        ctx.lineWidth = 1.3 * f.s;
        ctx.beginPath();
        ctx.moveTo(-half * 0.5, -height * 0.3);
        ctx.lineTo(half * 0.5, height * 0.18);
        ctx.moveTo(half * 0.5, -height * 0.3);
        ctx.lineTo(-half * 0.5, height * 0.18);
        ctx.stroke();
      });
    }
  }

  if (extra === 'scarf') {
    // Scarf round the neck with the tail down the front. Darker than the shirt
    // it is picked from, or the two would read as one garment.
    paint(
      f,
      { u: torso.u, v: torso.v, y: hip + 0.27, h: 0.14, r: 0.19, rTop: 0.165, roundTop: 0.6, roundBottom: 0.5 },
      shade(look.shirt, 0.58),
    );
    if (f.front) {
      paint(
        f,
        { u: torso.u + 0.05, v: lean + 0.13, y: hip + 0.03, h: 0.27, r: 0.065, rTop: 0.06, roundTop: 0.5, roundBottom: 0.9 },
        shade(look.shirt, 0.52),
      );
    }
  }
  if (extra === 'hood') {
    // A hood pushed back off the head, which is the whole read of a hoodie.
    paint(
      f,
      { u: torso.u, v: torso.v - 0.16, y: hip + 0.24, h: 0.3, r: 0.22, rTop: 0.19, roundTop: 0.9, roundBottom: 0.6 },
      shade(look.shirt, 0.88),
    );
  }
}

/** Neck, head, hair, face and hat, in the order the camera needs them. */
function drawHeadGroup(
  f: Figure,
  look: Appearance,
  opts: PersonOptions,
  hip: number,
  lean: number,
  sway: number,
  extra: GuestExtra,
): void {
  // A squoval: rounded on every corner, a shade wider than it is tall, a touch
  // narrower at the crown, and about as tall as the whole body under it.
  const head: Part = {
    u: sway * 0.6,
    v: lean * 1.2,
    y: hip + 0.36,
    h: 0.58,
    r: 0.37,
    rTop: 0.35,
    roundTop: 0.66,
    roundBottom: 0.6,
    bulge: 0.025,
  };

  // Just enough neck that the head is not glued straight onto the shoulders.
  paint(
    f,
    { u: head.u, v: head.v, y: hip + 0.3, h: 0.1, r: 0.1, rTop: 0.11, roundTop: 0.4, roundBottom: 0.3 },
    look.skin,
    { light: 0.6 },
  );
  drawHairBack(f, look, head);
  paint(f, head, look.skin);
  drawEars(f, look, head);
  drawHair(f, look, head, opts.role !== undefined || extra === 'flatCap' || extra === 'hood');
  drawFace(f, look, opts, head, extra);
  if (opts.role) drawUniformHat(f, opts.role, head);
  else drawGuestExtra(f, look, head, extra);
}

/** A nub of an ear each side, which is what stops a head reading as an egg. */
function drawEars(f: Figure, look: Appearance, head: Part): void {
  for (const side of [-1, 1] as const) {
    paint(
      f,
      {
        u: head.u + side * head.r * 0.99,
        v: head.v,
        y: head.y + head.h * 0.34,
        h: head.h * 0.2,
        r: head.r * 0.11,
        rTop: head.r * 0.11,
        roundTop: 1,
        roundBottom: 1,
      },
      shade(look.skin, 0.96),
      { light: 0.6 },
    );
  }
}

/** Whatever is in the near hand, placed on it. */
function drawHeld(f: Figure, opts: PersonOptions, hand: Part, extra: GuestExtra): void {
  const { ctx } = f;
  if (opts.carrying) {
    const at = spot(f, hand.u, hand.v, hand.y + hand.h);
    ctx.save();
    ctx.translate(at.x, at.y - 1 * f.s);
    ctx.scale(f.s, f.s);
    drawTray(ctx, opts.carrying);
    ctx.restore();
    return;
  }
  if (opts.prop === 'notepad') {
    const pad: Part = {
      u: hand.u * 0.9,
      v: hand.v + 0.14,
      y: hand.y + 0.06,
      h: 0.05,
      r: 0.13,
      rTop: 0.13,
      roundTop: 0.35,
      roundBottom: 0.35,
    };
    paint(f, pad, '#fdf8ec', { light: 0.6 });
    const at = spot(f, pad.u, pad.v, pad.y + pad.h);
    ctx.strokeStyle = 'rgba(160, 148, 128, 0.9)';
    ctx.lineWidth = 0.8;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(at.x - 5 * f.s, at.y + i * 2.4 * f.s + 1.2 * f.s);
      ctx.lineTo(at.x + 5 * f.s, at.y + i * 2.4 * f.s - 1.2 * f.s);
      ctx.stroke();
    }
  } else if (opts.prop === 'cloth') {
    // A sponge, which is what the cleaner carries on the sheet.
    paint(
      f,
      {
        u: hand.u * 1.05,
        v: hand.v + 0.12,
        y: hand.y - 0.02,
        h: 0.08,
        r: 0.13,
        rTop: 0.12,
        roundTop: 0.4,
        roundBottom: 0.4,
      },
      SHEET.butter,
      { light: 0.6 },
    );
  } else if (opts.prop === 'pan') {
    const at = spot(f, hand.u * 0.9, hand.v + 0.2, hand.y + 0.06);
    isoCylinder(ctx, at.x, at.y, 0.2 * f.s, 0.06 * f.s, '#4a4f55');
    ctx.strokeStyle = '#37393d';
    ctx.lineWidth = 2 * f.s;
    const grip = spot(f, hand.u, hand.v, hand.y + 0.05);
    ctx.beginPath();
    ctx.moveTo(grip.x, grip.y);
    ctx.lineTo(at.x, at.y - 1 * f.s);
    ctx.stroke();
  } else if (extra === 'flatCap') {
    // The delivery guest's paper bag, carried down at the side.
    paint(
      f,
      {
        u: hand.u * 1.1,
        v: hand.v + 0.06,
        y: hand.y - 0.22,
        h: 0.26,
        r: 0.12,
        rTop: 0.115,
        roundTop: 0.2,
        roundBottom: 0.25,
      },
      SHEET.oakLight,
    );
  }
}

/**
 * Eyes, brows, blush, mouth and — on the chef and on the sheet's older guest — a
 * moustache, painted onto the front of the rounded head and pushed round towards
 * the way the figure is facing, so the features sit on the turn of the skull
 * rather than square on the middle of it. Nothing is drawn at all on the two
 * away facings, where the face is pointing away from the camera.
 */
function drawFace(
  f: Figure,
  look: Appearance,
  opts: PersonOptions,
  head: Part,
  extra: GuestExtra,
): void {
  const time = opts.time;
  onSurface(f, head, f.front, 0.19, 0.52, (half, height) => {
    const { ctx } = f;
    const dx = half * 0.26;
    // Each figure gets a different `time` offset, so blinks never synchronise.
    const blinking = (time * 0.31) % 1 < 0.05;

    ctx.lineCap = 'round';
    if (blinking) {
      ctx.strokeStyle = '#3a2b21';
      ctx.lineWidth = 1.2 * f.s;
      ctx.beginPath();
      ctx.moveTo(-dx - half * 0.15, 0);
      ctx.lineTo(-dx + half * 0.15, 0);
      ctx.moveTo(dx - half * 0.15, 0);
      ctx.lineTo(dx + half * 0.15, 0);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#fbf7ef';
      ctx.beginPath();
      ctx.ellipse(-dx, 0, half * 0.17, height * 0.15, 0, 0, Math.PI * 2);
      ctx.ellipse(dx, 0, half * 0.17, height * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2b2118';
      ctx.beginPath();
      ctx.arc(-dx + half * 0.03, height * 0.02, half * 0.11, 0, Math.PI * 2);
      ctx.arc(dx + half * 0.03, height * 0.02, half * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.arc(-dx - half * 0.045, -height * 0.05, half * 0.045, 0, Math.PI * 2);
      ctx.arc(dx - half * 0.045, -height * 0.05, half * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = shade(look.hair, 0.7);
    ctx.lineWidth = 1.1 * f.s;
    ctx.beginPath();
    ctx.moveTo(-dx - half * 0.18, -height * 0.155);
    ctx.lineTo(-dx + half * 0.15, -height * 0.19);
    ctx.moveTo(dx - half * 0.15, -height * 0.19);
    ctx.lineTo(dx + half * 0.18, -height * 0.155);
    ctx.stroke();

    ctx.fillStyle = 'rgba(232, 122, 122, 0.4)';
    ctx.beginPath();
    ctx.ellipse(-half * 0.32, height * 0.14, half * 0.12, height * 0.06, 0, 0, Math.PI * 2);
    ctx.ellipse(half * 0.32, height * 0.14, half * 0.12, height * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    // A moustache on the chef and on the oldest guest, which on a face this
    // round is the strongest single cue of who somebody is.
    const moustache = opts.role === 'chef' || extra === 'moustache';
    if (moustache) {
      ctx.fillStyle = shade(look.hair, opts.role === 'chef' ? 0.85 : 1.25);
      ctx.beginPath();
      ctx.ellipse(-half * 0.13, height * 0.1, half * 0.15, height * 0.055, 0.35, 0, Math.PI * 2);
      ctx.ellipse(half * 0.13, height * 0.1, half * 0.15, height * 0.055, -0.35, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(80, 40, 30, 0.85)';
      ctx.lineWidth = 1.2 * f.s;
      ctx.beginPath();
      ctx.arc(0, height * 0.1, half * 0.21, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }

    if (wearsGlasses(look)) {
      ctx.strokeStyle = 'rgba(58, 46, 38, 0.9)';
      ctx.lineWidth = 0.9 * f.s;
      ctx.beginPath();
      ctx.arc(-dx, 0, half * 0.2, 0, Math.PI * 2);
      ctx.arc(dx, 0, half * 0.2, 0, Math.PI * 2);
      ctx.moveTo(-dx + half * 0.2, 0);
      ctx.lineTo(dx - half * 0.2, 0);
      ctx.stroke();
    }
  });
}

/**
 * Headgear by job, each its own rounded volume on the crown. Silhouette does the
 * work: a tall toque, a peaked cap and a wrapped headscarf still tell you who is
 * who from across the room, and from behind, where no uniform is in view.
 */
function drawUniformHat(f: Figure, role: 'waiter' | 'chef' | 'cleaner', head: Part): void {
  const crown = head.y + head.h;
  const { ctx } = f;

  switch (role) {
    case 'chef': {
      // Toque: a band round the brow and a fat pleated puff standing over it,
      // wider at the top than the bottom, which is what makes a toque a toque.
      paint(
        f,
        { u: head.u, v: head.v, y: crown - 0.11, h: 0.13, r: head.r * 1.05, rTop: head.r * 1.02, roundTop: 0.35, roundBottom: 0.35 },
        '#fdf9ef',
        { outline: inkOf('#e8dcc4', 0.5) },
      );
      paint(
        f,
        {
          u: head.u,
          v: head.v,
          y: crown - 0.03,
          h: 0.36,
          r: head.r * 0.66,
          rTop: head.r * 1.04,
          roundTop: 1,
          roundBottom: 0.5,
          bulge: head.r * 0.26,
        },
        '#fffdf8',
        { outline: inkOf('#e8dcc4', 0.5) },
      );
      break;
    }
    case 'waiter': {
      // Peaked cap in the waiter's own blue, with the diner's initial on it. The
      // bill is drawn first so the crown laps over its root.
      const cap: Part = {
        u: head.u,
        v: head.v,
        y: crown - 0.12,
        h: 0.19,
        r: head.r * 1.07,
        rTop: head.r * 0.86,
        roundTop: 0.9,
        roundBottom: 0.3,
      };
      paint(
        f,
        { u: head.u, v: head.v + 0.24, y: crown - 0.11, h: 0.05, r: head.r * 0.6, rTop: head.r * 0.58, roundTop: 0.9, roundBottom: 0.9 },
        SHEET.skyDeep,
      );
      paint(f, cap, SHEET.sky);
      onSurface(f, cap, f.front, 0.05, 0.55, (half) => {
        ctx.fillStyle = SHEET.butter;
        ctx.beginPath();
        ctx.arc(0, 0, half * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = SHEET.ink;
        ctx.lineWidth = 0.9 * f.s;
        ctx.beginPath();
        ctx.arc(0, 0, half * 0.15, -Math.PI * 0.4, Math.PI * 0.4);
        ctx.moveTo(-half * 0.12, -half * 0.16);
        ctx.lineTo(-half * 0.12, half * 0.16);
        ctx.stroke();
      });
      break;
    }
    default: {
      // Headscarf, wrapped low over the hair, with the knot out on the side the
      // camera can see and two short tails behind it.
      paint(
        f,
        { u: head.u, v: head.v, y: crown - 0.2, h: 0.24, r: head.r * 1.06, rTop: head.r * 0.98, roundTop: 0.5, roundBottom: 0.3 },
        SHEET.mintDeep,
      );
      paint(f, pill(head.u + 0.26, head.v - 0.06, crown - 0.18, 0.13, 0.085), shade(SHEET.mintDeep, 1.12));
      paint(f, pill(head.u + 0.3, head.v - 0.14, crown - 0.3, 0.14, 0.055), shade(SHEET.mintDeep, 0.9));
      break;
    }
  }
}

/**
 * What a guest is wearing that the staff never do: a flower, a flat cap or a
 * hood over the crown. The scarf and the hood's shoulders belong to the body, so
 * they are drawn with the torso; this is the part that sits on the head.
 */
function drawGuestExtra(f: Figure, look: Appearance, head: Part, extra: GuestExtra): void {
  const crown = head.y + head.h;
  const { ctx } = f;

  if (extra === 'flower') {
    // A bloom tucked in above one ear, which is the sheet's oldest guest.
    const at = spot(f, head.u + head.r * 0.78, head.v - 0.04, crown - 0.1);
    const r = 2.6 * f.s;
    ctx.fillStyle = '#f3a0bc';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(at.x + Math.cos(a) * r, at.y + Math.sin(a) * r * 0.7, r * 0.8, r * 0.62, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = SHEET.butter;
    ctx.beginPath();
    ctx.arc(at.x, at.y, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (extra === 'flatCap') {
    // Flat cap with a short peak: the delivery guest.
    const colour = shade(look.pants, 1.18);
    paint(
      f,
      { u: head.u, v: head.v + 0.22, y: crown - 0.1, h: 0.045, r: head.r * 0.62, rTop: head.r * 0.6, roundTop: 0.9, roundBottom: 0.9 },
      shade(colour, 0.85),
    );
    paint(
      f,
      { u: head.u, v: head.v - 0.02, y: crown - 0.11, h: 0.15, r: head.r * 1.06, rTop: head.r * 0.88, roundTop: 1, roundBottom: 0.3 },
      colour,
    );
    return;
  }

  if (extra === 'hood') {
    // The hood pulled up over the crown, in the shirt's own colour.
    paint(
      f,
      { u: head.u, v: head.v - 0.06, y: crown - 0.26, h: 0.34, r: head.r * 1.1, rTop: head.r * 0.78, roundTop: 0.95, roundBottom: 0.4 },
      shade(look.shirt, 1.04),
    );
  }
}

/**
 * Hair that hangs behind the head, drawn before it so the head sits in front of
 * its own hair rather than inside it.
 */
function drawHairBack(f: Figure, look: Appearance, head: Part): void {
  if (look.hairStyle === 'long') {
    // A mass wider than the head at the crown and set back from it, falling to
    // the shoulders and narrowing on the way down rather than ending in a hem.
    paint(
      f,
      {
        u: head.u,
        v: head.v - 0.04,
        y: head.y - 0.24,
        h: head.h * 1.22,
        r: head.r * 0.82,
        rTop: head.r * 1.06,
        roundTop: 0.7,
        roundBottom: 0.85,
        bulge: head.r * 0.06,
      },
      look.hair,
    );
  } else if (look.hairStyle === 'bun') {
    // High enough on the back of the head to break the crown line, or a bun would
    // be a style you could only tell somebody had from behind.
    paint(
      f,
      {
        u: head.u,
        v: head.v - 0.2,
        y: head.y + head.h * 0.8,
        h: head.h * 0.42,
        r: head.r * 0.34,
        rTop: head.r * 0.32,
        roundTop: 1,
        roundBottom: 1,
      },
      look.hair,
    );
  }
}

/**
 * What is left of a bald head's hair: a tuft above each ear, drawn after the head
 * because a horseshoe hidden behind a skull this round shows as nothing at all.
 */
function drawSideHair(f: Figure, look: Appearance, head: Part): void {
  for (const side of [-1, 1] as const) {
    paint(
      f,
      {
        u: head.u + side * head.r * 0.88,
        v: head.v - 0.02,
        y: head.y + head.h * 0.16,
        h: head.h * 0.34,
        r: head.r * 0.17,
        rTop: head.r * 0.19,
        roundTop: 0.8,
        roundBottom: 0.9,
      },
      look.hair,
    );
  }
}

/**
 * The hair on the crown: one rounded cap a shade wider than the skull, sitting
 * proud of it. The step where it meets the forehead is what gives a round head a
 * hairline, so a head reads as a head and not as an egg.
 */
function drawHair(f: Figure, look: Appearance, head: Part, hatted = false): void {
  if (look.hairStyle === 'bald') {
    drawSideHair(f, look, head);
    return;
  }

  // Under a hat there is no crown to paint: all that shows is the rim of hair
  // below the brim. Painting the full cap anyway is what turns a chef into a
  // chef in a hat on a bouffant.
  if (hatted) {
    paint(
      f,
      {
        u: head.u,
        v: head.v,
        y: head.y + head.h * 0.52,
        h: head.h * 0.22,
        r: head.r * 1.04,
        rTop: head.r * 1.0,
        roundTop: 0.2,
        roundBottom: 0.7,
      },
      look.hair,
    );
    drawSideHair(f, look, head);
    return;
  }

  const cap: Part = {
    u: head.u,
    v: head.v,
    y: head.y + head.h * 0.56,
    h: head.h * 0.48,
    // A shade wider than the skull, so the hair wraps the sides of the head, with
    // a generously rounded hairline: cut that square and the outline along it
    // turns into a swimming cap strapped over the brows.
    r: head.r * 1.05,
    rTop: head.r * 0.72,
    roundTop: 0.9,
    roundBottom: 0.66,
    bulge: head.r * 0.04,
  };

  switch (look.hairStyle) {
    case 'cap':
      // The same cap dropped low with a flat hairline, which reads as a blunt
      // fringe cut straight across the brow.
      paint(
        f,
        { ...cap, y: head.y + head.h * 0.38, h: head.h * 0.67, rTop: head.r * 0.84, roundBottom: 0.12 },
        look.hair,
      );
      break;
    case 'curly': {
      paint(f, { ...cap, h: head.h * 0.45, rTop: head.r * 0.86 }, look.hair);
      // Puffs round the crown, far side first so the near ones lap over them.
      // None of them stray forward over the face.
      const puffs: Array<[number, number]> = [
        [-0.26, -0.08],
        [-0.16, 0.12],
        [0, -0.16],
        [0.1, 0.12],
        [0.26, -0.04],
      ];
      for (const [u, v] of puffs) {
        paint(
          f,
          {
            u: head.u + u,
            v: head.v + v,
            y: head.y + head.h * 0.84,
            h: head.h * 0.24,
            r: head.r * 0.26,
            rTop: head.r * 0.26,
            roundTop: 1,
            roundBottom: 1,
          },
          shade(look.hair, u > 0 ? 1.07 : 0.93),
        );
      }
      break;
    }
    default:
      // Short, bun and long all share the same rounded cap.
      paint(f, cap, look.hair);
      break;
  }
}

// ---------------------------------------------------- 2D icons for the UI

/** Ingredient icon drawn in plain screen space for shop and market lists. */
export function drawIngredientIcon(
  ctx: CanvasRenderingContext2D,
  ing: Ingredient,
  x: number,
  y: number,
  size: number,
): void {
  const s = size / 32;
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.scale(s, s);
  ctx.fillStyle = ing.color;
  ctx.strokeStyle = ing.accent;
  ctx.lineWidth = 1.6;

  switch (ing.icon) {
    case 'loaf':
      roundRect(ctx, -12, -7, 24, 14, 6);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(i * 6, -5);
        ctx.lineTo(i * 6 + 3, 1);
      }
      ctx.stroke();
      break;
    case 'sack':
      ctx.beginPath();
      ctx.moveTo(-9, 11);
      ctx.quadraticCurveTo(-13, -6, -5, -9);
      ctx.lineTo(5, -9);
      ctx.quadraticCurveTo(13, -6, 9, 11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case 'grain':
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.ellipse(i * 7, i === 0 ? -2 : 3, 4, 8, i * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      break;
    case 'round':
      ctx.beginPath();
      ctx.arc(0, 1, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = ing.accent;
      ctx.beginPath();
      ctx.ellipse(0, -9, 4, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'leaf':
      ctx.beginPath();
      ctx.moveTo(0, 11);
      ctx.quadraticCurveTo(-14, 0, 0, -11);
      ctx.quadraticCurveTo(14, 0, 0, 11);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(0, -10);
      ctx.stroke();
      break;
    case 'slab':
      roundRect(ctx, -12, -8, 24, 16, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = mix(ing.color, '#ffffff', 0.35);
      roundRect(ctx, -7, -4, 14, 8, 2);
      ctx.fill();
      break;
    case 'drop':
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.quadraticCurveTo(10, 2, 0, 11);
      ctx.quadraticCurveTo(-10, 2, 0, -12);
      ctx.fill();
      ctx.stroke();
      break;
    case 'bean':
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(-6 + i * 6, i % 2 === 0 ? -1 : 4, 5, 3.6, 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      break;
    case 'sheet':
      roundRect(ctx, -11, -11, 22, 22, 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = mix(ing.color, '#ffffff', 0.3);
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(-9, i * 6);
        ctx.lineTo(9, i * 6);
      }
      ctx.stroke();
      break;
  }
  ctx.restore();
}
