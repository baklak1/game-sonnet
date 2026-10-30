// Покрокове навчання в першій главі.
import type { GameState } from '../sim/types';
import type { App } from './app';
import { saveProgress } from '../core/save';

interface Step {
  text: string;
  hl?: string;
  until?: (app: App, s: GameState) => boolean;
}

export class Tutorial {
  i = 0;
  private shown = -1;
  private mark = 0;
  private defs0 = 0;
  private steps: Step[] = [
    { text: '<b>Вітаємо в штабі!</b> Це Київ, жовтень 2022-го. Вночі жовті вогники — це будинки зі світлом. Наше завдання — щоб вони не згасли.' },
    { text: 'Сьогодні о 21:00 прилетять шахеди. Відкрийте меню <b>ППО</b> ліворуч.', hl: 'tb_def', until: (a) => a.panel === 'def' },
    { text: 'Оберіть <b>Мобільну вогневу групу</b>, торкніться карти поруч із підстанцією чи ТЕЦ і натисніть <b>✓</b>. Дрони летять з півночі та сходу.', until: (_a, s) => s.defs.length > this.defs0 },
    { text: 'Група розгортається годину. Час іде як у Hearts of Iron: на швидкості <b>1</b> хвилина = година гри. Увімкніть <b>4–5</b> або <b>⏭</b> «до вечора».', until: (_a, s) => s.t > this.mark + 180 || s.phase === 'alert' },
    { text: '<b>Тривога!</b> Червоні вогники — шахеди. МВГ стріляють самі, а вночі світять прожекторами. Мобільні групи можна переставляти: торкніться групи → «Перемістити».', until: (_a, s) => !!s.lastWaveReport },
    { text: 'Бригади вже їдуть ремонтувати пошкоджене — працює <b>авторемонт</b>. Торкніться об’єкта, щоб побачити стан, захист і дії.' },
    { text: 'Коли енергії бракує, вмикаються <b>черги відключень</b>: частина будинків гасне по черзі. Відкрийте <b>Мережа</b>, щоб бачити райони.', hl: 'tb_grid', until: (a) => a.panel === 'grid' },
    { text: 'Гроші надходять щогодини за поставлену енергію, щоранку — грант і зарплати. Ставте ППО на шляхах дронів, укріплюйте ключові підстанції. Удачі!' },
  ];

  update(app: App, s: GameState): void {
    const el = document.getElementById('tutor')!;
    if (this.i >= this.steps.length) {
      el.classList.add('hidden');
      app.progress.tutorialDone = true;
      saveProgress(app.progress);
      app.tutorial = null;
      return;
    }
    const st = this.steps[this.i];
    if (this.shown !== this.i) {
      this.shown = this.i;
      if (this.i === 2) this.defs0 = s.defs.length;
      if (this.i === 3) this.mark = s.t;
      document.querySelectorAll('.pulse').forEach((e) => e.classList.remove('pulse'));
      if (st.hl) document.getElementById(st.hl)?.classList.add('pulse');
      el.innerHTML = `${st.text}<div class="btns">${st.until ? '' : '<button class="primary small" data-act="tutorNext">Далі</button>'}<button class="small" data-act="tutorSkip">Пропустити навчання</button></div>`;
      el.classList.remove('hidden');
    }
    if (st.until && st.until(app, s)) this.next();
  }

  next(): void {
    document.querySelectorAll('.pulse').forEach((e) => e.classList.remove('pulse'));
    this.i++;
  }
}
