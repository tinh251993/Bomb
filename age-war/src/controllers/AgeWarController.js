import { ERAS, FARMER, RESOURCE_TYPES } from '../core/constants.js';

const Phaser = window.Phaser;

let nextProjectileId = 1;

export class AgeWarController {
  constructor(scene, model, view) {
    this.scene = scene;
    this.model = model;
    this.view = view;
  }

  update(time, delta) {
    if (this.model.gameDone) return;
    const deltaSeconds = delta / 1000;
    this.model.clearExpiredMessage(time);
    this.handleGathering(time);
    if (this.model.buildingScreenOpen) {
      this.view.sync();
      this.view.syncBuildingScreen();
      return;
    }
    this.handleIncome(time);
    this.handleEnemyAi(time);
    this.updateUnits(time, deltaSeconds, 'player');
    this.updateUnits(time, deltaSeconds, 'enemy');
    this.updateTurret(time, 'player');
    this.updateTurret(time, 'enemy');
    this.updateProjectiles(delta);
    this.model.cleanupUnits();
    this.view.sync();
  }

  handleButton(index, time) {
    if (this.model.buildingScreenOpen) return;
    if (index <= 2) {
      this.spawnPlayerUnit(index, time);
      return;
    }
    if (index === 3) this.buyTurret(time);
    if (index === 4) this.evolve(time);
  }

  openBuildingScreen() {
    if (this.model.gameDone) return;
    this.model.buildingScreenOpen = true;
    this.view.showBuildingScreen(
      () => this.closeBuildingScreen(),
      () => this.trainFarmer(this.scene.time.now),
      (resourceId, delta) => this.assignFarmer(resourceId, delta, this.scene.time.now)
    );
  }

  closeBuildingScreen() {
    this.model.buildingScreenOpen = false;
    this.view.hideBuildingScreen();
    this.view.sync();
  }

  spawnPlayerUnit(unitIndex, time) {
    if (!this.model.canSpawn('player')) {
      this.model.showMessage('Player unit limit 200', time);
      return;
    }
    const stats = ERAS[this.model.eraIndex].units[unitIndex];
    if (!this.spendGold(stats.cost, time)) return;
    this.model.spawnUnit('player', unitIndex);
    this.view.sync();
  }

  trainFarmer(time) {
    if (this.model.resources.food < FARMER.cost.food) {
      this.model.showMessage(`Need ${FARMER.cost.food} food`, time);
      this.view.syncBuildingScreen();
      return;
    }
    this.model.resources.food -= FARMER.cost.food;
    this.model.farmers++;
    this.model.showMessage(`Farmers ${this.model.farmers}`, time);
    this.view.sync();
    this.view.syncBuildingScreen();
  }

  assignFarmer(resourceId, delta, time) {
    if (!(resourceId in this.model.farmerAssignments)) return;
    if (delta > 0 && this.model.idleFarmers() <= 0) {
      this.model.showMessage('No idle farmers', time);
      this.view.syncBuildingScreen();
      return;
    }
    if (delta < 0 && this.model.farmerAssignments[resourceId] <= 0) return;

    this.model.farmerAssignments[resourceId] += delta;
    this.view.syncBuildingScreen();
  }

  buyTurret(time) {
    if (this.model.playerBase.hasTurret) {
      this.model.showMessage('Turret ready', time);
      return;
    }
    const cost = ERAS[this.model.eraIndex].turret.cost;
    if (!this.spendGold(cost, time)) return;
    this.model.playerBase.hasTurret = true;
    this.view.sync();
  }

  evolve(time) {
    if (this.model.eraIndex >= ERAS.length - 1) {
      this.model.showMessage('Max age', time);
      return;
    }
    const cost = 220 + this.model.eraIndex * 260;
    if (this.model.xp < cost) {
      this.model.showMessage(`Need ${cost} XP`, time);
      return;
    }
    this.model.xp -= cost;
    this.model.eraIndex++;
    this.model.playerBase.eraIndex = this.model.eraIndex;
    this.model.showMessage(`${ERAS[this.model.eraIndex].name} age`, time);
    this.view.sync();
  }

  spendGold(cost, time) {
    if (this.model.resources.gold >= cost) {
      this.model.resources.gold -= cost;
      this.model.syncGoldResource();
      return true;
    }
    this.model.showMessage(`Need ${cost} gold`, time);
    return false;
  }

  handleIncome(time) {
    if (time < this.model.nextIncomeAt) return;
    this.model.nextIncomeAt = time + 1000;
    this.model.enemyGold += 11 + this.model.enemyEraIndex * 6;
  }

  handleGathering(time) {
    if (time < this.model.nextGatherAt) return;
    this.model.nextGatherAt = time + FARMER.gatherIntervalMs;
    if (this.model.farmers <= 0) return;

    RESOURCE_TYPES.forEach((resource) => {
      const farmers = this.model.farmerAssignments[resource.id] || 0;
      this.model.resources[resource.id] += resource.gatherAmount * farmers;
    });
    this.model.syncGoldResource();
  }

  handleEnemyAi(time) {
    if (time < this.model.nextEnemySpawnAt) return;
    if (this.model.enemyEraIndex < this.model.eraIndex && this.model.enemyGold > 340) {
      this.model.enemyEraIndex++;
      this.model.enemyBase.eraIndex = this.model.enemyEraIndex;
      if (!this.model.enemyBase.hasTurret && this.model.enemyEraIndex >= 1) this.model.enemyBase.hasTurret = true;
    }

    const unitIndex = Phaser.Math.Between(0, Math.min(2, this.model.enemyEraIndex + 1));
    const stats = ERAS[this.model.enemyEraIndex].units[unitIndex];
    if (this.model.canSpawn('enemy') && this.model.enemyGold >= stats.cost) {
      this.model.enemyGold -= stats.cost;
      this.model.spawnUnit('enemy', unitIndex);
    }
    this.model.nextEnemySpawnAt = time + Math.max(900, 2600 - this.model.enemyEraIndex * 300 - Phaser.Math.Between(0, 500));
  }

  updateUnits(time, deltaSeconds, side) {
    this.model.unitsFor(side).forEach((unit) => {
      if (unit.dead) return;
      const target = this.findTarget(unit);
      if (target && Math.abs(target.x - unit.x) <= unit.stats.range + unit.width / 2) {
        this.attack(time, unit, target);
        return;
      }
      unit.move(deltaSeconds);
    });
  }

  findTarget(unit) {
    const enemies = this.model.enemyUnitsFor(unit.side).filter((enemy) => !enemy.dead);
    enemies.sort((a, b) => Math.abs(a.x - unit.x) - Math.abs(b.x - unit.x));
    return enemies[0] || this.model.enemyBaseFor(unit.side);
  }

  attack(time, unit, target) {
    if (!unit.canAttack(time)) return;
    unit.markAttack(time);
    if (unit.isRanged()) {
      this.spawnProjectile(unit.x + unit.facing() * 24, unit.y - 10, target, unit.stats.damage, unit.side, ERAS[unit.eraIndex].color);
      return;
    }
    this.applyDamage(target, unit.stats.damage, unit.side);
  }

  updateTurret(time, side) {
    const base = this.model.baseFor(side);
    if (!base.hasTurret || time < base.nextTurretAt) return;
    const config = ERAS[base.eraIndex].turret;
    const target = this.model.enemyUnitsFor(side)
      .filter((unit) => !unit.dead && Math.abs(unit.x - base.x) <= config.range)
      .sort((a, b) => Math.abs(a.x - base.x) - Math.abs(b.x - base.x))[0];
    if (!target) return;
    base.nextTurretAt = time + config.cooldown;
    this.spawnProjectile(base.x + (side === 'player' ? 48 : -48), base.y - 112, target, config.damage, side, 0xf8fafc);
  }

  spawnProjectile(x, y, target, damage, side, color) {
    this.model.projectiles.push({
      id: nextProjectileId++,
      x,
      y,
      target,
      damage,
      side,
      color,
      speed: 460
    });
  }

  updateProjectiles(delta) {
    this.model.projectiles = this.model.projectiles.filter((shot) => {
      if (!shot.target || shot.target.dead) return false;

      const angle = Phaser.Math.Angle.Between(shot.x, shot.y, shot.target.x, shot.target.y);
      const distance = shot.speed * delta / 1000;
      shot.x += Math.cos(angle) * distance;
      shot.y += Math.sin(angle) * distance;

      if (Phaser.Math.Distance.Between(shot.x, shot.y, shot.target.x, shot.target.y) > 18) return true;

      this.applyDamage(shot.target, shot.damage, shot.side);
      return false;
    });
  }

  applyDamage(target, amount, fromSide) {
    if ('maxHp' in target && 'side' in target && !('stats' in target)) {
      target.hp = Math.max(0, target.hp - amount);
      this.view.flashBase(target.side);
      if (target.hp <= 0) this.finish(target.side === 'player' ? 'lose' : 'win');
      return;
    }

    const killed = target.takeDamage(amount);
    this.view.flashUnit(target);
    if (!killed || fromSide !== 'player') return;
    this.model.resources.gold += target.stats.reward;
    this.model.syncGoldResource();
    this.model.xp += target.stats.reward + 8;
  }

  finish(result) {
    if (this.model.gameDone) return;
    this.model.gameDone = true;
    this.view.finish(result, () => this.scene.scene.restart());
  }
}
