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
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  antialias: true,
  antialiasGL: true,
  pixelArt: false,
  roundPixels: true,
  transparent: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: true
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
