import './ui/styles.css';
import { App } from './ui/app';
import { step } from './sim/sim';

async function boot(): Promise<void> {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('12px "Pixelify Sans"'), document.fonts.load('12px "Pixelify Sans"', 'Світло є ґїєі')]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    /* шрифт не обов’язковий */
  }
  const app = new App();
  (window as unknown as { __app: App }).__app = app;
  (window as unknown as { __sim: unknown }).__sim = { step };
  (window as unknown as { __ready: boolean }).__ready = true;
}

void boot();
