import { DIRS } from '../core/constants.js';
import { Character } from './Character.js';

const Phaser = window.Phaser;

export class Enemy extends Character {
  constructor(x, y) {
    super(x, y, 1);
    this.dir = Phaser.Utils.Array.GetRandom(DIRS);
  }

  chooseDirection(choices) {
    this.dir = Phaser.Utils.Array.GetRandom(choices);
  }
}

