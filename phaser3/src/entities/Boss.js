import { DIRS } from '../core/constants.js';
import { Character } from './Character.js';

const Phaser = window.Phaser;

export class Boss extends Character {
  constructor(x, y, speed = 1.2, type = null) {
    super(x, y, speed);
    this.maxHealth = type?.id === 'eagle' ? 200 : 100;
    this.health = this.maxHealth;
    this.dir = Phaser.Utils.Array.GetRandom(DIRS);
    this.dead = false;
    this.nextChaseAt = 0;
    this.chaseUntil = 0;
    this.size = 2;
    this.type = type;
    this.flying = false;
    this.nextFlightAt = 0;
    this.flightUntil = 0;
    this.bombRange = type?.id === 'eagle' ? 4 : 2;
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
    if (this.type?.id === 'eagle') return this.bombRange;

    const lostPercentSteps = Math.floor(((this.maxHealth - this.health) / this.maxHealth) * 10);
    return 2 + lostPercentSteps * 2;
  }

  takeDamage(amount = 10) {
    this.health = Math.max(0, this.health - amount);
    if (this.type?.id === 'eagle') this.bombRange += 1;
    if (this.health <= 0) this.dead = true;
    return this.health <= 0;
  }

  getMoveSpeed() {
    if (this.type?.id !== 'eagle') return this.speed;

    const lostPercentSteps = Math.floor(((this.maxHealth - this.health) / this.maxHealth) * 10);
    return 170 + (this.flying ? 20 : 0) + lostPercentSteps * 10;
  }

  isEagle() {
    return this.type?.id === 'eagle';
  }

  isAlive() {
    return !this.dead && super.isAlive();
  }
}
