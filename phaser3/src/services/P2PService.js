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
    const channel = peer.pc.createDataChannel('game', {
      ordered: false,
      maxRetransmits: 1
    });
    this.attachChannel(peer, channel);

    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    this.sendSignal?.(peerId, 'offer', peer.pc.localDescription);
  }

  attachChannel(peer, channel) {
    peer.channel = channel;
    channel.onopen = () => {
      peer.open = true;
      this.emitStatus();
      this.resolveIfReady();
    };
    channel.onclose = () => {
      peer.open = false;
      this.emitStatus();
    };
    channel.onerror = () => {
      peer.open = false;
      this.emitStatus();
    };
    channel.onmessage = (event) => this.handleMessage(peer.id, event.data);
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
    return Array.from(this.peers.values()).filter((peer) => peer.open).length >= expectedPeers;
  }

  send(event, payload, targetPeerId = null) {
    const message = JSON.stringify({ event, payload });
    const targets = targetPeerId ? [this.peers.get(targetPeerId)] : Array.from(this.peers.values());
    targets.forEach((peer) => {
      if (!peer?.open || peer.channel?.readyState !== 'open') return;
      if (peer.channel.bufferedAmount > this.maxBufferedAmount) return;
      peer.channel.send(message);
    });
  }

  sendToHost(event, payload) {
    if (!this.room?.hostId || this.room.hostId === this.playerId) return;
    this.send(event, payload, this.room.hostId);
  }

  handleMessage(fromPlayerId, raw) {
    let message = null;
    try {
      message = JSON.parse(raw);
    } catch (_error) {
      return;
    }
    this.messageListeners.forEach((listener) => listener({
      fromPlayerId,
      event: message.event,
      payload: message.payload
    }));
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
        connectionState: peer.pc.connectionState
      }))
    };
    this.statusListeners.forEach((listener) => listener(status));
  }

  closePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.channel?.close();
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
