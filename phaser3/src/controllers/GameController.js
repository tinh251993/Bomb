import { BombTypes, DIRS, Direction } from '../core/constants.js';
import { GridMath } from '../core/GridMath.js';
import { multiplayer } from '../services/MultiplayerService.js';

const Phaser = window.Phaser;

export class GameController {
  constructor(scene, model, view) {
    this.scene = scene;
    this.model = model;
    this.view = view;
    this.enemyStepTime = 0;
    this.bossStepTime = 0;
    this.nextBossThrowAt = 0;
    this.multiplayer = { enabled: false, room: null, playerId: null };
    this.lastStateSentAt = 0;
    this.unsubscribeRemoteState = null;
    this.unsubscribeReviveRequest = null;
    this.remoteStatuses = new Map();
    this.lastReviveRequestAt = 0;
  }

  configureMultiplayer(config) {
    this.multiplayer = {
      enabled: Boolean(config.enabled),
      room: config.room || null,
      playerId: config.playerId || null
    };

    if (!this.multiplayer.enabled) return;

    this.unsubscribeRemoteState = multiplayer.onRemotePlayerState(({ playerId, state }) => {
      if (playerId === this.multiplayer.playerId) return;
      this.remoteStatuses.set(playerId, state?.status || 'alive');
      this.view.updateRemotePlayer(playerId, state);
    });
    this.unsubscribeReviveRequest = multiplayer.onReviveRequest(() => {
      this.reviveLocalPlayer();
    });
  }

  bindControls() {
    this.cursors = this.scene.input.keyboard.createCursorKeys();
    this.keys = this.scene.input.keyboard.addKeys({
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      r: Phaser.Input.Keyboard.KeyCodes.R,
      one: Phaser.Input.Keyboard.KeyCodes.ONE,
      two: Phaser.Input.Keyboard.KeyCodes.TWO,
      three: Phaser.Input.Keyboard.KeyCodes.THREE,
      four: Phaser.Input.Keyboard.KeyCodes.FOUR,
      five: Phaser.Input.Keyboard.KeyCodes.FIVE
    });
    this.scene.input.keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.SPACE
    ]);
    this.scene.game.canvas.setAttribute('tabindex', '0');
    this.scene.game.canvas.focus();
    this.scene.input.on('pointerdown', () => this.scene.game.canvas.focus());
    this.scene.input.keyboard.on('keydown-SPACE', () => this.placeBomb());
    this.scene.input.keyboard.on('keydown-R', () => this.scene.scene.restart());
    this.scene.input.keyboard.on('keydown-ONE', () => this.selectBombType(0));
    this.scene.input.keyboard.on('keydown-TWO', () => this.selectBombType(1));
    this.scene.input.keyboard.on('keydown-THREE', () => this.selectBombType(2));
    this.scene.input.keyboard.on('keydown-FOUR', () => this.selectBombType(3));
    this.scene.input.keyboard.on('keydown-FIVE', () => this.selectBombType(4));
    this.playGameMusic();
  }

  playGameMusic() {
    const existing = this.scene.sound.get('game-music');
    if (existing?.isPlaying) return;

    if (existing) {
      existing.play({ loop: true, volume: 0.42 });
      return;
    }

    this.scene.sound.add('game-music', { loop: true, volume: 0.42 }).play();
  }

  update(time, delta) {
    if (this.model.gameOver) return;

    this.updateDownedState(time);
    this.handlePlayerMove(delta / 1000);
    this.handleItemPickup();
    this.handleEnemyMove(time);
    this.handleBossMove(time);
    this.handleBossBombThrow(time);
    this.checkEnemyCollision();
    this.checkBossCollision();
    this.checkRemoteRevive(time);
    this.broadcastPlayerState(time);
  }

  handlePlayerMove(dt) {
    const input = this.getMoveInput();
    const player = this.model.player;
    if (!player.isAliveState()) return;

    player.setDirection(input.direction);
    this.view.setPlayerDirection(player.direction);

    if (input.dx === 0 && input.dy === 0) return;

    const distance = player.speed * dt;
    const currentTile = GridMath.toGrid(player.sprite.x, player.sprite.y);
    const laneCenter = GridMath.toWorld(currentTile.x, currentTile.y);
    let nextX = player.sprite.x;
    let nextY = player.sprite.y;

    if (input.dx !== 0) {
      nextY = this.moveTowards(player.sprite.y, laneCenter.y, distance);
      if (Math.abs(nextY - laneCenter.y) <= 2) {
        nextY = laneCenter.y;
        nextX += input.dx * distance;
      }
    } else {
      nextX = this.moveTowards(player.sprite.x, laneCenter.x, distance);
      if (Math.abs(nextX - laneCenter.x) <= 2) {
        nextX = laneCenter.x;
        nextY += input.dy * distance;
      }
    }

    const grid = GridMath.toGrid(nextX, nextY);
    const occupiedCells = this.getPlayerCollisionCells(nextX, nextY, input.dx, input.dy);
    if (!occupiedCells.every((cell) => this.model.isPlayerWalkable(cell.x, cell.y))) return;

    const clamped = GridMath.clampWorld(nextX, nextY);
    player.sprite.x = clamped.x;
    player.sprite.y = clamped.y;
    this.view.updatePlayerDepth();
    player.setGridPosition(grid.x, grid.y);
  }

  getPlayerCollisionCells(worldX, worldY, dx, dy) {
    const horizontalHalfWidth = 13;
    const horizontalHalfHeight = 12;
    const verticalHalfWidth = 13;
    const verticalHalfHeight = 22;
    let samples;

    if (dx < 0) {
      samples = [
        GridMath.toGrid(worldX - horizontalHalfWidth, worldY - horizontalHalfHeight),
        GridMath.toGrid(worldX - horizontalHalfWidth, worldY + horizontalHalfHeight)
      ];
    } else if (dx > 0) {
      samples = [
        GridMath.toGrid(worldX + horizontalHalfWidth, worldY - horizontalHalfHeight),
        GridMath.toGrid(worldX + horizontalHalfWidth, worldY + horizontalHalfHeight)
      ];
    } else if (dy < 0) {
      samples = [
        GridMath.toGrid(worldX - verticalHalfWidth, worldY - verticalHalfHeight),
        GridMath.toGrid(worldX + verticalHalfWidth, worldY - verticalHalfHeight)
      ];
    } else {
      samples = [
        GridMath.toGrid(worldX - verticalHalfWidth, worldY + verticalHalfHeight),
        GridMath.toGrid(worldX + verticalHalfWidth, worldY + verticalHalfHeight)
      ];
    }

    const unique = new Map();
    samples.forEach((cell) => unique.set(GridMath.key(cell.x, cell.y), cell));
    return Array.from(unique.values());
  }

  moveTowards(current, target, maxDelta) {
    if (Math.abs(target - current) <= maxDelta) return target;
    return current + Math.sign(target - current) * maxDelta;
  }

  getMoveInput() {
    if (this.cursors.left.isDown || this.keys.a.isDown) return { dx: -1, dy: 0, direction: Direction.LEFT };
    if (this.cursors.right.isDown || this.keys.d.isDown) return { dx: 1, dy: 0, direction: Direction.RIGHT };
    if (this.cursors.up.isDown || this.keys.w.isDown) return { dx: 0, dy: -1, direction: Direction.UP };
    if (this.cursors.down.isDown || this.keys.s.isDown) return { dx: 0, dy: 1, direction: Direction.DOWN };
    return { dx: 0, dy: 0, direction: this.model.player.direction };
  }

  handleEnemyMove(time) {
    if (time < this.enemyStepTime) return;
    this.enemyStepTime = time + 260;

    this.model.enemies.forEach((enemy) => {
      if (!enemy.isAlive()) return;

      const choices = DIRS.filter((dir) => this.model.isWalkable(enemy.gridX + dir.x, enemy.gridY + dir.y));
      if (choices.length === 0) return;

      if (!this.model.isWalkable(enemy.gridX + enemy.dir.x, enemy.gridY + enemy.dir.y) || Phaser.Math.Between(0, 100) < 28) {
        enemy.chooseDirection(choices);
      }

      enemy.setGridPosition(enemy.gridX + enemy.dir.x, enemy.gridY + enemy.dir.y);
      this.view.moveEnemy(enemy);
    });
  }

  handleBossMove(time) {
    const boss = this.model.boss;
    if (!boss?.isAlive() || time < this.bossStepTime) return;
    this.bossStepTime = time + Math.round(260 / boss.speed);

    const choices = DIRS.filter((dir) => this.model.isWalkable(boss.gridX + dir.x, boss.gridY + dir.y));
    if (choices.length === 0) return;

    if (!this.model.isWalkable(boss.gridX + boss.dir.x, boss.gridY + boss.dir.y) || Phaser.Math.Between(0, 100) < 34) {
      boss.chooseDirection(choices);
    }

    boss.setDirection(this.directionFromDelta(boss.dir));
    this.view.setBossDirection(boss.direction);
    boss.setGridPosition(boss.gridX + boss.dir.x, boss.gridY + boss.dir.y);
    this.view.moveBoss(boss);
  }

  directionFromDelta(delta) {
    if (delta.x < 0) return Direction.LEFT;
    if (delta.x > 0) return Direction.RIGHT;
    if (delta.y < 0) return Direction.UP;
    return Direction.DOWN;
  }

  handleBossBombThrow(time) {
    if (!this.model.boss?.isAlive()) return;

    if (this.nextBossThrowAt === 0) {
      this.nextBossThrowAt = time + 6000;
      return;
    }
    if (time < this.nextBossThrowAt) return;

    this.nextBossThrowAt = time + 6000;
    this.model.getRandomBossBombSpots(8).forEach((spot) => {
      const bomb = this.model.placeBossBomb(spot.x, spot.y);
      if (!bomb) return;

      this.view.createBombSprite(bomb);
      const key = GridMath.key(bomb.gridX, bomb.gridY);
      bomb.setTimer(this.scene.time.delayedCall(1650, () => this.explodeBomb(key)));
    });
  }

  placeBomb() {
    const tile = GridMath.toGrid(this.model.player.sprite.x, this.model.player.sprite.y);
    const bomb = this.model.placeBomb(tile.x, tile.y);
    if (!bomb) return;

    this.view.createBombSprite(bomb);
    const key = GridMath.key(bomb.gridX, bomb.gridY);
    bomb.setTimer(this.scene.time.delayedCall(1650, () => this.explodeBomb(key)));
  }

  selectBombType(index) {
    const type = BombTypes[index];
    if (!type) return;

    this.model.player.setBombType(type);
    this.view.updateHud();
  }

  explodeBomb(key) {
    const bomb = this.model.removeBomb(key);
    if (!bomb) return;

    const cells = this.model.getExplosionCells(bomb);
    this.model.removeItemsIn(cells);
    const broken = this.model.breakCrates(cells);
    broken.forEach((cell) => {
      this.view.removeCrate(cell.x, cell.y);
      const item = this.model.maybeDropItem(cell.x, cell.y);
      if (item) this.spawnItem(item);
    });

    this.scene.sound.play('bomb-sfx', { volume: 0.32 });
    this.view.drawExplosion(cells, bomb.type);
    this.applyExplosionDamage(cells, bomb.owner);
    this.triggerBombsIn(cells);
    this.view.updateHud();
  }

  triggerBombsIn(cells) {
    this.model.getBombKeysIn(cells).forEach((bombKey) => {
      this.scene.time.delayedCall(70, () => this.explodeBomb(bombKey));
    });
  }

  spawnItem(item) {
    this.view.drawItem(item);
    item.setExpireTimer(this.scene.time.delayedCall(30000, () => {
      this.model.removeItemAt(item.gridX, item.gridY);
    }));
  }

  applyExplosionDamage(cells, owner = 'player') {
    if (this.model.isPlayerIn(cells)) {
      this.downLocalPlayer();
    }

    this.model.killEnemiesIn(cells);
    const bossWasKilled = owner !== 'boss' && this.model.damageBossIn(cells);
    if (bossWasKilled) this.view.clearBossHud();
    this.view.updateBossHud();
    if (this.model.isLevelCleared()) this.clearLevel();
  }

  clearLevel() {
    if (!this.model.hasNextLevel()) {
      this.endGame(true);
      return;
    }

    this.model.gameOver = true;
    this.view.showLevelCompleteMessage(this.model.level + 1);
    this.scene.time.delayedCall(1500, () => this.startNextLevel());
  }

  startNextLevel() {
    const player = this.model.player;
    this.scene.scene.restart({
      ...this.scene.launchData,
      level: this.model.level + 1,
      score: this.model.score,
      playerStats: {
        maxBombs: player.maxBombs,
        bombRange: player.bombRange,
        speed: player.speed,
        currentBombType: player.currentBombType
      }
    });
  }

  handleItemPickup() {
    const player = this.model.player;
    if (!player.isAliveState()) return;

    const item = this.model.collectItemAt(player.gridX, player.gridY);
    if (!item) return;

    this.scene.sound.play('item-sfx', { volume: 0.35 });
    this.view.updateHud();
  }

  checkEnemyCollision() {
    const player = this.model.player;
    if (player.isDead()) return;

    const hit = this.model.enemies.some((enemy) => {
      return enemy.isAlive() && Phaser.Math.Distance.Between(player.sprite.x, player.sprite.y, enemy.sprite.x, enemy.sprite.y) < 26;
    });
    if (!hit) return;

    if (player.isDowned()) {
      this.killLocalPlayer();
      return;
    }

    this.killLocalPlayer();
  }

  checkBossCollision() {
    const player = this.model.player;
    const boss = this.model.boss;
    if (player.isDead() || !boss?.isAlive()) return;

    const hit = Phaser.Math.Distance.Between(player.sprite.x, player.sprite.y, boss.sprite.x, boss.sprite.y) < 46;
    if (!hit) return;

    this.killLocalPlayer();
  }

  endGame(won) {
    this.model.endGame(won);
    if (!won) this.scene.sound.play('lose-sfx', { volume: 0.35 });
    this.view.showEndMessage(won);
  }

  broadcastPlayerState(time) {
    if (!this.multiplayer.enabled || time - this.lastStateSentAt < 80) return;

    const player = this.model.player;
    this.lastStateSentAt = time;
    multiplayer.sendPlayerState({
      x: player.sprite.x,
      y: player.sprite.y,
      gridX: player.gridX,
      gridY: player.gridY,
      direction: player.direction,
      characterId: player.character.id,
      status: player.status,
      downedRemainingMs: player.isDowned() ? Math.max(0, player.downedUntil - this.scene.time.now) : 0
    });
  }

  downLocalPlayer() {
    const player = this.model.player;
    if (!player.isAliveState()) return;

    player.downUntil(this.scene.time.now + 15000);
    this.view.updateLocalPlayerStatus(15000);
    this.broadcastPlayerState(this.scene.time.now + 1000);
  }

  reviveLocalPlayer() {
    if (!this.model.player.revive()) return;

    this.view.updateLocalPlayerStatus();
    this.broadcastPlayerState(this.scene.time.now + 1000);
  }

  killLocalPlayer() {
    const player = this.model.player;
    if (player.isDead()) return;

    player.die();
    this.view.updateLocalPlayerStatus();
    this.broadcastPlayerState(this.scene.time.now + 1000);

    if (this.areAllPlayersDead()) {
      this.endGame(false);
    }
  }

  updateDownedState(time) {
    const player = this.model.player;
    if (!player.isDowned()) {
      this.view.updateLocalPlayerStatus();
      return;
    }

    const remaining = Math.max(0, player.downedUntil - time);
    this.view.updateLocalPlayerStatus(remaining);
    if (remaining <= 0) {
      this.killLocalPlayer();
    }
  }

  checkRemoteRevive(time) {
    if (!this.multiplayer.enabled || !this.model.player.isAliveState()) return;
    if (time - this.lastReviveRequestAt < 600) return;

    const targetPlayerId = this.view.findDownedRemoteTouching(this.model.player.sprite);
    if (!targetPlayerId) return;

    this.lastReviveRequestAt = time;
    multiplayer.requestRevive(targetPlayerId);
  }

  areAllPlayersDead() {
    if (!this.multiplayer.enabled || !this.multiplayer.room) {
      return this.model.player.isDead();
    }

    const players = this.multiplayer.room.players || [];
    if (players.length <= 1) return this.model.player.isDead();

    return players.every((player) => {
      if (player.id === this.multiplayer.playerId) return this.model.player.isDead();
      return this.remoteStatuses.get(player.id) === 'dead';
    });
  }
}
