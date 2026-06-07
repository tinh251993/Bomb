import { AgeWarController } from '../controllers/AgeWarController.js';
import { HEIGHT, WIDTH } from '../core/constants.js';
import { AgeWarModel } from '../models/AgeWarModel.js';
import { AgeWarView } from '../views/AgeWarView.js';

const Phaser = window.Phaser;

export class AgeWarScene extends Phaser.Scene {
  constructor() {
    super('AgeWarScene');
    this.model = null;
    this.view = null;
    this.controller = null;
  }

  create() {
    this.model = new AgeWarModel();
    this.view = new AgeWarView(this, this.model);
    this.controller = new AgeWarController(this, this.model, this.view);
    this.view.create(
      (index) => this.controller.handleButton(index, this.time.now),
      () => this.controller.openBuildingScreen()
    );
    this.view.sync();
  }

  update(time, delta) {
    this.controller?.update(time, delta);
  }
}

export const ageWarConfig = {
  type: Phaser.AUTO,
  parent: 'age-war-game',
  width: WIDTH,
  height: HEIGHT,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  antialias: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: true
  },
  scene: [AgeWarScene]
};
