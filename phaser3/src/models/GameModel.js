import { BombTypes, BossBombType, Characters, DIRS, TileType } from '../core/constants.js';
import { GridMath } from '../core/GridMath.js';
import { Bomb } from '../entities/Bomb.js';
import { Boss } from '../entities/Boss.js';
import { Enemy } from '../entities/Enemy.js';
import { Item } from '../entities/Item.js';
import { Player } from '../entities/Player.js';
import { TileMap } from './TileMap.js';

const Phaser = window.Phaser;
const MAX_LEVEL = 6;
const SHARED_PLAYER_SPAWN = { x: 1, y: 1 };
const ENEMY_SPAWN_HINTS = [
  { x: 13, y: 11 },
  { x: 11, y: 1 },
  { x: 7, y: 9 },
  { x: 13, y: 5 },
  { x: 3, y: 11 },
  { x: 9, y: 3 },
  { x: 5, y: 7 },
  { x: 11, y: 9 },
  { x: 3, y: 5 },
  { x: 7, y: 11 },
  { x: 13, y: 9 },
  { x: 9, y: 7 },
  { x: 5, y: 1 },
  { x: 1, y: 7 },
  { x: 11, y: 3 },
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

export class GameModel {
  constructor(options = {}) {
    this.selectedCharacter = options.character || Characters[0];
    this.selectedBombType = options.bombType || BombTypes[0];
    this.playerIndex = options.playerIndex || 0;
    this.playerCount = Math.max(1, options.playerCount || 1);
    this.level = Math.min(MAX_LEVEL, Math.max(1, options.level || 1));
    this.mapSeed = options.mapSeed || 'solo';
    const spawn = SHARED_PLAYER_SPAWN;
    this.map = new TileMap(this.level, this.mapSeed);
    this.player = new Player(spawn.x, spawn.y, this.selectedCharacter, this.selectedBombType);
    this.applyPlayerStats(options.playerStats);
    this.infiniteLives = Boolean(options.infiniteLives || options.playerStats?.infiniteLives);
    this.enemies = [];
    this.boss = null;
    this.bombs = new Map();
    this.items = new Map();
    this.score = options.score || 0;
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
    if (this.level === 3) {
      this.spawnBoss();
      this.spawnLevelThreeEnemies();
      return;
    }
    if (this.level === 6) {
      this.spawnBoss(FOREST_BOSS_SPAWN);
    }

    const count = this.playerCount * 4;
    const used = new Set();

    ENEMY_SPAWN_HINTS.slice(0, count).forEach((spot) => {
      const pos = this.map.findNearestOpen(spot.x, spot.y);
      const key = GridMath.key(pos.x, pos.y);
      if (used.has(key)) return;

      used.add(key);
      const enemy = new Enemy(pos.x, pos.y);
      enemy.id = `enemy-${this.enemies.length}`;
      this.enemies.push(enemy);
    });
  }

  spawnLevelThreeEnemies() {
    const count = Math.min(this.playerCount * 5, 12);
    const used = new Set([
      GridMath.key(this.player.gridX, this.player.gridY),
      this.boss ? GridMath.key(this.boss.gridX, this.boss.gridY) : ''
    ]);

    LEVEL_THREE_ENEMY_SPAWN_HINTS.slice(0, count).forEach((spot) => {
      const pos = this.map.findNearestOpen(spot.x, spot.y);
      const key = GridMath.key(pos.x, pos.y);
      if (used.has(key)) return;

      used.add(key);
      const enemy = new Enemy(pos.x, pos.y);
      enemy.id = `enemy-${this.enemies.length}`;
      this.enemies.push(enemy);
    });
  }

  spawnBoss(spawn = BOSS_SPAWN) {
    const pos = this.map.findNearestOpen(spawn.x, spawn.y);
    this.boss = new Boss(pos.x, pos.y);
  }

  enableInfiniteLives() {
    this.infiniteLives = true;
  }

  respawnPlayer(invincibleUntil) {
    this.player.setGridPosition(SHARED_PLAYER_SPAWN.x, SHARED_PLAYER_SPAWN.y);
    this.player.respawn(invincibleUntil);
    return SHARED_PLAYER_SPAWN;
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
    return bomb;
  }

  placeBossBomb(x, y) {
    const key = GridMath.key(x, y);
    if (!this.boss || this.bombs.has(key) || !this.map.isEmpty(x, y)) return null;

    const bomb = new Bomb(x, y, this.boss.getBombRange(), BossBombType, 'boss');
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
    if (!this.boss || !this.boss.isAlive()) return false;

    const hit = cells.some((cell) => {
      return Math.abs(cell.x - this.boss.gridX) <= 1 && Math.abs(cell.y - this.boss.gridY) <= 1;
    });
    if (!hit) return false;

    const killed = this.boss.takeDamage(10);
    if (killed) {
      this.score += 1000;
    } else {
      this.score += 80;
    }
    return killed;
  }

  isBossAlive() {
    return Boolean(this.boss?.isAlive());
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

  isPlayerWalkable(x, y) {
    if (!this.map.isEmpty(x, y)) return false;
    const key = GridMath.key(x, y);
    if (!this.bombs.has(key)) return true;
    return x === this.player.gridX && y === this.player.gridY;
  }

  endGame(won) {
    this.gameOver = true;
    this.won = won;
  }

  hasNextLevel() {
    return this.level < MAX_LEVEL;
  }
}
