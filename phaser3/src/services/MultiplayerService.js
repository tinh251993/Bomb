class MultiplayerService {
  constructor() {
    this.socket = null;
    this.room = null;
    this.playerId = null;
    this.roomListeners = new Set();
    this.startListeners = new Set();
    this.remoteStateListeners = new Set();
    this.reviveListeners = new Set();
  }

  isAvailable() {
    return typeof window.io === 'function';
  }

  connect() {
    if (!this.isAvailable()) return Promise.reject(new Error('Socket.IO client is not loaded.'));
    if (this.socket?.connected) return Promise.resolve(this.socket);

    this.socket = window.io();
    this.socket.on('room:update', ({ room }) => this.setRoom(room));
    this.socket.on('room:game-start', ({ room }) => {
      this.setRoom(room);
      this.startListeners.forEach((listener) => listener(room));
    });
    this.socket.on('game:player-state', (payload) => {
      this.remoteStateListeners.forEach((listener) => listener(payload));
    });
    this.socket.on('game:revive-request', (payload) => {
      this.reviveListeners.forEach((listener) => listener(payload));
    });

    return new Promise((resolve, reject) => {
      this.socket.once('connect', () => resolve(this.socket));
      this.socket.once('connect_error', reject);
    });
  }

  async createRoom() {
    await this.connect();
    const response = await this.emitWithAck('room:create', {});
    if (!response.ok) throw new Error(response.message || 'Could not create room.');
    this.playerId = response.playerId;
    this.setRoom(response.room);
    return response.room;
  }

  async joinRoom(code) {
    await this.connect();
    const response = await this.emitWithAck('room:join', { code });
    if (!response.ok) throw new Error(response.message || 'Could not join room.');
    this.playerId = response.playerId;
    this.setRoom(response.room);
    return response.room;
  }

  async submitSelection(characterId, bombTypeId) {
    const response = await this.emitWithAck('room:selection', { characterId, bombTypeId });
    if (!response.ok) throw new Error(response.message || 'Could not save selection.');
    this.setRoom(response.room);
    return response.room;
  }

  async startRoom() {
    const response = await this.emitWithAck('room:start', {});
    if (!response.ok) throw new Error(response.message || 'Could not start room.');
    this.setRoom(response.room);
    return response.room;
  }

  sendPlayerState(state) {
    if (!this.socket?.connected || !this.room?.started) return;
    this.socket.emit('game:player-state', state);
  }

  requestRevive(targetPlayerId) {
    if (!this.socket?.connected || !this.room?.started || !targetPlayerId) return;
    this.socket.emit('game:revive-player', { targetPlayerId });
  }

  onRoomUpdate(listener) {
    this.roomListeners.add(listener);
    return () => this.roomListeners.delete(listener);
  }

  onGameStart(listener) {
    this.startListeners.add(listener);
    return () => this.startListeners.delete(listener);
  }

  onRemotePlayerState(listener) {
    this.remoteStateListeners.add(listener);
    return () => this.remoteStateListeners.delete(listener);
  }

  onReviveRequest(listener) {
    this.reviveListeners.add(listener);
    return () => this.reviveListeners.delete(listener);
  }

  getLocalPlayer() {
    return this.room?.players.find((player) => player.id === this.playerId) || null;
  }

  isHost() {
    return this.room?.hostId === this.playerId;
  }

  setRoom(room) {
    this.room = room;
    this.roomListeners.forEach((listener) => listener(room));
  }

  emitWithAck(event, payload) {
    return new Promise((resolve) => {
      this.socket.emit(event, payload, resolve);
    });
  }
}

export const multiplayer = new MultiplayerService();
