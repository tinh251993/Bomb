import { ENEMY_BASE_X, ERAS, GROUND_Y, MAX_UNITS_PER_SIDE, PLAYER_BASE_X } from '../core/constants.js';
import { ArmyUnit } from '../entities/ArmyUnit.js';

export class AgeWarModel {
  constructor() {
    this.playerUnits = [];
    this.enemyUnits = [];
    this.projectiles = [];
    this.resources = {
      wood: 80,
      food: 160,
      gold: 120,
      stone: 60
    };
    this.farmers = 0;
    this.farmerAssignments = {
      wood: 0,
      food: 0,
      gold: 0,
      stone: 0
    };
    this.gold = 120;
    this.xp = 0;
    this.eraIndex = 0;
    this.enemyEraIndex = 0;
    this.enemyGold = 120;
    this.nextEnemySpawnAt = 1200;
    this.nextIncomeAt = 1000;
    this.nextGatherAt = 2000;
    this.gameDone = false;
    this.buildingScreenOpen = false;
    this.message = '';
    this.messageExpiresAt = 0;
    this.playerBase = this.createBase('player');
    this.enemyBase = this.createBase('enemy');
  }

  createBase(side) {
    return {
      side,
      x: side === 'player' ? PLAYER_BASE_X : ENEMY_BASE_X,
      y: GROUND_Y - 90,
      hp: 1200,
      maxHp: 1200,
      eraIndex: 0,
      hasTurret: false,
      nextTurretAt: 0
    };
  }

  unitsFor(side) {
    return side === 'player' ? this.playerUnits : this.enemyUnits;
  }

  enemyUnitsFor(side) {
    return side === 'player' ? this.enemyUnits : this.playerUnits;
  }

  baseFor(side) {
    return side === 'player' ? this.playerBase : this.enemyBase;
  }

  enemyBaseFor(side) {
    return side === 'player' ? this.enemyBase : this.playerBase;
  }

  liveUnitsFor(side) {
    return this.unitsFor(side).filter((unit) => !unit.dead).length;
  }

  assignedFarmers() {
    return Object.values(this.farmerAssignments).reduce((total, count) => total + count, 0);
  }

  idleFarmers() {
    return this.farmers - this.assignedFarmers();
  }

  playerPopulation() {
    return this.liveUnitsFor('player') + this.farmers;
  }

  canSpawn(side) {
    return this.liveUnitsFor(side) < MAX_UNITS_PER_SIDE;
  }

  spawnUnit(side, unitIndex) {
    if (!this.canSpawn(side)) return null;
    const eraIndex = side === 'player' ? this.eraIndex : this.enemyEraIndex;
    const stats = ERAS[eraIndex].units[unitIndex];
    const unit = new ArmyUnit(side, stats, eraIndex);
    this.unitsFor(side).push(unit);
    return unit;
  }

  cleanupUnits() {
    this.playerUnits = this.playerUnits.filter((unit) => !unit.dead);
    this.enemyUnits = this.enemyUnits.filter((unit) => !unit.dead);
  }

  showMessage(text, time) {
    this.message = text;
    this.messageExpiresAt = time + 1100;
  }

  clearExpiredMessage(time) {
    if (this.message && time >= this.messageExpiresAt) this.message = '';
  }

  syncGoldResource() {
    this.gold = this.resources.gold;
  }
}
