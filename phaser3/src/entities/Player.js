import { BombTypes, Characters } from '../core/constants.js';
import { Character } from './Character.js';

export class Player extends Character {
  constructor(x, y, character = Characters[0], bombType = BombTypes[0]) {
    super(x, y, 170);
    this.character = character;
    this.maxBombs = 1;
    this.bombRange = 2;
    this.currentBombType = bombType;
    this.status = 'alive';
    this.downedUntil = 0;
    this.invincibleUntil = 0;
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

  isAliveState() {
    return this.status === 'alive';
  }

  isDowned() {
    return this.status === 'downed';
  }

  isDead() {
    return this.status === 'dead';
  }

  isInvincible(time) {
    return this.invincibleUntil > time;
  }

  downUntil(time) {
    if (this.status === 'dead') return;
    this.status = 'downed';
    this.downedUntil = time;
  }

  revive() {
    if (this.status !== 'downed') return false;
    this.status = 'alive';
    this.downedUntil = 0;
    return true;
  }

  die() {
    this.status = 'dead';
    this.downedUntil = 0;
  }

  respawn(invincibleUntil) {
    this.status = 'alive';
    this.downedUntil = 0;
    this.invincibleUntil = invincibleUntil;
  }
}
