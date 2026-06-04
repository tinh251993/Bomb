import { BombTypes, Characters, HEIGHT, WIDTH } from '../core/constants.js';
import { multiplayer } from '../services/MultiplayerService.js';

const Phaser = window.Phaser;

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super('LobbyScene');
    this.roomText = null;
    this.playersText = null;
    this.statusText = null;
    this.joinInput = null;
    this.unsubscribeRoom = null;
    this.unsubscribeSelectionStart = null;
    this.unsubscribeLoading = null;
    this.unsubscribeStart = null;
    this.unsubscribeLatency = null;
    this.hasStartedGame = false;
    this.chooseButton = null;
    this.chooseButtonBg = null;
    this.chooseButtonText = null;
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

    this.add.text(WIDTH / 2, 108, 'Host a room or join with a room code', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#cbd5e1'
    }).setOrigin(0.5);

    this.createButtons();
    this.createRoomPanel();
    this.unsubscribeRoom = multiplayer.onRoomUpdate((room) => this.renderRoom(room));
    this.unsubscribeSelectionStart = multiplayer.onSelectionStart((room) => this.startSelection(room));
    this.unsubscribeLoading = multiplayer.onGameLoading((room) => this.startLoading(room));
    this.unsubscribeStart = multiplayer.onGameStart((room) => this.startMultiplayerGame(room));
    this.unsubscribeLatency = multiplayer.onLatencyUpdate((latencyMs) => this.renderLatency(latencyMs));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());

    if (!multiplayer.isAvailable()) {
      this.setStatus('Run with Node server to enable multiplayer: npm start');
    }
  }

  createButtons() {
    this.createButton(WIDTH / 2 - 130, 170, 210, 52, 'HOST ROOM', async () => {
      try {
        this.setStatus('Creating room...');
        const room = await multiplayer.createRoom();
        this.setStatus(`Room ${room.code} created.`);
      } catch (error) {
        this.setStatus(error.message);
      }
    });

    this.createJoinInput();
    this.createButton(WIDTH / 2 + 130, 248, 210, 52, 'JOIN ROOM', async () => {
      try {
        const code = this.joinInput?.node?.value || '';
        this.setStatus('Joining room...');
        const room = await multiplayer.joinRoom(code);
        this.setStatus(`Joined room ${room.code}.`);
      } catch (error) {
        this.setStatus(error.message);
      }
    });

    const choose = this.createButton(WIDTH / 2, HEIGHT - 84, 250, 56, 'WAIT HOST', async () => {
      if (!multiplayer.room) {
        this.setStatus('Create or join a room first.');
        return;
      }
      if (!multiplayer.isHost()) {
        this.setStatus('Waiting for host to choose player.');
        return;
      }
      try {
        await multiplayer.chooseSelection();
      } catch (error) {
        this.setStatus(error.message);
      }
    });
    this.chooseButton = choose.button;
    this.chooseButtonBg = choose.bg;
    this.chooseButtonText = choose.text;
  }

  createJoinInput() {
    this.joinInput = this.add.dom(WIDTH / 2 - 130, 248, 'input', [
      'width: 180px',
      'height: 42px',
      'font: 22px Arial',
      'text-align: center',
      'text-transform: uppercase',
      'border: 3px solid #334155',
      'background: #020617',
      'color: #f8fafc',
      'outline: none'
    ].join(';'));
    this.joinInput.node.placeholder = 'ROOM';
    this.joinInput.node.maxLength = 5;
  }

  createRoomPanel() {
    this.add.rectangle(WIDTH / 2, 405, 520, 180, 0x111827, 0.92)
      .setStrokeStyle(3, 0x334155);
    this.roomText = this.add.text(WIDTH / 2, 340, 'No room yet', {
      fontFamily: 'Arial',
      fontSize: '22px',
      color: '#facc15',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.playersText = this.add.text(WIDTH / 2, 390, '', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#f8fafc',
      align: 'center'
    }).setOrigin(0.5);
    this.statusText = this.add.text(WIDTH / 2, 505, '', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#93c5fd',
      align: 'center'
    }).setOrigin(0.5);
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

  renderRoom(room) {
    this.roomText.setText(`Room code: ${room.code}   ${room.players.length}/4`);
    this.playersText.setText(room.players.map((player, index) => {
      const host = player.id === room.hostId ? 'HOST' : 'P';
      const ready = player.ready ? 'ready' : 'choosing';
      const mine = player.id === multiplayer.playerId ? 'you' : '';
      return `${index + 1}. ${host} ${player.name} ${mine} - ${ready}`;
    }).join('\n'));
    this.renderChooseButton(room);
  }

  renderChooseButton(room) {
    if (!this.chooseButtonText || !this.chooseButtonBg) return;

    const isHost = multiplayer.isHost();
    this.chooseButtonText.setText(isHost ? 'CHOOSE PLAYER' : 'WAIT HOST');
    this.chooseButtonBg.setFillStyle(isHost ? 0x16a34a : 0x475569);
    this.chooseButtonBg.setStrokeStyle(3, isHost ? 0xbbf7d0 : 0x94a3b8);
    if (room.phase === 'selection') this.chooseButtonText.setText('SELECTING...');
    if (room.phase === 'loading') this.chooseButtonText.setText('LOADING...');
    if (room.phase === 'playing') this.chooseButtonText.setText('PLAYING');
  }

  setStatus(message) {
    this.statusText?.setText(message);
  }

  renderLatency(latencyMs) {
    if (latencyMs === null) return;
    const base = multiplayer.room ? `Room ${multiplayer.room.code}` : 'Connected';
    this.setStatus(`${base}   Ping ${latencyMs} ms`);
  }

  startSelection(room) {
    if (this.hasStartedGame) return;
    this.scene.start('SelectionScene', { multiplayer: true, room });
  }

  startLoading(room) {
    if (this.hasStartedGame) return;
    this.scene.start('LoadingScene', { multiplayer: true, room, playerId: multiplayer.playerId });
  }

  startMultiplayerGame(room) {
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
      playerId: multiplayer.playerId
    });
  }

  shutdown() {
    this.unsubscribeRoom?.();
    this.unsubscribeSelectionStart?.();
    this.unsubscribeLoading?.();
    this.unsubscribeStart?.();
    this.unsubscribeLatency?.();
    this.unsubscribeRoom = null;
    this.unsubscribeSelectionStart = null;
    this.unsubscribeLoading = null;
    this.unsubscribeStart = null;
    this.unsubscribeLatency = null;
  }
}
