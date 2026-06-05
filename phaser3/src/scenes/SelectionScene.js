import { BombTypes, Characters, HEIGHT, LevelOptions, WIDTH } from '../core/constants.js';
import { createBombSheetTextures } from '../core/BombTextureFactory.js';
import { multiplayer } from '../services/MultiplayerService.js';

const Phaser = window.Phaser;

export class SelectionScene extends Phaser.Scene {
  constructor() {
    super('SelectionScene');
    this.selectedCharacter = Characters[0];
    this.selectedBombType = BombTypes[0];
    this.selectedLevel = LevelOptions[0];
    this.characterCards = [];
    this.bombCards = [];
    this.levelCards = [];
    this.isMultiplayer = false;
    this.roomText = null;
    this.actionLabel = null;
    this.unsubscribeStart = null;
    this.unsubscribeRoom = null;
    this.unsubscribeLoading = null;
    this.unsubscribeLatency = null;
    this.latencyMs = null;
    this.hasStartedGame = false;
  }

  preload() {
    this.load.image('select-bg', '../res/background_Actor.png');
    this.load.image('bomb-sheet', '../res/Bomb/bomb.png');
    Characters.forEach((character) => {
      this.load.image(`${character.id}-card`, character.card);
    });
  }

  create(data = {}) {
    this.isMultiplayer = Boolean(data.multiplayer);
    this.hasStartedGame = false;
    this.cameras.main.setBackgroundColor('#111827');
    this.add.image(WIDTH / 2, HEIGHT / 2, 'select-bg')
      .setDisplaySize(WIDTH, HEIGHT)
      .setAlpha(0.34);

    createBombSheetTextures(this);
    this.addTitle();
    this.addCharacterPicker();
    this.addBombPicker();
    this.addLevelPicker();
    this.addStartButton();
    this.addRoomStatus();
    this.refreshSelection();

    if (this.isMultiplayer) {
      this.unsubscribeRoom = multiplayer.onRoomUpdate(() => this.renderRoomStatus());
      this.unsubscribeStart = multiplayer.onGameStart((room) => this.startMultiplayerGame(room));
      this.unsubscribeLoading = multiplayer.onGameLoading((room) => this.startLoading(room));
      this.unsubscribeLatency = multiplayer.onLatencyUpdate((latencyMs) => {
        this.latencyMs = latencyMs;
        this.renderRoomStatus();
      });
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
      this.renderRoomStatus();
    }
  }

  addTitle() {
    this.add.text(WIDTH / 2, 38, 'CHOOSE YOUR FIGHTER', {
      fontFamily: 'Arial',
      fontSize: '28px',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5);
  }

  addCharacterPicker() {
    this.add.text(48, 72, 'Character', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#cbd5e1',
      fontStyle: 'bold'
    });

    Characters.forEach((character, index) => {
      const x = 132 + index * 220;
      const card = this.add.container(x, 170);
      const panel = this.add.rectangle(0, 0, 170, 150, 0x0f172a, 0.88)
        .setStrokeStyle(3, 0x334155);
      const sprite = this.add.image(0, -18, `${character.id}-card`).setDisplaySize(96, 96);
      const name = this.add.text(0, 54, character.name, {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#f8fafc',
        fontStyle: 'bold'
      }).setOrigin(0.5);

      card.add([panel, sprite, name]);
      card.setSize(170, 150);
      card.setInteractive({ useHandCursor: true });
      card.on('pointerdown', () => {
        this.selectedCharacter = character;
        this.refreshSelection();
      });
      this.characterCards.push({ character, panel });
    });
  }

  addBombPicker() {
    this.add.text(48, 258, 'Bomb type', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#cbd5e1',
      fontStyle: 'bold'
    });

    BombTypes.forEach((type, index) => {
      const x = 76 + index * 142;
      const card = this.add.container(x, 340);
      const panel = this.add.rectangle(0, 0, 112, 108, 0x0f172a, 0.88)
        .setStrokeStyle(3, 0x334155);
      const bomb = this.add.image(0, -22, `bomb-${type.id}`)
        .setDisplaySize(50, 50);
      const name = this.add.text(0, 34, type.name, {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#f8fafc',
        align: 'center',
        wordWrap: { width: 96 }
      }).setOrigin(0.5);

      card.add([panel, bomb, name]);
      card.setSize(112, 108);
      card.setInteractive({ useHandCursor: true });
      card.on('pointerdown', () => {
        this.selectedBombType = type;
        this.refreshSelection();
      });
      this.bombCards.push({ type, panel });
    });
  }

  addLevelPicker() {
    this.add.text(48, 430, 'Map', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#cbd5e1',
      fontStyle: 'bold'
    });

    LevelOptions.forEach((option, index) => {
      const x = 86 + index * 136;
      const card = this.add.container(x, 510);
      const color = option.level >= 4 ? 0x166534 : 0x0f3b57;
      const panel = this.add.rectangle(0, 0, 116, 112, color, 0.9)
        .setStrokeStyle(3, 0x334155);
      const title = this.add.text(0, -24, option.name, {
        fontFamily: 'Arial',
        fontSize: '16px',
        color: '#f8fafc',
        fontStyle: 'bold'
      }).setOrigin(0.5);
      const theme = this.add.text(0, 18, option.theme, {
        fontFamily: 'Arial',
        fontSize: '13px',
        color: '#cbd5e1',
        align: 'center',
        wordWrap: { width: 98 }
      }).setOrigin(0.5);

      card.add([panel, title, theme]);
      card.setSize(116, 112);
      card.setInteractive({ useHandCursor: true });
      card.on('pointerdown', () => {
        if (this.isMultiplayer && !multiplayer.isHost()) return;
        this.selectedLevel = option;
        this.refreshSelection();
      });
      this.levelCards.push({ option, panel, baseColor: color });
    });
  }

  addStartButton() {
    const button = this.add.container(WIDTH / 2, HEIGHT - 44);
    const bg = this.add.rectangle(0, 0, 210, 54, 0x16a34a, 1)
      .setStrokeStyle(3, 0xbbf7d0);
    this.actionLabel = this.add.text(0, 0, this.isMultiplayer ? 'READY' : 'START GAME', {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    button.add([bg, this.actionLabel]);
    button.setSize(210, 54);
    button.setInteractive({ useHandCursor: true });
    button.on('pointerover', () => bg.setFillStyle(0x22c55e));
    button.on('pointerout', () => bg.setFillStyle(0x16a34a));
    button.on('pointerdown', () => {
      if (this.isMultiplayer) {
        this.submitMultiplayerSelection();
        return;
      }

      this.scene.start('GameScene', {
        character: this.selectedCharacter,
        bombType: this.selectedBombType,
        level: this.selectedLevel.level
      });
    });
  }

  addRoomStatus() {
    this.roomText = this.add.text(WIDTH / 2, HEIGHT - 96, '', {
      fontFamily: 'Arial',
      fontSize: '15px',
      color: '#cbd5e1',
      align: 'center'
    }).setOrigin(0.5);
  }

  refreshSelection() {
    this.characterCards.forEach(({ character, panel }) => {
      const selected = character.id === this.selectedCharacter.id;
      panel.setStrokeStyle(3, selected ? 0xfacc15 : 0x334155);
      panel.setFillStyle(selected ? 0x1f2937 : 0x0f172a, selected ? 0.96 : 0.88);
    });

    this.bombCards.forEach(({ type, panel }) => {
      const selected = type.id === this.selectedBombType.id;
      panel.setStrokeStyle(3, selected ? 0xfacc15 : 0x334155);
      panel.setFillStyle(selected ? 0x1f2937 : 0x0f172a, selected ? 0.96 : 0.88);
    });

    this.levelCards.forEach(({ option, panel, baseColor }) => {
      const selected = option.level === this.selectedLevel.level;
      panel.setStrokeStyle(3, selected ? 0xfacc15 : 0x334155);
      panel.setFillStyle(selected ? 0x1f2937 : baseColor, selected ? 0.98 : 0.9);
    });

    if (this.isMultiplayer) {
      this.actionLabel?.setText(multiplayer.isHost() ? 'START ROOM' : 'READY');
    }
  }

  async submitMultiplayerSelection() {
    try {
      await multiplayer.submitSelection(this.selectedCharacter.id, this.selectedBombType.id, this.selectedLevel.level);
      if (multiplayer.isHost()) {
        const room = await multiplayer.startRoom();
        this.startLoading(room);
      } else {
        this.roomText.setText('Ready. Waiting for host to start...');
      }
    } catch (error) {
      this.roomText.setText(error.message);
    }
  }

  startMultiplayerGame(room) {
    if (this.hasStartedGame) return;
    this.hasStartedGame = true;

    const localPlayer = room.players.find((player) => player.id === multiplayer.playerId);
    const character = Characters.find((item) => item.id === localPlayer?.characterId) || this.selectedCharacter;
    const bombType = BombTypes.find((item) => item.id === localPlayer?.bombTypeId) || this.selectedBombType;

    this.scene.start('GameScene', {
      character,
      bombType,
      multiplayer: true,
      room,
      playerId: multiplayer.playerId,
      level: room.selectedLevel || this.selectedLevel.level
    });
  }

  startLoading(room) {
    if (this.hasStartedGame) return;
    this.hasStartedGame = true;

    this.scene.start('LoadingScene', {
      multiplayer: true,
      room,
      playerId: multiplayer.playerId,
      level: room.selectedLevel || this.selectedLevel.level
    });
  }

  renderRoomStatus() {
    const room = multiplayer.room;
    if (!room || !this.roomText) return;

    const roomLevel = LevelOptions.find((option) => option.level === room.selectedLevel);
    if (roomLevel && roomLevel.level !== this.selectedLevel.level) {
      this.selectedLevel = roomLevel;
      this.refreshSelection();
    }

    const lines = room.players.map((player) => {
      const host = player.id === room.hostId ? 'HOST' : 'P';
      const mine = player.id === multiplayer.playerId ? 'you' : '';
      return `${host} ${player.name} ${mine} - ${player.ready ? 'ready' : 'choosing'}`;
    });
    const ping = this.latencyMs === null ? 'Ping -- ms' : `Ping ${this.latencyMs} ms`;
    this.roomText.setText(`Room ${room.code}   ${ping}   Map ${this.selectedLevel.name}\n${lines.join('   ')}`);
    this.actionLabel?.setText(multiplayer.isHost() ? 'START ROOM' : 'READY');
  }

  shutdown() {
    this.unsubscribeStart?.();
    this.unsubscribeRoom?.();
    this.unsubscribeLoading?.();
    this.unsubscribeLatency?.();
  }
}
