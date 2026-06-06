import { DIRS } from '../core/constants.js';
import { Character } from './Character.js';

const Phaser = window.Phaser;

export class Enemy extends Character {
  constructor(x, y, speed = 1) {
    super(x, y, speed);
    this.dir = Phaser.Utils.Array.GetRandom(DIRS);
    this.nextChaseAt = 0;
    this.chaseUntil = 0;
  }

  chooseDirection(choices) {
    this.dir = Phaser.Utils.Array.GetRandom(choices);
  }
}
