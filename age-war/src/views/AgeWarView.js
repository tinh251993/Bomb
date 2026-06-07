import { BUILDINGS, ERAS, GROUND_Y, HEIGHT, MAX_UNITS_PER_SIDE, RESOURCE_TYPES, WIDTH } from '../core/constants.js';

const Phaser = window.Phaser;

export class AgeWarView {
  constructor(scene, model) {
    this.scene = scene;
    this.model = model;
    this.unitSprites = new Map();
    this.baseSprites = new Map();
    this.projectileSprites = new Map();
    this.buttons = [];
    this.buildingScreen = null;
    this.buildingResourceTexts = {};
    this.buildingWorkerTexts = {};
    this.buildingFarmerText = null;
  }

  create(onButton, onPlayerBaseClick) {
    this.createWorld();
    this.createBase(this.model.playerBase, onPlayerBaseClick);
    this.createBase(this.model.enemyBase);
    this.createHud(onButton);
  }

  createWorld() {
    this.scene.cameras.main.setBackgroundColor('#0f172a');
    this.scene.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x0f172a, 1);
    this.scene.add.rectangle(WIDTH / 2, 224, WIDTH, 448, 0x164e63, 1);
    this.scene.add.rectangle(WIDTH / 2, GROUND_Y + 72, WIDTH, 160, 0x3f2f1d, 1);
    for (let i = 0; i < 16; i++) {
      this.scene.add.circle(60 + i * 84, 102 + (i % 4) * 34, 42, 0x1e3a8a, 0.18);
      this.scene.add.rectangle(40 + i * 82, GROUND_Y + 15, 68, 9, 0x6b4f2a, 0.4);
    }
    this.scene.add.text(WIDTH / 2, 40, 'AGE BATTLE', {
      fontFamily: 'Arial',
      fontSize: '34px',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5);
  }

  createBase(base, onClick = null) {
    const era = ERAS[base.eraIndex];
    const baseRect = this.scene.add.rectangle(base.x, base.y, 132, 178, era.base, 1)
      .setStrokeStyle(4, base.side === 'player' ? 0x93c5fd : 0xfca5a5);
    const flag = this.scene.add.triangle(base.x, base.y - 116, 0, 36, 0, 0, base.side === 'player' ? 58 : -58, 18, base.side === 'player' ? 0x22c55e : 0xef4444, 1);
    const hpBg = this.scene.add.rectangle(base.x, base.y - 112, 126, 11, 0x450a0a, 1);
    const hpBar = this.scene.add.rectangle(base.x, base.y - 112, 126, 11, 0xef4444, 1);
    if (onClick) {
      baseRect.setInteractive({ useHandCursor: true });
      baseRect.on('pointerdown', onClick);
      baseRect.on('pointerover', () => baseRect.setStrokeStyle(4, 0xfacc15));
      baseRect.on('pointerout', () => baseRect.setStrokeStyle(4, 0x93c5fd));
    }
    this.baseSprites.set(base.side, { baseRect, flag, hpBg, hpBar, turret: null });
  }

  createHud(onButton) {
    this.hud = this.scene.add.text(24, 18, '', {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#f8fafc',
      fontStyle: 'bold'
    });

    const labels = ['Unit 1', 'Unit 2', 'Unit 3', 'Turret', 'Evolve'];
    labels.forEach((label, index) => {
      this.createButton(210 + index * 142, 662, 124, 46, label, () => onButton(index));
    });

    this.message = this.scene.add.text(WIDTH / 2, 104, '', {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#fde68a',
      fontStyle: 'bold'
    }).setOrigin(0.5);
  }

  createButton(x, y, width, height, label, onClick) {
    const container = this.scene.add.container(x, y);
    const bg = this.scene.add.rectangle(0, 0, width, height, 0x0b2a46, 1).setStrokeStyle(3, 0x38bdf8);
    const text = this.scene.add.text(0, 0, label, {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#f8fafc',
      fontStyle: 'bold',
      align: 'center'
    }).setOrigin(0.5);
    container.add([bg, text]);
    container.setSize(width, height);
    container.setInteractive({ useHandCursor: true });
    container.on('pointerover', () => bg.setFillStyle(0x164e63));
    container.on('pointerout', () => bg.setFillStyle(0x0b2a46));
    container.on('pointerdown', onClick);
    this.buttons.push({ bg, text });
  }

  sync() {
    this.syncBase(this.model.playerBase);
    this.syncBase(this.model.enemyBase);
    [...this.model.playerUnits, ...this.model.enemyUnits].forEach((unit) => this.syncUnit(unit));
    this.cleanupDeadUnitSprites();
    this.syncProjectiles();
    this.updateHud();
  }

  syncBase(base) {
    const sprite = this.baseSprites.get(base.side);
    sprite.baseRect.setFillStyle(ERAS[base.eraIndex].base);
    sprite.hpBar.width = 126 * (base.hp / base.maxHp);
    if (base.hasTurret && !sprite.turret) {
      sprite.turret = this.scene.add.rectangle(base.x + (base.side === 'player' ? 48 : -48), base.y - 112, 34, 42, ERAS[base.eraIndex].color, 1)
        .setStrokeStyle(3, 0xf8fafc);
      return;
    }
    if (sprite.turret) sprite.turret.setFillStyle(ERAS[base.eraIndex].color);
  }

  syncUnit(unit) {
    let sprite = this.unitSprites.get(unit.id);
    if (!sprite) {
      const color = ERAS[unit.eraIndex].color;
      const body = this.scene.add.rectangle(unit.x, unit.y, unit.width, unit.height, color, 1)
        .setStrokeStyle(3, unit.side === 'player' ? 0xe0f2fe : 0xffedd5);
      const weapon = this.scene.add.rectangle(unit.x + unit.facing() * 18, unit.y - 8, 26, 6, 0x111827, 1);
      const hpBar = this.scene.add.rectangle(unit.x, unit.y - unit.height / 2 - 10, unit.width, 5, 0x22c55e, 1);
      sprite = { body, weapon, hpBar };
      this.unitSprites.set(unit.id, sprite);
    }
    sprite.body.setPosition(unit.x, unit.y);
    sprite.weapon.setPosition(unit.x + unit.facing() * 18, unit.y - 8);
    sprite.hpBar.setPosition(unit.x, unit.y - unit.height / 2 - 10);
    sprite.hpBar.width = Math.max(2, unit.width * Math.max(0, unit.hp / unit.maxHp));
  }

  cleanupDeadUnitSprites() {
    const liveIds = new Set([...this.model.playerUnits, ...this.model.enemyUnits].map((unit) => unit.id));
    this.unitSprites.forEach((sprite, id) => {
      if (liveIds.has(id)) return;
      sprite.body.destroy();
      sprite.weapon.destroy();
      sprite.hpBar.destroy();
      this.unitSprites.delete(id);
    });
  }

  syncProjectiles() {
    this.model.projectiles.forEach((projectile) => {
      if (this.projectileSprites.has(projectile.id)) return;
      const sprite = this.scene.add.circle(projectile.x, projectile.y, 7, projectile.color, 1).setStrokeStyle(2, 0x020617);
      this.projectileSprites.set(projectile.id, sprite);
    });
    const liveIds = new Set(this.model.projectiles.map((projectile) => projectile.id));
    this.projectileSprites.forEach((sprite, id) => {
      if (!liveIds.has(id)) {
        sprite.destroy();
        this.projectileSprites.delete(id);
        return;
      }
      const projectile = this.model.projectiles.find((item) => item.id === id);
      sprite.setPosition(projectile.x, projectile.y);
    });
  }

  updateHud() {
    const evolveCost = this.model.eraIndex >= ERAS.length - 1 ? 'MAX' : 220 + this.model.eraIndex * 260;
    this.hud.setText(`Age ${ERAS[this.model.eraIndex].name}   Pop ${this.model.playerPopulation()}   Gold ${this.model.gold}   XP ${this.model.xp}   Units ${this.model.liveUnitsFor('player')}/${MAX_UNITS_PER_SIDE}   Enemy ${this.model.liveUnitsFor('enemy')}/${MAX_UNITS_PER_SIDE}   Evolve ${evolveCost}`);
    ERAS[this.model.eraIndex].units.forEach((unit, index) => {
      this.buttons[index].text.setText(`${unit.name}\n${unit.cost}g`);
    });
    this.buttons[3].text.setText(this.model.playerBase.hasTurret ? 'Turret\nReady' : `Turret\n${ERAS[this.model.eraIndex].turret.cost}g`);
    this.buttons[4].text.setText(this.model.eraIndex >= ERAS.length - 1 ? 'Max Age' : `Evolve\n${evolveCost}xp`);
    this.message.setText(this.model.message);
  }

  flashUnit(unit) {
    const sprite = this.unitSprites.get(unit.id);
    if (sprite) this.flash(sprite.body);
  }

  flashBase(side) {
    const sprite = this.baseSprites.get(side);
    if (sprite) this.flash(sprite.baseRect);
  }

  flash(object) {
    this.scene.tweens.add({
      targets: object,
      alpha: 0.35,
      duration: 70,
      yoyo: true
    });
  }

  showBuildingScreen(onClose, onTrainFarmer, onAssignFarmer) {
    this.hideBuildingScreen();
    const era = ERAS[this.model.eraIndex];
    const buildings = BUILDINGS[this.model.eraIndex] || BUILDINGS[0];
    const overlay = this.scene.add.container(0, 0).setDepth(5000);
    const shade = this.scene.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x020617, 0.78);
    const panel = this.scene.add.rectangle(WIDTH / 2, HEIGHT / 2, 900, 520, 0x0b2a46, 0.96)
      .setStrokeStyle(4, 0x38bdf8, 0.88);
    const title = this.scene.add.text(WIDTH / 2, 120, `${era.name} Main Base`, {
      fontFamily: 'Arial',
      fontSize: '34px',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    const close = this.createOverlayButton(WIDTH / 2, 592, 180, 46, 'Back', onClose);
    const farmerButton = this.createOverlayButton(790, 248, 190, 44, 'Train Farmer', onTrainFarmer);
    this.buildingFarmerText = this.scene.add.text(494, 248, '', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    overlay.add([shade, panel, title, close, farmerButton, this.buildingFarmerText]);
    RESOURCE_TYPES.forEach((resource, index) => {
      const x = 310 + index * 190;
      const card = this.scene.add.container(x, 184);
      const bg = this.scene.add.rectangle(0, 0, 168, 108, 0x07111f, 0.94)
        .setStrokeStyle(2, resource.color);
      const marker = this.scene.add.rectangle(-62, -24, 14, 38, resource.color, 1);
      const text = this.scene.add.text(-42, -24, '', {
        fontFamily: 'Arial',
        fontSize: '16px',
        color: '#f8fafc',
        fontStyle: 'bold'
      }).setOrigin(0, 0.5);
      const workers = this.scene.add.text(0, 18, '', {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#cbd5e1',
        fontStyle: 'bold'
      }).setOrigin(0.5);
      const minus = this.createTinyButton(-38, 44, '-', () => onAssignFarmer(resource.id, -1));
      const plus = this.createTinyButton(38, 44, '+', () => onAssignFarmer(resource.id, 1));
      card.add([bg, marker, text, workers, minus, plus]);
      overlay.add(card);
      this.buildingResourceTexts[resource.id] = text;
      this.buildingWorkerTexts[resource.id] = workers;
    });

    buildings.forEach((building, index) => {
      const x = 332 + index * 308;
      const card = this.scene.add.container(x, 420);
      const bg = this.scene.add.rectangle(0, 0, 238, 230, 0x07111f, 0.96)
        .setStrokeStyle(3, index === 0 ? 0xfacc15 : 0x334155);
      const roof = this.scene.add.triangle(0, -84, -66, 16, 0, -46, 66, 16, era.color, 1)
        .setStrokeStyle(2, 0xf8fafc, 0.6);
      const body = this.scene.add.rectangle(0, -22, 108, 72, era.base, 1)
        .setStrokeStyle(3, 0xf8fafc, 0.55);
      const name = this.scene.add.text(0, 46, building.name, {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#f8fafc',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 190 }
      }).setOrigin(0.5);
      const role = this.scene.add.text(0, 92, building.role, {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#cbd5e1',
        align: 'center',
        wordWrap: { width: 190 }
      }).setOrigin(0.5);
      const cost = this.scene.add.text(0, 124, `${building.cost}g`, {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#fde68a',
        fontStyle: 'bold'
      }).setOrigin(0.5);
      card.add([bg, roof, body, name, role, cost]);
      overlay.add(card);
    });

    this.buildingScreen = overlay;
    this.syncBuildingScreen();
  }

  syncBuildingScreen() {
    if (!this.buildingScreen) return;
    Object.entries(this.buildingResourceTexts).forEach(([resource, text]) => {
      const label = resource.charAt(0).toUpperCase() + resource.slice(1);
      text.setText(`${label}\n${this.model.resources[resource]}`);
    });
    Object.entries(this.buildingWorkerTexts).forEach(([resource, text]) => {
      const config = RESOURCE_TYPES.find((item) => item.id === resource);
      const assigned = this.model.farmerAssignments[resource] || 0;
      text.setText(`Workers ${assigned}  +${config.gatherAmount}/2s`);
    });
    this.buildingFarmerText?.setText(`Farmers ${this.model.farmers}   Idle ${this.model.idleFarmers()}   Pop ${this.model.playerPopulation()}`);
    this.message.setText(this.model.message);
    this.updateHud();
  }

  createOverlayButton(x, y, width, height, label, onClick) {
    const button = this.scene.add.container(x, y);
    const bg = this.scene.add.rectangle(0, 0, width, height, 0x16a34a, 1)
      .setStrokeStyle(3, 0xbbf7d0);
    const text = this.scene.add.text(0, 0, label, {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    button.add([bg, text]);
    button.setSize(width, height);
    button.setInteractive({ useHandCursor: true });
    button.on('pointerover', () => bg.setFillStyle(0x22c55e));
    button.on('pointerout', () => bg.setFillStyle(0x16a34a));
    button.on('pointerdown', onClick);
    return button;
  }

  createTinyButton(x, y, label, onClick) {
    const button = this.scene.add.container(x, y);
    const bg = this.scene.add.rectangle(0, 0, 34, 26, 0x0f172a, 1)
      .setStrokeStyle(2, 0x93c5fd);
    const text = this.scene.add.text(0, -1, label, {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    button.add([bg, text]);
    button.setSize(34, 26);
    button.setInteractive({ useHandCursor: true });
    button.on('pointerover', () => bg.setFillStyle(0x1e293b));
    button.on('pointerout', () => bg.setFillStyle(0x0f172a));
    button.on('pointerdown', onClick);
    return button;
  }

  hideBuildingScreen() {
    this.buildingScreen?.destroy(true);
    this.buildingScreen = null;
    this.buildingResourceTexts = {};
    this.buildingWorkerTexts = {};
    this.buildingFarmerText = null;
  }

  finish(result, onRestart) {
    this.scene.add.rectangle(WIDTH / 2, HEIGHT / 2, 520, 210, 0x020617, 0.9)
      .setStrokeStyle(4, result === 'win' ? 0x22c55e : 0xef4444);
    this.scene.add.text(WIDTH / 2, HEIGHT / 2 - 34, result === 'win' ? 'VICTORY' : 'DEFEAT', {
      fontFamily: 'Arial',
      fontSize: '42px',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    const retry = this.scene.add.text(WIDTH / 2, HEIGHT / 2 + 42, 'Click to restart', {
      fontFamily: 'Arial',
      fontSize: '22px',
      color: '#fde68a',
      fontStyle: 'bold'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    retry.on('pointerdown', onRestart);
  }
}
