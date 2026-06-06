import { Boss } from './Boss.js';

export class PirateBoss extends Boss {
  getBombRange() {
    const lostPercentSteps = Math.floor(((this.maxHealth - this.health) / this.maxHealth) * 10);
    return 2 + lostPercentSteps * 2;
  }
}
