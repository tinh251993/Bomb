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
    this.unsubscribeP2PStatus = null;
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
    this.unsubscribeP2PStatus = multiplayer.onP2PStatus((status) => this.renderP2PStatus(status));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
    this.renderRoom(data.room || multiplayer.room);
    this.reportReady();
  }

  async reportReady() {
    try {
      this.statusText?.setText('Connecting P2P peers...');
      await multiplayer.reportLoadingReady();
      this.statusText?.setText('P2P ready. Waiting for players...');
    } catch (error) {
      this.statusText?.setText(error.message);
    }
  }

  renderRoom(room) {
    if (!room || !this.roomText) return;

    const loaded = room.loadingPlayerIds?.length || 0;
    const total = room.players?.length || 0;
    this.roomText.setText(`Room ${room.code}   Map ${room.customMap?.name || room.selectedLevel || 1}\n${loaded}/${total} players connected`);
  }

  renderP2PStatus(status) {
    if (!this.statusText || !status) return;

    const connected = status.peers.filter((peer) => peer.open).length;
    const total = status.peers.length;
    this.statusText.setText(status.ready
      ? `P2P ready ${connected}/${total}`
      : `Connecting P2P ${connected}/${total}`);
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
      level: room.selectedLevel || 1,
      customMap: room.customMap || null
    });
  }

  shutdown() {
    this.unsubscribeRoom?.();
    this.unsubscribeStart?.();
    this.unsubscribeP2PStatus?.();
  }
}
