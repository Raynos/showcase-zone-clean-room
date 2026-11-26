// HUD states for tools/hud-matrix.sh. Same shape as tools/golden/scenes.js (run by tools/golden/lib.js):
// { n, name, what, hour?, setup(G, g) }. Each is staged once at the first size, then the viewport is
// changed live for every other size, so the matrix also exercises the HUD's live re-layout.
const HM_PI = Math.PI;
const hmFields = async (G, g, level) => {
  window.HM_AFTER = null;
  G.noCamps(); G.clearMobs(); G.level(level);
  g.quests.accept('q_welcome');
  G.place(40, 6, HM_PI / 2 + 0.3);
  G.cam(-HM_PI / 2 + 0.3, 0.1, 1);
};
// G.quiet() mutes every later headline (tools/golden/lib.js): a state that raises one takes the lane back first
const hmLane = (g) => { const l = g.hud.notices; if (l.__quiet) { delete l.push; l.__quiet = false; } l.clear(); };
const hmFight = async (G, g) => {
  const a = G.spawn('mite', 43.6, 5.2, { level: 2, aggro: true });
  G.spawn('pallet', 46, 9, { level: 3, aggro: true });
  await G.settleMobs();
  g.combat.target = a; g.player.invuln = 60;
  return a;
};
const HM_STATES = [
  {
    n: 1, name: 'town-idle', what: 'Idle in town: tracker, prompt, nothing in combat', hour: 11,
    async setup(G, g) {
      G.noCamps(); G.level(3);
      g.quests.accept('q_welcome');
      G.place(-30, 6, -HM_PI / 2);
      G.cam(HM_PI / 2, 0.14, 1);
      await G.secs(1.0); G.quiet();
      g.hud.log('Picked up Scrap ×3', 'loot'); g.hud.log('Quest accepted: First Day on the Yard', 'quest');
      g.hud.setInteract('Talk', 'chat');
    },
  },
  {
    n: 2, name: 'fight-target', what: 'In a fight with a target, a skill just used', hour: 12.5,
    async setup(G, g) {
      await hmFields(G, g, 6);
      await hmFight(G, g);
      await G.secs(1.0); G.quiet();
      await G.tap('skill1', 3); await G.secs(0.6);
      g.hud.log('Mite Lv 2 hits you for 4', 'combat');
      g.hud.damage({ x: 43.6, y: 1.2, z: 5.2 }, '27', ''); g.hud.damage({ x: 43.8, y: 1.6, z: 5.0 }, '61', 'crit');
    },
  },
  {
    n: 3, name: 'boss', what: 'Boss fight: boss bar, a second target, banner', hour: 15,
    async setup(G, g) {
      await hmFields(G, g, 9);
      const b = G.spawn('foreman', 47, 8, { level: 9, aggro: true });
      const a = G.spawn('mite', 43.6, 5.2, { level: 8, aggro: true });
      await G.settleMobs();
      g.combat.target = a; g.player.invuln = 60;
      await G.secs(1.0); G.quiet();
      g.hud.banner('FOREMAN UNIT 7', 'Shift boss', 'danger');
      await G.secs(0.5);
      void b;
    },
  },
  {
    n: 4, name: 'level1-locked', what: 'Level 1: third skill and Overdrive locked, so neither is drawn', hour: 10,
    async setup(G, g) {
      await hmFields(G, g, 1);
      await G.secs(1.0); G.quiet();
    },
  },
  {
    n: 5, name: 'level20-cooldown', what: 'Level 20 rifle: every skill cooling, energy low, hurt (kit seat), Overdrive full', hour: 13,
    async setup(G, g) {
      await hmFields(G, g, 20);
      G.weapon('rail_rifle', 0);
      await hmFight(G, g);
      await G.secs(0.6); G.quiet();
      for (const b of ['skill1', 'skill2', 'skill3']) { G.heal(); await G.tap(b, 3); await G.secs(0.9); }
      await G.tap('dodge', 3); await G.secs(0.1);
      g.state.d.hp = Math.round(g.state.maxHp * 0.5); g.state.addItem('kit', 3, true); await G.tap('potion', 3);
      g.combat.od = 100; g.state.d.energy = 4;
      await G.secs(0.3);
    },
  },
  {
    n: 6, name: 'bow-drawing', what: 'Bow equipped, drawing at a target', hour: 12,
    async setup(G, g) {
      await hmFields(G, g, 4);
      G.weapon('trainer_bow', 0);
      await hmFight(G, g);
      await G.secs(0.8); G.quiet();
      g.input.press('attack'); await G.secs(0.5);
    },
  },
  {
    n: 7, name: 'mounted', what: 'Riding the horse in the fields', hour: 9,
    async setup(G, g) {
      G.noCamps(); G.clearMobs(); G.level(5);
      g.quests.accept('q_welcome');
      g.state.setFlag('horse_whistle');
      G.place(-70, 30, 0);
      G.cam(HM_PI, 0.12, 1.1);
      await G.secs(0.5);
      await G.tap('mount', 3);
      await G.until(() => g.player.mode && g.player.mode.name === 'ride', 900);
      await G.secs(0.8); G.quiet();
    },
  },
  {
    n: 8, name: 'dialogue', what: 'Talking to the Yardmaster', hour: 11,
    async setup(G, g) {
      G.noCamps(); G.level(3);
      G.place(-30, 6, -HM_PI / 2);
      G.cam(HM_PI / 2, 0.14, 1);
      await G.secs(0.5); G.quiet();
      g.panels.talk('quest1');
      await G.secs(1.2);
    },
  },
  {
    n: 9, name: 'tip-card', what: 'A tip in a fight: its sentence in the lane under the target, the dodge button pulsing, a toast sent to the feed', hour: 12.5,
    async setup(G, g) {
      await hmFields(G, g, 2);
      await hmFight(G, g);
      await G.secs(0.6); G.quiet();
      window.HM_AFTER = () => {
        hmLane(g);
        g.hud.tip({ title: 'Read the floor', text: 'Red shapes on the ground are incoming attacks. Roll out with the dodge button: a late roll slows time.', at: 'dodge', secs: 999 });
        g.hud.toast('Scrap ×2', 'loot');
      };
      window.HM_AFTER();
      await G.secs(0.4);
    },
  },
  {
    n: 10, name: 'lefty-fight', what: 'Left-handed, in a fight (one-sided notch in landscape)', hour: 12.5,
    async setup(G, g) {
      g.state.d.settings.lefty = true;
      await hmFields(G, g, 6);
      await hmFight(G, g);
      await G.secs(1.0); G.quiet();
    },
  },
  {
    n: 11, name: 'shooter-rifle', what: 'Shooter stance with a rifle (fire, second fire, aim, reload)', hour: 12.5,
    async setup(G, g) {
      await hmFields(G, g, 12);
      G.weapon('rivet_rifle', 0); G.weapon('shop_blade', 1);
      await hmFight(G, g);
      // the shooter stance's own bar, as combat will send it (docs/UI-ENGINE-PLAN.md U5); fed by hand
      // until combat does, unless combat already sends a stance
      const c = g.combat, melee = c.actionBar.bind(c);
      const probe = melee();
      if (!probe.stance && !probe.some((s) => s.id === 'fire')) {
        c.actionBar = () => {
          const out = [];
          for (const s of melee()) {
            if (s.id === 'attack') {
              out.push({ ...s, id: 'fire', label: 'Fire', count: undefined });
              out.push({ ...s, id: 'fire2', label: '', count: undefined });
              out.push({ id: 'aim', icon: 'target', label: 'Aim', state: 'ready' });
              out.push({ id: 'reload', icon: 'ammo', label: 'Reload', state: 'ready', count: 6 });
            } else if (s.id !== 'target') out.push(s);
          }
          out.stance = 'shooter';
          return out;
        };
      }
      await G.secs(1.0); G.quiet();
    },
  },
  {
    n: 12, name: 'hurt-overdrive', what: 'Melee at level 12, hurt with kits left and Overdrive full: the cluster at its peak', hour: 12.5,
    async setup(G, g) {
      await hmFields(G, g, 12);
      G.weapon('shop_blade', 0); G.weapon('trainer_bow', 1);
      await hmFight(G, g);
      await G.secs(0.8); G.quiet();
      g.state.addItem('kit', 3, true); g.state.d.hp = Math.round(g.state.maxHp * 0.42);
      g.combat.od = 100;
      await G.secs(0.4);
    },
  },
  {
    n: 13, name: 'shooter-ads', what: 'Shooter stance, aiming down sights with rounds spent: left fire and reload are in', hour: 12.5,
    async setup(G, g) {
      await hmFields(G, g, 12);
      G.weapon('rivet_rifle', 0); G.weapon('shop_blade', 1);
      await hmFight(G, g);
      await G.secs(0.8); G.quiet();
      await G.tap('attack', 3); await G.secs(0.5); await G.tap('attack', 3); await G.secs(0.4);
      await G.tap('aim', 3); await G.secs(0.6);
    },
  },
  {
    n: 14, name: 'tray-open', what: 'Exploring with the menu tray open (on a desktop: the micro menu)', hour: 11,
    async setup(G, g) {
      await hmFields(G, g, 6);
      await G.secs(1.0); G.quiet();
      g.state.addScrip(25);
      window.HM_AFTER = (o) => { if (!o.mouse) document.querySelector('.hbtn').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 77, pointerType: 'touch' })); };
      await G.secs(0.4);
    },
  },
  {
    n: 15, name: 'wheel-open', what: 'The quick wheel open from the weapon chip', hour: 11,
    async setup(G, g) {
      await hmFields(G, g, 6);
      G.weapon('shop_blade', 0); G.weapon('trainer_bow', 1);
      g.state.setFlag('horse_whistle'); g.state.addItem('kit', 2, true);
      await G.secs(1.0); G.quiet();
      window.HM_AFTER = (o) => { if (!o.mouse) g.hud.openWheel(); };
      await G.secs(0.4);
    },
  },
  {
    n: 16, name: 'busy-fight', what: 'A fight with everything raised at once: toasts, a level, a zone, a streak, a tip; the lane shows one, the feed two', hour: 12.5,
    async setup(G, g) {
      await hmFields(G, g, 2);
      await hmFight(G, g);
      await G.secs(1.0); G.quiet();
      g.grind.cheat('streak'); g.grind.cheat('streak');
      window.HM_AFTER = () => {
        const h = g.hud;
        hmLane(g);
        h.toast('Brass Cog', 'loot', 'A collectible cog, off a robot', 'cog');
        h.toast('Crate Mites broken: 4/5', 'quest');
        h.toast('Bounty paid', 'quest', 'Break 5 guards · +10 XP, 60 scrip', 'check');
        h.banner('LEVEL 3', 'Health and energy restored', 'level');
        h.banner(g.zoneName, 'Levels 1-3', '');
        h.log('+2 Copper Wire', 'loot'); h.log('+1 Scrap Plating', 'loot'); h.log('+1 Brass Cog', 'loot');
        h.tip({ title: 'Read the floor', text: 'Red shapes on the ground are incoming attacks. Roll out with the dodge button: a late roll slows time.', at: 'dodge' });
      };
      window.HM_AFTER();
      await G.secs(0.4);
    },
  },
  {
    n: 17, name: 'calm-news', what: 'Out of a fight: a headline in the lane, the streak cooling, the tuning offer as a chip', hour: 12.5,
    async setup(G, g) {
      await hmFields(G, g, 2);
      await G.secs(3.0); G.quiet();
      g.grind.cheat('streak');
      g.grind.cheat('tune'); g.grind.cheat('tune');
      window.HM_AFTER = () => { hmLane(g); g.hud.toast('Vista found', 'secret', 'The Lookout'); g.hud.banner('LEVEL 3', 'Health and energy restored', 'level'); };
      window.HM_AFTER();
      await G.secs(0.5);
    },
  },
  {
    n: 18, name: 'first-minute', what: 'Before the first job: a crate drop and a bounty both want the column (one line shows), chat in the feed, the first tip lit', hour: 11,
    async setup(G, g) {
      window.HM_AFTER = null;
      G.noCamps(); G.clearMobs(); G.level(1);
      for (const id in g.state.d.quests) delete g.state.d.quests[id];
      g.grind.ensureBounties();
      G.place(-30, 6, -HM_PI / 2); G.cam(HM_PI / 2, 0.14, 1);
      await G.secs(1.0); G.quiet();
      hmCrate();
      g.hud.log('Nyx: Shift Boss Slag is up in the Slagworks again', 'chat'); g.hud.log('Kestrel: Selling 9 Blast Bolts, 10 each', 'chat');
      window.HM_AFTER = () => { hmLane(g); g.hud.tip({ title: 'Find work', text: 'A yellow ! means a job. Walk up and tap the prompt.', secs: 999 }); };
      window.HM_AFTER();
      await G.secs(0.6);
    },
  },
  {
    n: 19, name: 'full-column', what: 'Later, out of a fight: a quest, a crate drop, chat in the feed and a zone headline over them', hour: 11,
    async setup(G, g) {
      await hmFields(G, g, 3);
      g.state.d.quests.q_welcome = { state: 'done', prog: [5] };
      g.quests.accept('q_salvage');
      g.grind.ensureBounties();
      await G.secs(1.0); G.quiet();
      hmCrate();
      g.hud.log('Oskar: Rares. More hp, better salvage, boar', 'chat'); g.hud.log('Dace: what are the gold glinting robots', 'chat');
      window.HM_AFTER = () => { hmLane(g); g.hud.banner(g.zoneName, 'Peaceful'); };
      window.HM_AFTER();
      await G.secs(0.6);
    },
  },
];
// the crate drop's line as systems/events.ts draws it (the event itself is the zone's to schedule)
function hmCrate() {
  const c = document.querySelector('.lz-evcard');
  if (!c) return;
  c.className = 'lz-evcard on';
  c.innerHTML = '<div class="lz-ev-h"><b>CRATEFALL</b><span>2:08</span></div><div class="lz-ev-r"><i><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M5 12h14"/></svg></i>64 m · Guarded · 3 left</div><div class="lz-ev-s">Supply drop · Crate Fields</div>';
}
if (window.GOLDEN) window.GOLDEN.scenes = HM_STATES;
