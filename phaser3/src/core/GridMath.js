import { COLS, HEIGHT, HUD, ROWS, TILE, WIDTH } from './constants.js';

const Phaser = window.Phaser;

export class GridMath {
  static toWorld(x, y) {
    return {
      x: x * TILE + TILE / 2,
      y: HUD + y * TILE + TILE / 2
    };
  }

  static toGrid(x, y) {
    return {
      x: Phaser.Math.Clamp(Math.floor(x / TILE), 0, COLS - 1),
      y: Phaser.Math.Clamp(Math.floor((y - HUD) / TILE), 0, ROWS - 1)
    };
  }

  static clampWorld(x, y) {
    return {
      x: Phaser.Math.Clamp(x, TILE / 2, WIDTH - TILE / 2),
      y: Phaser.Math.Clamp(y, HUD + TILE / 2, HEIGHT - TILE / 2)
    };
  }

  static key(x, y) {
    return `${x},${y}`;
  }
}

