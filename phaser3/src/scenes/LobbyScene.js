import { HEIGHT, WIDTH } from '../core/constants.js';

const Phaser = window.Phaser;

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super('LobbyScene');
    this.hasStartedGame = false;
  }

  preload() {
    this.load.image('lobby-bg', '../res/background_Menu.png');
    this.load.image('lobby-bebong', '../res/User/opbebong.png');
    this.load.image('lobby-khokho', '../res/User/opkhokho.png');
    this.load.image('lobby-tiachop', '../res/User/optiachop.png');
  }

  create() {
    this.hasStartedGame = false;
    this.cameras.main.setBackgroundColor('#07111f');
    this.add.image(WIDTH / 2, HEIGHT / 2, 'lobby-bg')
      .setDisplaySize(WIDTH, HEIGHT)
      .setAlpha(0.42);
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x020617, 0.34);

    this.add.rectangle(WIDTH / 2, HEIGHT / 2 + 12, 760, 438, 0x0b2a46, 0.88)
      .setStrokeStyle(4, 0x38bdf8, 0.72);
    this.add.rectangle(WIDTH / 2, 158, 640, 82, 0x07111f, 0.74)
      .setStrokeStyle(3, 0xfacc15, 0.86);

    this.add.text(WIDTH / 2, 134, 'BOMB ONLINE', {
      fontFamily: 'Arial',
      fontSize: '44px',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(WIDTH / 2, 178, 'SOLO ADVENTURE', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#fde68a',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.image(WIDTH / 2 - 210, 332, 'lobby-bebong').setDisplaySize(122, 122);
    this.add.image(WIDTH / 2, 316, 'lobby-khokho').setDisplaySize(138, 138);
    this.add.image(WIDTH / 2 + 210, 332, 'lobby-tiachop').setDisplaySize(122, 122);

    this.createButtons();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
  }

  createButtons() {
    this.createButton(WIDTH / 2, HEIGHT - 120, 300, 70, 'PLAY SOLO', () => {
      this.scene.start('SelectionScene');
    });
  }

  createButton(x, y, width, height, label, onClick) {
    const button = this.add.container(x, y);
    const shadow = this.add.rectangle(0, 7, width, height, 0x020617, 0.45);
    const bg = this.add.rectangle(0, 0, width, height, 0x16a34a, 1)
      .setStrokeStyle(4, 0xbbf7d0);
    const text = this.add.text(0, 0, label, {
      fontFamily: 'Arial',
      fontSize: '26px',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    button.add([shadow, bg, text]);
    button.setSize(width, height);
    button.setInteractive({ useHandCursor: true });
    button.on('pointerover', () => bg.setFillStyle(0x22c55e));
    button.on('pointerout', () => bg.setFillStyle(0x16a34a));
    button.on('pointerdown', onClick);
    return { button, bg, text };
  }

  shutdown() {
  }
}
