import './ui/styles.css';
import { App } from './ui/app';
import { step } from './sim/sim';
import { loadProgress } from './core/save';
import { applyFont, loadFont } from './ui/fonts';

async function boot(): Promise<void> {
  // шрифт із налаштувань — до побудови інтерфейсу, щоб підписи на мапі одразу були правильні
  const st = loadProgress().settings;
  await loadFont(applyFont(st.font, st.fontScale));
  const app = new App();
  (window as unknown as { __app: App }).__app = app;
  (window as unknown as { __sim: unknown }).__sim = { step };
  (window as unknown as { __ready: boolean }).__ready = true;
}

void boot();
