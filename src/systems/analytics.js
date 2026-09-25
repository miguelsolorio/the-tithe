// Gameplay events for Google Analytics (gtag is loaded in index.html).
// Dev builds and ?debug runs log to the console instead of sending, so
// playtesting doesn't pollute the numbers.
export class Analytics {
  constructor(game) {
    this.game = game;
    this.live = !import.meta.env.DEV && !game.debug;
    this.milestones = new Set();
    game.events.on('levelEnter', (id) => this.levelEnter(id));
    game.events.on('enemyKilled', (e, weapon) => this.enemyKilled(e, weapon));
  }

  send(name, params = {}) {
    if (!this.live) return console.debug('[analytics]', name, params);
    try {
      window.gtag?.('event', name, params);
    } catch {
      // Blocked or broken tag: never let analytics break the game.
    }
  }

  // Common context: where the player is and how long this run has lasted.
  ctx() {
    const g = this.game;
    return { level_id: g.levels.current?.id || null, run_seconds: Math.round(g.time - g.stats.start) };
  }

  // New run (fresh start or continue): milestones count once per run.
  runStart(mode) {
    this.milestones.clear();
    for (const f of this.game.flags) this.milestones.add(f);
    this.send('game_start', { mode });
  }

  levelEnter(id) {
    const g = this.game;
    const index = g.levels.defs.findIndex((l) => l.id === id);
    this.send('level_enter', { ...this.ctx(), level_id: id, level_index: index, level_name: g.levels.byId[id]?.name || id });
  }

  enemyKilled(enemy, weapon) {
    this.send('enemy_killed', { ...this.ctx(), enemy_type: enemy.type || 'unknown', weapon: weapon || 'unknown', run_kills: this.game.stats.kills });
  }

  milestone(flag) {
    if (this.milestones.has(flag)) return;
    this.milestones.add(flag);
    this.send('milestone', { ...this.ctx(), milestone: flag });
  }

  itemPickup(id) {
    this.send('item_pickup', { ...this.ctx(), item_id: id });
  }

  death(cause) {
    this.send('player_death', { ...this.ctx(), cause: cause || 'unknown', run_deaths: this.game.stats.deaths });
  }

  retry() {
    this.send('checkpoint_retry', this.ctx());
  }

  quit() {
    const s = this.game.stats;
    this.send('game_quit', { ...this.ctx(), run_kills: s.kills, run_deaths: s.deaths });
  }

  bossDefeated() {
    this.send('boss_defeated', { ...this.ctx(), run_deaths: this.game.stats.deaths });
  }

  complete() {
    const s = this.game.stats;
    this.send('game_complete', { run_seconds: Math.round(this.game.time - s.start), run_kills: s.kills, run_deaths: s.deaths });
  }
}
