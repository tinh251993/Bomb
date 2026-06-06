import { HEIGHT, WIDTH } from '../core/constants.js';

const Phaser = window.Phaser;

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super('LobbyScene');
    this.hasStartedGame = false;
  }

  create() {
    this.hasStartedGame = false;
    this.cameras.main.setBackgroundColor('#0f172a');
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x0f172a, 1);

    this.add.text(WIDTH / 2, 62, 'BOMB ONLINE', {
      fontFamily: 'Arial',
      fontSize: '36px',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(WIDTH / 2, 108, 'Solo mode', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#cbd5e1'
    }).setOrigin(0.5);

    this.createButtons();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
  }

  createButtons() {
    this.createButton(WIDTH / 2, HEIGHT / 2, 250, 58, 'PLAY SOLO', () => {
      this.scene.start('SelectionScene');
    });
  }

  createButton(x, y, width, height, label, onClick) {
    const button = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, width, height, 0x2563eb, 1)
      .setStrokeStyle(3, 0x93c5fd);
    const text = this.add.text(0, 0, label, {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    button.add([bg, text]);
    button.setSize(width, height);
    button.setInteractive({ useHandCursor: true });
    button.on('pointerover', () => bg.setFillStyle(0x3b82f6));
    button.on('pointerout', () => bg.setFillStyle(0x2563eb));
    button.on('pointerdown', onClick);
    return { button, bg, text };
  }

  shutdown() {
  }
}
