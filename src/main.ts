import { Game } from './game';

const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none';
const boot = document.getElementById('boot')!;
const bar = document.getElementById('bootbar')!;
const text = document.getElementById('boottext')!;
const game = new Game();
(window as any).game = game;
game.boot(canvas, (p, label) => { bar.style.width = `${Math.round(p * 100)}%`; text.textContent = label; })
  .then(() => { boot.style.opacity = '0'; setTimeout(() => boot.remove(), 700); })
  .catch((e) => { console.error(e); text.textContent = 'FAILED: ' + (e?.message ?? e); });
