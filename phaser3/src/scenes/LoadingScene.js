import { BombTypes, Characters, HEIGHT, WIDTH } from '../core/constants.js';
import { multiplayer } from '../services/MultiplayerService.js';

const Phaser = window.Phaser;

export class LoadingScene extends Phaser.Scene {
  constructor() {
    super('LoadingScene');
    this.roomText = null;
    this.statusText = null;
    this.unsubscribeRoom = null;
    this.unsubscribeStart = null;
    this.hasStartedGame = false;
  }

  create(data = {}) {
    this.hasStartedGame = false;
    this.cameras.main.setBackgroundColor('#0f172a');
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x0f172a, 1);
    this.add.text(WIDTH / 2, HEIGHT / 2 - 72, 'LOADING', {
      fontFamily: 'Arial',
      fontSize: '34px',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.roomText = this.add.text(WIDTH / 2, HEIGHT / 2 - 12, '', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#cbd5e1',
      align: 'center'
    }).setOrigin(0.5);
    this.statusText = this.add.text(WIDTH / 2, HEIGHT / 2 + 48, 'Connecting players...', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#93c5fd',
      align: 'center'
    }).setOrigin(0.5);

    this.unsubscribeRoom = multiplayer.onRoomUpdate((room) => this.renderRoom(room));
    this.unsubscribeStart = multiplayer.onGameStart((room) => this.startGame(room));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
    this.renderRoom(data.room || multiplayer.room);
    this.reportReady();
  }

  async reportReady() {
    try {
      await multiplayer.reportLoadingReady();
    } catch (error) {
      this.statusText?.setText(error.message);
    }
  }

  renderRoom(room) {
    if (!room || !this.roomText) return;

    const loaded = room.loadingPlayerIds?.length || 0;
    const total = room.players?.length || 0;
    this.roomText.setText(`Room ${room.code}   Map ${room.selectedLevel || 1}\n${loaded}/${total} players connected`);
  }

  startGame(room) {
    if (this.hasStartedGame) return;
    this.hasStartedGame = true;

    const localPlayer = room.players.find((player) => player.id === multiplayer.playerId);
    const character = Characters.find((item) => item.id === localPlayer?.characterId) || Characters[0];
    const bombType = BombTypes.find((item) => item.id === localPlayer?.bombTypeId) || BombTypes[0];

    this.scene.start('GameScene', {
      character,
      bombType,
      multiplayer: true,
      room,
      playerId: multiplayer.playerId,
      level: room.selectedLevel || 1
    });
  }

  shutdown() {
    this.unsubscribeRoom?.();
    this.unsubscribeStart?.();
  }
}
