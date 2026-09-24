import * as THREE from 'three';
import { ITEM_INFO } from './inventory.js';
import { CONFIG } from '../config.js';

// ?debug: FPS counter and console helpers on window.game:
//   game.teleport(level, spawn?)  level = id ('cistern'), index (1-7) or name
//   game.spawn(type, distance?)   type = acolyte | hound | drowned | lamprey | skinless | wallMaw | mother
//   game.give(item)               knife | revolver | shotgun | phone | fuse | crowbar | valve | ammo | shells | bandage | all
//   game.god(on?)                 toggle god mode (no damage)
//   game.kill()                   kill every enemy in the level
//   game.flag(name) / game.flags  story flags

export function installDebug(game) {
  game.fpsFrames = 0;
  game.fpsTime = 0;

  game.teleport = (level, spawn) => {
    const id = game.levels.resolve(level);
    if (!id) return `unknown level: ${level}. Try ${game.levels.defs.map((d) => d.id).join(', ')}`;
    if (game.state === 'title') game.start({ level: id, spawn });
    else {
      game.levels.byId[id].prepare?.(game);
      game.levels.goTo(id, spawn || 'start');
    }
    return `teleporting to ${id}`;
  };

  game.spawn = (type, distance = 4) => {
    const p = game.player;
    const dir = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const pos = p.position.clone().addScaledVector(dir, distance);
    const g = game.levels.current.physics.groundAt(pos.x, pos.z, pos.y + 1.5);
    if (g.y > -Infinity) pos.y = g.y;
    const e = game.enemies.spawn(type, pos, { yaw: Math.atan2(-dir.x, -dir.z), idle: type === 'wallMaw' ? 'dormant' : 'stand' });
    return e ? `spawned ${type}` : `unknown enemy: ${type}`;
  };

  game.give = (item) => {
    const inv = game.inventory;
    if (item === 'all') {
      for (const id of Object.keys(ITEM_INFO)) inv.addItem(id, { silent: true });
      inv.addAmmo('revolver', 36);
      inv.addAmmo('shotgun', 16);
      return 'gave everything';
    }
    if (item === 'ammo') {
      inv.addAmmo('revolver', 12);
      return '+12 revolver rounds';
    }
    if (item === 'shells') {
      inv.addAmmo('shotgun', 8);
      return '+8 shells';
    }
    if (item === 'bandage' || item === 'health') {
      game.player.heal(CONFIG.player.maxHealth);
      return 'healed';
    }
    if (!ITEM_INFO[item]) return `unknown item: ${item}. Try ${Object.keys(ITEM_INFO).join(', ')}, ammo, shells, bandage, all`;
    inv.addItem(item);
    return `gave ${item}`;
  };

  game.god = (on) => {
    game.godMode = on === undefined ? !game.godMode : !!on;
    return `god mode ${game.godMode ? 'on' : 'off'}`;
  };

  game.kill = () => {
    game.enemies.killAll();
    return 'killed all enemies';
  };

  game.flag = (name) => {
    game.setFlag(name);
    return [...game.flags];
  };

  // Scripted play-testing helpers.
  game.place = (x, z, lookX = x, lookZ = z - 1, pitch = 0, y = null) => {
    const p = game.player;
    const gy = y ?? game.levels.current.physics.groundAt(x, z, p.position.y + 1.5).y;
    p.position.set(x, gy === -Infinity ? p.position.y : gy, z);
    p.yaw = Math.atan2(-(lookX - x), -(lookZ - z));
    p.pitch = pitch;
    p.eyeY = null;
    p.velocity.set(0, 0, 0);
  };
  game.press = (code) => game.input.pressed.add(code);
  game.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  game.aimAt = (target) => {
    const p = game.player;
    const e = game.camera.position;
    p.yaw = Math.atan2(-(target.x - e.x), -(target.z - e.z));
    p.pitch = Math.atan2(target.y - e.y, Math.hypot(target.x - e.x, target.z - e.z));
  };

  window.game = game;
  console.info('[debug] window.game: teleport(level), spawn(type), give(item), god(), kill(), flag(name)');
}

export function updateDebug(game, dt) {
  game.fpsFrames++;
  game.fpsTime += dt;
  if (game.fpsTime < 0.5) return;
  const fps = game.fpsFrames / game.fpsTime;
  game.fpsFrames = 0;
  game.fpsTime = 0;
  const info = game.renderer.info;
  const p = game.player.position;
  const lvl = game.levels.current;
  game.hud.fps(
    `${fps.toFixed(0)} fps  ${info.render.calls} calls  ${(info.render.triangles / 1000).toFixed(0)}k tris\n` +
      `${lvl ? lvl.id : '-'}  ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}${game.godMode ? '  GOD' : ''}\n` +
      `${lvl ? lvl.enemies.filter((e) => !e.dead).length : 0} enemies  hp ${game.player.health.toFixed(0)}`,
  );
}
