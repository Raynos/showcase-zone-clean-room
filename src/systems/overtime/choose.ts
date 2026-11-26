import type { Game } from '../../game';

export interface Choice { id: string; title: string; sub: string; pri?: boolean }

/**
 * A short choice in the panel family's confirm sheet (the outpost boards ask the same way,
 * systems/objectives/daily.ts): a heading, a line, and a stacked button for each choice. Resolves to
 * the chosen id, or null when the sheet is closed.
 */
export async function choose(g: Game, head: string, line: string, list: Choice[]): Promise<string | null> {
  const panels = g.panels as { confirm(t: string, y: string, n: string): Promise<boolean> } | null;
  if (!panels) return null;
  const row = (c: Choice) => `<div class="pn-btn ${c.pri ? 'pri' : 'ghost'}" data-m="1" data-pick="${c.id}" style="display:flex;flex-direction:column;align-items:flex-start;justify-content:center;width:100%;min-height:56px;margin:8px 0 0;padding:8px 14px;text-align:left;white-space:normal"><span>${c.title}</span><small style="display:block;margin-top:3px;font-size:12px;color:inherit;opacity:.85;font-weight:600;letter-spacing:0;text-transform:none;line-height:1.3;white-space:normal">${c.sub}</small></div>`;
  let pick: string | null = null;
  const grab = (e: Event) => { const el = (e.target as HTMLElement).closest?.('[data-pick]') as HTMLElement | null; if (el) pick = el.dataset.pick ?? null; };
  window.addEventListener('pointerup', grab, true);
  try {
    const ok = await panels.confirm(`${head}<small>${line}</small>${list.map(row).join('')}`, 'Not now', '');
    return ok && pick ? pick : null;
  } finally { window.removeEventListener('pointerup', grab, true); }
}
