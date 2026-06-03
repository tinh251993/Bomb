import { HEIGHT, WIDTH } from './core/constants.js';
import { GameScene } from './scenes/GameScene.js';
import { LobbyScene } from './scenes/LobbyScene.js';
import { SelectionScene } from './scenes/SelectionScene.js';

const Phaser = window.Phaser;

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  pixelArt: false,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  dom: {
    createContainer: true
  },
  audio: {
    disableWebAudio: false
  },
  scene: [LobbyScene, SelectionScene, GameScene]
};

window.__bombGame = new Phaser.Game(config);
