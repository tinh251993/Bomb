import { DIRS } from '../core/constants.js';
import { Character } from './Character.js';

const Phaser = window.Phaser;

export class Boss extends Character {
  constructor(x, y) {
    super(x, y, 1.2);
    this.maxHealth = 100;
    this.health = this.maxHealth;
    this.dir = Phaser.Utils.Array.GetRandom(DIRS);
  }

  chooseDirection(choices) {
    this.dir = Phaser.Utils.Array.GetRandom(choices);
  }

  getBombRange() {
    const lostPercentSteps = Math.floor(((this.maxHealth - this.health) / this.maxHealth) * 10);
    return 2 + lostPercentSteps * 2;
  }

  takeDamage(amount = 10) {
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.destroy();
    return this.health <= 0;
  }
}
