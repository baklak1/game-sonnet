// HTML ігрових панелей (праворуч). Живі дані перемальовуються кожні ~0,5 с.
import { B, DIFF, hpAvail } from '../data/balance';
import { levelById } from '../data/levels';
import { AMMO_NAMES, AMMO_PACK, BUILDS, CREWS, DEFS, LINE_SPECS, PROT_NAMES, TECHS, THREATS, protClass } from '../data/specs';
import { DIR_NAMES } from '../data/mapData';
import type { AmmoType, DefType, GameState, PObj, WavePolicy } from '../sim/types';
import { availableGen, importMult, industryFactor, limitMW, plannedMW, districtDemand, objAvail } from '../sim/grid';
import { METRO_LINES } from '../data/metro';
import { ammoPackCost, buildCost, buildDays, F16_COST, f16Available, fmtMoney, maxContractors, projectCost, protQuote, transformerPrice } from '../sim/actions';
import { needsProject } from '../sim/crews';
import { crewPeople } from '../sim/init';
import { avgServed, goalStatus } from '../sim/objectives';
import { dayOf, fmtTime, temperature } from '../sim/demand';
import { esc } from './screens';
import { iconImg } from '../render/icons';
import { spriteFor } from '../render/renderer';

const KIND_NAMES: Record<string, string> = {
  tpp: 'Теплоелектроцентраль', tes: 'Теплова електростанція', hpp: 'Гідроелектростанція', pspp: 'Гідроакумулююча станція',
  sub750: 'Підстанція 750 кВ (Укренерго)', sub330: 'Підстанція 330 кВ (Укренерго)', sub110: 'Підстанція 110 кВ (ДТЕК)',
  import: 'Міжрегіональний перетік', kgu: 'Когенераційна установка', gtu: 'Газотурбінна установка', ses: 'Сонячна станція',
  bess: 'Система накопичення енергії', boiler: 'Модульна котельня', pn: 'Пункт незламності', base: 'База ремонтних бригад',
  depot: 'Склад обладнання', decoy: 'Макет-приманка', crit: 'Критичний споживач',
  metro: 'Тягова підстанція метро', industry: 'Промислова зона (бізнес-тариф)', wte: 'Сміттєспалювальна ТЕЦ', wes: 'Вітрова електростанція',
};

const POLICY_NAMES: Record<WavePolicy, string> = {
  mixed: 'змішаний удар', generation: 'по генерації', ring: 'по кільцю 330 кВ', imports: 'по імпорту (ПС 750)', distribution: 'по підстанціях ДТЕК', finish: 'добивання пошкодженого',
};

function hpBar(f: number): string {
  const col = f >= 0.75 ? '#4ade80' : f >= 0.5 ? '#ffd166' : f >= 0.25 ? '#ff8c42' : '#e63946';
  return `<div class="hpbar"><i style="width:${Math.round(f * 100)}%;background:${col}"></i></div>`;
}

function row(k: string, v: string): string {
  return `<div class="row"><span class="k">${k}</span><b>${v}</b></div>`;
}

const mw = (v: number) => `${Math.round(v)} МВт`;

export function buildPanel(s: GameState, tab: string): string {
  const tabs: [string, string][] = [['gen', 'Генерація'], ['grid', 'Мережа'], ['sup', 'Підтримка']];
  const lists: Record<string, string[]> = {
    gen: ['kgu', 'gtu', 'ses', 'wes', 'bess', 'boiler'],
    grid: ['sub110', 'line110', 'cable110', 'line330', 'sub330'],
    sup: ['pn', 'base', 'depot', 'decoy'],
  };
  const busy = s.builds.filter((b) => b.kind !== 'def' && b.kind !== 'tech').length;
  const items = lists[tab].map((id) => {
    const unlocked = s.unlocked.builds.includes(id);
    if (LINE_SPECS[id]) {
      const L = LINE_SPECS[id];
      return `<button class="item ${unlocked ? '' : 'locked'}" data-act="${unlocked ? 'placeLine' : 'locked'}" data-arg="${id}">
        ${iconImg('bolt')}<span class="t"><b>${L.name}</b><small>${L.cap} МВт. ${L.cable ? 'Під землею — дрони не дістануть. ' : ''}${L.costKm} млн/км, ${L.kmPerDay} км/добу. Через Дніпро ×2,5.</small></span></button>`;
    }
    const b = BUILDS[id];
    return `<button class="item ${unlocked ? '' : 'locked'}" data-act="${unlocked ? 'placeBuild' : 'locked'}" data-arg="${id}">
      ${iconImg(b.kind)}<span class="t"><b>${b.name}</b><small>${esc(b.desc)}</small><small>Будується ${buildDays(s, id)} дн.</small></span><span class="price">${fmtMoney(buildCost(s, id))}</span></button>`;
  }).join('');
  return `<h2>Будівництво</h2>
    <div class="tabs">${tabs.map(([k, n]) => `<button class="${k === tab ? 'on' : ''}" data-act="buildTab" data-arg="${k}">${n}</button>`).join('')}</div>
    <p>Підрядники: ${busy}/${maxContractors(s)} зайняті</p>
    <div class="list">${items}</div>
    ${s.builds.length ? `<h3>Триває</h3>${s.builds.map((b) => `<div class="row"><span class="k">${esc(b.label)}</span><b>${Math.max(0, Math.ceil((b.until - s.t) / 60))} год</b></div>`).join('')}` : ''}`;
}

export function defensePanel(s: GameState, adOverlay: boolean): string {
  const types: DefType[] = ['mfg', 'manpads', 'gepard', 'interceptor', 'ew', 'radar', 'nasams', 'irist', 'patriot'];
  const items = types.map((t) => {
    const d = DEFS[t];
    const unlocked = s.unlocked.defs.includes(t);
    const vs = d.kind === 'aura' || d.kind === 'sensor' ? '' : `Шахед ${Math.round((d.pk.shahed ?? 0) * 100)}% · ракети ${Math.round((d.pk.kh101 ?? 0) * 100)}%${d.pk.iskander ? ` · балістика ${Math.round(d.pk.iskander * 100)}%` : ''}`;
    return `<button class="item ${unlocked ? '' : 'locked'}" data-act="${unlocked ? 'placeDef' : 'locked'}" data-arg="${t}">
      ${iconImg(t)}<span class="t"><b>${d.name}</b><small>${esc(d.desc)}</small><small>${vs}${vs ? ' · ' : ''}радіус ${Math.round(d.range / 8 * 10) / 10} км · ${d.upkeep} млн/добу</small></span><span class="price">${fmtMoney(d.cost)}</span></button>`;
  }).join('');
  const ammo = (Object.keys(AMMO_NAMES) as AmmoType[])
    .filter((a) => s.defs.some((d) => DEFS[d.type].ammo === a) || s.stock[a] > 0)
    .map((a) => `<div class="row"><span class="k">${AMMO_NAMES[a]}: <b style="color:var(--ink)">${s.stock[a]}</b></span><button class="small" data-act="buyAmmo" data-arg="${a}">+${AMMO_PACK[a]} за ${fmtMoney(ammoPackCost(a))}</button></div>`)
    .join('');
  return `<h2>Протиповітряна оборона</h2>
    <div class="btns"><button class="${adOverlay ? 'on' : ''}" data-act="toggleAD">Зони ППО на карті</button></div>
    <div class="list" style="margin-top:6px">${items}</div>
    <h3>Склад боєприпасів</h3>${ammo || '<p>Немає систем, що потребують ракет.</p>'}
    <p style="font-size:11px">Магазини поповнюються зі складу, коли комплекс не стріляє.</p>`;
}

export function crewsPanel(s: GameState): string {
  const used = crewPeople(s);
  const pend = s.staffPending.reduce((a, p) => a + p.n, 0);
  const crewList = s.crews.map((c) => {
    const st: Record<string, string> = { idle: 'вільна', move: 'в дорозі', work: 'ремонтує', rest: 'відпочиває', shelter: 'в укритті', injured: 'поранена' };
    const job = c.job ? (c.job.startsWith('L:') ? 'ЛЕП' : s.objs.find((o) => o.id === c.job)?.name ?? '') : '';
    return `<button class="item" data-act="selectCrew" data-arg="${c.id}">${iconImg('crew')}<span class="t"><b>${CREWS[c.type].name}</b><small>${st[c.state]}${job ? ': ' + esc(job) : ''} · сили ${Math.round(c.stamina)}%</small></span></button>`;
  }).join('');
  const hire = (Object.keys(CREWS) as (keyof typeof CREWS)[]).map((t) => `<button class="item" data-act="hireCrew" data-arg="${t}">${iconImg('crew')}<span class="t"><b>${CREWS[t].name}</b><small>${CREWS[t].people} людей · ${CREWS[t].speed} HP/год</small></span><span class="price">${fmtMoney(CREWS[t].hire)}</span></button>`).join('');
  return `<h2>Бригади і персонал</h2>
    ${row('Штат', `${s.staff} осіб${pend ? ` (+${pend} навчаються)` : ''}`)}
    ${row('Зайнято в бригадах', `${used}`)}
    ${row('Вільні', `${s.staff - used}`)}
    <div class="btns"><button data-act="hireStaff">Найняти ${B.hireN} людей · ${fmtMoney(B.hireCost)}</button></div>
    <div class="btns">
      <button class="${s.autoRepair ? 'on' : ''}" data-act="toggleAuto">Авторемонт: ${s.autoRepair ? 'так' : 'ні'}</button>
      <button class="${s.crewRisk ? 'on' : ''}" data-act="toggleRisk">Ремонт у тривогу: ${s.crewRisk ? 'ризикувати' : 'ні'}</button>
    </div>
    <h3>Трансформатори</h3>
    ${row('На складі', `${s.transformers}${s.trDeliveries.length ? ` (+${s.trDeliveries.length} в дорозі)` : ''}`)}
    <div class="btns"><button data-act="buyTr">Замовити · ${fmtMoney(transformerPrice(s))}, 3 дні</button></div>
    <h3>Бригади (${s.crews.length})</h3><div class="list">${crewList}</div>
    <h3>Найняти бригаду</h3><div class="list">${hire}</div>`;
}

export function gridPanel(s: GameState, gridOverlay: boolean): string {
  const limited = (s.flags.limitUntil ?? 0) > s.t;
  const d = s.districts.map((d) => {
    const pct = Math.round(d.frac * 100);
    const col = pct >= 97 ? 'good' : pct >= 60 ? 'warn' : 'bad';
    return `<button class="item" data-act="selectDistrict" data-arg="${d.id}"><span class="t"><b>${d.name}${d.priority ? ' ★' : ''}</b>
      <small><span class="tag ${col}">${pct}%</span>${d.queuesOff ? `<span class="tag">${d.queuesOff}/6 черг вимкнено</span>` : ''}${d.noHeat > 0.3 ? '<span class="tag bad">без тепла</span>' : ''}${d.pn ? `<span class="tag">ПН: ${d.pn}</span>` : ''}</small></span><span class="price">${mw(d.served)}</span></button>`;
  }).join('');
  const stor = s.objs.filter((o) => (o.kind === 'pspp' || o.kind === 'bess') && o.built).map((o) => row(o.name, `${Math.round(((o.soc ?? 0) / (o.socMax ?? 1)) * 100)}% заряду`)).join('');
  return `<h2>Енергосистема</h2>
    <div class="btns"><button class="${gridOverlay ? 'on' : ''}" data-act="toggleGrid">Шар мережі на карті</button></div>
    ${row('Генерація + імпорт', mw(s.genTotal))}
    ${row('Попит', mw(s.demandTotal))}
    ${row('Отримують', `${mw(s.servedTotal)} (${s.demandTotal ? Math.round((s.servedTotal / s.demandTotal) * 100) : 100}%)`)}
    ${row('Імпорт з АЕС', `${mw(s.importUsed)} з ${mw(Math.min(999, s.importBase * importMult(s)))}`)}
    ${limited ? `<p><span class="tag bad">Наказ Укренерго: ≤ ${Math.round(limitMW(s))} МВт ще ${Math.ceil(((s.flags.limitUntil ?? 0) - s.t) / 60)} год</span> <button class="small" data-act="panel" data-arg="sched">Графіки</button></p>` : ''}
    ${row('Вода ГЕС на добу', `${Math.round(s.flags.hppLeft ?? 0)} МВт·год`)}
    ${row('Вітер', `${Math.round((s.flags.wind ?? 0.5) * 100)}%`)}
    ${stor}
    <h3>Метро</h3>${METRO_LINES.map((l) => {
      const parts = s.objs.filter((o) => o.kind === 'metro' && o.id.startsWith(`metro_${l.id}_`));
      const need = parts.reduce((a, o) => a + o.cap, 0), got = parts.reduce((a, o) => a + Math.min(o.cap, o.critServed ?? 0), 0);
      const mm = ((s.t % 1440) + 1440) % 1440;
      const frac = mm < 330 ? 1 : need ? Math.min(1, got / (need * 0.9)) : 1;
      return `<button class="item" data-act="selectMetro" data-arg="${l.id}"><span class="t"><b style="color:${l.color}">${l.id} ${l.name}</b></span><span class="price">${mm < 330 ? 'ніч' : Math.round(frac * 100) + '%'}</span></button>`;
    }).join('')}
    <h3>Промисловість</h3>
    ${row('Промзони отримують', `${mw(s.industryServed)}`)}
    <div class="btns"><button class="${s.flags.indPriority ? 'on' : ''}" data-act="toggleInd">${s.flags.indPriority ? 'Пріоритет: промисловість (більше грошей)' : 'Пріоритет: побут (промзони гасимо першими)'}</button></div>
    <h3>Райони (торкніться, щоб дати пріоритет)</h3>
    <p style="font-size:11px">Дефіцит ділиться чергами. Пріоритетні райони (до двох) вимикаються останніми.</p>
    <div class="list">${d}</div>`;
}

export function techPanel(s: GameState): string {
  const items = TECHS.map((t) => {
    const unlocked = s.unlocked.techs.includes(t.id);
    const has = s.tech[t.id];
    return `<button class="item ${unlocked ? '' : 'locked'}" data-act="${has ? 'none' : unlocked ? 'research' : 'locked'}" data-arg="${t.id}">
      ${iconImg('tech')}<span class="t"><b>${t.name}${has ? ' ✓' : ''}</b><small>${esc(t.desc)}</small></span><span class="price">${has ? 'є' : fmtMoney(t.cost)}</span></button>`;
  }).join('');
  return `<h2>Технології</h2><p>Діють до кінця глави.</p><div class="list">${items}</div>`;
}

export function hqPanel(s: GameState): string {
  const L = levelById(s.levelId);
  const g = goalStatus(s);
  const day = dayOf(s.t);
  const f = s.forecast;
  let fc = '<p>Сьогодні вночі атаки не очікується.</p>';
  if (f && f.day === day) {
    if (f.drones < 0) fc = '<p>Розвідка не має даних. Готуйтеся до найгіршого.</p>';
    else fc = `<p>Очікується вночі: <b>~${f.drones}</b> дронів, <b>~${f.missiles}</b> крилатих ракет${f.ballistic ? `, <b>~${f.ballistic}</b> балістичних` : ''}.</p>
      <p>Ймовірний характер: ${POLICY_NAMES[f.policy]}.${f.dirs.length ? ` Напрямки: ${f.dirs.map((d) => DIR_NAMES[d]).join(', ')}.` : ''}</p>`;
  }
  const nextDays = s.waveDays.filter((d) => d > day || (d === day && s.phase !== 'alert' && !s.lastWaveReport)).slice(0, 4);
  const r = s.lastWaveReport;
  const down = Object.entries(s.stats.downed).map(([k, v]) => `${THREATS[k as keyof typeof THREATS].short}: ${v}`).join(', ') || '—';
  return `<h2>Штаб</h2>
    <h3>Мета</h3><p>${esc(g.text)}</p><p><span class="tag ${g.ok ? 'good' : 'warn'}">${esc(g.progress)}</span></p>
    ${s.mode === 'campaign' ? row('День', `${Math.min(day, L.days + 1)} з ${L.days}`) : row('Відбито хвиль', `${s.stats.wavesDone}`)}
    ${row('Складність', DIFF[s.difficulty].name)}
    ${row('Середнє світло', `${Math.round(avgServed(s) * 100)}%`)}
    ${row('Довіра киян', `${Math.round(s.trust)}`)}
    <h3>Розвідка</h3>${fc}
    ${s.mode === 'campaign' && nextDays.length ? `<p>Дні атак попереду: ${nextDays.join(', ')}</p>` : ''}
    ${s.enemyIntel && s.t - s.enemyIntel.at < 3 * 1440 ? '<p><span class="tag bad">Ворог знає позиції вашої ППО (розвідка)</span></p>' : ''}
    ${r ? `<h3>Остання атака (день ${r.day})</h3>${row('Запущено / збито', `${r.launched} / ${r.downed}`)}${row('Влучань', `${r.hits}`)}${row('Ракет ППО', `${r.missilesSpent} · ${fmtMoney(r.adCost)}`)}${row('Втрачено потужності', mw(r.mwLost))}` : ''}
    <h3>Збито за гру</h3><p>${esc(down)}</p>`;
}

function statusTags(s: GameState, o: PObj): string {
  const t: string[] = [];
  if (!o.built) t.push('<span class="tag warn">будується</span>');
  if (o.fireUntil > s.t) t.push('<span class="tag bad">пожежа</span>');
  if (o.hp < o.maxHp * 0.25 && o.built) t.push('<span class="tag bad">виведено з ладу</span>');
  if (needsProject(o)) t.push('<span class="tag bad">потрібен проєкт відновлення</span>');
  if ((o.kind === 'sub110' || o.kind === 'sub330' || o.kind === 'sub750') && o.hp < o.maxHp * 0.25) t.push('<span class="tag warn">потрібен трансформатор</span>');
  if (o.prot) t.push(`<span class="tag good">${PROT_NAMES[o.prot]}</span>`);
  if (o.priority) t.push('<span class="tag warn">пріоритет ремонту</span>');
  const crews = s.crews.filter((c) => c.job === o.id).length;
  if (crews) t.push(`<span class="tag">бригад: ${crews}</span>`);
  return t.join('');
}

export function objPanel(s: GameState, o: PObj): string {
  const f = o.hp / o.maxHp;
  let info = '';
  switch (o.kind) {
    case 'tpp': case 'tes': case 'hpp': case 'kgu': case 'gtu': case 'ses': case 'import':
      info = row('Видача зараз', mw(o.out)) + row('Доступно', `${mw(availableGen(s, o))} з ${mw(o.cap)}`);
      if (o.kind === 'tpp') info += row('Гріє райони', s.districts.filter((d) => d.heatSrc === o.id).map((d) => d.name).join(', ') || '—');
      if (o.kind === 'tes') info += '<p>Видача в Київ обмежена двома ЛЕП 330 кВ. Решта йде в області.</p>';
      break;
    case 'pspp': case 'bess':
      info = row('Заряд', `${Math.round(o.soc ?? 0)} / ${o.socMax} МВт·год`) + row('Потік зараз', `${o.out >= 0 ? 'віддає' : 'заряджається'} ${mw(Math.abs(o.out))}`);
      break;
    case 'sub750':
      info = row('Імпорт зараз', mw(o.out)) + row('Ліміт імпорту', mw(Math.min(o.cap, s.importBase * importMult(s)))) + row('Трансформація', mw(o.cap * objAvail(o)));
      break;
    case 'sub330': case 'sub110':
      info = row('Транзит', mw(o.out)) + row('Потужність', `${mw(o.cap * objAvail(o))} з ${mw(o.cap)}`);
      if (o.district) info += row('Живить район', s.districts.find((d) => d.id === o.district)?.name ?? '');
      break;
    case 'crit':
      info = row('Потрібно', mw(o.cap)) + row('Отримує', mw(o.critServed ?? 0)) + row('Дизель', `${o.backupLeft ?? 0} год`);
      break;
    case 'pn':
      info = '<p>Зменшує злість киян через відключення в районі.</p>';
      break;
    case 'industry':
      info = row('Попит зараз', mw(o.cap * industryFactor(s.t))) + row('Отримує', mw(o.critServed ?? 0)) +
        `<p>Бізнес платить за світло в ${B.businessTariff} раза дорожче, ніж побут. У дефіцит промзони вимикають першими — якщо не дати їм пріоритет у панелі «Мережа».</p>`;
      break;
    case 'wte':
      info = row('Видача', mw(o.out)) + '<p>Палить сміття: електрики мало (~4 МВт), зате дає тепло Позняками й Дніпровському району, навіть коли ТЕЦ вибито.</p>';
      break;
    case 'wes':
      info = row('Вітер', `${Math.round((s.flags.wind ?? 0.5) * 100)}%`) + row('Видача', `${mw(Math.max(0, o.out))} з ${mw(o.cap)}`) +
        (s.lines.some((l) => (l.a === o.id || l.b === o.id) && l.built) ? '' : '<p><span class="tag bad">Не підключено! Збудуйте ЛЕП 110 кВ до підстанції.</span></p>');
      break;
  }
  const pq = protQuote(s, o);
  const actions: string[] = [];
  if (o.built && o.hp < o.maxHp && !needsProject(o)) actions.push(`<button class="primary" data-act="sendCrew" data-arg="${o.id}">Направити бригаду</button>`);
  if (needsProject(o)) actions.push(`<button class="primary" data-act="project" data-arg="${o.id}">Проєкт відновлення · ${fmtMoney(projectCost(o))}, ${B.projectDays} дні</button>`);
  if (o.built && o.hp < o.maxHp) actions.push(`<button data-act="prioRepair" data-arg="${o.id}">${o.priority ? 'Зняти пріоритет' : 'Пріоритет ремонту'}</button>`);
  if (pq && pq.cost !== null && protClass(o.kind)) {
    const ok = pq.level <= s.unlocked.prot;
    actions.push(`<button ${ok ? '' : 'disabled'} data-act="protect" data-arg="${o.id}">Укріпити: ${pq.name} · ${fmtMoney(pq.cost)}, ${pq.days} дн.${ok ? '' : ' (ще недоступно)'}</button>`);
  }
  if (!o.fixed) actions.push(`<button class="danger" data-act="sellObj" data-arg="${o.id}">Демонтувати</button>`);
  return `<h2>${esc(o.name)}</h2><p>${KIND_NAMES[o.kind] ?? ''}${o.district ? ' · ' + (s.districts.find((d) => d.id === o.district)?.name ?? '') : ''}</p>
    <div style="display:flex;align-items:center;gap:8px">${iconImg(spriteFor(o), 'big')}<div style="flex:1">${hpBar(f)}<small>${Math.round(o.hp)} / ${o.maxHp} HP · ${Math.round(hpAvail(o.hp, o.maxHp) * 100)}% потужності</small></div></div>
    <p>${statusTags(s, o)}</p>${info}<div class="btns" style="flex-direction:column">${actions.join('')}</div>`;
}

export function defPanel(s: GameState, id: number): string {
  const d = s.defs.find((dd) => dd.id === id);
  if (!d) return '';
  const spec = DEFS[d.type];
  const pols: [string, string][] = [['smart', 'Розумна'], ['missiles', 'Лише ракети'], ['ballistic', 'Лише балістика'], ['all', 'По всіх']];
  const showPol = spec.kind === 'missile' && d.type !== 'manpads' && d.type !== 'interceptor';
  return `<h2>${spec.name}</h2>
    <div style="display:flex;align-items:center;gap:8px">${iconImg(d.type, 'big')}<div style="flex:1"><small>${esc(spec.desc)}</small></div></div>
    ${!d.built ? '<p><span class="tag warn">розгортається</span></p>' : ''}${d.tx !== undefined ? '<p><span class="tag warn">переїжджає</span></p>' : ''}
    ${spec.mag < 9999 && spec.ammo ? row('Магазин', `${d.ammo} / ${spec.mag}`) + row('На складі', `${s.stock[spec.ammo]}`) : ''}
    ${row('Пострілів / збито', `${d.shots} / ${d.kills}`)}
    ${row('Стан', `${Math.round((d.hp / spec.hp) * 100)}%`)}
    ${showPol ? `<h3>Політика вогню</h3><div class="btns">${pols.map(([k, n]) => `<button class="small ${d.policy === k ? 'on' : ''}" data-act="policy" data-arg="${d.id}:${k}">${n}</button>`).join('')}</div>` : ''}
    <div class="btns" style="flex-direction:column"><button class="primary" data-act="moveDef" data-arg="${d.id}">Перемістити</button>
    ${spec.ammo && spec.mag < 9999 ? `<button data-act="buyAmmo" data-arg="${spec.ammo}">Купити боєприпаси +${AMMO_PACK[spec.ammo]} · ${fmtMoney(ammoPackCost(spec.ammo))}</button>` : ''}
    <button class="danger" data-act="sellDef" data-arg="${d.id}">Розформувати (повернути 40%)</button></div>`;
}

export function crewPanel(s: GameState, id: number): string {
  const c = s.crews.find((cc) => cc.id === id);
  if (!c) return '';
  const spec = CREWS[c.type];
  const st: Record<string, string> = { idle: 'вільна', move: 'в дорозі', work: 'ремонтує', rest: 'відпочиває на базі', shelter: 'в укритті (тривога)', injured: 'поранена' };
  const job = c.job ? (c.job.startsWith('L:') ? 'Лінія електропередачі' : s.objs.find((o) => o.id === c.job)?.name ?? '') : '—';
  return `<h2>${spec.name}</h2>
    ${row('Стан', st[c.state])}${row('Об’єкт', esc(job))}${row('Сили', `${Math.round(c.stamina)}%`)}${row('Людей', `${spec.people}`)}
    <p>Ремонтує: ${spec.fixes.filter((k) => KIND_NAMES[k]).slice(0, 5).map((k) => KIND_NAMES[k]).join(', ')}${spec.lines.length ? `, ЛЕП ${spec.lines.join('/')} кВ` : ''}.</p>
    <div class="btns" style="flex-direction:column"><button class="primary" data-act="assignMode" data-arg="${c.id}">Направити на об’єкт…</button>
    <button data-act="crewHome" data-arg="${c.id}">На базу відпочивати</button>
    <button class="danger" data-act="disband" data-arg="${c.id}">Розформувати</button></div>`;
}

export function linePanel(s: GameState, id: string): string {
  const l = s.lines.find((ll) => ll.id === id);
  if (!l) return '';
  const a = s.objs.find((o) => o.id === l.a), b = s.objs.find((o) => o.id === l.b);
  const f = l.hp / l.maxHp;
  return `<h2>${l.cable ? 'Кабель' : 'ЛЕП'} ${l.kv} кВ</h2><p>${esc(a?.name ?? '')} — ${esc(b?.name ?? '')}</p>
    ${hpBar(f)}${row('Пропускна здатність', mw(l.cap * hpAvail(l.hp, l.maxHp)))}${row('Перетік зараз', mw(Math.abs(l.flow)))}
    ${!l.built ? '<p><span class="tag warn">будується</span></p>' : ''}
    ${l.built && f < 1 ? `<div class="btns"><button class="primary" data-act="sendCrew" data-arg="L:${l.id}">Направити бригаду</button></div>` : ''}`;
}

export function districtPanel(s: GameState, id: string): string {
  const d = s.districts.find((dd) => dd.id === id);
  if (!d) return '';
  const subs = s.objs.filter((o) => o.district === id && o.kind === 'sub110');
  const local = s.objs.filter((o) => o.district === id && ['kgu', 'gtu', 'ses', 'bess', 'boiler'].includes(o.kind));
  const heat = temperature(s) < B.heatTemp;
  return `<h2>${d.name} район</h2>
    ${row('Населення', `~${d.pop} тис.`)}${row('Попит', mw(d.demand))}${row('Отримує', `${mw(d.served)} (${Math.round(d.frac * 100)}%)`)}
    ${row('Черги вимкнено', `${d.queuesOff} з 6`)}${heat ? row('Тепло', d.noHeat > 0.05 ? `${Math.round((1 - d.noHeat) * 100)}% (ТЕЦ: ${s.objs.find((o) => o.id === d.heatSrc)?.name})` : 'є') : ''}
    ${row('Пункти незламності', `${d.pn} / 3`)}
    <h3>Живлення</h3>${subs.map((o) => row(o.name, `${Math.round(hpAvail(o.hp, o.maxHp) * 100)}%`)).join('')}
    ${local.length ? local.map((o) => row(o.name, mw(Math.max(0, o.out)))).join('') : '<p>Локальної генерації немає. КГУ чи батарея дадуть району світло навіть без кільця.</p>'}
    <h3>Графік відключень</h3>
    <div class="row"><span class="k">Вимкнено черг</span><span><button class="small" data-act="schedD" data-arg="${d.id}:-1">−</button> <b>${s.schedule.mode === 'manual' ? s.schedule.queues[d.id] ?? 0 : 'авто'}</b> <button class="small" data-act="schedD" data-arg="${d.id}:1">+</button></span></div>
    <div class="btns"><button class="${s.emergencyOff.includes(d.id) ? 'danger on' : 'danger'}" data-act="emerg" data-arg="${d.id}">${s.emergencyOff.includes(d.id) ? '⚡ Увімкнути район' : '⚡ Екстрено вимкнути район'}</button></div>
    <div class="btns" style="flex-direction:column"><button class="${d.priority ? 'on' : ''}" data-act="prioDistrict" data-arg="${d.id}">${d.priority ? 'Зняти пріоритет' : 'Дати пріоритет у графіках'}</button>
    ${s.unlocked.builds.includes('pn') ? `<button data-act="placeBuild" data-arg="pn">Поставити Пункт незламності · ${fmtMoney(BUILDS.pn.cost)}</button>` : ''}</div>`;
}

export function metroPanel(s: GameState, lineId: string): string {
  const line = METRO_LINES.find((l) => l.id === lineId);
  if (!line) return '';
  const parts = s.objs.filter((o) => o.kind === 'metro' && o.id.startsWith(`metro_${lineId}_`));
  const m = ((s.t % 1440) + 1440) % 1440;
  const open = m >= 5 * 60 + 30;
  const rows = parts.map((o) => {
    const need = o.cap * (open ? 1 : 0.2);
    const ok = (o.critServed ?? 0) >= need * 0.85;
    return `<div class="row"><span class="k">${esc(o.name.replace(/^Метро M\d: /, ''))}</span><b style="color:${ok ? 'var(--good)' : 'var(--bad)'}">${ok ? 'рух є' : 'стоїть'}</b></div>`;
  }).join('');
  return `<h2 style="color:${line.color}">${line.id} · ${esc(line.name)}</h2>
    <p>${line.stations.length} станцій · тягове живлення ~${line.mw} МВт</p>
    <p>${open ? 'Метро працює.' : 'Нічна перерва: поїзди в депо, станції — укриття.'} Якщо район, через який іде лінія, без світла, поїзди на цій ділянці зупиняються, а кияни дуже злі.</p>
    <h3>Ділянки по районах</h3>${rows}
    <p style="font-size:11px">Метро має пріоритет одразу після водоканалу. Дайте району з метро резервне живлення (КГУ, батарея) — і поїзди підуть навіть без кільця.</p>`;
}

export function schedulePanel(s: GameState): string {
  const limited = (s.flags.limitUntil ?? 0) > s.t;
  const lim = limitMW(s);
  const plan = plannedMW(s);
  const manual = s.schedule.mode === 'manual';
  const over = limited && plan > lim * 1.02;
  const allK = manual ? Math.round(Object.values(s.schedule.queues).reduce((a, b) => a + b, 0) / s.districts.length) : 0;
  const rows = s.districts.map((d) => {
    const em = s.emergencyOff.includes(d.id);
    const k = s.schedule.queues[d.id] ?? 0;
    return `<div class="item" style="flex-wrap:wrap"><span class="t"><b>${d.name}${d.priority ? ' ★' : ''}</b>
      <small>${Math.round(districtDemand(s, d.share))} МВт · світло ${Math.round(d.frac * 100)}%${em ? ' · <span style="color:var(--bad)">ЕКСТРЕНО ВИМКНЕНО</span>' : ''}</small></span>
      <span style="display:flex;gap:4px;align-items:center">${manual ? `<button class="small" data-act="schedD" data-arg="${d.id}:-1">−</button><b style="min-width:30px;text-align:center">${k}/6</b><button class="small" data-act="schedD" data-arg="${d.id}:1">+</button>` : `<span class="tag">авто</span>`}
      <button class="small ${em ? 'on' : ''}" data-act="emerg" data-arg="${d.id}" title="Екстрене відключення">⚡</button></span></div>`;
  }).join('');
  return `<h2>Графіки відключень</h2>
    ${limited ? `<p><span class="tag ${over ? 'bad' : 'good'}">Наказ Укренерго: ≤ ${Math.round(lim)} МВт ще ${Math.ceil(((s.flags.limitUntil ?? 0) - s.t) / 60)} год</span></p>` : '<p><span class="tag good">Наказу Укренерго зараз немає</span></p>'}
    ${row('Заплановано (побут + промзони)', `<span style="color:${over ? 'var(--bad)' : 'var(--good)'}">${Math.round(plan)} МВт</span>`)}
    ${over ? `<p style="color:var(--bad)">Перевищення ${Math.round(plan - lim)} МВт: Укренерго саме застосує аварійні відключення (злять утричі більше) і випише штраф.</p>` : ''}
    <div class="tabs"><button class="${manual ? '' : 'on'}" data-act="schedMode" data-arg="auto">Автомат</button><button class="${manual ? 'on' : ''}" data-act="schedMode" data-arg="manual">Ручний графік</button></div>
    <p style="font-size:12px">${manual ? 'Ви самі вирішуєте, скільки черг (з 6) вимкнено в кожному районі. Планові відключення киян злять менше.' : 'Автомат ділить дефіцит рівномірно, але під наказом Укренерго працює не точно (+10% до злості).'}</p>
    <div class="row"><span class="k">Для всього Києва</span><span><button class="small" data-act="schedAll" data-arg="${allK - 1}">−</button> <b>${allK}/6</b> <button class="small" data-act="schedAll" data-arg="${allK + 1}">+</button></span></div>
    <div class="btns"><button class="primary" data-act="schedFit">Підібрати під ліміт</button><button class="${s.flags.indOff ? 'on' : ''}" data-act="indOff">${s.flags.indOff ? 'Промзони вимкнено' : 'Вимкнути промзони'}</button></div>
    <h3>Райони</h3>
    <p style="font-size:12px">⚡ — екстрене відключення: миттєво звільняє потужність для інших районів, метро й водоканалу, у тривогу менше шкоди від пожеж на підстанціях. Але це аварійне відключення — кияни злі.</p>
    <div class="list">${rows}</div>`;
}

export function forecastHtml(s: GameState): string {
  const day = dayOf(s.t);
  const f = s.forecast;
  if (s.phase === 'alert') {
    const left = s.pending.length + s.threats.length;
    const f16 = f16Available(s) ? ` <button class="small" data-act="f16Mode">✈ F-16 · ${F16_COST} млн</button>` : (s.flags.f16Until ?? 0) > s.t ? ' · <b>F-16 в повітрі</b>' : '';
    return `<b>ТРИВОГА</b> · у небі: ${s.threats.length} · ще очікується: ${s.pending.length}${left === 0 ? ' · завершується' : ''}${f16}`;
  }
  if (f && f.day === day && s.pending.length) {
    if (f.drones < 0) return '<b>Сьогодні о 21:00</b> очікується атака. Даних розвідки немає.';
    return `<b>Сьогодні ~21:00:</b> ~${f.drones} дронів, ~${f.missiles} ракет${f.ballistic ? `, ~${f.ballistic} балістики` : ''}${f.dirs.length ? ` · ${f.dirs.map((d) => DIR_NAMES[d]).join(', ')}` : ''}`;
  }
  const next = s.waveDays.find((d) => d > day);
  return next ? `Наступна атака очікується: день ${next}` : s.mode === 'campaign' ? 'Атак більше не очікується. Дотягніть до ранку.' : '';
}

export function timeLabel(s: GameState): string {
  return `День ${dayOf(s.t)} · ${fmtTime(s.t)}`;
}

export const _unused = { DIFF };
