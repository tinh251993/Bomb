import { GameController } from '../controllers/GameController.js';
import { GameModel } from '../models/GameModel.js';
import { GameView } from '../views/GameView.js';

const Phaser = window.Phaser;

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
    this.model = null;
    this.view = null;
    this.controller = null;
  }

  preload() {
    this.view = new GameView(this, null);
    this.view.preload();
  }

  create(data = {}) {
    this.launchData = data;
    this.input.keyboard.enabled = true;
    const playerIndex = data.room?.players?.findIndex((player) => player.id === data.playerId) ?? 0;
    this.model = new GameModel({
      character: data.character,
      bombType: data.bombType,
      playerIndex,
      playerCount: data.room?.players?.length || 1,
      level: data.level || 1,
      score: data.score || 0,
      playerStats: data.playerStats
    });
    this.view = new GameView(this, this.model);
    this.view.create();
    this.controller = new GameController(this, this.model, this.view);
    this.controller.configureMultiplayer({
      enabled: Boolean(data.multiplayer),
      room: data.room,
      playerId: data.playerId
    });
    this.controller.bindControls();
  }

  update(time, delta) {
    this.controller?.update(time, delta);
  }
}
