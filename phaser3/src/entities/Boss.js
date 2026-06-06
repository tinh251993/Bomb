import { DIRS } from '../core/constants.js';
import { Character } from './Character.js';

const Phaser = window.Phaser;

export class Boss extends Character {
  constructor(x, y, speed = 1.2, type = null) {
    super(x, y, speed);
    this.maxHealth = 100;
    this.health = this.maxHealth;
    this.dir = Phaser.Utils.Array.GetRandom(DIRS);
    this.dead = false;
    this.nextChaseAt = 0;
    this.chaseUntil = 0;
    this.size = 2;
    this.type = type;
  }

  getOccupiedCells(x = this.gridX, y = this.gridY) {
    return [
      { x, y },
      { x: x + 1, y },
      { x, y: y + 1 },
      { x: x + 1, y: y + 1 }
    ];
  }

  chooseDirection(choices) {
    this.dir = Phaser.Utils.Array.GetRandom(choices);
  }

  getBombRange() {
    return 2;
  }

  takeDamage(amount = 10) {
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.dead = true;
    return this.health <= 0;
  }

  getMoveSpeed() {
    return this.speed;
  }

  isEagle() {
    return false;
  }

  isAlive() {
    return !this.dead && super.isAlive();
  }
}
