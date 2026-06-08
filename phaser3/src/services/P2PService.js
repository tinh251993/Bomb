class P2PService {
  constructor() {
    this.room = null;
    this.playerId = null;
    this.isHost = false;
    this.sendSignal = null;
    this.peers = new Map();
    this.messageListeners = new Set();
    this.statusListeners = new Set();
    this.connectPromise = null;
    this.connectResolve = null;
    this.connectTimer = null;
    this.useStun = true;
    this.pendingSignals = [];
    this.maxBufferedAmount = 256 * 1024;
    this.binaryVersion = 1;
  }

  isSupported() {
    return typeof window.RTCPeerConnection === 'function';
  }

  connectRoom(room, playerId, sendSignal) {
    if (!this.isSupported()) return Promise.reject(new Error('WebRTC is not supported in this browser.'));
    if (!room || !playerId) return Promise.reject(new Error('Missing P2P room data.'));

    const sameRoom = this.room?.code === room.code && this.playerId === playerId;
    this.room = room;
    this.playerId = playerId;
    this.isHost = room.hostId === playerId;
    this.sendSignal = sendSignal;

    const peerIds = this.isHost
      ? room.players.map((player) => player.id).filter((id) => id !== playerId)
      : [room.hostId].filter((id) => id && id !== playerId);

    Array.from(this.peers.keys()).forEach((peerId) => {
      if (!peerIds.includes(peerId)) this.closePeer(peerId);
    });

    peerIds.forEach((peerId) => {
      const peer = this.ensurePeer(peerId);
      if (this.isHost && !peer.offerStarted) this.startHostPeer(peerId);
    });
    this.flushPendingSignals();

    if (sameRoom && this.isReady()) return Promise.resolve();
    return this.waitUntilReady();
  }

  ensurePeer(peerId) {
    const existing = this.peers.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(this.rtcConfig());
    const peer = {
      id: peerId,
      pc,
      channel: null,
      stateChannel: null,
      eventChannel: null,
      open: false,
      offerStarted: false
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      this.sendSignal?.(peerId, 'ice', event.candidate);
    };
    pc.ondatachannel = (event) => this.attachChannel(peer, event.channel);
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        peer.open = false;
        this.emitStatus();
      }
    };

    this.peers.set(peerId, peer);
    return peer;
  }

  rtcConfig() {
    if (!this.useStun) return {};
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
  }

  async startHostPeer(peerId) {
    const peer = this.ensurePeer(peerId);
    peer.offerStarted = true;
    const stateChannel = peer.pc.createDataChannel('state', {
      ordered: false,
      maxRetransmits: 0
    });
    const eventChannel = peer.pc.createDataChannel('event', {
      ordered: true
    });
    this.attachChannel(peer, stateChannel);
    this.attachChannel(peer, eventChannel);

    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    this.sendSignal?.(peerId, 'offer', peer.pc.localDescription);
  }

  attachChannel(peer, channel) {
    if (channel.label === 'event') {
      peer.eventChannel = channel;
    } else {
      peer.stateChannel = channel;
      peer.channel = channel;
    }
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
      peer.open = this.isPeerOpen(peer);
      this.emitStatus();
      this.resolveIfReady();
    };
    channel.onclose = () => {
      peer.open = this.isPeerOpen(peer);
      this.emitStatus();
    };
    channel.onerror = () => {
      peer.open = this.isPeerOpen(peer);
      this.emitStatus();
    };
    channel.onmessage = (event) => this.handleMessage(peer.id, event.data);
  }

  isPeerOpen(peer) {
    const stateOpen = peer.stateChannel?.readyState === 'open';
    const eventOpen = peer.eventChannel?.readyState === 'open';
    return stateOpen && eventOpen;
  }

  async handleSignal({ fromPlayerId, type, payload }) {
    if (!fromPlayerId || fromPlayerId === this.playerId) return;
    if (!this.playerId || !this.sendSignal) {
      this.pendingSignals.push({ fromPlayerId, type, payload });
      return;
    }
    const peer = this.ensurePeer(fromPlayerId);

    if (type === 'offer') {
      await peer.pc.setRemoteDescription(payload);
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      this.sendSignal?.(fromPlayerId, 'answer', peer.pc.localDescription);
      return;
    }

    if (type === 'answer') {
      if (peer.pc.signalingState !== 'stable') {
        await peer.pc.setRemoteDescription(payload);
      }
      return;
    }

    if (type === 'ice' && payload) {
      await peer.pc.addIceCandidate(payload).catch(() => {});
    }
  }

  flushPendingSignals() {
    const pending = this.pendingSignals.splice(0);
    pending.forEach((signal) => this.handleSignal(signal).catch(() => {}));
  }

  waitUntilReady(timeoutMs = 12000) {
    if (this.isReady()) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise((resolve, reject) => {
      this.connectResolve = resolve;
      window.clearTimeout(this.connectTimer);
      this.connectTimer = window.setTimeout(() => {
        this.connectPromise = null;
        this.connectResolve = null;
        reject(new Error('P2P connection timeout.'));
      }, timeoutMs);
    });
    return this.connectPromise;
  }

  resolveIfReady() {
    if (!this.isReady() || !this.connectResolve) return;
    window.clearTimeout(this.connectTimer);
    const resolve = this.connectResolve;
    this.connectPromise = null;
    this.connectResolve = null;
    resolve();
  }

  isReady() {
    const expectedPeers = this.isHost
      ? Math.max(0, (this.room?.players?.length || 1) - 1)
      : (this.room?.players?.length > 1 ? 1 : 0);
    if (expectedPeers === 0) return true;
    return Array.from(this.peers.values()).filter((peer) => this.isPeerOpen(peer)).length >= expectedPeers;
  }

  send(event, payload, targetPeerId = null) {
    const message = this.encodeMessage(event, payload);
    if (!message) return;
    const targets = targetPeerId ? [this.peers.get(targetPeerId)] : Array.from(this.peers.values());
    targets.forEach((peer) => {
      const channel = this.isStateEvent(event) ? peer?.stateChannel : peer?.eventChannel;
      if (!peer || channel?.readyState !== 'open') return;
      if (channel.bufferedAmount > this.maxBufferedAmount) return;
      channel.send(message);
    });
  }

  isStateEvent(event) {
    return event === 'game:player-state'
      || event === 'game:player-state-relay'
      || event === 'game:world-state';
  }

  sendToHost(event, payload) {
    if (!this.room?.hostId || this.room.hostId === this.playerId) return;
    this.send(event, payload, this.room.hostId);
  }

  handleMessage(fromPlayerId, raw) {
    const message = this.decodeMessage(raw);
    if (!message) return;
    this.messageListeners.forEach((listener) => listener({
      fromPlayerId,
      event: message.event,
      payload: message.payload
    }));
  }

  encodeMessage(event, payload) {
    if (event === 'game:player-state') return this.encodePlayerState(1, payload);
    if (event === 'game:player-state-relay') return this.encodePlayerRelay(payload);
    if (event === 'game:world-state') return this.encodeWorldState(payload);
    return JSON.stringify({ event, payload });
  }

  decodeMessage(raw) {
    if (raw instanceof ArrayBuffer) return this.decodeBinary(raw);
    if (raw instanceof Blob) return null;

    try {
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }

  encodePlayerRelay(payload) {
    const index = this.playerIndex(payload?.playerId);
    if (index < 0) return null;
    return this.encodePlayerState(2, payload.state, index);
  }

  encodePlayerState(type, state = {}, relayPlayerIndex = 0) {
    const buffer = new ArrayBuffer(type === 2 ? 16 : 15);
    const view = new DataView(buffer);
    let offset = 0;
    view.setUint8(offset++, type);
    view.setUint8(offset++, this.binaryVersion);
    if (type === 2) view.setUint8(offset++, relayPlayerIndex);
    view.setUint16(offset, state.seq || 0); offset += 2;
    view.setInt16(offset, Math.round(state.x || 0)); offset += 2;
    view.setInt16(offset, Math.round(state.y || 0)); offset += 2;
    view.setUint8(offset++, state.gridX || 0);
    view.setUint8(offset++, state.gridY || 0);
    view.setUint8(offset++, this.directionCode(state.direction));
    view.setUint8(offset++, this.characterCode(state.characterId));
    view.setUint8(offset++, this.statusCode(state.status));
    view.setUint16(offset, Math.min(65535, Math.round(state.downedRemainingMs || 0)));
    return buffer;
  }

  decodePlayerState(view, offset) {
    const state = {};
    state.seq = view.getUint16(offset); offset += 2;
    state.x = view.getInt16(offset); offset += 2;
    state.y = view.getInt16(offset); offset += 2;
    state.gridX = view.getUint8(offset++);
    state.gridY = view.getUint8(offset++);
    state.direction = this.directionFromCode(view.getUint8(offset++));
    state.characterId = this.characterFromCode(view.getUint8(offset++));
    state.status = this.statusFromCode(view.getUint8(offset++));
    state.downedRemainingMs = view.getUint16(offset);
    return state;
  }

  encodeWorldState(state = {}) {
    const writer = this.createBinaryWriter();
    writer.u8(3);
    writer.u8(this.binaryVersion);
    writer.u8(state.full ? 1 : 0);
    writer.u16(state.seq || 0);
    writer.i32(Math.round(state.score || 0));
    this.writeCrateList(writer, state.crates || []);
    this.writeCrateList(writer, state.crateAdds || []);
    this.writeCrateList(writer, state.crateRemoves || []);
    this.writeCrateList(writer, state.bombs || []);
    this.writeCrateList(writer, state.bombAdds || []);
    this.writeCrateList(writer, state.bombRemoves || []);
    this.writeItemList(writer, state.items || []);
    this.writeItemList(writer, state.itemAdds || []);
    this.writeCrateList(writer, state.itemRemoves || []);
    this.writeEnemyList(writer, state.enemies || []);
    this.writeIdList(writer, state.removedEnemies || []);
    this.writeBossList(writer, state.bosses || []);
    this.writeIdList(writer, state.removedBosses || []);
    return writer.buffer();
  }

  decodeWorldState(view) {
    let offset = 2;
    const state = {
      full: view.getUint8(offset++) === 1,
      seq: view.getUint16(offset)
    };
    offset += 2;
    state.score = view.getInt32(offset); offset += 4;
    [state.crates, offset] = this.readCrateList(view, offset);
    [state.crateAdds, offset] = this.readCrateList(view, offset);
    [state.crateRemoves, offset] = this.readCrateList(view, offset);
    [state.bombs, offset] = this.readCrateList(view, offset);
    [state.bombAdds, offset] = this.readCrateList(view, offset);
    [state.bombRemoves, offset] = this.readCrateList(view, offset);
    [state.items, offset] = this.readItemList(view, offset);
    [state.itemAdds, offset] = this.readItemList(view, offset);
    [state.itemRemoves, offset] = this.readCrateList(view, offset);
    [state.enemies, offset] = this.readEnemyList(view, offset);
    [state.removedEnemies, offset] = this.readIdList(view, offset, 'enemy');
    [state.bosses, offset] = this.readBossList(view, offset);
    [state.removedBosses] = this.readIdList(view, offset, 'boss');
    return state;
  }

  decodeBinary(buffer) {
    const view = new DataView(buffer);
    const type = view.getUint8(0);
    const version = view.getUint8(1);
    if (version !== this.binaryVersion) return null;

    if (type === 1) {
      return { event: 'game:player-state', payload: this.decodePlayerState(view, 2) };
    }
    if (type === 2) {
      const playerId = this.playerIdFromIndex(view.getUint8(2));
      if (!playerId) return null;
      return {
        event: 'game:player-state-relay',
        payload: { playerId, state: this.decodePlayerState(view, 3) }
      };
    }
    if (type === 3) {
      return { event: 'game:world-state', payload: this.decodeWorldState(view) };
    }
    return null;
  }

  createBinaryWriter() {
    const bytes = [];
    return {
      u8: (value) => bytes.push(value & 255),
      u16: (value) => {
        bytes.push((value >> 8) & 255, value & 255);
      },
      i16: (value) => {
        const next = value < 0 ? value + 65536 : value;
        bytes.push((next >> 8) & 255, next & 255);
      },
      i32: (value) => {
        const next = value < 0 ? value + 4294967296 : value;
        bytes.push((next >>> 24) & 255, (next >>> 16) & 255, (next >>> 8) & 255, next & 255);
      },
      buffer: () => new Uint8Array(bytes).buffer
    };
  }

  writeCrateList(writer, crates) {
    writer.u16(crates.length);
    crates.forEach((crate) => {
      const { x, y } = this.parseCoord(crate);
      writer.u8(x);
      writer.u8(y);
    });
  }

  readCrateList(view, offset) {
    const count = view.getUint16(offset); offset += 2;
    const crates = [];
    for (let i = 0; i < count; i++) {
      crates.push(`${view.getUint8(offset++)},${view.getUint8(offset++)}`);
    }
    return [crates, offset];
  }

  writeItemList(writer, items) {
    writer.u16(items.length);
    items.forEach((item) => {
      const { x, y } = this.parseCoord(item.key || item);
      writer.u8(Number.isFinite(item.x) ? item.x : x);
      writer.u8(Number.isFinite(item.y) ? item.y : y);
      writer.u8(this.itemTypeCode(item.type));
    });
  }

  readItemList(view, offset) {
    const count = view.getUint16(offset); offset += 2;
    const items = [];
    for (let i = 0; i < count; i++) {
      const x = view.getUint8(offset++);
      const y = view.getUint8(offset++);
      items.push({
        key: `${x},${y}`,
        x,
        y,
        type: this.itemTypeFromCode(view.getUint8(offset++))
      });
    }
    return [items, offset];
  }

  writeEnemyList(writer, enemies) {
    writer.u16(enemies.length);
    enemies.forEach((enemy) => {
      writer.u16(this.idNumber(enemy.id));
      writer.u8(enemy.x || 0);
      writer.u8(enemy.y || 0);
      writer.i16(Math.round(enemy.worldX || 0));
      writer.i16(Math.round(enemy.worldY || 0));
      writer.u8(this.directionCode(enemy.direction));
      writer.u8(enemy.alive === false ? 0 : 1);
    });
  }

  readEnemyList(view, offset) {
    const count = view.getUint16(offset); offset += 2;
    const enemies = [];
    for (let i = 0; i < count; i++) {
      const id = view.getUint16(offset); offset += 2;
      const enemy = {
        id: `enemy-${id}`,
        x: view.getUint8(offset++),
        y: view.getUint8(offset++),
        worldX: view.getInt16(offset),
        worldY: view.getInt16(offset + 2),
        direction: null,
        alive: true
      };
      offset += 4;
      enemy.direction = this.directionFromCode(view.getUint8(offset++));
      enemy.alive = view.getUint8(offset++) === 1;
      enemies.push(enemy);
    }
    return [enemies, offset];
  }

  writeBossList(writer, bosses) {
    writer.u16(bosses.length);
    bosses.forEach((boss) => {
      writer.u16(this.idNumber(boss.id));
      writer.u8(this.bossTypeCode(boss.bossType));
      writer.u8(boss.x || 0);
      writer.u8(boss.y || 0);
      writer.i16(Math.round(boss.worldX || 0));
      writer.i16(Math.round(boss.worldY || 0));
      writer.u8(this.directionCode(boss.direction));
      writer.i16(Math.round(boss.health || 0));
      writer.u8(boss.bombRange || 0);
      writer.u8(boss.flying ? 1 : 0);
      writer.u8(boss.alive === false ? 0 : 1);
    });
  }

  readBossList(view, offset) {
    const count = view.getUint16(offset); offset += 2;
    const bosses = [];
    for (let i = 0; i < count; i++) {
      const id = view.getUint16(offset); offset += 2;
      const boss = {
        id: `boss-${id}`,
        bossType: this.bossTypeFromCode(view.getUint8(offset++)),
        x: view.getUint8(offset++),
        y: view.getUint8(offset++),
        worldX: view.getInt16(offset),
        worldY: view.getInt16(offset + 2),
        direction: null,
        health: 0,
        bombRange: 0,
        flying: false,
        alive: true
      };
      offset += 4;
      boss.direction = this.directionFromCode(view.getUint8(offset++));
      boss.health = view.getInt16(offset); offset += 2;
      boss.bombRange = view.getUint8(offset++);
      boss.flying = view.getUint8(offset++) === 1;
      boss.alive = view.getUint8(offset++) === 1;
      bosses.push(boss);
    }
    return [bosses, offset];
  }

  writeIdList(writer, ids) {
    writer.u16(ids.length);
    ids.forEach((id) => writer.u16(this.idNumber(id)));
  }

  readIdList(view, offset, prefix) {
    const count = view.getUint16(offset); offset += 2;
    const ids = [];
    for (let i = 0; i < count; i++) {
      ids.push(`${prefix}-${view.getUint16(offset)}`);
      offset += 2;
    }
    return [ids, offset];
  }

  parseCoord(coord) {
    if (typeof coord === 'string') {
      const [x, y] = coord.split(',').map((value) => Number.parseInt(value, 10));
      return { x: x || 0, y: y || 0 };
    }
    return { x: coord?.x || 0, y: coord?.y || 0 };
  }

  idNumber(id) {
    const match = String(id || '').match(/-(\d+)$/);
    return match ? Number.parseInt(match[1], 10) : 0;
  }

  playerIndex(playerId) {
    return this.room?.players?.findIndex((player) => player.id === playerId) ?? -1;
  }

  playerIdFromIndex(index) {
    return this.room?.players?.[index]?.id || null;
  }

  directionCode(direction) {
    return { down: 0, up: 1, left: 2, right: 3 }[direction] ?? 0;
  }

  directionFromCode(code) {
    return ['down', 'up', 'left', 'right'][code] || 'down';
  }

  characterCode(characterId) {
    return { bebong: 0, khokho: 1, tiachop: 2 }[characterId] ?? 0;
  }

  characterFromCode(code) {
    return ['bebong', 'khokho', 'tiachop'][code] || 'bebong';
  }

  statusCode(status) {
    return { alive: 0, downed: 1, dead: 2 }[status] ?? 0;
  }

  statusFromCode(code) {
    return ['alive', 'downed', 'dead'][code] || 'alive';
  }

  bossTypeCode(type) {
    return { pirate: 0, eagle: 1 }[type] ?? 0;
  }

  bossTypeFromCode(code) {
    return ['pirate', 'eagle'][code] || 'pirate';
  }

  itemTypeCode(type) {
    return { bomb: 0, flame: 1, speed: 2 }[type] ?? 0;
  }

  itemTypeFromCode(code) {
    return ['bomb', 'flame', 'speed'][code] || 'bomb';
  }

  onMessage(listener) {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onStatus(listener) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  emitStatus() {
    const status = {
      ready: this.isReady(),
      peers: Array.from(this.peers.values()).map((peer) => ({
        id: peer.id,
        open: peer.open,
        stateOpen: peer.stateChannel?.readyState === 'open',
        eventOpen: peer.eventChannel?.readyState === 'open',
        connectionState: peer.pc.connectionState
      }))
    };
    this.statusListeners.forEach((listener) => listener(status));
  }

  closePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.stateChannel?.close();
    peer.eventChannel?.close();
    peer.pc.close();
    this.peers.delete(peerId);
  }

  close() {
    Array.from(this.peers.keys()).forEach((peerId) => this.closePeer(peerId));
    window.clearTimeout(this.connectTimer);
    this.room = null;
    this.playerId = null;
    this.connectPromise = null;
    this.connectResolve = null;
  }
}

export const p2p = new P2PService();
