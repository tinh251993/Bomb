import { BombTypes, BossBombType, BossTypes, Characters, DIRS, TileType } from '../core/constants.js';
import { GridMath } from '../core/GridMath.js';
import { Bomb } from '../entities/Bomb.js';
import { EagleBoss } from '../entities/EagleBoss.js';
import { Enemy } from '../entities/Enemy.js';
import { Item } from '../entities/Item.js';
import { PirateBoss } from '../entities/PirateBoss.js';
import { Player } from '../entities/Player.js';
import { TileMap } from './TileMap.js';

const Phaser = window.Phaser;
const MAX_LEVEL = 6;
const SHARED_PLAYER_SPAWN = { x: 1, y: 1 };
const ENEMY_SPAWN_HINTS = [
  { x: 24, y: 11 },
  { x: 22, y: 1 },
  { x: 18, y: 9 },
  { x: 24, y: 5 },
  { x: 13, y: 11 },
  { x: 20, y: 3 },
  { x: 5, y: 7 },
  { x: 22, y: 9 },
  { x: 3, y: 5 },
  { x: 7, y: 11 },
  { x: 16, y: 9 },
  { x: 9, y: 7 },
  { x: 5, y: 1 },
  { x: 1, y: 7 },
  { x: 18, y: 3 },
  { x: 7, y: 5 }
];
const LEVEL_THREE_ENEMY_SPAWN_HINTS = [
  { x: 13, y: 1 },
  { x: 10, y: 1 },
  { x: 7, y: 3 },
  { x: 12, y: 3 },
  { x: 9, y: 5 },
  { x: 5, y: 5 },
  { x: 13, y: 7 },
  { x: 10, y: 7 },
  { x: 7, y: 9 },
  { x: 12, y: 9 },
  { x: 9, y: 11 },
  { x: 5, y: 11 }
];
const BOSS_SPAWN = { x: 3, y: 9 };
const FOREST_BOSS_SPAWN = { x: 12, y: 5 };
const BOSS_SPAWN_HINTS = [
  BOSS_SPAWN,
  { x: 20, y: 9 },
  FOREST_BOSS_SPAWN,
  { x: 20, y: 3 }
];
const FOREST_BOSS_SPAWN_HINTS = [
  FOREST_BOSS_SPAWN,
  { x: 20, y: 5 },
  { x: 4, y: 5 },
  { x: 20, y: 9 }
];
const BASE_ENEMY_COUNT = 4;
const DEFAULT_BOSS_TYPE = BossTypes[0];

export class GameModel {
  constructor(options = {}) {
    this.selectedCharacter = options.character || Characters[0];
    this.selectedBombType = options.bombType || BombTypes[0];
    this.playerIndex = options.playerIndex || 0;
    this.playerCount = Math.max(1, options.playerCount || 1);
    this.customMap = options.customMap || null;
    this.mapType = this.customMap?.type || (Number(options.level || 1) >= 4 ? 'forest' : 'pirate');
    this.level = Math.min(MAX_LEVEL, Math.max(1, options.level || 1));
    this.mapSeed = options.mapSeed || 'solo';
    const spawn = SHARED_PLAYER_SPAWN;
    this.map = new TileMap(this.level, this.mapSeed, this.customMap?.layout);
    this.player = new Player(spawn.x, spawn.y, this.selectedCharacter, this.selectedBombType);
    this.applyPlayerStats(options.playerStats);
    this.infiniteLives = Boolean(options.infiniteLives || options.playerStats?.infiniteLives);
    this.enemies = [];
    this.speedMultiplier = this.getLevelSpeedMultiplier();
    this.bosses = [];
    this.boss = null;
    this.bombs = new Map();
    this.playerPassThroughBombs = new Set();
    this.items = new Map();
    this.score = options.score || 0;
    this.levelDeathCount = Math.max(0, Number(options.levelDeathCount || options.playerStats?.levelDeathCount || 0));
    this.gameOver = false;
    this.won = false;
    this.spawnEnemies();
  }

  applyPlayerStats(stats) {
    if (!stats) return;

    this.player.maxBombs = Math.max(1, stats.maxBombs || this.player.maxBombs);
    this.player.bombRange = Math.max(1, stats.bombRange || this.player.bombRange);
    this.player.speed = Math.max(120, stats.speed || this.player.speed);
    this.player.currentBombType = stats.currentBombType || this.player.currentBombType;
  }

  spawnEnemies() {
    const customBoss = this.customMap?.objects?.find((object) => object.kind === 'boss');
    if (customBoss) {
      this.spawnBoss({ x: customBoss.x, y: customBoss.y, bossType: customBoss.bossType || customBoss.type });
    }
    this.spawnLevelBosses();

    const customEnemies = this.customMap?.objects?.filter((object) => object.kind === 'enemy') || [];
    if (customEnemies.length > 0) {
      this.spawnCustomEnemies(customEnemies);
      return;
    }

    if (this.level === 3) {
      this.spawnLevelThreeEnemies();
      return;
    }

    const count = this.getScaledEnemyCount(ENEMY_SPAWN_HINTS.length);
    const used = new Set([
      GridMath.key(this.player.gridX, this.player.gridY),
      ...this.getBossOccupiedKeys()
    ]);

    ENEMY_SPAWN_HINTS.slice(0, count).forEach((spot) => {
      const pos = this.map.findNearestOpen(spot.x, spot.y);
      const key = GridMath.key(pos.x, pos.y);
      if (used.has(key)) return;

      used.add(key);
      const enemy = new Enemy(pos.x, pos.y, this.speedMultiplier);
      enemy.id = `enemy-${this.enemies.length}`;
      this.enemies.push(enemy);
    });
  }

  getLevelSpeedMultiplier() {
    return 1 + (this.level - 1) * 0.1;
  }

  getScaledEnemyCount(maxCount) {
    return Math.min(maxCount, BASE_ENEMY_COUNT * this.playerCount + this.level - 1);
  }

  spawnLevelBosses() {
    const targetCount = Math.floor(this.level / 3);
    while (this.bosses.length < targetCount) {
      const hints = this.level >= 6 ? FOREST_BOSS_SPAWN_HINTS : BOSS_SPAWN_HINTS;
      const spawn = hints[this.bosses.length] || hints[hints.length - 1];
      this.spawnBoss(spawn);
    }
  }

  spawnCustomEnemies(customEnemies) {
    const used = new Set([
      GridMath.key(this.player.gridX, this.player.gridY),
      ...this.getBossOccupiedKeys()
    ]);

    customEnemies.forEach((spot) => {
      const x = Number(spot.x) || 1;
      const y = Number(spot.y) || 1;
      const key = GridMath.key(x, y);
      if (!this.map.isEmpty(x, y)) return;
      if (used.has(key)) return;

      used.add(key);
      const enemy = new Enemy(x, y, this.speedMultiplier);
      enemy.id = `enemy-${this.enemies.length}`;
      this.enemies.push(enemy);
    });
  }

  spawnLevelThreeEnemies() {
    const count = this.getScaledEnemyCount(LEVEL_THREE_ENEMY_SPAWN_HINTS.length);
    const used = new Set([
      GridMath.key(this.player.gridX, this.player.gridY),
      ...this.getBossOccupiedKeys()
    ]);

    LEVEL_THREE_ENEMY_SPAWN_HINTS.slice(0, count).forEach((spot) => {
      const pos = this.map.findNearestOpen(spot.x, spot.y);
      const key = GridMath.key(pos.x, pos.y);
      if (used.has(key)) return;

      used.add(key);
      const enemy = new Enemy(pos.x, pos.y, this.speedMultiplier);
      enemy.id = `enemy-${this.enemies.length}`;
      this.enemies.push(enemy);
    });
  }

  spawnBoss(spawn = BOSS_SPAWN) {
    const pos = this.findNearestBossArea(spawn.x, spawn.y);
    const bossType = this.resolveBossType(spawn.bossType);
    const BossClass = bossType.id === 'eagle' ? EagleBoss : PirateBoss;
    const boss = new BossClass(pos.x, pos.y, 1.2 * this.speedMultiplier, bossType);
    boss.id = `boss-${this.bosses.length}`;
    this.bosses.push(boss);
    this.boss = this.bosses[0] || null;
    return boss;
  }

  resolveBossType(typeId) {
    return BossTypes.find((type) => type.id === typeId) || DEFAULT_BOSS_TYPE;
  }

  getBossOccupiedKeys() {
    return this.bosses.flatMap((boss) => {
      return boss.getOccupiedCells().map((cell) => GridMath.key(cell.x, cell.y));
    });
  }

  findNearestBossArea(startX, startY) {
    for (let radius = 0; radius < this.map.grid[0].length; radius++) {
      for (let y = Math.max(1, startY - radius); y < Math.min(this.map.grid.length - 2, startY + radius + 1); y++) {
        for (let x = Math.max(1, startX - radius); x < Math.min(this.map.grid[y].length - 2, startX + radius + 1); x++) {
          if (this.canBossOccupy(x, y)) return { x, y };
        }
      }
    }
    return this.map.findNearestOpen(startX, startY);
  }

  enableInfiniteLives() {
    this.infiniteLives = true;
  }

  respawnPlayer(invincibleUntil) {
    this.player.setGridPosition(SHARED_PLAYER_SPAWN.x, SHARED_PLAYER_SPAWN.y);
    this.player.respawn(invincibleUntil);
    return SHARED_PLAYER_SPAWN;
  }

  recordLevelDeath() {
    this.levelDeathCount++;
    return this.levelDeathCount;
  }

  canPlaceBomb() {
    return !this.gameOver && this.player.isAliveState() && this.countPlayerBombs() < this.player.maxBombs;
  }

  countPlayerBombs() {
    return Array.from(this.bombs.values()).filter((bomb) => bomb.owner === 'player').length;
  }

  placeBomb(x, y) {
    if (!this.canPlaceBomb()) return null;

    const key = GridMath.key(x, y);
    if (this.bombs.has(key)) return null;

    const bomb = new Bomb(x, y, this.player.bombRange, this.player.currentBombType, 'player');
    this.bombs.set(key, bomb);
    this.playerPassThroughBombs.add(key);
    return bomb;
  }

  placeBossBomb(x, y, sourceBoss = this.boss, rangeOverride = null) {
    const key = GridMath.key(x, y);
    if (!this.isBossAlive() || this.bombs.has(key) || !this.map.isEmpty(x, y)) return null;

    const aliveBoss = sourceBoss?.isAlive() ? sourceBoss : this.bosses.find((boss) => boss.isAlive()) || this.boss;
    if (!aliveBoss) return null;
    const bomb = new Bomb(x, y, rangeOverride || aliveBoss.getBombRange(), BossBombType, 'boss');
    this.bombs.set(key, bomb);
    return bomb;
  }

  placeRemoteBomb(x, y, range, type) {
    const key = GridMath.key(x, y);
    if (this.bombs.has(key) || !this.map.isEmpty(x, y)) return null;

    const bomb = new Bomb(x, y, range, type, 'remote');
    this.bombs.set(key, bomb);
    return bomb;
  }

  getRandomBossBombSpots(count) {
    const spots = [];
    const used = new Set(this.bombs.keys());
    const candidates = [];

    for (let y = 1; y < this.map.grid.length - 1; y++) {
      for (let x = 1; x < this.map.grid[y].length - 1; x++) {
        const key = GridMath.key(x, y);
        if (this.map.isEmpty(x, y) && !used.has(key)) candidates.push({ x, y, key });
      }
    }

    Phaser.Utils.Array.Shuffle(candidates).slice(0, count).forEach((spot) => {
      used.add(spot.key);
      spots.push({ x: spot.x, y: spot.y });
    });

    return spots;
  }

  removeBomb(key) {
    const bomb = this.bombs.get(key);
    if (!bomb) return null;

    bomb.destroy();
    this.bombs.delete(key);
    this.playerPassThroughBombs.delete(key);
    return bomb;
  }

  getExplosionCells(bomb) {
    const affected = [{ x: bomb.gridX, y: bomb.gridY }];

    DIRS.forEach((dir) => {
      for (let step = 1; step <= bomb.range; step++) {
        const tx = bomb.gridX + dir.x * step;
        const ty = bomb.gridY + dir.y * step;
        const tile = this.map.get(tx, ty);

        if (tile === TileType.WALL || tile === TileType.WATER) break;

        affected.push({ x: tx, y: ty });

        if (tile === TileType.CRATE) break;
      }
    });

    return affected;
  }

  breakCrates(cells) {
    const broken = [];
    cells.forEach((cell) => {
      if (this.map.get(cell.x, cell.y) !== TileType.CRATE) return;

      this.map.set(cell.x, cell.y, TileType.EMPTY);
      this.score += 15;
      broken.push(cell);
    });
    return broken;
  }

  destroyTilesInRadius(centerX, centerY, radius) {
    const destroyed = [];

    for (let y = centerY - radius; y <= centerY + radius; y++) {
      for (let x = centerX - radius; x <= centerX + radius; x++) {
        if (x <= 0 || y <= 0 || x >= this.map.grid[0].length - 1 || y >= this.map.grid.length - 1) continue;
        if (Math.abs(x - centerX) + Math.abs(y - centerY) > radius) continue;
        if (this.map.get(x, y) === TileType.EMPTY) continue;

        this.map.set(x, y, TileType.EMPTY);
        destroyed.push({ x, y });
      }
    }

    return destroyed;
  }

  maybeDropItem(x, y) {
    if (this.map.randomAt(x, y) >= 0.34) return null;

    const types = ['bomb', 'flame', 'speed'];
    const typeIndex = Math.min(types.length - 1, Math.floor(this.map.randomAt(x + 17, y + 31) * types.length));
    const type = types[typeIndex];
    const item = new Item(x, y, type);
    this.items.set(GridMath.key(x, y), item);
    return item;
  }

  collectItemAt(x, y) {
    const key = GridMath.key(x, y);
    const item = this.items.get(key);
    if (!item) return null;

    if (item.type === 'bomb') this.player.addBombCapacity();
    if (item.type === 'flame') this.player.addBombRange();
    if (item.type === 'speed') this.player.addSpeed();

    item.destroy();
    this.items.delete(key);
    this.score += 40;
    return item;
  }

  removeItemAt(x, y) {
    const key = GridMath.key(x, y);
    const item = this.items.get(key);
    if (!item) return null;

    item.destroy();
    this.items.delete(key);
    return item;
  }

  removeItemsIn(cells) {
    const removed = [];
    cells.forEach((cell) => {
      const item = this.removeItemAt(cell.x, cell.y);
      if (item) removed.push(item);
    });
    return removed;
  }

  getBombKeysIn(cells) {
    const hit = new Set(cells.map((cell) => GridMath.key(cell.x, cell.y)));
    return Array.from(this.bombs.keys()).filter((key) => hit.has(key));
  }

  killEnemiesIn(cells) {
    const hit = new Set(cells.map((cell) => GridMath.key(cell.x, cell.y)));
    const killed = [];

    this.enemies.forEach((enemy) => {
      if (!enemy.isAlive() || !hit.has(GridMath.key(enemy.gridX, enemy.gridY))) return;
      enemy.destroy();
      this.score += 120;
      killed.push(enemy);
    });

    this.enemies = this.enemies.filter((enemy) => enemy.isAlive());
    return killed;
  }

  killAllEnemies() {
    const killed = [];

    this.enemies.forEach((enemy) => {
      if (!enemy.isAlive()) return;
      enemy.destroy();
      this.score += 120;
      killed.push(enemy);
    });

    this.enemies = [];
    return killed;
  }

  damageBossIn(cells) {
    const killedBosses = [];

    this.bosses.forEach((boss) => {
      if (!boss.isAlive()) return;

      const bossCells = new Set(boss.getOccupiedCells().map((cell) => GridMath.key(cell.x, cell.y)));
      const hit = cells.some((cell) => bossCells.has(GridMath.key(cell.x, cell.y)));
      if (!hit) return;

      const killed = boss.takeDamage(10);
      if (killed) {
        this.score += 1000;
        killedBosses.push(boss);
      } else {
        this.score += 80;
      }
    });

    this.boss = this.bosses.find((boss) => boss.isAlive()) || null;
    return killedBosses;
  }

  isBossAlive() {
    return this.bosses.some((boss) => boss.isAlive());
  }

  getAliveEnemyCount() {
    return this.enemies.filter((enemy) => enemy.isAlive()).length;
  }

  getAliveBossCount() {
    return this.bosses.filter((boss) => boss.isAlive()).length;
  }

  isLevelCleared() {
    return this.enemies.length === 0 && !this.isBossAlive();
  }

  isPlayerIn(cells) {
    if (this.player.isDead()) return false;
    return cells.some((cell) => cell.x === this.player.gridX && cell.y === this.player.gridY);
  }

  isWalkable(x, y) {
    return this.map.isEmpty(x, y) && !this.bombs.has(GridMath.key(x, y));
  }

  canBossOccupy(x, y, ignoredBoss = null) {
    const occupied = new Set();
    this.bosses.forEach((boss) => {
      if (!boss.isAlive()) return;
      if (boss === ignoredBoss) return;
      boss.getOccupiedCells().forEach((cell) => occupied.add(GridMath.key(cell.x, cell.y)));
    });

    const cells = [
      { x, y },
      { x: x + 1, y },
      { x, y: y + 1 },
      { x: x + 1, y: y + 1 }
    ];
    return cells.every((cell) => {
      const key = GridMath.key(cell.x, cell.y);
      return this.map.isEmpty(cell.x, cell.y) && !this.bombs.has(key) && !occupied.has(key);
    });
  }

  isPlayerWalkable(x, y) {
    if (!this.map.isEmpty(x, y)) return false;
    const key = GridMath.key(x, y);
    if (!this.bombs.has(key)) return true;
    return this.playerPassThroughBombs.has(key);
  }

  updatePlayerPassThroughBombs(overlapCells) {
    const overlapped = new Set(overlapCells.map((cell) => GridMath.key(cell.x, cell.y)));
    Array.from(this.playerPassThroughBombs).forEach((key) => {
      if (!this.bombs.has(key) || !overlapped.has(key)) {
        this.playerPassThroughBombs.delete(key);
      }
    });
  }

  endGame(won) {
    this.gameOver = true;
    this.won = won;
  }

  hasNextLevel() {
    return this.level < MAX_LEVEL;
  }
}
