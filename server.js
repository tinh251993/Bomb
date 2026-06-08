const express = require('express');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT || 8010);
const MAX_PLAYERS = 4;

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = new Map();
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const mapsFile = path.join(dataDir, 'custom-maps.json');

app.use(express.json({ limit: '1mb' }));
app.use('/res', express.static(path.join(__dirname, 'res')));
app.use('/age-war', express.static(path.join(__dirname, 'age-war')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get(['/phaser3/', '/phaser3/index.html'], (req, res) => {
  if (req.query.play === '1') {
    res.sendFile(path.join(__dirname, 'phaser3', 'index.html'));
    return;
  }
  res.redirect('/');
});
app.use('/phaser3', express.static(path.join(__dirname, 'phaser3')));

app.get('/api/maps', (_req, res) => {
  res.json({ ok: true, maps: readCustomMaps() });
});

app.get('/api/network-config', (_req, res) => {
  res.json({ ok: true, iceServers: readIceServers() });
});

app.post('/api/maps', (req, res) => {
  const map = sanitizeCustomMap(req.body);
  if (!map) return res.status(400).json({ ok: false, message: 'Invalid map.' });

  const maps = readCustomMaps();
  const existingIndex = maps.findIndex((item) => item.type === map.type && item.name === map.name);
  const entry = {
    ...map,
    updatedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    maps[existingIndex] = entry;
  } else {
    maps.unshift(entry);
  }

  writeCustomMaps(maps);
  res.json({ ok: true, map: entry, maps });
});

app.post('/api/maps/import', (req, res) => {
  const incoming = Array.isArray(req.body?.maps) ? req.body.maps : [];
  const maps = readCustomMaps();
  let imported = 0;

  incoming.forEach((item) => {
    const map = sanitizeCustomMap(item);
    if (!map) return;

    const existingIndex = maps.findIndex((existing) => existing.type === map.type && existing.name === map.name);
    const entry = {
      ...map,
      updatedAt: item.updatedAt || new Date().toISOString()
    };

    if (existingIndex >= 0) {
      maps[existingIndex] = entry;
    } else {
      maps.unshift(entry);
    }
    imported++;
  });

  if (imported > 0) writeCustomMaps(maps);
  res.json({ ok: true, imported, maps });
});

app.delete('/api/maps/:type/:name', (req, res) => {
  const type = req.params.type === 'forest' ? 'forest' : 'pirate';
  const name = String(req.params.name || '').slice(0, 40);
  const maps = readCustomMaps();
  const nextMaps = maps.filter((map) => map.type !== type || map.name !== name);
  writeCustomMaps(nextMaps);
  res.json({ ok: true, maps: nextMaps });
});

io.on('connection', (socket) => {
  socket.on('ping:check', (_payload, reply) => {
    reply?.({ ok: true, serverTime: Date.now() });
  });

  socket.on('room:create', (_payload, reply) => {
    const code = createRoomCode();
    const player = createPlayer(socket, true);
    const room = {
      code,
      hostId: socket.id,
      started: false,
      phase: 'lobby',
      selectedLevel: 1,
      customMap: null,
      loadingPlayers: new Set(),
      inGamePlayers: new Set(),
      cleanupTimer: null,
      players: new Map([[socket.id, player]])
    };

    rooms.set(code, room);
    socket.data.roomCode = code;
    socket.join(code);
    reply?.({ ok: true, room: serializeRoom(room), playerId: socket.id });
  });

  socket.on('room:join', ({ code }, reply) => {
    const normalizedCode = String(code || '').trim().toUpperCase();
    const room = rooms.get(normalizedCode);

    if (!room) return reply?.({ ok: false, message: 'Room not found.' });
    if (room.started) return reply?.({ ok: false, message: 'Room already started.' });
    if (room.players.size >= MAX_PLAYERS) return reply?.({ ok: false, message: 'Room is full.' });

    const player = createPlayer(socket, false);
    room.players.set(socket.id, player);
    socket.data.roomCode = normalizedCode;
    socket.join(normalizedCode);

    emitRoom(room);
    reply?.({ ok: true, room: serializeRoom(room), playerId: socket.id });
  });

  socket.on('room:selection', ({ characterId, bombTypeId, level, customMap }, reply) => {
    const room = getSocketRoom(socket);
    if (!room) return reply?.({ ok: false, message: 'Not in a room.' });

    const player = room.players.get(socket.id);
    if (!player) return reply?.({ ok: false, message: 'Player not found.' });

    player.characterId = characterId || player.characterId;
    player.bombTypeId = bombTypeId || player.bombTypeId;
    player.ready = true;
    if (room.hostId === socket.id) {
      room.selectedLevel = Math.min(6, Math.max(1, Number(level) || room.selectedLevel || 1));
      room.customMap = sanitizeCustomMap(customMap);
    }
    emitRoom(room);
    reply?.({ ok: true, room: serializeRoom(room) });
  });

  socket.on('room:choose-selection', (_payload, reply) => {
    const room = getSocketRoom(socket);
    if (!room) return reply?.({ ok: false, message: 'Not in a room.' });
    if (room.hostId !== socket.id) return reply?.({ ok: false, message: 'Only host can choose player.' });
    if (room.started) return reply?.({ ok: false, message: 'Room already started.' });

    room.phase = 'selection';
    emitRoom(room);
    io.to(room.code).emit('room:selection-start', { room: serializeRoom(room) });
    reply?.({ ok: true, room: serializeRoom(room) });
  });

  socket.on('room:start', (_payload, reply) => {
    const room = getSocketRoom(socket);
    if (!room) return reply?.({ ok: false, message: 'Not in a room.' });
    if (room.hostId !== socket.id) return reply?.({ ok: false, message: 'Only host can start.' });
    if (room.players.size < 1) return reply?.({ ok: false, message: 'Room is empty.' });

    room.phase = 'loading';
    room.loadingPlayers.clear();
    const payload = { room: serializeRoom(room) };
    emitRoom(room);
    io.to(room.code).emit('room:game-loading', payload);
    reply?.({ ok: true, ...payload });
  });

  socket.on('room:loading-ready', (_payload, reply) => {
    const room = getSocketRoom(socket);
    if (!room) return reply?.({ ok: false, message: 'Not in a room.' });
    if (room.phase !== 'loading') return reply?.({ ok: false, message: 'Room is not loading.' });

    room.loadingPlayers.add(socket.id);
    emitRoom(room);
    reply?.({ ok: true, room: serializeRoom(room) });

    if (room.loadingPlayers.size !== room.players.size) return;

    room.started = true;
    room.phase = 'playing';
    const payload = { room: serializeRoom(room) };
    emitRoom(room);
    io.to(room.code).emit('room:game-start', payload);
  });

  socket.on('p2p:signal', ({ targetPlayerId, type, payload }, reply) => {
    const room = getSocketRoom(socket);
    if (!room) return reply?.({ ok: false, message: 'Not in a room.' });
    if (!room.players.has(targetPlayerId)) return reply?.({ ok: false, message: 'Target player not found.' });

    io.to(targetPlayerId).emit('p2p:signal', {
      fromPlayerId: socket.id,
      type,
      payload
    });
    reply?.({ ok: true });
  });

  socket.on('game:player-state', (state) => {
    const room = getSocketRoom(socket);
    if (!room || !room.started) return;
    socket.to(room.code).emit('game:player-state', {
      playerId: socket.id,
      state
    });
  });

  socket.on('game:enter', (_payload, reply) => {
    const room = getSocketRoom(socket);
    if (!room || !room.started) return reply?.({ ok: false, message: 'Not in a started room.' });

    room.inGamePlayers.add(socket.id);
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }
    emitRoom(room);
    reply?.({ ok: true, room: serializeRoom(room) });
  });

  socket.on('game:leave', (_payload, reply) => {
    const room = getSocketRoom(socket);
    if (!room) return reply?.({ ok: true });

    room.inGamePlayers.delete(socket.id);
    cleanupRoomIfGameEmpty(room);
    if (rooms.has(room.code)) emitRoom(room);
    reply?.({ ok: true });
  });

  socket.on('game:bomb-place', (bomb) => {
    const room = getSocketRoom(socket);
    if (!room || !room.started) return;
    socket.to(room.code).emit('game:bomb-place', {
      playerId: socket.id,
      bomb
    });
  });

  socket.on('game:world-state', (state) => {
    const room = getSocketRoom(socket);
    if (!room || !room.started || room.hostId !== socket.id) return;
    socket.to(room.code).emit('game:world-state', state);
  });

  socket.on('game:revive-player', ({ targetPlayerId }) => {
    const room = getSocketRoom(socket);
    if (!room || !room.started || !room.players.has(targetPlayerId)) return;
    io.to(targetPlayerId).emit('game:revive-request', {
      fromPlayerId: socket.id
    });
  });

  socket.on('game:kill-enemies', () => {
    const room = getSocketRoom(socket);
    if (!room || !room.started) return;
    io.to(room.hostId).emit('game:kill-enemies-request', {
      fromPlayerId: socket.id
    });
  });

  socket.on('game:restart-level', (payload) => {
    const room = getSocketRoom(socket);
    if (!room || !room.started || room.hostId !== socket.id) return;
    socket.to(room.code).emit('game:restart-level', payload);
  });

  socket.on('disconnect', () => {
    const room = getSocketRoom(socket);
    if (!room) return;

    room.players.delete(socket.id);
    room.loadingPlayers?.delete(socket.id);
    room.inGamePlayers?.delete(socket.id);
    if (room.players.size === 0) {
      if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
      rooms.delete(room.code);
      return;
    }

    if (room.hostId === socket.id) {
      room.hostId = room.players.keys().next().value;
      const newHost = room.players.get(room.hostId);
      if (newHost) newHost.isHost = true;
    }

    cleanupRoomIfGameEmpty(room);
    if (!rooms.has(room.code)) return;
    emitRoom(room);
  });
});

function createPlayer(socket, isHost) {
  return {
    id: socket.id,
    name: isHost ? 'Host' : `Player ${Math.floor(Math.random() * 90) + 10}`,
    isHost,
    ready: false,
    characterId: 'bebong',
    bombTypeId: 'basic'
  };
}

function getSocketRoom(socket) {
  const code = socket.data.roomCode;
  return code ? rooms.get(code) : null;
}

function emitRoom(room) {
  io.to(room.code).emit('room:update', { room: serializeRoom(room) });
}

function cleanupRoomIfGameEmpty(room) {
  if (room.phase !== 'playing' || room.inGamePlayers.size !== 0 || room.cleanupTimer) return;

  room.cleanupTimer = setTimeout(() => {
    room.cleanupTimer = null;
    if (room.phase === 'playing' && room.inGamePlayers.size === 0) {
      rooms.delete(room.code);
    }
  }, 5000);
}

function readIceServers() {
  if (process.env.ICE_SERVERS_JSON) {
    try {
      const parsed = JSON.parse(process.env.ICE_SERVERS_JSON);
      if (Array.isArray(parsed)) return parsed.filter((server) => server?.urls);
    } catch (_error) {
      // Fall through to explicit TURN/STUN env parsing.
    }
  }

  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];
  if (process.env.TURN_URLS) {
    iceServers.push({
      urls: process.env.TURN_URLS.split(',').map((url) => url.trim()).filter(Boolean),
      username: process.env.TURN_USERNAME || undefined,
      credential: process.env.TURN_CREDENTIAL || undefined
    });
  }
  return iceServers;
}

function sanitizeCustomMap(customMap) {
  if (!customMap || !Array.isArray(customMap.layout)) return null;

  const layout = customMap.layout.slice(0, 13).map((row) => {
    return String(row || '').slice(0, 26);
  });
  if (layout.length !== 13) return null;

  return {
    type: customMap.type === 'forest' ? 'forest' : 'pirate',
    name: String(customMap.name || 'custom').slice(0, 40),
    layout,
    objects: Array.isArray(customMap.objects) ? customMap.objects.slice(0, 40).map((object) => {
      const kind = ['boss', 'enemy', 'asset', 'playerSpawn'].includes(object.kind) ? object.kind : 'asset';
      return {
        kind,
        player: kind === 'playerSpawn' ? Math.min(4, Math.max(1, Number(object.player) || 1)) : undefined,
        x: Number(object.x) || 0,
        y: Number(object.y) || 0,
        width: Number(object.width) || 1,
        height: Number(object.height) || 1,
        bossType: ['pirate', 'eagle'].includes(object.bossType) ? object.bossType : undefined,
        assetId: object.assetId ? String(object.assetId).slice(0, 80) : undefined,
        name: object.name ? String(object.name).slice(0, 80) : undefined
      };
    }) : []
  };
}

function readCustomMaps() {
  ensureMapsFile();
  try {
    const maps = JSON.parse(fs.readFileSync(mapsFile, 'utf8'));
    return Array.isArray(maps) ? maps.map(sanitizeCustomMap).filter(Boolean) : [];
  } catch (_error) {
    return [];
  }
}

function writeCustomMaps(maps) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(mapsFile, JSON.stringify(maps, null, 2));
}

function ensureMapsFile() {
  if (fs.existsSync(mapsFile)) return;

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(mapsFile, '[]\n');
}

function serializeRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    started: room.started,
    phase: room.phase,
    selectedLevel: room.selectedLevel || 1,
    customMap: room.customMap || null,
    loadingPlayerIds: Array.from(room.loadingPlayers || []),
    inGamePlayerIds: Array.from(room.inGamePlayers || []),
    players: Array.from(room.players.values()).map((player) => ({
      ...player,
      isHost: player.id === room.hostId
    }))
  };
}

function createRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!rooms.has(code)) return code;
  }
  throw new Error('Could not allocate room code.');
}

server.listen(PORT, () => {
  console.log(`Bomb Online server listening on http://127.0.0.1:${PORT}`);
  console.log(`Custom maps stored at ${mapsFile}`);
});
