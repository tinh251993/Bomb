import { Direction } from '../core/constants.js';

export class Character {
  constructor(x, y, speed = 0) {
    this.gridX = x;
    this.gridY = y;
    this.speed = speed;
    this.direction = Direction.DOWN;
    this.sprite = null;
  }

  attachSprite(sprite) {
    this.sprite = sprite;
    return this;
  }

  setGridPosition(x, y) {
    this.gridX = x;
    this.gridY = y;
  }

  setDirection(direction) {
    this.direction = direction;
  }

  isAlive() {
    return !this.sprite || this.sprite.active;
  }

  destroy() {
    if (this.sprite) this.sprite.destroy();
  }
}

