import { BombTypes, BossTypes, Characters, COLS, HEIGHT, LevelOptions, ROWS, TileType, WIDTH } from '../core/constants.js';
import { createBombSheetTextures } from '../core/BombTextureFactory.js';
import { TileMap } from '../models/TileMap.js';
import { multiplayer } from '../services/MultiplayerService.js';

const Phaser = window.Phaser;

export class SelectionScene extends Phaser.Scene {
  constructor() {
    super('SelectionScene');
    this.selectedCharacter = Characters[0];
    this.selectedBombType = BombTypes[0];
    this.selectedLevel = LevelOptions[0];
    this.selectedCustomMap = null;
    this.serverMaps = [];
    this.mapOptions = [];
    this.mapSelect = null;
    this.characterCards = [];
    this.bombCards = [];
    this.levelCards = [];
    this.levelGroupButtons = [];
    this.mapPreviewGraphics = null;
    this.mapPreviewTitle = null;
    this.activeLevelGroup = 'pirate';
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
    this.addMapPreview();
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

    this.mapOptions = this.createMapOptions();
    this.mapSelect = this.add.dom(344, 520, 'select', [
      'width: 520px',
      'height: 44px',
      'font: 18px Arial',
      'border: 3px solid #334155',
      'border-radius: 6px',
      'background: #020617',
      'color: #f8fafc',
      'outline: none',
      'padding: 0 10px'
    ].join(';'));
    this.renderMapOptions();
    this.mapSelect.node.addEventListener('change', () => {
      if (this.isMultiplayer && !multiplayer.isHost()) {
        this.mapSelect.node.value = this.mapValue();
        return;
      }
      this.selectMapOption(this.mapSelect.node.value);
    });
    this.loadServerMaps();
  }

  addMapPreview() {
    const panelX = 948;
    const panelY = 286;
    this.add.rectangle(panelX, panelY, 520, 350, 0x0f172a, 0.9)
      .setStrokeStyle(3, 0x334155);
    this.mapPreviewTitle = this.add.text(panelX, 126, '', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.mapPreviewGraphics = this.add.graphics();
    this.updateMapPreview();
  }

  renderMapOptions() {
    if (!this.mapSelect?.node) return;

    const selectedMapKey = this.selectedCustomMap
      ? `${this.selectedCustomMap.type}/${this.selectedCustomMap.name}`
      : null;
    const currentValue = this.mapValue();
    this.mapOptions = this.createMapOptions();
    this.mapSelect.node.innerHTML = '';
    this.mapOptions.forEach((option) => {
      const item = document.createElement('option');
      item.value = option.value;
      item.textContent = option.label;
      this.mapSelect.node.appendChild(item);
    });
    const sameCustomMap = this.mapOptions.find((option) => {
      return selectedMapKey
        && option.customMap
        && `${option.customMap.type}/${option.customMap.name}` === selectedMapKey;
    });
    this.mapSelect.node.value = sameCustomMap?.value || (this.mapOptions.some((option) => option.value === currentValue)
      ? currentValue
      : this.mapValue());
  }

  addLevelGroupButton(x, y, group, label) {
    const button = this.add.container(x, y);
    const panel = this.add.rectangle(0, 0, 92, 30, 0x0f172a, 0.92)
      .setStrokeStyle(2, 0x334155);
    const text = this.add.text(0, 0, label, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    button.add([panel, text]);
    button.setSize(92, 30);
    button.setInteractive({ useHandCursor: true });
    button.on('pointerdown', () => {
      this.activeLevelGroup = group;
      const firstInGroup = LevelOptions.find((option) => this.levelGroupFor(option) === group);
      if (firstInGroup) this.selectedLevel = firstInGroup;
      this.refreshSelection();
    });
    this.levelGroupButtons.push({ group, panel });
  }

  levelGroupFor(option) {
    return option.level <= 3 ? 'pirate' : 'forest';
  }

  createMapOptions() {
    const builtIn = LevelOptions.map((option) => ({
      value: `level:${option.level}`,
      label: `${option.theme} - ${option.name}`,
      level: option.level,
      customMap: null
    }));
    const saved = this.readSavedMaps().map((map, index) => ({
      value: `custom:${index}`,
      label: `${map.type} - ${map.name}`,
      level: map.type === 'forest' ? 4 : 1,
      customMap: map
    }));
    return [...builtIn, ...saved];
  }

  readSavedMaps() {
    if (this.serverMaps.length > 0) return this.serverMaps;

    try {
      const maps = JSON.parse(localStorage.getItem('bombOnline.savedMaps') || '[]');
      return Array.isArray(maps) ? maps.filter((map) => Array.isArray(map.layout)) : [];
    } catch (_error) {
      return [];
    }
  }

  async loadServerMaps() {
    try {
      const response = await fetch('/api/maps');
      if (!response.ok) throw new Error('Cannot load maps.');
      const payload = await response.json();
      this.serverMaps = Array.isArray(payload.maps) ? payload.maps.filter((map) => Array.isArray(map.layout)) : [];
      const localMaps = this.readLocalSavedMaps();
      if (localMaps.length > 0) {
        this.serverMaps = await this.importLocalMapsToServer(localMaps);
        localStorage.setItem('bombOnline.savedMaps', JSON.stringify(this.serverMaps));
      }
      this.renderMapOptions();
      this.refreshSelection();
    } catch (_error) {
      this.serverMaps = [];
    }
  }

  readLocalSavedMaps() {
    try {
      const maps = JSON.parse(localStorage.getItem('bombOnline.savedMaps') || '[]');
      return Array.isArray(maps) ? maps.filter((map) => Array.isArray(map.layout)) : [];
    } catch (_error) {
      return [];
    }
  }

  async importLocalMapsToServer(maps) {
    const response = await fetch('/api/maps/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maps })
    });
    if (!response.ok) return this.serverMaps;

    const payload = await response.json();
    return Array.isArray(payload.maps) ? payload.maps.filter((map) => Array.isArray(map.layout)) : this.serverMaps;
  }

  selectMapOption(value) {
    const option = this.mapOptions.find((item) => item.value === value) || this.mapOptions[0];
    const levelOption = LevelOptions.find((item) => item.level === option.level) || LevelOptions[0];
    this.selectedLevel = levelOption;
    this.selectedCustomMap = option.customMap;
    this.refreshSelection();
  }

  updateMapPreview() {
    if (!this.mapPreviewGraphics) return;

    const map = new TileMap(this.selectedLevel.level, 'preview', this.selectedCustomMap?.layout || null);
    const cell = 16;
    const startX = 740;
    const startY = 158;
    const colors = {
      [TileType.EMPTY]: 0x8fbf45,
      [TileType.WALL]: 0xd9e3e6,
      [TileType.CRATE]: 0xd99a38,
      [TileType.WATER]: 0x38bdf8
    };

    this.mapPreviewGraphics.clear();
    this.mapPreviewGraphics.fillStyle(0x07111f, 1);
    this.mapPreviewGraphics.fillRoundedRect(startX - 8, startY - 8, COLS * cell + 16, ROWS * cell + 16, 6);

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const tile = map.get(x, y);
        this.mapPreviewGraphics.fillStyle(colors[tile] || colors[TileType.EMPTY], 1);
        this.mapPreviewGraphics.fillRect(startX + x * cell, startY + y * cell, cell - 1, cell - 1);
      }
    }

    (this.selectedCustomMap?.objects || []).forEach((object) => {
      if (object.kind === 'enemy') {
        this.mapPreviewGraphics.fillStyle(0xef4444, 1);
        this.mapPreviewGraphics.fillCircle(startX + object.x * cell + cell / 2, startY + object.y * cell + cell / 2, 5);
      }
      if (object.kind === 'boss') {
        const bossType = BossTypes.find((type) => type.id === object.bossType) || BossTypes[0];
        this.mapPreviewGraphics.fillStyle(bossType.id === 'eagle' ? 0x2563eb : 0x991b1b, 1);
        this.mapPreviewGraphics.fillRect(startX + object.x * cell, startY + object.y * cell, cell * 2 - 1, cell * 2 - 1);
      }
    });

    this.mapPreviewTitle?.setText(`Preview: ${this.selectedMapName()}`);
  }

  mapValue() {
    if (this.selectedCustomMap) {
      const customOption = this.mapOptions.find((option) => {
        return option.customMap
          && option.customMap.type === this.selectedCustomMap.type
          && option.customMap.name === this.selectedCustomMap.name;
      });
      return customOption?.value || `level:${this.selectedLevel.level}`;
    }
    return `level:${this.selectedLevel.level}`;
  }

  selectedCustomMapPayload() {
    if (!this.selectedCustomMap) return null;
    return {
      type: this.selectedCustomMap.type,
      name: this.selectedCustomMap.name,
      layout: this.selectedCustomMap.layout,
      objects: this.selectedCustomMap.objects || []
    };
  }

  selectedMapName() {
    return this.selectedCustomMap
      ? `${this.selectedCustomMap.type}/${this.selectedCustomMap.name}`
      : this.selectedLevel.name;
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
        level: this.selectedLevel.level,
        customMap: this.selectedCustomMapPayload()
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

    this.levelGroupButtons.forEach(({ group, panel }) => {
      const selected = group === this.activeLevelGroup;
      panel.setStrokeStyle(2, selected ? 0xfacc15 : 0x334155);
      panel.setFillStyle(selected ? 0x1f2937 : 0x0f172a, selected ? 0.98 : 0.92);
    });

    this.levelCards.forEach(({ option, card, panel, baseColor }) => {
      const inActiveGroup = this.levelGroupFor(option) === this.activeLevelGroup;
      const selected = option.level === this.selectedLevel.level;
      card.setVisible(inActiveGroup);
      if (inActiveGroup) {
        card.setInteractive({ useHandCursor: true });
      } else {
        card.disableInteractive();
      }
      panel.setStrokeStyle(3, selected ? 0xfacc15 : 0x334155);
      panel.setFillStyle(selected ? 0x1f2937 : baseColor, selected ? 0.98 : 0.9);
    });

    if (this.mapSelect?.node) {
      this.mapSelect.node.value = this.mapValue();
      this.mapSelect.node.disabled = this.isMultiplayer && !multiplayer.isHost();
    }

    this.updateMapPreview();

    if (this.isMultiplayer) {
      this.actionLabel?.setText(multiplayer.isHost() ? 'START ROOM' : 'READY');
    }
  }

  async submitMultiplayerSelection() {
    try {
      await multiplayer.submitSelection(
        this.selectedCharacter.id,
        this.selectedBombType.id,
        this.selectedLevel.level,
        this.selectedCustomMapPayload()
      );
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
      level: room.selectedLevel || this.selectedLevel.level,
      customMap: room.customMap || null
    });
  }

  startLoading(room) {
    if (this.hasStartedGame) return;
    this.hasStartedGame = true;

    this.scene.start('LoadingScene', {
      multiplayer: true,
      room,
      playerId: multiplayer.playerId,
      level: room.selectedLevel || this.selectedLevel.level,
      customMap: room.customMap || this.selectedCustomMapPayload()
    });
  }

  renderRoomStatus() {
    const room = multiplayer.room;
    if (!room || !this.roomText) return;

    const roomLevel = LevelOptions.find((option) => option.level === room.selectedLevel);
    const shouldMirrorRoomMap = !multiplayer.isHost() || room.phase === 'loading' || room.phase === 'playing';
    if (shouldMirrorRoomMap && roomLevel && (roomLevel.level !== this.selectedLevel.level || !this.sameMap(room.customMap, this.selectedCustomMap))) {
      this.selectedLevel = roomLevel;
      this.selectedCustomMap = room.customMap || null;
      this.activeLevelGroup = this.levelGroupFor(roomLevel);
      this.refreshSelection();
    }

    const lines = room.players.map((player) => {
      const host = player.id === room.hostId ? 'HOST' : 'P';
      const mine = player.id === multiplayer.playerId ? 'you' : '';
      return `${host} ${player.name} ${mine} - ${player.ready ? 'ready' : 'choosing'}`;
    });
    const ping = this.latencyMs === null ? 'Ping -- ms' : `Ping ${this.latencyMs} ms`;
    this.roomText.setText(`Room ${room.code}   ${ping}   Map ${room.customMap?.name || this.selectedMapName()}\n${lines.join('   ')}`);
    this.actionLabel?.setText(multiplayer.isHost() ? 'START ROOM' : 'READY');
  }

  sameMap(left, right) {
    if (!left && !right) return true;
    if (!left || !right) return false;
    return left.type === right.type && left.name === right.name;
  }

  shutdown() {
    this.unsubscribeStart?.();
    this.unsubscribeRoom?.();
    this.unsubscribeLoading?.();
    this.unsubscribeLatency?.();
  }
}
