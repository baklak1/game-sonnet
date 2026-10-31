// HTML екранів меню. Дії — через data-act / data-arg (обробляє App).
import { LEVELS, ENDLESS, type LevelDef } from '../data/levels';
import { DIFF } from '../data/balance';
import { THREATS } from '../data/specs';
import type { Progress, Settings } from '../core/save';
import { FONTS } from './fonts';
import type { Difficulty, GameState } from '../sim/types';
import { avgServed } from '../sim/objectives';

const DIFFS: Difficulty[] = ['easy', 'normal', 'hard', 'hell'];
const DIFF_DESC: Record<Difficulty, string> = {
  easy: 'Менші хвилі, більше грошей, точна розвідка',
  normal: 'Як задумано',
  hard: 'Більші хвилі, повторні удари, неточна розвідка',
  hell: 'Ворог майже не шкодує ракет. Без розвідки',
};

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

export function mainMenu(hasRun: boolean, runLabel: string): string {
  return `<div class="menu">
    <div class="logo"><div class="a">ДТЕК:</div><div class="b">СВІТЛО Є</div><small>Піксельна оборона енергосистеми Києва</small></div>
    <div class="menu-btns">
      ${hasRun ? `<button class="primary" data-act="continue">Продовжити<br><small>${esc(runLabel)}</small></button>` : ''}
      <button class="${hasRun ? '' : 'primary'}" data-act="campaign">Кампанія «Хроніка»</button>
      <button data-act="endlessMenu">Безкінечна оборона</button>
      <button data-act="howto">Як грати</button>
      <button data-act="settings">Налаштування</button>
      <button data-act="about">Про гру</button>
    </div>
    <p style="text-align:center;color:var(--ink3);font-size:calc(12px * var(--fs));margin:4px 0 0">Неофіційна фан-гра. Не пов’язана з ДТЕК, Укренерго чи іншими компаніями.</p>
  </div>`;
}

export function campaignMenu(p: Progress): string {
  const cards = LEVELS.map((L, i) => {
    const unlocked = i === 0 || (p.stars[LEVELS[i - 1].id] ?? 0) > 0;
    const st = p.stars[L.id] ?? 0;
    return `<button class="card pix ${unlocked ? '' : 'locked'}" data-act="${unlocked ? 'brief' : 'locked'}" data-arg="${L.id}">
      <span class="p">${esc(L.period)}</span><b>${L.num}. ${esc(L.title)}</b>
      <small>${L.days} днів · ${L.waves.length} атак</small>
      <span class="stars">${'★'.repeat(st)}${'☆'.repeat(3 - st)}${p.diffDone[L.id] ? ` <small>${DIFF[p.diffDone[L.id]].name}</small>` : ''}</span>
    </button>`;
  }).join('');
  return `<div class="menu"><div class="topline"><button data-act="back">←</button><h1>Кампанія «Хроніка 2022–2026»</h1></div><div class="cards">${cards}</div></div>`;
}

export function briefing(L: LevelDef, chosen: Difficulty): string {
  const threats = L.unlock.threats.map((t) => THREATS[t].short).join(', ');
  return `<div class="menu"><div class="topline"><button data-act="${L.id === 'endless' ? 'back' : 'campaign'}">←</button><h1>${L.num ? L.num + '. ' : ''}${esc(L.title)}</h1></div>
    <div class="panel-box pix">
      <p style="color:var(--acc2)">${esc(L.period)}</p>
      <p>${esc(L.brief)}</p>
      <h3 style="color:var(--ink2);margin:10px 0 4px">Що нового</h3>
      <ul>${L.mech.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
      <p><span class="tag">Загрози: ${esc(threats)}</span> <span class="tag">${L.season === 'winter' ? 'Зима' : L.season === 'summer' ? 'Літо' : L.season === 'spring' ? 'Весна' : 'Осінь'}</span></p>
    </div>
    <div class="diff">${DIFFS.map((d) => `<button class="${d === chosen ? 'on' : ''}" data-act="diff" data-arg="${d}"><b>${DIFF[d].name}</b><small>${DIFF_DESC[d]}</small></button>`).join('')}</div>
    <button class="primary" style="min-height:48px;font-size:calc(16px * var(--fs))" data-act="start" data-arg="${L.id}">Почати</button>
  </div>`;
}

export function endlessMenu(p: Progress, chosen: Difficulty): string {
  const rec = DIFFS.map((d) => `<span class="tag">${DIFF[d].name}: ${p.bestWaves[d] ?? 0} хвиль</span>`).join(' ');
  return briefing(ENDLESS, chosen).replace('<div class="diff">', `<p style="margin:0">Рекорди: ${rec}</p><div class="diff">`);
}

export function howTo(): string {
  return `<div class="menu"><div class="topline"><button data-act="back">←</button><h1>Як грати</h1></div>
  <div class="panel-box pix">
    <h2>Мета</h2>
    <p>Не дати Києву зануритися в повну темряву і зберегти довіру киян. Поразка — якщо місто понад 12 годин майже без світла або довіра впала до нуля.</p>
    <h2>Час</h2>
    <p>Як у Hearts of Iron: на швидкості 1 одна реальна хвилина — одна година гри. Швидкості 1–5 (×1, ×2, ×5, ×10, ×20), пауза — «II» або пробіл. «⏭» перемотує до вечора. Коли починається тривога, гра ставиться на паузу (можна вимкнути в налаштуваннях).</p>
    <h2>День і ніч</h2>
    <p>Удень бригади ремонтують, ви будуєте й закуповуєте. О 21:00 у дні атаки лунає сирена: шахеди летять кілька годин, на світанку — крилаті ракети й балістика.</p>
    <h2>Місто</h2>
    <p>Метро (три лінії) живиться від районів, через які проходить: якщо район без світла — поїзди на цій ділянці стоять, кияни злі. Промзони платять за світло дорожче, але в дефіцит їх гасять першими (пріоритет можна змінити в «Мережі»). За містом можна ставити вітряки — їх треба з’єднати ЛЕП з підстанцією.</p>
    <h2>Райони їдять по-різному</h2>
    <ul>
      <li><b>Спальні</b> (Оболонь, Троєщина, Дарниця, Борщагівка, Лівобережна): удень порожньо, пік уранці й особливо ввечері, 19–22.</li>
      <li><b>Діловий центр</b> (Печерськ, Шевченківський): офіси й уряд, пік з 9 до 18, уночі тихо, влітку кондиціонери. Мешканців менше, а бізнес платить дорожче — світло тут вигідніше.</li>
      <li><b>Змішані</b> (Поділ, Солом’янка, Голосіїв): рівніший попит протягом доби.</li>
      <li>Приватний сектор з електроопаленням (Голосіїв, Дарниця, Святошин) у мороз їсть помітно більше. У вихідні центр затихає, спальні райони споживають більше.</li>
      <li>Профіль доби кожного району видно в його панелі.</li>
    </ul>
    <h2>Енергосистема</h2>
    <ul>
      <li>ТЕЦ, ГЕС, ГАЕС, Трипільська ТЕС та імпорт з АЕС через ПС 750 «Київська» живлять кільце 330 кВ.</li>
      <li>Від кільця енергія йде на підстанції 110 кВ ДТЕК, а від них — у райони.</li>
      <li>Коли енергії мало, вмикаються черги: дефіцит ділиться між районами чесно. Видно, як гаснуть будинки.</li>
      <li>Аварійні відключення (раптові) злять киян утричі більше за планові. Батареї ДТЕК закривають такі провали.</li>
      <li>Локальна генерація (КГУ, ГТУ, СЕС, батареї) живить свій район, навіть коли його відрізано від кільця.</li>
    </ul>
    <h2>Графіки та екстрені відключення</h2>
    <p>Укренерго надсилає наказ: «Київ споживає не більше N МВт до такої-то години». У вкладці «Графіки» можна лишити автомат або скласти ручний графік: однаково для всього Києва або окремо для кожного району (0–6 черг з 6). Панель показує, на скільки МВт ви перевищуєте ліміт або скільки лишилося запасу, — черги підбираєте самі, з огляду на те, який район зараз їсть найбільше. Якщо графік не вкладається в ліміт, Укренерго саме застосує аварійні відключення і штраф. Наказ закінчився — ручний графік знімається. Кнопка ⚡ екстрено вимикає район: потужність одразу йде іншим районам, метро й водоканалу, але кияни злі.</p>
    <h2>Оборона</h2>
    <ul>
      <li>МВГ і «Гепарди» — дешево проти шахедів. ЗРК (NASAMS, IRIS-T, Patriot) — дорогі ракети, бережіть їх для ракет.</li>
      <li>Балістику збиває лише Patriot. Політика вогню «Розумна» не марнує ракети на дрони.</li>
      <li>Захист Р1–Р3 зменшує урон по об’єкту. Розвідник ворога, якщо долетить, побачить вашу ППО — переставте мобільні групи.</li>
    </ul>
    <h2>Ремонт і люди</h2>
    <ul>
      <li>Бригади ДТЕК — мережа 110 кВ і мала генерація; високовольтні — ПС 330/750; «Енергоремонт» — станції.</li>
      <li>Знищеній підстанції потрібен трансформатор, станції — проєкт відновлення.</li>
      <li>Бригади втомлюються, а під час тривоги ховаються (можна ризикнути — тоді повторний удар може їх поранити).</li>
    </ul>
    <h2>Гроші</h2>
    <p>Дохід іде щогодини за поставлену енергію (довіра впливає на збір платежів). Щоранку — грант і зарплати. Паливо для ТЕЦ і КГУ коштує, імпорт з АЕС дешевший. Частину витрат на ремонт компенсує Фонд підтримки енергетики.</p>
    <h2>Керування</h2>
    <p>Тягніть карту пальцем, щипок — масштаб. Торкніться об’єкта, щоб побачити дії. Ліворуч — меню будівництва, ППО, бригад, мережі, технологій і штабу.</p>
  </div></div>`;
}

export function about(): string {
  return `<div class="menu"><div class="topline"><button data-act="back">←</button><h1>Про гру</h1></div>
  <div class="panel-box pix">
    <p><b>«ДТЕК: Світло є»</b> — неофіційна фан-гра про енергетиків, які тримають світло в Києві під обстрілами. Вона не пов’язана з ДТЕК, Укренерго, Київтеплоенерго, Центренерго чи Укргідроенерго й не використовує їхніх логотипів.</p>
    <p>Назви та потужності великих об’єктів (ТЕЦ-5 700 МВт, ТЕЦ-6 500 МВт, Дарницька ТЕЦ 160 МВт, Київська ГЕС 440 МВт, Київська ГАЕС 235 МВт, Трипільська ТЕС 1800 МВт, ПС 750 кВ «Київська», кільце 330 кВ, батареї ДТЕК 200 МВт) взято з відкритих джерел і округлено. Розташування підстанцій умовне, назви ПС 110 кВ вигадані за місцевостями.</p>
    <p>Перебіг атак у главах лише надихнутий реальними подіями 2022–2026 років. Цифри, хвилі й результати — ігрові.</p>
    <p>Мапа: райони, вулиці, шосе, залізниці, станції метро, вода, парки й промзони — © OpenStreetMap contributors (ODbL), вивантаження BBBike.org.</p>
    <p>Звуки — OpenGameArt.org, CC0: сирена «storm siren» (TinyWorlds), «Synthesized explosion» (qubodup), пакети «50 CC0 Sci-Fi SFX», «100 CC0 SFX», «25 CC0 bang / firework SFX» (rubberduck), «Motor Sound Effect» (EZduzziteh).</p>
    <p>Сміттєспалювальний завод «Енергія», промзони й метро — реальні об’єкти; їхні параметри в грі округлені й умовні.</p>
    <p>Шрифти (SIL Open Font License 1.1): Tiny5, Press Start 2P, Handjet, Pixelify Sans, JetBrains Mono, Rubik — © їхні автори.</p>
    <p>Музика: трек, наданий автором збірки.</p>
    <p>Слава енергетикам, рятувальникам і ППО.</p>
  </div></div>`;
}

/** Повзунок налаштування; значення застосовується одразу під час перетягування. */
function slider(key: 'musicPct' | 'sfxPct' | 'fontScale', label: string, v: number, min: number, max: number, step: number): string {
  return `<label class="slider"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-set="${key}"><b>${v === 0 && key !== 'fontScale' ? 'вимк.' : `${v}%`}</b></label>`;
}

/** Звук і шрифт — спільний блок для екрана налаштувань і меню паузи. */
export function soundFontControls(st: Settings): string {
  return `${slider('musicPct', 'Музика', st.musicPct, 0, 100, 5)}${slider('sfxPct', 'Звуки', st.sfxPct, 0, 100, 5)}
    <div class="fontpick"><span class="k">Шрифт</span>${FONTS.map((f) => `<button class="${st.font === f.id ? 'on' : ''}" data-act="setFont" data-arg="${f.id}" style="font-family:${f.family.replace(/"/g, "'")}, sans-serif;font-size:calc(${Math.round(16 * f.k)}px * var(--fs) / ${FONTS.find((x) => x.id === st.font)?.k ?? 1})">${f.name}</button>`).join('')}</div>
    ${slider('fontScale', 'Розмір шрифту', st.fontScale, 70, 150, 5)}`;
}

export function settingsMenu(p: Progress): string {
  const t = (key: 'autopause' | 'ambient' | 'vibro' | 'lowFx', label: string) =>
    `<button class="${p.settings[key] ? 'on' : ''}" data-act="toggleSetting" data-arg="${key}">${label}: ${p.settings[key] ? 'увімк.' : 'вимк.'}</button>`;
  return `<div class="menu"><div class="topline"><button data-act="back">←</button><h1>Налаштування</h1></div>
  <div class="panel-box pix"><div class="menu-btns">
    ${soundFontControls(p.settings)}
    ${t('autopause', 'Пауза на початку тривоги')}${t('ambient', 'Гул генераторів у темряві')}${t('vibro', 'Вібрація')}${t('lowFx', 'Економія батареї')}
    <button class="danger" data-act="resetAll">Скинути прогрес</button>
  </div></div></div>`;
}

export function results(s: GameState, L: LevelDef, nextId: string | null): string {
  const o = s.over!;
  const down = Object.entries(s.stats.downed).map(([k, v]) => `${THREATS[k as keyof typeof THREATS]?.short ?? k}: ${v}`).join(', ') || '—';
  const st = o.win ? `<div class="stars" style="font-size:calc(32px * var(--fs));color:var(--acc);text-align:center">${'★'.repeat(o.stars)}${'☆'.repeat(3 - o.stars)}</div>` : '';
  const isEndless = s.mode === 'endless';
  return `<div class="menu">
    <div class="logo"><div class="a" style="font-size:calc(32px * var(--fs));color:${o.win || isEndless ? 'var(--acc)' : 'var(--bad)'}">${isEndless ? 'Оборону завершено' : o.win ? 'Світло втримано!' : 'Поразка'}</div></div>
    ${st}
    <div class="panel-box pix">
      <p>${esc(o.reason)}</p>
      <div class="statgrid">
        <div class="row"><span class="k">${isEndless ? 'Відбито хвиль' : 'Глава'}</span><b>${isEndless ? s.stats.wavesDone : esc(L.title)}</b></div>
        <div class="row"><span class="k">Середнє світло</span><b>${Math.round(avgServed(s) * 100)}%</b></div>
        <div class="row"><span class="k">Мін. довіра</span><b>${Math.round(s.stats.minTrust)}</b></div>
        <div class="row"><span class="k">Влучань</span><b>${s.stats.hits}</b></div>
        <div class="row"><span class="k">Ракет ППО</span><b>${s.stats.missiles} (${Math.round(s.stats.adCost)} млн)</b></div>
        <div class="row"><span class="k">Відремонтовано</span><b>${Math.round(s.stats.repairsHp)} HP</b></div>
        ${isEndless ? `<div class="row"><span class="k">Рахунок</span><b>${o.score}</b></div>` : ''}
      </div>
      <p style="margin-top:8px">Збито: ${esc(down)}</p>
    </div>
    <div class="menu-btns">
      ${nextId && o.win ? `<button class="primary" data-act="brief" data-arg="${nextId}">Наступна глава</button>` : ''}
      <button data-act="retry">Ще раз</button>
      <button data-act="toMenu">До меню</button>
    </div></div>`;
}
