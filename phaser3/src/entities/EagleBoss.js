import { Boss } from './Boss.js';

export class EagleBoss extends Boss {
  constructor(x, y, speed = 1.2, type = null) {
    super(x, y, speed, type);
    this.maxHealth = 200;
    this.health = this.maxHealth;
    this.flying = false;
    this.nextFlightAt = 0;
    this.flightUntil = 0;
    this.stunnedUntil = 0;
    this.bombRange = 4;
  }

  getBombRange() {
    return this.bombRange;
  }

  takeDamage(amount = 10) {
    const killed = super.takeDamage(amount);
    this.bombRange += 1;
    return killed;
  }

  getMoveSpeed() {
    const lostPercentSteps = Math.floor(((this.maxHealth - this.health) / this.maxHealth) * 10);
    return 170 - (this.flying ? 20 : 0) + lostPercentSteps * 10;
  }

  isEagle() {
    return true;
  }
}
