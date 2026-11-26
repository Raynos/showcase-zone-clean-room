import type { Game } from '../../game';
import type { ChoiceOpt } from '../../ui/panels/common';

export type Choice = ChoiceOpt;

/**
 * A short choice on the panel family's choice sheet (ui/panels.ts, `choose`): a heading, a line, and a
 * stacked button for each answer. The `pri` answer is the sheet's one accent; its rule of the day, par
 * times and best go above the buttons as a chip, a medal row and a line. Resolves to the chosen id, or
 * null when the sheet is put off.
 */
export async function choose(g: Game, head: string, line: string, list: Choice[]): Promise<string | null> {
  const panels = g.panels as { choose(head: string, line: string, list: ChoiceOpt[], cancel?: string): Promise<string | null> } | null;
  if (!panels) return null;
  return panels.choose(head, line, list, 'Not now');
}
