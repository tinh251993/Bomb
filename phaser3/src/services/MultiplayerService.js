import { p2p } from './P2PService.js';

class MultiplayerService {
  constructor() {
    this.socket = null;
    this.room = null;
    this.playerId = null;
    this.roomListeners = new Set();
    this.selectionStartListeners = new Set();
    this.loadingListeners = new Set();
    this.startListeners = new Set();
    this.remoteStateListeners = new Set();
    this.remoteBombListeners = new Set();
    this.remoteWorldStateListeners = new Set();
    this.reviveListeners = new Set();
    this.killEnemiesListeners = new Set();
    this.restartListeners = new Set();
    this.latencyListeners = new Set();
    this.latencyMs = null;
    this.pingTimer = null;
    this.p2pFailed = false;
    this.iceServersLoaded = false;
    this.p2pStatusListeners = new Set();
    this.unsubscribeP2PMessage = null;
    this.unsubscribeP2PStatus = null;
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
    });
    this.socket.on('room:selection-start', ({ room }) => {
      this.setRoom(room);
    });
    this.socket.on('room:game-loading', ({ room }) => {
      this.setRoom(room);
    });
    this.socket.on('game:player-state', (payload) => {
      this.remoteStateListeners.forEach((listener) => listener(payload));
    });
    this.socket.on('game:bomb-place', (payload) => {
      this.remoteBombListeners.forEach((listener) => listener(payload));
    });
    this.socket.on('game:world-state', (payload) => {
      this.remoteWorldStateListeners.forEach((listener) => listener(payload));
    });
    this.socket.on('game:revive-request', (payload) => {
      this.reviveListeners.forEach((listener) => listener(payload));
    });
    this.socket.on('game:kill-enemies-request', (payload) => {
      this.killEnemiesListeners.forEach((listener) => listener(payload));
    });
    this.socket.on('p2p:signal', (payload) => {
      p2p.handleSignal(payload).catch(() => {});
    });

    return new Promise((resolve, reject) => {
      this.socket.once('connect', () => {
        this.startPingMonitor();
        resolve(this.socket);
      });
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

  async submitSelection(characterId, bombTypeId, level, customMap = null) {
    const response = await this.emitWithAck('room:selection', { characterId, bombTypeId, level, customMap });
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

  async chooseSelection() {
    const response = await this.emitWithAck('room:choose-selection', {});
    if (!response.ok) throw new Error(response.message || 'Could not open selection.');
    this.setRoom(response.room);
    return response.room;
  }

  async reportLoadingReady() {
    if (this.room?.players?.length > 1) {
      await this.ensureP2PReady().catch(() => {});
    }
    const response = await this.emitWithAck('room:loading-ready', {});
    if (!response.ok) throw new Error(response.message || 'Could not confirm loading.');
    this.setRoom(response.room);
    return response.room;
  }

  async enterGame() {
    if (this.room?.players?.length > 1) await this.ensureP2PReady().catch(() => {});
    const response = await this.emitWithAck('game:enter', {});
    if (response?.room) this.setRoom(response.room);
    return response;
  }

  async leaveGame() {
    if (!this.socket?.connected) return;
    await this.emitWithAck('game:leave', {});
  }

  sendPlayerState(state) {
    if (!this.socket?.connected || !this.room?.started) return;
    if (this.shouldUseP2P()) {
      this.sendP2P('game:player-state', state);
      return;
    }
    this.socket.emit('game:player-state', state);
  }

  sendBombPlace(bomb) {
    if (!this.socket?.connected || !this.room?.started) return;
    if (this.shouldUseP2P()) {
      this.sendP2P('game:bomb-place', bomb);
      return;
    }
    this.socket.emit('game:bomb-place', bomb);
  }

  sendWorldState(state) {
    if (!state) return;
    if (!this.socket?.connected || !this.room?.started || !this.isHost()) return;
    if (this.shouldUseP2P()) {
      this.sendP2P('game:world-state', state);
      return;
    }
    this.socket.emit('game:world-state', state);
  }

  requestRevive(targetPlayerId) {
    if (!this.socket?.connected || !this.room?.started || !targetPlayerId) return;
    if (this.shouldUseP2P()) {
      this.sendP2P('game:revive-player', { targetPlayerId });
      return;
    }
    this.socket.emit('game:revive-player', { targetPlayerId });
  }

  requestKillEnemies() {
    if (!this.socket?.connected || !this.room?.started) return;
    if (this.shouldUseP2P()) {
      this.sendP2P('game:kill-enemies', {});
      return;
    }
    this.socket.emit('game:kill-enemies');
  }

  sendRestartLevel(payload) {
    if (!this.socket?.connected || !this.room?.started || !this.isHost()) return;
    if (this.shouldUseP2P()) {
      this.sendP2P('game:restart-level', payload);
      return;
    }
    this.socket.emit('game:restart-level', payload);
  }

  onRoomUpdate(listener) {
    this.roomListeners.add(listener);
    return () => this.roomListeners.delete(listener);
  }

  onGameStart(listener) {
    this.startListeners.add(listener);
    if (this.room?.started) window.setTimeout(() => listener(this.room), 0);
    return () => this.startListeners.delete(listener);
  }

  onSelectionStart(listener) {
    this.selectionStartListeners.add(listener);
    if (this.room?.phase === 'selection') window.setTimeout(() => listener(this.room), 0);
    return () => this.selectionStartListeners.delete(listener);
  }

  onGameLoading(listener) {
    this.loadingListeners.add(listener);
    if (this.room?.phase === 'loading') window.setTimeout(() => listener(this.room), 0);
    return () => this.loadingListeners.delete(listener);
  }

  onRemotePlayerState(listener) {
    this.remoteStateListeners.add(listener);
    return () => this.remoteStateListeners.delete(listener);
  }

  onRemoteBombPlace(listener) {
    this.remoteBombListeners.add(listener);
    return () => this.remoteBombListeners.delete(listener);
  }

  onRemoteWorldState(listener) {
    this.remoteWorldStateListeners.add(listener);
    return () => this.remoteWorldStateListeners.delete(listener);
  }

  onReviveRequest(listener) {
    this.reviveListeners.add(listener);
    return () => this.reviveListeners.delete(listener);
  }

  onKillEnemiesRequest(listener) {
    this.killEnemiesListeners.add(listener);
    return () => this.killEnemiesListeners.delete(listener);
  }

  onRestartLevel(listener) {
    this.restartListeners.add(listener);
    return () => this.restartListeners.delete(listener);
  }

  onLatencyUpdate(listener) {
    this.latencyListeners.add(listener);
    if (this.latencyMs !== null) window.setTimeout(() => listener(this.latencyMs), 0);
    return () => this.latencyListeners.delete(listener);
  }

  onP2PStatus(listener) {
    this.p2pStatusListeners.add(listener);
    return () => this.p2pStatusListeners.delete(listener);
  }

  getLocalPlayer() {
    return this.room?.players.find((player) => player.id === this.playerId) || null;
  }

  isHost() {
    return this.room?.hostId === this.playerId;
  }

  setRoom(room) {
    const wasStarted = this.room?.started;
    const previousPhase = this.room?.phase;
    this.room = room;
    this.roomListeners.forEach((listener) => listener(room));
    if (previousPhase !== 'selection' && room?.phase === 'selection') {
      this.selectionStartListeners.forEach((listener) => listener(room));
    }
    if (previousPhase !== 'loading' && room?.phase === 'loading') {
      this.loadingListeners.forEach((listener) => listener(room));
    }
    if (!wasStarted && room?.started) {
      this.stopPingMonitor();
      this.startListeners.forEach((listener) => listener(room));
    }
  }

  async ensureP2PReady() {
    if (!this.room || !this.playerId || this.room.players.length <= 1) return;
    if (this.p2pFailed) return;
    this.bindP2PEvents();
    await this.loadIceServers();
    try {
      await p2p.connectRoom(this.room, this.playerId, (targetPlayerId, type, payload) => {
        return this.emitWithAck('p2p:signal', { targetPlayerId, type, payload });
      });
    } catch (error) {
      this.p2pFailed = true;
      this.p2pStatusListeners.forEach((listener) => listener({
        ready: false,
        fallback: true,
        message: error?.message || 'P2P failed. Using server relay.'
      }));
      throw error;
    }
  }

  async loadIceServers() {
    if (this.iceServersLoaded) return;
    this.iceServersLoaded = true;
    try {
      const response = await fetch('/api/network-config');
      if (!response.ok) return;
      const payload = await response.json();
      p2p.setIceServers(payload.iceServers);
    } catch (_error) {
      // Default STUN config remains active.
    }
  }

  bindP2PEvents() {
    if (this.unsubscribeP2PMessage) return;

    this.unsubscribeP2PMessage = p2p.onMessage(({ fromPlayerId, event, payload }) => {
      if (event === 'game:player-state') {
        this.remoteStateListeners.forEach((listener) => listener({ playerId: fromPlayerId, state: payload }));
        if (this.isHost()) p2p.send('game:player-state-relay', { playerId: fromPlayerId, state: payload });
        return;
      }
      if (event === 'game:player-state-relay') {
        if (payload?.playerId === this.playerId) return;
        this.remoteStateListeners.forEach((listener) => listener(payload));
        return;
      }
      if (event === 'game:bomb-place') {
        this.remoteBombListeners.forEach((listener) => listener({ playerId: fromPlayerId, bomb: payload }));
        if (this.isHost()) p2p.send('game:bomb-place-relay', { playerId: fromPlayerId, bomb: payload });
        return;
      }
      if (event === 'game:bomb-place-relay') {
        this.remoteBombListeners.forEach((listener) => listener(payload));
        return;
      }
      if (event === 'game:world-state') {
        this.remoteWorldStateListeners.forEach((listener) => listener(payload));
        return;
      }
      if (event === 'game:revive-player') {
        this.handleP2PReviveRequest(fromPlayerId, payload);
        return;
      }
      if (event === 'game:revive-request') {
        this.reviveListeners.forEach((listener) => listener(payload));
        return;
      }
      if (event === 'game:kill-enemies') {
        this.handleP2PKillEnemiesRequest(fromPlayerId);
        return;
      }
      if (event === 'game:kill-enemies-request') {
        this.killEnemiesListeners.forEach((listener) => listener(payload));
        return;
      }
      if (event === 'game:restart-level') {
        this.restartListeners.forEach((listener) => listener(payload));
      }
    });

    this.unsubscribeP2PStatus = p2p.onStatus((status) => {
      this.p2pStatusListeners.forEach((listener) => listener(status));
    });
  }

  handleP2PReviveRequest(fromPlayerId, payload) {
    if (!this.isHost() || !payload?.targetPlayerId) return;
    p2p.send('game:revive-request', { fromPlayerId }, payload.targetPlayerId);
  }

  handleP2PKillEnemiesRequest(fromPlayerId) {
    if (!this.isHost()) return;
    this.killEnemiesListeners.forEach((listener) => listener({ fromPlayerId }));
  }

  sendP2P(event, payload) {
    if (!p2p.isReady()) return false;
    if (this.isHost()) {
      p2p.send(event, payload);
    } else {
      p2p.sendToHost(event, payload);
    }
    return true;
  }

  requiresP2P() {
    return (this.room?.players?.length || 0) > 1;
  }

  shouldUseP2P() {
    return this.requiresP2P() && !this.p2pFailed && p2p.isReady();
  }

  emitWithAck(event, payload) {
    return new Promise((resolve) => {
      this.socket.emit(event, payload, resolve);
    });
  }

  startPingMonitor() {
    if (this.pingTimer) return;

    this.measureLatency();
    this.pingTimer = window.setInterval(() => this.measureLatency(), 3000);
    this.socket.once('disconnect', () => {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.setLatency(null);
    });
  }

  stopPingMonitor() {
    if (!this.pingTimer) return;
    window.clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.setLatency(null);
  }

  async measureLatency() {
    if (!this.socket?.connected) return;

    const startedAt = performance.now();
    const response = await this.emitWithAck('ping:check', { clientTime: Date.now() });
    if (!response?.ok) return;

    this.setLatency(Math.round(performance.now() - startedAt));
  }

  setLatency(latencyMs) {
    this.latencyMs = latencyMs;
    this.latencyListeners.forEach((listener) => listener(latencyMs));
  }
}

export const multiplayer = new MultiplayerService();
