import { BossTypes, Characters, COLS, HEIGHT, HUD, ROWS, TILE, TileType, WIDTH } from '../core/constants.js';
import { createBombSheetTextures } from '../core/BombTextureFactory.js';
import { GridMath } from '../core/GridMath.js';

export class GameView {
  constructor(scene, model) {
    this.scene = scene;
    this.model = model;
    this.remoteSprites = new Map();
    this.remoteStates = new Map();
    this.localStatusText = null;
    this.bossHealthBg = null;
    this.bossHealthFill = null;
    this.bossHealthText = null;
    this.cheatText = null;
    this.pingText = null;
  }

  preload() {
    const load = this.scene.load;
    load.image('floor', '../res/land.png');
    load.image('wall', '../res/boxcot.png');
    load.image('crate', '../res/boxgo3.png');
    load.image('water', '../res/snow.png');
    load.image('bomb-sheet', '../res/Bomb/bomb.png');
    Characters.forEach((character) => {
      load.image(`${character.id}-card`, character.card);
      Object.entries(character.sprites).forEach(([direction, path]) => {
        load.image(`${character.id}-${direction}`, path);
      });
    });
    load.image('enemy', '../res/quaivat 3_down.png');
    load.image('forest-enemy', '../res/quaivat3new_down.png');
    BossTypes.forEach((bossType) => {
      Object.entries(bossType.sprites).forEach(([state, path]) => {
        load.image(this.bossTextureKey(bossType, state), path);
      });
    });
    load.image('boss-bomb', '../res/bomb.gif');
    load.image('item-bomb', '../res/items/item_bomb.gif');
    load.image('item-flame', '../res/items/item_bombsize.gif');
    load.image('item-speed', '../res/items/item_shoe.gif');
    load.audio('bomb-sfx', '../res/sound/bomb_bang.wav');
    load.audio('item-sfx', '../res/sound/item.wav');
    load.audio('lose-sfx', '../res/sound/bomber_die.wav');
    load.audio('win-sfx', '../res/sound/bomDrink.wav');
    load.audio('game-music', '../res/sound/05 Elder Kettle.ogg');
  }

  create() {
    this.scene.cameras.main.setBackgroundColor('#172033');
    this.floorLayer = this.scene.add.group();
    this.wallLayer = this.scene.add.group();
    this.crateLayer = this.scene.add.group();
    this.effectLayer = this.scene.add.group();
    createBombSheetTextures(this.scene);
    this.drawMap();
    this.drawPlayer();
    this.drawEnemies();
    this.drawBoss();
    this.drawHud();
  }

  drawMap() {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const pos = GridMath.toWorld(x, y);
        const floor = this.scene.add.image(pos.x, pos.y, 'floor').setDisplaySize(TILE, TILE);
        if (this.model.level === 3) floor.setTint(0xb8f4ff);
        if (this.model.level === 4) floor.setTint(0x4caf5a);
        if (this.model.level === 5) floor.setTint(0xc49a45);
        if (this.model.level === 6) floor.setTint(0xb98d3a);
        this.floorLayer.add(floor);

        const tile = this.model.map.get(x, y);
        if (tile === TileType.WALL) {
          const wall = this.scene.add.image(pos.x, pos.y, 'wall').setDisplaySize(TILE, TILE).setDepth(this.depthForY(pos.y));
          if (this.model.level === 3) wall.setTint(0xdffbff);
          if (this.model.level === 4) wall.setTint(0xd9d0a8);
          if (this.model.level === 5) wall.setTint(0x6fb34d);
          if (this.model.level === 6) wall.setTint(0x7fba4a);
          wall.gridX = x;
          wall.gridY = y;
          this.wallLayer.add(wall);
        }
        if (tile === TileType.CRATE) {
          const crate = this.scene.add.image(pos.x, pos.y, 'crate').setDisplaySize(TILE, TILE).setDepth(this.depthForY(pos.y));
          if (this.model.level === 4) crate.setTint(0xf3c65c);
          if (this.model.level === 5) crate.setTint(0xd99a38);
          if (this.model.level === 6) crate.setTint(0xd08b2f);
          crate.gridX = x;
          crate.gridY = y;
          this.crateLayer.add(crate);
        }
        if (tile === TileType.WATER) {
          const water = this.scene.add.image(pos.x, pos.y, 'water').setDisplaySize(TILE, TILE).setTint(0x38bdf8);
          water.setDepth(this.depthForY(pos.y) - 1);
          water.gridX = x;
          water.gridY = y;
          this.wallLayer.add(water);
        }
      }
    }
  }

  drawPlayer() {
    const pos = GridMath.toWorld(this.model.player.gridX, this.model.player.gridY);
    const sprite = this.scene.add.sprite(pos.x, pos.y, this.playerTexture('down')).setDisplaySize(40, 44);
    this.updateSpriteDepth(sprite);
    this.model.player.attachSprite(sprite);
  }

  drawEnemies() {
    const texture = this.model.mapType === 'forest' ? 'forest-enemy' : 'enemy';
    this.model.enemies.forEach((enemy) => {
      const pos = GridMath.toWorld(enemy.gridX, enemy.gridY);
      const sprite = this.scene.add.sprite(pos.x, pos.y, texture).setDisplaySize(42, 42);
      this.updateSpriteDepth(sprite);
      enemy.attachSprite(sprite);
    });
  }

  drawBoss() {
    this.model.bosses.forEach((boss) => {
      const pos = this.bossWorldPosition(boss);
      const sprite = this.scene.add.sprite(pos.x, pos.y, this.bossTexture('down', boss)).setDisplaySize(TILE * 2, TILE * 2);
      this.updateSpriteDepth(sprite);
      boss.attachSprite(sprite);
    });
  }

  drawHud() {
    this.scene.add.rectangle(WIDTH / 2, HUD / 2, WIDTH, HUD, 0x0f172a, 0.92).setDepth(10000);
    this.scoreText = this.scene.add.text(18, 14, '', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#f8fafc'
    }).setDepth(10001);
    this.scene.add.text(WIDTH - 18, 14, 'Move: Arrows/WASD   Bomb: Space   Type: 1-5', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#cbd5e1'
    }).setOrigin(1, 0).setDepth(10001);
    this.pingText = this.scene.add.text(WIDTH - 18, 34, 'Ping -- ms', {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#93c5fd'
    }).setOrigin(1, 0).setDepth(10001).setVisible(false);
    this.messageText = this.scene.add.text(WIDTH / 2, HEIGHT / 2, '', {
      fontFamily: 'Arial',
      fontSize: '32px',
      color: '#ffffff',
      backgroundColor: '#111827',
      padding: { x: 18, y: 12 },
      align: 'center'
    }).setOrigin(0.5).setDepth(20000).setVisible(false);
    this.localStatusText = this.scene.add.text(0, 0, '', {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#fef3c7',
      backgroundColor: '#111827',
      padding: { x: 6, y: 3 }
    }).setOrigin(0.5).setDepth(20001).setVisible(false);
    this.cheatText = this.scene.add.text(WIDTH / 2, HUD + 48, '', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#fef3c7',
      backgroundColor: '#111827',
      padding: { x: 10, y: 5 }
    }).setOrigin(0.5).setDepth(20002).setVisible(false);
    this.drawBossHud();
    this.updateHud();
  }

  drawBossHud() {
    if (!this.model.isBossAlive()) return;

    this.bossHealthBg = this.scene.add.rectangle(WIDTH / 2, HUD + 16, 260, 12, 0x111827, 0.86)
      .setDepth(10001);
    this.bossHealthFill = this.scene.add.rectangle(WIDTH / 2 - 130, HUD + 16, 260, 12, 0xef4444, 1)
      .setOrigin(0, 0.5)
      .setDepth(10002);
    this.bossHealthText = this.scene.add.text(WIDTH / 2, HUD + 29, 'BOSS', {
      fontFamily: 'Arial',
      fontSize: '13px',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(10002);
    this.updateBossHud();
  }

  updateHud() {
    const player = this.model.player;
    const status = player.status === 'alive' ? '' : `   ${player.status.toUpperCase()}`;
    const enemies = this.model.getAliveEnemyCount();
    const bosses = this.model.getAliveBossCount();
    this.scoreText.setText(`Level ${this.model.level}   Score ${this.model.score}   Deaths ${this.model.levelDeathCount}   Enemies ${enemies}   Bosses ${bosses}   Bombs ${player.maxBombs}   Range ${player.bombRange}   Type ${player.currentBombType.name}${status}`);
  }

  updatePing(latencyMs) {
    if (!this.pingText) return;
    this.pingText
      .setText(latencyMs === null ? 'Ping -- ms' : `Ping ${latencyMs} ms`)
      .setVisible(true);
  }

  setPlayerDirection(direction) {
    this.model.player.sprite.setTexture(this.playerTexture(direction));
  }

  setBossDirection(direction, boss = this.model.boss) {
    if (!boss?.sprite) return;
    boss.sprite.setFlipX(boss.type?.id === 'eagle' && boss.flying && direction === 'left');
    boss.sprite.setTexture(this.bossTexture(direction, boss));
  }

  playBossFire(boss = this.model.boss, duration = 360) {
    if (!boss?.sprite) return;

    boss.sprite.setTexture(this.bossTexture('fire', boss));
    this.scene.time.delayedCall(duration, () => {
      if (boss.sprite?.active) this.setBossDirection(boss.direction, boss);
    });
  }

  showBossDead(boss = this.model.boss) {
    if (!boss?.sprite) return;

    boss.sprite.setTexture(this.bossTexture('dead', boss));
    boss.sprite.setVisible(true);
    this.scene.tweens.add({
      targets: boss.sprite,
      alpha: 0,
      duration: 520,
      onComplete: () => boss.sprite?.destroy()
    });
  }

  updatePlayerDepth() {
    this.updateSpriteDepth(this.model.player.sprite);
  }

  updateLocalPlayerStatus(remainingMs = 0) {
    const player = this.model.player;
    if (!player.sprite) return;

    player.sprite.clearTint();
    player.sprite.setAlpha(1);
    this.localStatusText?.setVisible(false);

    if (player.isInvincible(this.scene.time.now)) {
      player.sprite.setTint(0xfef08a);
      player.sprite.setAlpha(0.78);
    }

    if (player.status === 'downed') {
      player.sprite.setTint(0x93c5fd);
      player.sprite.setAlpha(0.72);
      this.localStatusText
        ?.setText(`HELP ${Math.ceil(remainingMs / 1000)}`)
        .setPosition(player.sprite.x, player.sprite.y - 34)
        .setVisible(true);
    }

    if (player.status === 'dead') {
      player.sprite.setTint(0x475569);
      player.sprite.setAlpha(0.45);
    }

    this.updateHud();
  }

  moveEnemy(enemy) {
    const pos = GridMath.toWorld(enemy.gridX, enemy.gridY);
    this.scene.tweens.add({
      targets: enemy.sprite,
      x: pos.x,
      y: pos.y,
      duration: Math.max(90, Math.round(220 / Math.max(1, enemy.speed || 1))),
      ease: 'Linear',
      onUpdate: () => this.updateSpriteDepth(enemy.sprite),
      onComplete: () => this.updateSpriteDepth(enemy.sprite)
    });
  }

  syncEnemy(enemy) {
    const pos = GridMath.toWorld(enemy.gridX, enemy.gridY);
    enemy.sprite.setPosition(pos.x, pos.y);
    enemy.sprite.setVisible(enemy.isAlive());
    this.updateSpriteDepth(enemy.sprite);
  }

  moveBoss(boss) {
    const pos = this.bossWorldPosition(boss);
    this.scene.tweens.add({
      targets: boss.sprite,
      x: pos.x,
      y: pos.y,
      duration: Math.max(80, Math.round(185 / Math.max(1, boss.speed || 1))),
      ease: 'Linear',
      onUpdate: () => this.updateBossDepth(boss),
      onComplete: () => this.updateBossDepth(boss)
    });
  }

  syncBoss(boss = this.model.boss) {
    if (!boss?.sprite) return;

    const pos = this.bossWorldPosition(boss);
    boss.sprite.setPosition(pos.x, pos.y);
    boss.sprite.setVisible(boss.isAlive());
    this.setBossFlying(boss, boss.flying);
    this.updateBossDepth(boss);
    this.updateBossHud();
  }

  setBossFlying(boss, flying) {
    if (!boss?.sprite) return;

    boss.sprite.clearTint();
    boss.sprite.setAlpha(1);
    if (flying) boss.sprite.setTint(0xbae6fd);
    this.setBossDirection(boss.direction, boss);
    this.updateBossDepth(boss);
  }

  createBombSprite(bomb) {
    const pos = GridMath.toWorld(bomb.gridX, bomb.gridY);
    const texture = bomb.type.id === 'boss' ? 'boss-bomb' : `bomb-${bomb.type.id}`;
    const isBossBomb = bomb.type.id === 'boss';
    const sprite = this.scene.add.image(pos.x, isBossBomb ? pos.y - 280 : pos.y, texture)
      .setDisplaySize(42, 42)
      .setDepth(this.depthForY(pos.y) - 3);
    bomb.attachSprite(sprite);

    if (isBossBomb) {
      const shadow = this.scene.add.ellipse(pos.x, pos.y + 12, 36, 10, 0x000000, 0.32)
        .setDepth(this.depthForY(pos.y) - 4)
        .setScale(0.35);
      this.scene.tweens.add({
        targets: sprite,
        y: pos.y,
        scaleX: sprite.scaleX,
        scaleY: sprite.scaleY,
        duration: 520,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          shadow.destroy();
          this.startBombPulse(sprite);
        }
      });
      this.scene.tweens.add({
        targets: shadow,
        scaleX: 1,
        scaleY: 1,
        alpha: 0.48,
        duration: 520,
        ease: 'Cubic.easeIn'
      });
      return;
    }

    this.startBombPulse(sprite);
  }

  startBombPulse(sprite) {
    if (!sprite?.active) return;

    const baseScaleX = sprite.scaleX;
    const baseScaleY = sprite.scaleY;
    this.scene.tweens.add({
      targets: sprite,
      scaleX: { from: baseScaleX * 0.92, to: baseScaleX * 1.08 },
      scaleY: { from: baseScaleY * 0.92, to: baseScaleY * 1.08 },
      duration: 360,
      yoyo: true,
      repeat: -1
    });
  }

  drawExplosion(cells, type) {
    cells.forEach((cell) => {
      const pos = GridMath.toWorld(cell.x, cell.y);
      const texture = type.id === 'boss' ? 'explosion-basic' : `explosion-${type.id}`;
      const flame = this.scene.add.image(pos.x, pos.y, texture)
        .setDisplaySize(type.explosionStyle === 'round' ? TILE * 1.35 : TILE * 1.2, TILE * 1.2)
        .setDepth(9000);
      this.effectLayer.add(flame);
      this.scene.tweens.add({
        targets: flame,
        alpha: 0,
        duration: 280,
        onComplete: () => flame.destroy()
      });
    });
  }

  removeCrate(x, y) {
    this.crateLayer.getChildren().forEach((crate) => {
      if (crate.gridX === x && crate.gridY === y) crate.destroy();
    });
  }

  removeTile(x, y) {
    this.removeCrate(x, y);
    this.wallLayer.getChildren().forEach((tile) => {
      if (tile.gridX === x && tile.gridY === y) tile.destroy();
    });
  }

  drawItem(item) {
    const key = item.type === 'bomb' ? 'item-bomb' : item.type === 'flame' ? 'item-flame' : 'item-speed';
    const pos = GridMath.toWorld(item.gridX, item.gridY);
    const sprite = this.scene.add.image(pos.x, pos.y, key).setDisplaySize(28, 28).setDepth(this.depthForY(pos.y) - 8);
    item.attachSprite(sprite);
  }

  updateRemotePlayer(playerId, state) {
    if (!state || playerId === state.localPlayerId) return;

    this.remoteStates.set(playerId, state);
    let sprite = this.remoteSprites.get(playerId);
    const character = Characters.find((item) => item.id === state.characterId) || Characters[0];
    const textureKey = `${character.id}-${state.direction || 'down'}`;

    if (!sprite) {
      sprite = this.scene.add.sprite(state.x, state.y, textureKey)
        .setDisplaySize(40, 44)
        .setAlpha(0.82);
      this.remoteSprites.set(playerId, sprite);
    }

    sprite.setTexture(textureKey);
    sprite.x = state.x;
    sprite.y = state.y;
    sprite.clearTint();
    sprite.setAlpha(0.82);
    sprite.setVisible(state.status !== 'dead');
    if (state.status === 'downed') {
      sprite.setTint(0x93c5fd);
      sprite.setAlpha(0.56);
    }
    this.updateSpriteDepth(sprite);
  }

  findDownedRemoteTouching(sprite) {
    for (const [playerId, remoteSprite] of this.remoteSprites.entries()) {
      const state = this.remoteStates.get(playerId);
      if (state?.status !== 'downed' || !remoteSprite.visible) continue;
      if (Phaser.Math.Distance.Between(sprite.x, sprite.y, remoteSprite.x, remoteSprite.y) < 30) {
        return playerId;
      }
    }
    return null;
  }

  showEndMessage(won) {
    if (!won) this.model.player.sprite.setTexture(this.playerTexture('dead'));
    this.messageText
      .setText(`${won ? 'YOU WIN' : 'GAME OVER'}\nScore: ${this.model.score}\nPress R to restart`)
      .setVisible(true);
  }

  showLevelCompleteMessage(nextLevel) {
    this.messageText
      .setText(`LEVEL CLEAR\nNext: Level ${nextLevel}`)
      .setVisible(true);
  }

  showCheatMessage(message) {
    if (!this.cheatText) return;

    this.cheatText.setText(message).setVisible(true);
    this.scene.time.delayedCall(1200, () => {
      if (this.cheatText?.text === message) this.cheatText.setVisible(false);
    });
  }

  showDeathCount(deathCount) {
    if (!this.cheatText) return;

    const message = `LEVEL ${this.model.level} DEATHS: ${deathCount}`;
    this.cheatText.setText(message).setVisible(true);
    this.scene.time.delayedCall(1800, () => {
      if (this.cheatText?.text === message) this.cheatText.setVisible(false);
    });
  }

  updateBossHud() {
    if (!this.bossHealthFill) return;

    const aliveBosses = this.model.bosses.filter((boss) => boss.isAlive());
    const totalHealth = aliveBosses.reduce((sum, boss) => sum + boss.health, 0);
    const totalMaxHealth = aliveBosses.reduce((sum, boss) => sum + boss.maxHealth, 0);
    const maxRange = aliveBosses.reduce((max, boss) => Math.max(max, boss.getBombRange()), 0);
    const ratio = totalMaxHealth > 0 ? Math.max(0, totalHealth / totalMaxHealth) : 0;
    this.bossHealthFill.setDisplaySize(260 * ratio, 12);
    this.bossHealthText?.setText(`BOSS x${aliveBosses.length} HP ${totalHealth}/${totalMaxHealth}   RANGE ${maxRange}`);
  }

  clearBossHud() {
    this.bossHealthBg?.destroy();
    this.bossHealthFill?.destroy();
    this.bossHealthText?.destroy();
    this.bossHealthBg = null;
    this.bossHealthFill = null;
    this.bossHealthText = null;
  }

  updateSpriteDepth(sprite) {
    if (sprite) sprite.setDepth(this.depthForY(sprite.y));
  }

  updateBossDepth(boss) {
    if (!boss?.sprite) return;

    boss.sprite.setDepth(boss.flying ? 9500 : this.depthForY(boss.sprite.y));
  }

  depthForY(y) {
    return 1000 + Math.round(y);
  }

  playerTexture(direction) {
    return `${this.model.player.character.id}-${direction}`;
  }

  bossTexture(direction, boss = this.model.boss) {
    const state = ['up', 'left', 'right', 'fire', 'dead'].includes(direction) ? direction : 'down';
    if (boss?.type?.id === 'eagle' && boss.flying && !['fire', 'dead'].includes(state)) {
      const flyingState = {
        up: 'flyUp',
        down: 'flyDown',
        left: 'flyLeft',
        right: 'flyRight'
      }[state] || 'flyDown';
      return this.bossTextureKey(boss.type, flyingState);
    }
    return this.bossTextureKey(boss?.type || BossTypes[0], state);
  }

  bossTextureKey(bossType, state) {
    const typeId = BossTypes.some((type) => type.id === bossType?.id) ? bossType.id : BossTypes[0].id;
    return `boss-${typeId}-${state}`;
  }

  bossWorldPosition(boss) {
    const pos = GridMath.toWorld(boss.gridX, boss.gridY);
    return {
      x: pos.x + TILE / 2,
      y: pos.y + TILE / 2
    };
  }
}
