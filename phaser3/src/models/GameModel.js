import { BombTypes, Characters, DIRS, TileType } from '../core/constants.js';
import { GridMath } from '../core/GridMath.js';
import { Bomb } from '../entities/Bomb.js';
import { Enemy } from '../entities/Enemy.js';
import { Item } from '../entities/Item.js';
import { Player } from '../entities/Player.js';
import { TileMap } from './TileMap.js';

const Phaser = window.Phaser;
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

export class GameModel {
  constructor(options = {}) {
    this.selectedCharacter = options.character || Characters[0];
    this.selectedBombType = options.bombType || BombTypes[0];
    this.playerIndex = options.playerIndex || 0;
    this.playerCount = Math.max(1, options.playerCount || 1);
    const spawn = SHARED_PLAYER_SPAWN;
    this.map = new TileMap();
    this.player = new Player(spawn.x, spawn.y, this.selectedCharacter, this.selectedBombType);
    this.enemies = [];
    this.bombs = new Map();
    this.items = new Map();
    this.score = 0;
    this.gameOver = false;
    this.won = false;
    this.spawnEnemies();
  }

  spawnEnemies() {
    const count = this.playerCount * 4;
    const used = new Set();

    ENEMY_SPAWN_HINTS.slice(0, count).forEach((spot) => {
      const pos = this.map.findNearestOpen(spot.x, spot.y);
      const key = GridMath.key(pos.x, pos.y);
      if (used.has(key)) return;

      used.add(key);
      this.enemies.push(new Enemy(pos.x, pos.y));
    });
  }

  canPlaceBomb() {
    return !this.gameOver && this.player.isAliveState() && this.bombs.size < this.player.maxBombs;
  }

  placeBomb(x, y) {
    if (!this.canPlaceBomb()) return null;

    const key = GridMath.key(x, y);
    if (this.bombs.has(key)) return null;

    const bomb = new Bomb(x, y, this.player.bombRange, this.player.currentBombType);
    this.bombs.set(key, bomb);
    return bomb;
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

        if (tile === TileType.WALL) break;

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
    if (Phaser.Math.Between(0, 100) >= 34) return null;

    const type = Phaser.Utils.Array.GetRandom(['bomb', 'flame', 'speed']);
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
}
