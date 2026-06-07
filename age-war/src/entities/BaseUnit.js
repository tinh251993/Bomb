import { ENEMY_BASE_X, GROUND_Y, PLAYER_BASE_X } from '../core/constants.js';

let nextUnitId = 1;

export class BaseUnit {
  constructor(side, stats, eraIndex) {
    this.id = nextUnitId++;
    this.side = side;
    this.stats = stats;
    this.eraIndex = eraIndex;
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.dead = false;
    this.nextAttackAt = 0;
    this.width = stats.id === 'tank' || stats.id === 'mech' ? 56 : 34;
    this.height = stats.id === 'tank' || stats.id === 'mech' ? 42 : 58;
    this.x = side === 'player' ? PLAYER_BASE_X + 76 : ENEMY_BASE_X - 76;
    this.y = GROUND_Y - this.height / 2;
  }

  facing() {
    return this.side === 'player' ? 1 : -1;
  }

  canAttack(time) {
    return time >= this.nextAttackAt;
  }

  markAttack(time) {
    this.nextAttackAt = time + this.stats.cooldown;
  }

  takeDamage(amount) {
    if (this.dead) return false;
    this.hp -= amount;
    if (this.hp > 0) return false;
    this.dead = true;
    return true;
  }
}
