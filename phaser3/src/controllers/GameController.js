import { BombTypes, BossBombType, DIRS, Direction } from '../core/constants.js';
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
    this.unsubscribeRemoteState = null;
    this.unsubscribeRemoteBomb = null;
    this.unsubscribeRemoteWorldState = null;
    this.unsubscribeReviveRequest = null;
    this.unsubscribeKillEnemiesRequest = null;
    this.unsubscribeLatency = null;
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

    multiplayer.enterGame().catch(() => {});
    this.unsubscribeRemoteState = multiplayer.onRemotePlayerState(({ playerId, state }) => {
      if (playerId === this.multiplayer.playerId) return;
      this.remoteStatuses.set(playerId, state?.status || 'alive');
      this.view.updateRemotePlayer(playerId, state);
      if (playerId === this.multiplayer.room?.hostId && !this.isAuthoritativeHost()) {
        this.applyWorldState(state?.world);
      }
    });
    this.unsubscribeRemoteBomb = multiplayer.onRemoteBombPlace(({ playerId, bomb }) => {
      if (playerId === this.multiplayer.playerId) return;
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
    this.unsubscribeLatency = multiplayer.onLatencyUpdate((latencyMs) => {
      this.view.updatePing(latencyMs);
    });
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeRemoteState?.();
      this.unsubscribeRemoteBomb?.();
      this.unsubscribeRemoteWorldState?.();
      this.unsubscribeReviveRequest?.();
      this.unsubscribeKillEnemiesRequest?.();
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
    this.scene.input.keyboard.on('keydown-SPACE', () => this.placeBomb());
    this.scene.input.keyboard.on('keydown-R', () => this.scene.scene.restart());
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
    this.playGameMusic();
  }

  enableInfiniteLives() {
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

  update(time, delta) {
    if (this.model.gameOver) return;

    this.updateDownedState(time);
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
    this.checkRemoteRevive(time);
    this.broadcastPlayerState(time);
  }

  isAuthoritativeHost() {
    return !this.multiplayer.enabled || multiplayer.isHost();
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

      const chaseDir = this.getChaseDirection(enemy, time, 10000, 5000);
      if (chaseDir) {
        enemy.dir = chaseDir;
      } else if (!this.model.isWalkable(enemy.gridX + enemy.dir.x, enemy.gridY + enemy.dir.y) || Phaser.Math.Between(0, 100) < 28) {
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

    const chaseDir = this.getChaseDirection(boss, time, 15000, 8000);
    if (chaseDir) {
      boss.dir = chaseDir;
    } else if (!this.model.isWalkable(boss.gridX + boss.dir.x, boss.gridY + boss.dir.y) || Phaser.Math.Between(0, 100) < 34) {
      boss.chooseDirection(choices);
    }

    boss.setDirection(this.directionFromDelta(boss.dir));
    this.view.setBossDirection(boss.direction);
    boss.setGridPosition(boss.gridX + boss.dir.x, boss.gridY + boss.dir.y);
    this.view.moveBoss(boss);
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
        if (!this.model.isWalkable(nextX, nextY) && !(nextX === targetX && nextY === targetY)) continue;

        const firstDir = current.firstDir || dir;
        if (nextX === targetX && nextY === targetY) return firstDir;

        visited.add(key);
        queue.push({ x: nextX, y: nextY, firstDir });
      }
    }

    return null;
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
    this.view.playBossFire();
    this.model.getRandomBossBombSpots(8).forEach((spot) => {
      const bomb = this.model.placeBossBomb(spot.x, spot.y);
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
    const bomb = this.model.placeBomb(tile.x, tile.y);
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
  }

  placeRemoteBomb(payload) {
    if (!payload) return;

    const type = payload.bombTypeId === 'boss'
      ? BossBombType
      : BombTypes.find((item) => item.id === payload.bombTypeId) || BombTypes[0];
    const bomb = this.model.placeRemoteBomb(payload.x, payload.y, payload.range || 2, type);
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

    if (!this.isAuthoritativeHost()) return;

    this.model.killEnemiesIn(cells);
    const bossWasKilled = owner !== 'boss' && this.model.damageBossIn(cells);
    if (bossWasKilled) {
      this.view.showBossDead();
      this.view.clearBossHud();
    }
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
    const boss = this.model.boss;
    if (player.isDead() || player.isInvincible(this.scene.time.now) || !boss?.isAlive()) return;

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
    const state = {
      x: player.sprite.x,
      y: player.sprite.y,
      gridX: player.gridX,
      gridY: player.gridY,
      direction: player.direction,
      characterId: player.character.id,
      status: player.status,
      downedRemainingMs: player.isDowned() ? Math.max(0, player.downedUntil - this.scene.time.now) : 0
    };
    if (this.isAuthoritativeHost()) state.world = this.createWorldState();
    multiplayer.sendPlayerState(state);
  }

  broadcastWorldState(time) {
    if (!this.multiplayer.enabled || time - this.lastWorldStateSentAt < 120) return;

    this.lastWorldStateSentAt = time;
    multiplayer.sendWorldState(this.createWorldState());
  }

  createWorldState() {
    return {
      enemies: this.model.enemies.map((enemy) => ({
        id: enemy.id,
        x: enemy.gridX,
        y: enemy.gridY,
        alive: enemy.isAlive()
      })),
      boss: this.model.boss ? {
        x: this.model.boss.gridX,
        y: this.model.boss.gridY,
        direction: this.model.boss.direction,
        health: this.model.boss.health,
        alive: this.model.boss.isAlive()
      } : null
    };
  }

  applyWorldState(state) {
    if (!state) return;

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

      enemy.setGridPosition(enemyState.x, enemyState.y);
      this.view.syncEnemy(enemy);
    });

    this.model.enemies = this.model.enemies.filter((enemy) => enemy.isAlive());

    if (state.boss && this.model.boss) {
      this.model.boss.setGridPosition(state.boss.x, state.boss.y);
      this.model.boss.setDirection(state.boss.direction || this.model.boss.direction);
      this.model.boss.health = state.boss.health;
      if (!state.boss.alive) this.model.boss.destroy();
      this.view.setBossDirection(this.model.boss.direction);
      this.view.syncBoss();
    }
  }

  downLocalPlayer() {
    const player = this.model.player;
    if (!player.isAliveState()) return;
    if (player.isInvincible(this.scene.time.now)) return;

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

    if (this.model.infiniteLives) {
      this.respawnLocalPlayer();
      return;
    }

    player.die();
    this.view.updateLocalPlayerStatus();
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
    this.view.showCheatMessage('RESPAWN');
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
