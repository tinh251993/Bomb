import { BombTypes, BossBombType, DIRS, Direction, TILE, TileType } from '../core/constants.js';
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
    this.lastWorldStateSentAt = 0;
    this.playerStateSeq = 0;
    this.worldStateSeq = 0;
    this.lastAppliedWorldStateSeq = 0;
    this.unsubscribeRemoteState = null;
    this.unsubscribeRemoteBomb = null;
    this.unsubscribeRemoteWorldState = null;
    this.unsubscribeReviveRequest = null;
    this.unsubscribeKillEnemiesRequest = null;
    this.unsubscribeRestartLevel = null;
    this.unsubscribeLatency = null;
    this.remoteStatuses = new Map();
    this.lastReviveRequestAt = 0;
    this.audioResumeHandler = null;
    this.mobileInput = { direction: null };
    this.mobileControlHandlers = [];
    this.mobileControlsRoot = null;
  }

  configureMultiplayer(config) {
    this.multiplayer = {
      enabled: Boolean(config.enabled),
      room: config.room || null,
      playerId: config.playerId || null
    };

    if (!this.multiplayer.enabled) return;

    multiplayer.enterGame().catch(() => {});
    this.unsubscribeRemoteState = multiplayer.onRemotePlayerState(({ playerId, state }) => {
      if (playerId === this.multiplayer.playerId) return;
      this.remoteStatuses.set(playerId, state?.status || 'alive');
      this.view.updateRemotePlayer(playerId, state);
    });
    this.unsubscribeRemoteBomb = multiplayer.onRemoteBombPlace(({ playerId, bomb }) => {
      if (playerId === this.multiplayer.playerId && this.isAuthoritativeHost()) return;
      this.placeRemoteBomb(bomb);
    });
    this.unsubscribeRemoteWorldState = multiplayer.onRemoteWorldState((state) => {
      if (this.isAuthoritativeHost()) return;
      this.applyWorldState(state);
    });
    this.unsubscribeReviveRequest = multiplayer.onReviveRequest(() => {
      this.reviveLocalPlayer();
    });
    this.unsubscribeKillEnemiesRequest = multiplayer.onKillEnemiesRequest(() => {
      if (this.isAuthoritativeHost()) this.killAllEnemies();
    });
    this.unsubscribeRestartLevel = multiplayer.onRestartLevel((payload) => {
      if (this.isAuthoritativeHost()) return;
      this.restartFromPayload(payload);
    });
    this.unsubscribeLatency = multiplayer.onLatencyUpdate((latencyMs) => {
      this.view.updatePing(latencyMs);
    });
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeRemoteState?.();
      this.unsubscribeRemoteBomb?.();
      this.unsubscribeRemoteWorldState?.();
      this.unsubscribeReviveRequest?.();
      this.unsubscribeKillEnemiesRequest?.();
      this.unsubscribeRestartLevel?.();
      this.unsubscribeLatency?.();
      multiplayer.leaveGame().catch(() => {});
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
      x: Phaser.Input.Keyboard.KeyCodes.X,
      z: Phaser.Input.Keyboard.KeyCodes.Z,
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
      Phaser.Input.Keyboard.KeyCodes.X,
      Phaser.Input.Keyboard.KeyCodes.Z,
      Phaser.Input.Keyboard.KeyCodes.SPACE
    ]);
    this.scene.game.canvas.setAttribute('tabindex', '0');
    this.scene.game.canvas.focus();
    this.scene.input.on('pointerdown', () => this.scene.game.canvas.focus());
    this.bindAudioResumeHandlers();
    this.scene.input.keyboard.on('keydown-SPACE', () => this.placeBomb());
    this.scene.input.keyboard.on('keydown-R', () => this.restartCurrentLevel());
    this.scene.input.keyboard.on('keydown-ONE', () => this.selectBombType(0));
    this.scene.input.keyboard.on('keydown-TWO', () => this.selectBombType(1));
    this.scene.input.keyboard.on('keydown-THREE', () => this.selectBombType(2));
    this.scene.input.keyboard.on('keydown-FOUR', () => this.selectBombType(3));
    this.scene.input.keyboard.on('keydown-FIVE', () => this.selectBombType(4));
    this.scene.input.keyboard.on('keydown-Z', (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      this.enableInfiniteLives();
    });
    this.scene.input.keyboard.on('keydown-X', (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      this.requestKillAllEnemies();
    });
    this.bindMobileControls();
    this.playGameMusic();
  }

  bindMobileControls() {
    this.mobileControlsRoot = document.querySelector('#mobile-controls');
    this.mobileControlsRoot?.classList.add('active');
    const controls = Array.from(document.querySelectorAll('[data-mobile-action]'));
    if (controls.length === 0) return;

    const directionMap = {
      left: Direction.LEFT,
      right: Direction.RIGHT,
      up: Direction.UP,
      down: Direction.DOWN
    };
    const setPressed = (button, pressed) => button.classList.toggle('pressed', pressed);

    controls.forEach((button) => {
      const action = button.dataset.mobileAction;
      const onDown = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.scene.game.canvas.focus();
        this.ensureAudioActive();
        setPressed(button, true);

        if (action === 'bomb') {
          this.placeBomb();
          return;
        }
        if (action === 'restart') {
          this.restartCurrentLevel();
          return;
        }
        if (action === 'invincible') {
          this.enableInfiniteLives();
          return;
        }
        this.mobileInput.direction = directionMap[action] || null;
      };
      const onUp = (event) => {
        event.preventDefault();
        setPressed(button, false);
        if (this.mobileInput.direction === directionMap[action]) this.mobileInput.direction = null;
      };

      button.addEventListener('pointerdown', onDown);
      button.addEventListener('pointerup', onUp);
      button.addEventListener('pointercancel', onUp);
      button.addEventListener('pointerleave', onUp);
      this.mobileControlHandlers.push({ button, onDown, onUp });
    });

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unbindMobileControls());
  }

  unbindMobileControls() {
    this.mobileControlHandlers.forEach(({ button, onDown, onUp }) => {
      button.removeEventListener('pointerdown', onDown);
      button.removeEventListener('pointerup', onUp);
      button.removeEventListener('pointercancel', onUp);
      button.removeEventListener('pointerleave', onUp);
      button.classList.remove('pressed');
    });
    this.mobileControlHandlers = [];
    this.mobileInput.direction = null;
    this.mobileControlsRoot?.classList.remove('active');
    this.mobileControlsRoot = null;
  }

  bindAudioResumeHandlers() {
    this.audioResumeHandler = () => this.ensureAudioActive();
    document.addEventListener('visibilitychange', this.audioResumeHandler);
    window.addEventListener('focus', this.audioResumeHandler);
    this.scene.input.on('pointerdown', this.audioResumeHandler);
    this.scene.input.keyboard.on('keydown', this.audioResumeHandler);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unbindAudioResumeHandlers());
  }

  unbindAudioResumeHandlers() {
    if (!this.audioResumeHandler) return;

    document.removeEventListener('visibilitychange', this.audioResumeHandler);
    window.removeEventListener('focus', this.audioResumeHandler);
    this.scene.input.off('pointerdown', this.audioResumeHandler);
    this.scene.input.keyboard.off('keydown', this.audioResumeHandler);
    this.audioResumeHandler = null;
  }

  ensureAudioActive() {
    const sound = this.scene.sound;
    if (sound.context?.state === 'suspended') {
      sound.context.resume().catch(() => {});
    }

    const music = sound.get('game-music');
    if (!music) return;
    if (music.isPaused) {
      music.resume();
      return;
    }
    if (!music.isPlaying) {
      music.play({ loop: true, volume: 0.42 });
    }
  }

  enableInfiniteLives() {
    if (!this.isAuthoritativeHost()) {
      this.view.showCheatMessage('HOST ONLY');
      return;
    }

    this.model.enableInfiniteLives();
    this.view.showCheatMessage('INFINITE LIVES');
    this.view.updateHud();
  }

  requestKillAllEnemies() {
    if (this.isAuthoritativeHost()) {
      this.killAllEnemies();
      return;
    }

    multiplayer.requestKillEnemies();
    this.view.showCheatMessage('KILL ENEMIES REQUEST');
  }

  killAllEnemies() {
    if (!this.isAuthoritativeHost()) return;

    const killed = this.model.killAllEnemies();
    if (killed.length === 0) {
      this.view.showCheatMessage('NO ENEMIES');
      return;
    }

    this.view.showCheatMessage('ENEMIES CLEARED');
    this.view.updateHud();
    if (this.model.isLevelCleared()) {
      this.clearLevel();
      return;
    }
    if (this.multiplayer.enabled) {
      multiplayer.sendWorldState(this.createWorldState());
    }
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

  restartCurrentLevel() {
    if (!this.isAuthoritativeHost()) {
      this.view.showCheatMessage('HOST ONLY');
      return;
    }

    const payload = this.createRestartPayload();
    multiplayer.sendRestartLevel(payload);
    this.restartFromPayload(payload);
  }

  createRestartPayload() {
    return {
      level: this.model.level,
      score: this.model.score,
      levelDeathCount: this.model.levelDeathCount,
      infiniteLives: this.model.infiniteLives
    };
  }

  restartFromPayload(payload = {}) {
    const player = this.model.player;
    this.scene.scene.restart({
      ...this.scene.launchData,
      ...payload,
      playerStats: {
        ...(this.scene.launchData?.playerStats || {}),
        maxBombs: player.maxBombs,
        bombRange: player.bombRange,
        speed: player.speed,
        currentBombType: player.currentBombType,
        infiniteLives: Boolean(payload.infiniteLives),
        levelDeathCount: payload.levelDeathCount || 0
      }
    });
  }

  update(time, delta) {
    if (this.model.gameOver) return;

    this.handlePlayerMove(delta / 1000);
    this.handleItemPickup();
    if (this.isAuthoritativeHost()) {
      this.handleEnemyMove(time);
      this.handleBossMove(time);
      this.handleBossBombThrow(time);
      this.broadcastWorldState(time);
    }
    this.checkEnemyCollision();
    this.checkBossCollision();
    this.broadcastPlayerState(time);
    this.view.updateNetworkSprites(delta / 1000);
  }

  isAuthoritativeHost() {
    return !this.multiplayer.enabled || multiplayer.isHost();
  }

  handlePlayerMove(dt) {
    const input = this.getMoveInput();
    const player = this.model.player;
    if (!player.isAliveState()) return;

    this.model.updatePlayerPassThroughBombs(this.getPlayerOverlapCells(player.sprite.x, player.sprite.y));
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
    this.model.updatePlayerPassThroughBombs(this.getPlayerOverlapCells(player.sprite.x, player.sprite.y));
  }

  getPlayerOverlapCells(worldX, worldY) {
    const halfWidth = 13;
    const halfHeight = 22;
    const samples = [
      GridMath.toGrid(worldX - halfWidth, worldY - halfHeight),
      GridMath.toGrid(worldX + halfWidth, worldY - halfHeight),
      GridMath.toGrid(worldX - halfWidth, worldY + halfHeight),
      GridMath.toGrid(worldX + halfWidth, worldY + halfHeight),
      GridMath.toGrid(worldX, worldY)
    ];

    const unique = new Map();
    samples.forEach((cell) => unique.set(GridMath.key(cell.x, cell.y), cell));
    return Array.from(unique.values());
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
    if (this.mobileInput.direction === Direction.LEFT) return { dx: -1, dy: 0, direction: Direction.LEFT };
    if (this.mobileInput.direction === Direction.RIGHT) return { dx: 1, dy: 0, direction: Direction.RIGHT };
    if (this.mobileInput.direction === Direction.UP) return { dx: 0, dy: -1, direction: Direction.UP };
    if (this.mobileInput.direction === Direction.DOWN) return { dx: 0, dy: 1, direction: Direction.DOWN };
    return { dx: 0, dy: 0, direction: this.model.player.direction };
  }

  handleEnemyMove(time) {
    if (time < this.enemyStepTime) return;
    const speed = this.model.enemies[0]?.speed || 1;
    this.enemyStepTime = time + Math.round(300 / speed);

    this.model.enemies.forEach((enemy) => {
      if (!enemy.isAlive()) return;

      const choices = DIRS.filter((dir) => this.model.isWalkable(enemy.gridX + dir.x, enemy.gridY + dir.y));
      if (choices.length === 0) return;

      const chaseDir = this.getChaseDirection(enemy, time, 10000, 5000);
      if (chaseDir) {
        enemy.dir = chaseDir;
      } else if (!this.model.isWalkable(enemy.gridX + enemy.dir.x, enemy.gridY + enemy.dir.y) || Phaser.Math.Between(0, 100) < 28) {
        enemy.chooseDirection(choices);
      }

      const nextX = enemy.gridX + enemy.dir.x;
      const nextY = enemy.gridY + enemy.dir.y;
      if (!this.model.isWalkable(nextX, nextY)) return;

      enemy.setDirection(this.directionFromDelta(enemy.dir));
      enemy.setGridPosition(nextX, nextY);
      this.view.moveEnemy(enemy);
    });
  }

  handleBossMove(time) {
    this.model.bosses.forEach((boss) => {
      if (!boss?.isAlive()) return;
      if (boss.isEagle()) {
        this.handleEagleMove(boss, time);
        return;
      }

      if (!boss.nextStepAt) boss.nextStepAt = 0;
      if (time < boss.nextStepAt) return;
      boss.nextStepAt = time + Math.round(260 / boss.speed);

      const choices = DIRS.filter((dir) => this.model.canBossOccupy(boss.gridX + dir.x, boss.gridY + dir.y, boss));
      if (choices.length === 0) return;

      const chaseDir = this.getChaseDirection(boss, time, 15000, 8000);
      if (chaseDir) {
        boss.dir = chaseDir;
      } else if (!this.model.canBossOccupy(boss.gridX + boss.dir.x, boss.gridY + boss.dir.y, boss) || Phaser.Math.Between(0, 100) < 34) {
        boss.chooseDirection(choices);
      }

      boss.setDirection(this.directionFromDelta(boss.dir));
      this.view.setBossDirection(boss.direction, boss);
      boss.setGridPosition(boss.gridX + boss.dir.x, boss.gridY + boss.dir.y);
      this.view.moveBoss(boss);
    });
  }

  handleEagleMove(boss, time) {
    if (!boss.nextFlightAt) boss.nextFlightAt = time + 10000;

    if (boss.stunnedUntil && time < boss.stunnedUntil) return;

    if (!boss.flying && time >= boss.nextFlightAt) {
      boss.flying = true;
      boss.flightUntil = time + 4000;
      boss.nextStepAt = 0;
      this.view.setBossFlying(boss, true);
    }

    if (boss.flying && time >= boss.flightUntil) {
      this.landEagleBoss(boss, time);
      return;
    }

    if (time < boss.nextStepAt) return;
    boss.nextStepAt = time + Math.max(80, Math.round((TILE / boss.getMoveSpeed()) * 1000));

    let dir = null;
    if (boss.flying) {
      dir = this.getDirectChaseDirection(boss);
    } else {
      const choices = DIRS.filter((candidate) => this.model.canBossOccupy(boss.gridX + candidate.x, boss.gridY + candidate.y, boss));
      if (choices.length === 0) return;
      const chaseDir = this.getChaseDirection(boss, time, 15000, 8000);
      if (chaseDir) {
        dir = chaseDir;
      } else if (!this.model.canBossOccupy(boss.gridX + boss.dir.x, boss.gridY + boss.dir.y, boss) || Phaser.Math.Between(0, 100) < 34) {
        boss.chooseDirection(choices);
        dir = boss.dir;
      } else {
        dir = boss.dir;
      }
    }

    if (!dir) return;
    const nextX = boss.gridX + dir.x;
    const nextY = boss.gridY + dir.y;
    const canMove = boss.flying ? this.canFlyingBossMoveTo(nextX, nextY) : this.model.canBossOccupy(nextX, nextY, boss);
    if (!canMove) return;

    boss.dir = dir;
    boss.setDirection(this.directionFromDelta(dir));
    this.view.setBossDirection(boss.direction, boss);
    boss.setGridPosition(nextX, nextY);
    this.view.moveBoss(boss);
  }

  getDirectChaseDirection(boss) {
    const target = this.findNearestAlivePlayer(boss.gridX, boss.gridY);
    if (!target) return boss.dir;

    const dx = target.gridX - boss.gridX;
    const dy = target.gridY - boss.gridY;
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) return { x: Math.sign(dx), y: 0 };
    if (dy !== 0) return { x: 0, y: Math.sign(dy) };
    if (dx !== 0) return { x: Math.sign(dx), y: 0 };
    return null;
  }

  canFlyingBossMoveTo(x, y) {
    return x > 0 && y > 0 && x < this.model.map.grid[0].length - 2 && y < this.model.map.grid.length - 2;
  }

  landEagleBoss(boss, time) {
    boss.flying = false;
    boss.nextFlightAt = time + 10000;
    boss.nextStepAt = time + 500;
    this.view.setBossFlying(boss, false);

    const centerX = boss.gridX + 1;
    const centerY = boss.gridY + 1;
    const destroyed = this.model.destroyTilesInRadius(centerX, centerY, 2);
    destroyed.forEach((cell) => this.view.removeTile(cell.x, cell.y));

    const radiusCells = [];
    for (let y = centerY - 2; y <= centerY + 2; y++) {
      for (let x = centerX - 2; x <= centerX + 2; x++) {
        if (x < 0 || y < 0 || x >= this.model.map.grid[0].length || y >= this.model.map.grid.length) continue;
        if (Math.abs(x - centerX) + Math.abs(y - centerY) <= 2) radiusCells.push({ x, y });
      }
    }
    this.model.removeItemsIn(radiusCells);
    this.triggerBombsIn(radiusCells);
    this.view.drawExplosion(radiusCells, BossBombType);

    if (boss.health <= boss.maxHealth / 2) {
      this.scene.time.delayedCall(1000, () => {
        if (boss.isAlive() && !boss.flying) this.view.playBossFire(boss, 1000);
      });
      this.scene.time.delayedCall(2000, () => {
        if (boss.isAlive() && !boss.flying) this.throwEagleBombs(boss);
      });
    }
  }

  interruptEagleFlight(boss) {
    if (!boss?.isEagle() || !boss.flying || !boss.isAlive()) return;

    const releaseAt = this.scene.time.now + 1000;
    boss.stunnedUntil = Math.max(boss.stunnedUntil || 0, releaseAt);
    boss.nextStepAt = boss.stunnedUntil;
    this.view.setBossFlying(boss, true);

    this.scene.time.delayedCall(1000, () => {
      if (!boss.isAlive()) return;
      if (boss.stunnedUntil > this.scene.time.now) return;

      boss.flying = false;
      boss.nextFlightAt = this.scene.time.now + 10000;
      boss.nextStepAt = this.scene.time.now + 500;
      boss.stunnedUntil = 0;
      this.view.setBossFlying(boss, false);
      this.view.syncBoss(boss);
    });
  }

  getChaseDirection(actor, time, cooldownMs, durationMs) {
    if (!actor.nextChaseAt) actor.nextChaseAt = time + cooldownMs;
    if (time >= actor.nextChaseAt) {
      actor.chaseUntil = time + durationMs;
      actor.nextChaseAt = time + cooldownMs;
    }
    if (time > actor.chaseUntil) return null;

    const target = this.findNearestAlivePlayer(actor.gridX, actor.gridY);
    if (!target) return null;
    return this.findPathDirection(actor.gridX, actor.gridY, target.gridX, target.gridY);
  }

  findNearestAlivePlayer(fromX, fromY) {
    const players = [];
    const local = this.model.player;
    if (local.isAliveState()) {
      players.push({ gridX: local.gridX, gridY: local.gridY });
    }

    this.view.remoteStates.forEach((state) => {
      if (state?.status !== 'alive') return;
      if (!Number.isFinite(state.gridX) || !Number.isFinite(state.gridY)) return;
      players.push({ gridX: state.gridX, gridY: state.gridY });
    });

    if (players.length === 0) return null;
    return players.reduce((nearest, player) => {
      const distance = Math.abs(player.gridX - fromX) + Math.abs(player.gridY - fromY);
      if (!nearest || distance < nearest.distance) return { ...player, distance };
      return nearest;
    }, null);
  }

  findPathDirection(startX, startY, targetX, targetY) {
    if (startX === targetX && startY === targetY) return null;

    const queue = [{ x: startX, y: startY, firstDir: null }];
    const visited = new Set([GridMath.key(startX, startY)]);

    while (queue.length > 0) {
      const current = queue.shift();
      for (const dir of DIRS) {
        const nextX = current.x + dir.x;
        const nextY = current.y + dir.y;
        const key = GridMath.key(nextX, nextY);
        if (visited.has(key)) continue;
        if (!this.canActorMoveTo(startX, startY, nextX, nextY, targetX, targetY)) continue;

        const firstDir = current.firstDir || dir;
        if (nextX === targetX && nextY === targetY) return firstDir;

        visited.add(key);
        queue.push({ x: nextX, y: nextY, firstDir });
      }
    }

    return null;
  }

  canActorMoveTo(startX, startY, nextX, nextY, targetX, targetY) {
    const boss = this.model.bosses.find((item) => item.gridX === startX && item.gridY === startY);
    if (boss) return this.model.canBossOccupy(nextX, nextY, boss);
    return this.model.isWalkable(nextX, nextY);
  }

  directionFromDelta(delta) {
    if (delta.x < 0) return Direction.LEFT;
    if (delta.x > 0) return Direction.RIGHT;
    if (delta.y < 0) return Direction.UP;
    return Direction.DOWN;
  }

  handleBossBombThrow(time) {
    this.model.bosses.forEach((boss) => {
      if (!boss?.isAlive()) return;
      if (boss.isEagle()) return;

      if (!boss.nextThrowAt) {
        boss.nextThrowAt = time + 6000;
        boss.isPreparingThrow = false;
        return;
      }

      if (!boss.isPreparingThrow && time >= boss.nextThrowAt - 1000) {
        boss.isPreparingThrow = true;
        this.view.playBossFire(boss, 1000);
      }
      if (time < boss.nextThrowAt) return;

      boss.nextThrowAt = time + 6000;
      boss.isPreparingThrow = false;
      this.model.getRandomBossBombSpots(8).forEach((spot) => {
        const bomb = this.model.placeBossBomb(spot.x, spot.y, boss);
        if (!bomb) return;

        this.view.createBombSprite(bomb);
        const key = GridMath.key(bomb.gridX, bomb.gridY);
        bomb.setTimer(this.scene.time.delayedCall(1650, () => this.explodeBomb(key)));
        multiplayer.sendBombPlace({
          x: bomb.gridX,
          y: bomb.gridY,
          range: bomb.range,
          bombTypeId: bomb.type.id
        });
      });
    });
  }

  throwEagleBombs(boss) {
    this.model.getRandomBossBombSpots(10).forEach((spot) => {
      const bomb = this.model.placeBossBomb(spot.x, spot.y, boss, boss.getBombRange());
      if (!bomb) return;

      this.view.createBombSprite(bomb);
      const key = GridMath.key(bomb.gridX, bomb.gridY);
      bomb.setTimer(this.scene.time.delayedCall(1650, () => this.explodeBomb(key)));
      multiplayer.sendBombPlace({
        x: bomb.gridX,
        y: bomb.gridY,
        range: bomb.range,
        bombTypeId: bomb.type.id
      });
    });
  }

  placeBomb() {
    const tile = GridMath.toGrid(this.model.player.sprite.x, this.model.player.sprite.y);
    const damageDisabled = this.model.player.isInvincible(this.scene.time.now);
    if (this.multiplayer.enabled && !this.isAuthoritativeHost()) {
      multiplayer.sendBombPlace({
        x: tile.x,
        y: tile.y,
        range: this.model.player.bombRange,
        bombTypeId: this.model.player.currentBombType.id,
        damageDisabled
      });
      return;
    }

    const bomb = this.model.placeBomb(tile.x, tile.y, { damageDisabled });
    if (!bomb) return;

    this.view.createBombSprite(bomb);
    const key = GridMath.key(bomb.gridX, bomb.gridY);
    bomb.setTimer(this.scene.time.delayedCall(1650, () => this.explodeBomb(key)));
    multiplayer.sendBombPlace({
      x: bomb.gridX,
      y: bomb.gridY,
      range: bomb.range,
      bombTypeId: bomb.type.id,
      damageDisabled: bomb.damageDisabled
    });
  }

  placeRemoteBomb(payload) {
    if (!payload) return;

    const type = payload.bombTypeId === 'boss'
      ? BossBombType
      : BombTypes.find((item) => item.id === payload.bombTypeId) || BombTypes[0];
    const bomb = this.model.placeRemoteBomb(payload.x, payload.y, payload.range || 2, type, {
      damageDisabled: Boolean(payload.damageDisabled)
    });
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
    this.applyExplosionDamage(cells, bomb);
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

  applyExplosionDamage(cells, bomb) {
    const owner = bomb?.owner || 'player';
    if (!bomb?.damageDisabled && this.model.isPlayerIn(cells)) {
      this.downLocalPlayer();
    }

    if (!this.isAuthoritativeHost()) return;

    if (owner !== 'boss' && !bomb?.damageDisabled) {
      this.model.killEnemiesIn(cells);
    }
    if (owner !== 'boss' && !bomb?.damageDisabled) {
      this.model.getBossesIn(cells)
        .filter((boss) => boss.isEagle() && boss.flying)
        .forEach((boss) => this.interruptEagleFlight(boss));
    }
    const killedBosses = owner !== 'boss' && !bomb?.damageDisabled ? this.model.damageBossIn(cells) : [];
    killedBosses.forEach((boss) => this.view.showBossDead(boss));
    if (!this.model.isBossAlive()) this.view.clearBossHud();
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
        currentBombType: player.currentBombType,
        infiniteLives: this.model.infiniteLives
      },
      infiniteLives: this.model.infiniteLives
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
    if (player.isDead() || player.isInvincible(this.scene.time.now)) return;

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
    if (player.isDead() || player.isInvincible(this.scene.time.now)) return;

    const hit = this.model.bosses.some((boss) => {
      if (!boss?.isAlive()) return false;
      return boss.getOccupiedCells().some((cell) => cell.x === player.gridX && cell.y === player.gridY)
        || Phaser.Math.Distance.Between(player.sprite.x, player.sprite.y, boss.sprite.x, boss.sprite.y) < 70;
    });
    if (!hit) return;

    this.killLocalPlayer();
  }

  endGame(won) {
    this.model.endGame(won);
    this.scene.sound.play(won ? 'win-sfx' : 'lose-sfx', { volume: won ? 0.42 : 0.35 });
    this.view.showEndMessage(won);
  }

  broadcastPlayerState(time) {
    if (!this.multiplayer.enabled || time - this.lastStateSentAt < 80) return;

    const player = this.model.player;
    this.lastStateSentAt = time;
    const state = {
      seq: ++this.playerStateSeq,
      x: player.sprite.x,
      y: player.sprite.y,
      gridX: player.gridX,
      gridY: player.gridY,
      direction: player.direction,
      characterId: player.character.id,
      status: player.status,
      downedRemainingMs: player.isDowned() ? Math.max(0, player.downedUntil - this.scene.time.now) : 0
    };
    multiplayer.sendPlayerState(state);
  }

  broadcastWorldState(time) {
    if (!this.multiplayer.enabled || time - this.lastWorldStateSentAt < 100) return;

    this.lastWorldStateSentAt = time;
    multiplayer.sendWorldState(this.createWorldState());
  }

  createWorldState() {
    return {
      seq: ++this.worldStateSeq,
      score: this.model.score,
      crates: this.getCrateState(),
      enemies: this.model.enemies.filter((enemy) => enemy.isAlive()).map((enemy) => ({
        id: enemy.id,
        x: enemy.gridX,
        y: enemy.gridY,
        worldX: enemy.sprite?.x,
        worldY: enemy.sprite?.y,
        direction: enemy.direction,
        alive: true
      })),
      bosses: this.model.bosses.filter((boss) => boss.isAlive()).map((boss) => ({
        id: boss.id,
        bossType: boss.type?.id,
        x: boss.gridX,
        y: boss.gridY,
        worldX: boss.sprite?.x,
        worldY: boss.sprite?.y,
        direction: boss.direction,
        health: boss.health,
        bombRange: boss.bombRange,
        flying: boss.flying,
        alive: true
      }))
    };
  }

  applyWorldState(state) {
    if (!state) return;
    if (Number.isFinite(state.seq)) {
      if (state.seq <= this.lastAppliedWorldStateSeq) return;
      this.lastAppliedWorldStateSeq = state.seq;
    }
    if (Number.isFinite(state.score)) this.model.score = state.score;
    if (Array.isArray(state.crates)) this.applyCrateState(state.crates);

    const liveEnemyIds = new Set((state.enemies || []).map((enemyState) => enemyState.id));
    this.model.enemies.forEach((enemy) => {
      if (liveEnemyIds.has(enemy.id)) return;
      enemy.destroy();
    });

    state.enemies?.forEach((enemyState) => {
      const enemy = this.model.enemies.find((item) => item.id === enemyState.id);
      if (!enemy) return;

      if (!enemyState.alive) {
        enemy.destroy();
        return;
      }

      const nextDirection = enemyState.direction || enemy.direction;
      const nextEnemyWorldX = Number.isFinite(enemyState.worldX) ? enemyState.worldX : null;
      const nextEnemyWorldY = Number.isFinite(enemyState.worldY) ? enemyState.worldY : null;
      const changed = enemy.gridX !== enemyState.x
        || enemy.gridY !== enemyState.y
        || enemy.direction !== nextDirection
        || Math.abs((enemy.networkX ?? -9999) - (nextEnemyWorldX ?? -9999)) > 2
        || Math.abs((enemy.networkY ?? -9999) - (nextEnemyWorldY ?? -9999)) > 2
        || !enemy.sprite.visible;
      if (!changed) return;

      enemy.setGridPosition(enemyState.x, enemyState.y);
      enemy.setDirection(nextDirection);
      enemy.networkX = nextEnemyWorldX;
      enemy.networkY = nextEnemyWorldY;
      this.view.syncEnemy(enemy);
    });

    this.model.enemies = this.model.enemies.filter((enemy) => enemy.isAlive());

    const bossStates = state.bosses || (state.boss ? [{ id: 'boss-0', ...state.boss }] : []);
    bossStates.forEach((bossState) => {
      const boss = this.model.bosses.find((item) => item.id === bossState.id);
      if (!boss) return;

      if (!bossState.alive) {
        boss.destroy();
        return;
      }

      const nextType = this.model.resolveBossType?.(bossState.bossType) || boss.type;
      const nextDirection = bossState.direction || boss.direction;
      const nextBombRange = Number.isFinite(bossState.bombRange) ? bossState.bombRange : boss.bombRange;
      const nextFlying = Boolean(bossState.flying);
      const nextBossWorldX = Number.isFinite(bossState.worldX) ? bossState.worldX : null;
      const nextBossWorldY = Number.isFinite(bossState.worldY) ? bossState.worldY : null;
      const changed = boss.gridX !== bossState.x
        || boss.gridY !== bossState.y
        || Math.abs((boss.networkX ?? -9999) - (nextBossWorldX ?? -9999)) > 2
        || Math.abs((boss.networkY ?? -9999) - (nextBossWorldY ?? -9999)) > 2
        || boss.type?.id !== nextType?.id
        || boss.direction !== nextDirection
        || boss.health !== bossState.health
        || boss.bombRange !== nextBombRange
        || boss.flying !== nextFlying
        || !boss.sprite.visible;

      boss.setGridPosition(bossState.x, bossState.y);
      boss.type = nextType;
      boss.setDirection(nextDirection);
      boss.health = bossState.health;
      boss.bombRange = nextBombRange;
      boss.flying = nextFlying;
      boss.networkX = nextBossWorldX;
      boss.networkY = nextBossWorldY;
      if (!changed) return;

      this.view.setBossDirection(boss.direction, boss);
      this.view.syncBoss(boss);
    });
    this.model.boss = this.model.bosses.find((boss) => boss.isAlive()) || null;
    this.view.updateHud();
  }

  getCrateState() {
    const crates = [];
    for (let y = 0; y < this.model.map.grid.length; y++) {
      for (let x = 0; x < this.model.map.grid[y].length; x++) {
        if (this.model.map.get(x, y) === TileType.CRATE) crates.push(`${x},${y}`);
      }
    }
    return crates;
  }

  applyCrateState(crateKeys) {
    const hostCrates = new Set(crateKeys);
    for (let y = 0; y < this.model.map.grid.length; y++) {
      for (let x = 0; x < this.model.map.grid[y].length; x++) {
        const key = `${x},${y}`;
        const localHasCrate = this.model.map.get(x, y) === TileType.CRATE;
        const hostHasCrate = hostCrates.has(key);

        if (localHasCrate && !hostHasCrate) {
          this.model.map.set(x, y, TileType.EMPTY);
          this.view.removeCrate(x, y);
        }
        if (!localHasCrate && hostHasCrate && this.model.map.get(x, y) === TileType.EMPTY) {
          this.model.map.set(x, y, TileType.CRATE);
          this.view.restoreCrate(x, y);
        }
      }
    }
  }

  downLocalPlayer() {
    const player = this.model.player;
    if (!player.isAliveState()) return;
    if (player.isInvincible(this.scene.time.now)) return;

    this.killLocalPlayer();
  }

  reviveLocalPlayer() {
    if (!this.model.player.revive()) return;

    this.view.updateLocalPlayerStatus();
    this.broadcastPlayerState(this.scene.time.now + 1000);
  }

  killLocalPlayer() {
    const player = this.model.player;
    if (player.isDead()) return;

    const deathCount = this.model.recordLevelDeath();
    this.view.showDeathCount(deathCount);
    if (this.model.infiniteLives) {
      this.respawnLocalPlayer();
      return;
    }

    player.die();
    this.view.updateLocalPlayerStatus();
    this.view.updateHud();
    this.broadcastPlayerState(this.scene.time.now + 1000);

    if (this.areAllPlayersDead()) {
      this.endGame(false);
    }
  }

  respawnLocalPlayer() {
    const spawn = this.model.respawnPlayer(this.scene.time.now + 3000);
    const pos = GridMath.toWorld(spawn.x, spawn.y);
    const sprite = this.model.player.sprite;
    sprite.setPosition(pos.x, pos.y);
    this.view.setPlayerDirection(Direction.DOWN);
    this.view.updatePlayerDepth();
    this.view.updateLocalPlayerStatus();
    this.broadcastPlayerState(this.scene.time.now + 1000);
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
