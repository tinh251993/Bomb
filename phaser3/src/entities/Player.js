import { BombTypes, Characters } from '../core/constants.js';
import { Character } from './Character.js';

export class Player extends Character {
  constructor(x, y, character = Characters[0], bombType = BombTypes[0]) {
    super(x, y, 170);
    this.character = character;
    this.maxBombs = 1;
    this.bombRange = 2;
    this.currentBombType = bombType;
  }

  addBombCapacity() {
    this.maxBombs++;
  }

  addBombRange() {
    this.bombRange++;
  }

  addSpeed() {
    this.speed += 24;
  }

  setBombType(type) {
    this.currentBombType = type;
  }
}
