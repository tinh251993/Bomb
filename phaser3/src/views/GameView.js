import { Characters, COLS, HEIGHT, HUD, ROWS, TILE, TileType, WIDTH } from '../core/constants.js';
import { createBombSheetTextures } from '../core/BombTextureFactory.js';
import { GridMath } from '../core/GridMath.js';

export class GameView {
  constructor(scene, model) {
    this.scene = scene;
    this.model = model;
    this.remoteSprites = new Map();
  }

  preload() {
    const load = this.scene.load;
    load.image('floor', '../res/land.png');
    load.image('wall', '../res/boxcot.png');
    load.image('crate', '../res/boxgo2.png');
    load.image('bomb-sheet', '../res/Bomb/bomb.png');
    Characters.forEach((character) => {
      load.image(`${character.id}-card`, character.card);
      Object.entries(character.sprites).forEach(([direction, path]) => {
        load.image(`${character.id}-${direction}`, path);
      });
    });
    load.image('enemy', '../res/quaivat 3_down.png');
    load.image('item-bomb', '../res/items/item_bomb.gif');
    load.image('item-flame', '../res/items/item_bombsize.gif');
    load.image('item-speed', '../res/items/item_shoe.gif');
    load.audio('bomb-sfx', '../res/sound/bomb_bang.wav');
    load.audio('item-sfx', '../res/sound/item.wav');
    load.audio('lose-sfx', '../res/sound/bomber_die.wav');
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
    this.drawHud();
  }

  drawMap() {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const pos = GridMath.toWorld(x, y);
        this.floorLayer.add(this.scene.add.image(pos.x, pos.y, 'floor').setDisplaySize(TILE, TILE));

        const tile = this.model.map.get(x, y);
        if (tile === TileType.WALL) {
          this.wallLayer.add(this.scene.add.image(pos.x, pos.y, 'wall').setDisplaySize(TILE, TILE).setDepth(this.depthForY(pos.y)));
        }
        if (tile === TileType.CRATE) {
          const crate = this.scene.add.image(pos.x, pos.y, 'crate').setDisplaySize(TILE, TILE).setDepth(this.depthForY(pos.y));
          crate.gridX = x;
          crate.gridY = y;
          this.crateLayer.add(crate);
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
    this.model.enemies.forEach((enemy) => {
      const pos = GridMath.toWorld(enemy.gridX, enemy.gridY);
      const sprite = this.scene.add.sprite(pos.x, pos.y, 'enemy').setDisplaySize(42, 42);
      this.updateSpriteDepth(sprite);
      enemy.attachSprite(sprite);
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
    this.messageText = this.scene.add.text(WIDTH / 2, HEIGHT / 2, '', {
      fontFamily: 'Arial',
      fontSize: '32px',
      color: '#ffffff',
      backgroundColor: '#111827',
      padding: { x: 18, y: 12 },
      align: 'center'
    }).setOrigin(0.5).setDepth(20000).setVisible(false);
    this.updateHud();
  }

  updateHud() {
    const player = this.model.player;
    this.scoreText.setText(`Score ${this.model.score}   Bombs ${player.maxBombs}   Range ${player.bombRange}   Type ${player.currentBombType.name}`);
  }

  setPlayerDirection(direction) {
    this.model.player.sprite.setTexture(this.playerTexture(direction));
  }

  updatePlayerDepth() {
    this.updateSpriteDepth(this.model.player.sprite);
  }

  moveEnemy(enemy) {
    const pos = GridMath.toWorld(enemy.gridX, enemy.gridY);
    this.scene.tweens.add({
      targets: enemy.sprite,
      x: pos.x,
      y: pos.y,
      duration: 220,
      ease: 'Linear',
      onUpdate: () => this.updateSpriteDepth(enemy.sprite),
      onComplete: () => this.updateSpriteDepth(enemy.sprite)
    });
  }

  createBombSprite(bomb) {
    const pos = GridMath.toWorld(bomb.gridX, bomb.gridY);
    const sprite = this.scene.add.image(pos.x, pos.y, `bomb-${bomb.type.id}`)
      .setDisplaySize(42, 42)
      .setDepth(this.depthForY(pos.y) - 3);
    const baseScaleX = sprite.scaleX;
    const baseScaleY = sprite.scaleY;
    bomb.attachSprite(sprite);
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
      const flame = this.scene.add.image(pos.x, pos.y, `explosion-${type.id}`)
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

  drawItem(item) {
    const key = item.type === 'bomb' ? 'item-bomb' : item.type === 'flame' ? 'item-flame' : 'item-speed';
    const pos = GridMath.toWorld(item.gridX, item.gridY);
    const sprite = this.scene.add.image(pos.x, pos.y, key).setDisplaySize(28, 28).setDepth(this.depthForY(pos.y) - 8);
    item.attachSprite(sprite);
  }

  updateRemotePlayer(playerId, state) {
    if (!state || playerId === state.localPlayerId) return;

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
    this.updateSpriteDepth(sprite);
  }

  showEndMessage(won) {
    if (!won) this.model.player.sprite.setTexture(this.playerTexture('dead'));
    this.messageText
      .setText(`${won ? 'YOU WIN' : 'GAME OVER'}\nScore: ${this.model.score}\nPress R to restart`)
      .setVisible(true);
  }

  updateSpriteDepth(sprite) {
    if (sprite) sprite.setDepth(this.depthForY(sprite.y));
  }

  depthForY(y) {
    return 1000 + Math.round(y);
  }

  playerTexture(direction) {
    return `${this.model.player.character.id}-${direction}`;
  }
}
