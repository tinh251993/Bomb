import { BaseUnit } from './BaseUnit.js';

export class ArmyUnit extends BaseUnit {
  constructor(side, stats, eraIndex) {
    super(side, stats, eraIndex);
  }

  move(deltaSeconds) {
    this.x += this.facing() * this.stats.speed * deltaSeconds;
  }

  isRanged() {
    return this.stats.range > 70;
  }
}
