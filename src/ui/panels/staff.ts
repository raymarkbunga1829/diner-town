import { audio } from '../../engine/audio';
import { Rng } from '../../engine/rng';
import type { StaffRole } from '../../game/types';
import {
  effectiveSkill,
  hireApplicant,
  makeApplicant,
  MAX_SKILL,
  mealCost,
  trainingCost,
} from '../../game/people';
import type { AppApi, Panel } from '../api';
import { el, fmt } from '../dom';
import { iconSvg } from '../icons';
import { chip, emptyState, healthColor, meter, personIcon } from './common';

const ROLES: Array<{ id: StaffRole; label: string; blurb: string }> = [
  { id: 'waiter', label: 'Waiter', blurb: 'Takes orders and runs plates to tables.' },
  { id: 'chef', label: 'Chef', blurb: 'Cooks orders at the stoves.' },
  { id: 'cleaner', label: 'Cleaner', blurb: 'Wipes down tables so they can be reseated.' },
];

const REFRESH_FEE = 150;

export function createStaffPanel(app: AppApi): Panel {
  let tab: 'team' | 'hire' = 'team';

  return {
    title: 'Staff',
    subtitle: () =>
      `${app.game.data.staff.length} of ${app.game.staffCapacity} positions filled · wages are paid at the start of each day`,
    tabs: [
      { id: 'team', label: 'My team' },
      { id: 'hire', label: 'Hire' },
    ],
    activeTab: tab,
    onTab: (id) => {
      tab = id as 'team' | 'hire';
    },
    render(body) {
      if (tab === 'team') renderTeam(app, body);
      else renderHiring(app, body);
    },
  };
}

function renderTeam(app: AppApi, body: HTMLElement): void {
  const staff = app.game.data.staff;
  if (!staff.length) {
    body.append(emptyState('Nobody works here yet. Hire someone from the Hire tab.'));
    return;
  }

  const totalWages = staff.reduce((s, m) => s + m.wage, 0);
  body.append(
    el('div', { class: 'card', style: 'margin-bottom:10px' }, [
      el('div', { class: 'row' }, [
        el('span', { class: 'name', text: 'Daily payroll' }),
        el('span', {
          class: 'price',
          html: `${iconSvg('coin', 13)} ${fmt(totalWages)}`,
          style: 'display:inline-flex;align-items:center;gap:4px',
        }),
      ]),
      el('div', {
        class: 'desc',
        text: 'If you cannot cover payroll your team turns up exhausted the next day.',
      }),
    ]),
  );

  const list = el('div', { class: 'list' });
  for (const member of staff) {
    const skill = effectiveSkill(member);
    const energy = member.energy / 100;
    const feed = mealCost(member);
    const train = trainingCost(skill);

    const roleSwitch = el(
      'div',
      { class: 'stepper', style: 'gap:3px' },
      ROLES.map((r) =>
        el('button', {
          class: member.role === r.id ? 'btn primary' : 'btn ghost',
          style: 'padding:5px 8px;font-size:11px',
          text: r.label,
          onclick: () => {
            member.role = r.id;
            member.state = 'idle';
            member.path = [];
            member.targetCustomerId = null;
            member.targetOrderId = null;
            member.targetUid = null;
            member.carryDishId = null;
            app.game.touch();
            app.save();
            app.toast(`${member.name} is now a ${r.label.toLowerCase()}`, 'good');
            app.refresh();
          },
        }),
      ),
    );

    list.append(
      el('div', { class: 'row-item', style: 'align-items:flex-start' }, [
        personIcon(member.look, 52, member.role),
        el('div', { class: 'row-main' }, [
          el('div', { class: 'row-title' }, [
            el('span', { text: member.name }),
            chip(`${ROLES.find((r) => r.id === member.role)!.label} ${skill}`, 'info'),
            member.state === 'exhausted' ? chip('Exhausted', 'warn') : null,
          ].filter(Boolean) as Node[]),
          el('div', { class: 'row-sub', text: `Wage ${fmt(member.wage)}/day` }),
          el('div', { style: 'margin-top:6px' }, [
            el('div', { class: 'row-sub', text: `Energy ${Math.round(member.energy)}%` }),
            meter(energy, healthColor(energy)),
          ]),
          el('div', { style: 'margin-top:6px' }, [
            el('div', {
              class: 'row-sub',
              text: `Skill ${skill}/${MAX_SKILL} — ${ROLES.find((r) => r.id === member.role)!.blurb}`,
            }),
            meter(skill / MAX_SKILL, '#7fb6e0'),
          ]),
          el('div', { style: 'margin-top:8px' }, [roleSwitch]),
          el('div', { style: 'display:flex;gap:6px;margin-top:8px;flex-wrap:wrap' }, [
            el('button', {
              class: 'btn green',
              html: `Feed · ${iconSvg('coin', 12)} ${fmt(feed)}`,
              disabled: member.energy >= 99 || !app.game.canAfford(feed),
              onclick: () => {
                if (!app.game.spend(feed)) return;
                member.energy = 100;
                if (member.state === 'exhausted') member.state = 'idle';
                audio.play('coin');
                app.toast(`${member.name} is back to full energy`, 'good');
                app.save();
                app.refresh();
              },
            }),
            el('button', {
              class: 'btn primary',
              html: `Train · ${iconSvg('coin', 12)} ${fmt(train)}`,
              disabled: skill >= MAX_SKILL || !app.game.canAfford(train),
              onclick: () => {
                if (!app.game.spend(train)) return;
                member.skills[member.role] = Math.min(MAX_SKILL, member.skills[member.role] + 1);
                member.wage += 12;
                audio.play('levelup');
                app.toast(
                  `${member.name} improved to ${member.role} skill ${member.skills[member.role]}`,
                  'good',
                );
                app.save();
                app.refresh();
              },
            }),
            el('button', {
              class: 'btn danger',
              text: 'Let go',
              onclick: async () => {
                const ok = await app.confirm({
                  title: `Let ${member.name} go?`,
                  message: 'Their training is lost and you will need to hire a replacement.',
                  confirmLabel: 'Let go',
                  danger: true,
                });
                if (!ok) return;
                app.game.data.staff = app.game.data.staff.filter((s) => s.id !== member.id);
                app.game.touch();
                app.save();
                app.toast(`${member.name} has left`, 'info');
                app.refresh();
              },
            }),
          ]),
        ]),
      ]),
    );
  }
  body.append(list);
}

function renderHiring(app: AppApi, body: HTMLElement): void {
  const full = app.game.data.staff.length >= app.game.staffCapacity;

  body.append(
    el('div', { class: 'card', style: 'margin-bottom:10px' }, [
      el('div', { class: 'row' }, [
        el('span', { class: 'name', text: 'New applicants' }),
        el('button', {
          class: 'btn ghost',
          html: `${iconSvg('refresh', 13)} ${fmt(REFRESH_FEE)}`,
          disabled: !app.game.canAfford(REFRESH_FEE),
          onclick: () => {
            if (!app.game.spend(REFRESH_FEE)) return;
            const r = new Rng(Date.now());
            app.game.data.applicants = [0, 1, 2].map(() =>
              makeApplicant(app.game.nextId(), app.game.data.level, r),
            );
            audio.play('tap');
            app.game.touch();
            app.save();
            app.refresh();
          },
        }),
      ]),
      el('div', {
        class: 'desc',
        text: full
          ? `You have filled all ${app.game.staffCapacity} positions. Reach a higher level to unlock more.`
          : 'Pay a one-off hiring fee, then a daily wage. Higher skill means faster work.',
      }),
    ]),
  );

  const list = el('div', { class: 'list' });
  for (const applicant of app.game.data.applicants) {
    const best = (Object.entries(applicant.skills) as Array<[StaffRole, number]>).sort(
      (a, b) => b[1] - a[1],
    )[0]!;

    list.append(
      el('div', { class: 'row-item', style: 'align-items:flex-start' }, [
        personIcon(applicant.look, 52),
        el('div', { class: 'row-main' }, [
          el('div', { class: 'row-title' }, [
            el('span', { text: applicant.name }),
            chip(`Best at ${best[0]}`, 'good'),
          ]),
          el('div', {
            class: 'row-sub',
            text: `Hiring fee ${fmt(applicant.fee)} · wage ${fmt(applicant.wage)}/day`,
          }),
          ...ROLES.map((r) =>
            el('div', { style: 'margin-top:5px' }, [
              el('div', {
                class: 'row-sub',
                text: `${r.label} skill ${applicant.skills[r.id]}/${MAX_SKILL}`,
              }),
              meter(applicant.skills[r.id] / MAX_SKILL, '#7fb6e0'),
            ]),
          ),
          el('div', { style: 'display:flex;gap:6px;margin-top:9px;flex-wrap:wrap' },
            ROLES.map((r) =>
              el('button', {
                class: 'btn primary',
                style: 'flex:1;min-width:92px',
                text: `Hire as ${r.label}`,
                disabled: full || !app.game.canAfford(applicant.fee),
                onclick: () => {
                  if (full) return;
                  if (!app.game.spend(applicant.fee)) return;
                  const doorX = app.game.data.doorX;
                  app.game.data.staff.push(
                    hireApplicant(applicant, r.id, Date.now(), { tx: doorX, ty: 0 }),
                  );
                  app.game.data.applicants = app.game.data.applicants.filter(
                    (a) => a.id !== applicant.id,
                  );
                  const rng = new Rng(Date.now() + applicant.id);
                  app.game.data.applicants.push(
                    makeApplicant(app.game.nextId(), app.game.data.level, rng),
                  );
                  audio.play('levelup');
                  app.toast(`${applicant.name} joined as a ${r.label.toLowerCase()}`, 'good');
                  app.game.touch();
                  app.save();
                  app.refresh();
                },
              }),
            ),
          ),
        ]),
      ]),
    );
  }

  if (!app.game.data.applicants.length) {
    list.append(emptyState('No applicants right now. Refresh the noticeboard.'));
  }
  body.append(list);
}
