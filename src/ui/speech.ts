/**
 * The line a conversation is saying right now, for whoever performs it (the speaker's mouth and hands in
 * systems/npcs.ts, a voice, a subtitle log). The conversation sheet (ui/panels/dialog.ts) is the one writer:
 * it reveals a line at a reading pace and reports every step here, so nobody reads the sheet's DOM to learn
 * what is being said.
 *
 *   speech.text       the whole line (one beat of the speaker's script), '' when nobody is talking
 *   speech.shown      how many of its letters have been revealed (fractional)
 *   speech.speaking   true from the first letter until the last one (or until a tap finishes the line)
 *   speech.on(fn)     fn(true, text) when a line starts, fn(false, text) when it has been said; returns
 *                     a function that unsubscribes
 *
 * A line shown whole (reduced motion, a conversation picked up again) starts already said: it raises nothing.
 */
type Heard = (speaking: boolean, text: string) => void;

class Speech {
  text = '';
  shown = 0;
  speaking = false;
  private fns: Heard[] = [];

  on(fn: Heard): () => void {
    this.fns.push(fn);
    return () => { const i = this.fns.indexOf(fn); if (i >= 0) this.fns.splice(i, 1); };
  }
  /** The sheet's report: this line, this much of it revealed. */
  set(text: string, shown: number) {
    const was = this.speaking, old = this.text;
    this.text = text; this.shown = shown;
    this.speaking = shown < text.length;
    if (was && (!this.speaking || old !== text)) this.tell(false, old);
    if (this.speaking && (!was || old !== text)) this.tell(true, text);
  }
  /** The conversation is over. */
  clear() { this.set('', 0); }
  private tell(on: boolean, text: string) { for (const fn of [...this.fns]) fn(on, text); }
}

export const speech = new Speech();
