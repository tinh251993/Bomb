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
    this.multiplayer = { enabled: false, room: null, playerId: null };
    this.lastStateSentAt = 0;
    this.unsubscribeRemoteState = null;
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
      this.view.updateRemotePlayer(playerId, state);
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

    this.handlePlayerMove(delta / 1000);
    this.handleItemPickup();
    this.handleEnemyMove(time);
    this.checkEnemyCollision();
    this.broadcastPlayerState(time);
  }

  handlePlayerMove(dt) {
    const input = this.getMoveInput();
    const player = this.model.player;
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
    this.applyExplosionDamage(cells);
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

  applyExplosionDamage(cells) {
    if (this.model.isPlayerIn(cells)) {
      this.endGame(false);
      return;
    }

    this.model.killEnemiesIn(cells);
    if (this.model.enemies.length === 0) this.endGame(true);
  }

  handleItemPickup() {
    const player = this.model.player;
    const item = this.model.collectItemAt(player.gridX, player.gridY);
    if (!item) return;

    this.scene.sound.play('item-sfx', { volume: 0.35 });
    this.view.updateHud();
  }

  checkEnemyCollision() {
    const player = this.model.player;
    const hit = this.model.enemies.some((enemy) => {
      return enemy.isAlive() && Phaser.Math.Distance.Between(player.sprite.x, player.sprite.y, enemy.sprite.x, enemy.sprite.y) < 26;
    });
    if (hit) this.endGame(false);
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
      characterId: player.character.id
    });
  }
}
