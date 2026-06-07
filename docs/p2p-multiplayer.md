# Bomb Online P2P Multiplayer

This document describes the server-assisted P2P multiplayer flow for the Phaser 3 Bomb game.

## Goal

The Node server is used only for:

- Room creation and join codes.
- Character, bomb, and map selection.
- WebRTC signaling: `offer`, `answer`, and `ice`.
- Loading readiness.

After WebRTC is connected, gameplay messages are sent through WebRTC DataChannel instead of Socket.IO gameplay events.

## Runtime Shape

```text
Lobby / selection / loading:
Client A <-> Socket.IO server <-> Client B

Gameplay:
Client A host <---- WebRTC DataChannel ----> Client B
Client A host <---- WebRTC DataChannel ----> Client C
Client A host <---- WebRTC DataChannel ----> Client D

Server during gameplay:
Only keeps the room alive. It does not relay player movement, bombs, or world snapshots.
```

The connection topology is host-star, not full mesh:

- Host connects to every client.
- Each client connects only to the host.
- Host relays client player-state and bomb events to other clients.

## Files

- `server.js`
  - Adds `p2p:signal`.
  - Validates both sockets are in the same room.
  - Relays signal payload to the target socket.

- `phaser3/src/services/P2PService.js`
  - Owns WebRTC `RTCPeerConnection` objects and DataChannels.
  - Host creates DataChannels and sends offers.
  - Clients answer host offers.
  - ICE candidates are exchanged through `p2p:signal`.
  - Emits parsed gameplay messages to `MultiplayerService`.

- `phaser3/src/services/MultiplayerService.js`
  - Still owns room/lobby state via Socket.IO.
  - Calls `p2p.connectRoom(...)` during loading and before entering game.
  - Routes gameplay send methods through P2P first:
    - `sendPlayerState`
    - `sendBombPlace`
    - `sendWorldState`
    - `requestRevive`
    - `requestKillEnemies`
  - Does not send gameplay traffic through Socket.IO when the room has more than one player.

- `phaser3/src/scenes/LoadingScene.js`
  - Displays P2P connection status.
  - Calls `reportLoadingReady()`, which waits for P2P before reporting ready.

## Signaling Events

Client to server:

```js
socket.emit('p2p:signal', {
  targetPlayerId,
  type, // "offer" | "answer" | "ice"
  payload
});
```

Server to target client:

```js
socket.emit('p2p:signal', {
  fromPlayerId,
  type,
  payload
});
```

The server does not inspect SDP or ICE payload internals.

## Gameplay Messages Over DataChannel

P2P payload envelope:

```js
{
  event: 'game:player-state',
  payload: { ... }
}
```

Current events:

- `game:player-state`
- `game:player-state-relay`
- `game:bomb-place`
- `game:bomb-place-relay`
- `game:world-state`
- `game:revive-player`
- `game:revive-request`
- `game:kill-enemies`
- `game:kill-enemies-request`

## Client Performance Rules

World snapshots are intentionally throttled and sequenced:

- Host sends `game:world-state` about 4 times per second.
- Host player-state does not embed world-state, avoiding duplicate snapshots.
- Each world-state has `seq`; clients ignore older snapshots.
- Snapshots include only alive enemies and alive bosses.
- Clients skip enemy/boss rendering when the received state is unchanged.
- DataChannel sends are skipped when a peer has too much buffered data.

## Host Behavior

Host is authoritative:

- Moves enemies.
- Moves bosses.
- Throws boss bombs.
- Computes world state.
- Broadcasts `game:world-state`.
- Receives client input/state through P2P.
- Relays client `player-state` and `bomb-place` to other clients.

## Client Behavior

Client sends to host:

- Local player state.
- Bomb placement.
- Revive request.
- Kill-enemies cheat request.

Client receives from host:

- Host player state.
- Relayed remote player state.
- Relayed remote bombs.
- World state snapshots.
- Revive request.

## STUN/TURN

`P2PService` currently uses public Google STUN:

```js
stun:stun.l.google.com:19302
stun:stun1.l.google.com:19302
```

This is not a gameplay server. It only helps peers discover connection candidates.

For hard NAT networks, pure STUN may fail. A TURN server would improve reliability, but TURN relays traffic, so it is no longer fully P2P for those players.

## Debug Checklist

1. Loading screen should show `Connecting P2P x/y`, then `P2P ready x/y`.
2. If it times out, check browser console for WebRTC/STUN errors.
3. Confirm `p2p:signal` events are emitted in the Socket.IO server logs if logging is added.
4. Host should receive client `game:player-state`.
5. Non-host clients should receive `game:player-state-relay` for other clients.
6. If bombs appear on host but not on other clients, inspect `game:bomb-place-relay`.

## Important Tradeoffs

- If the host leaves, the match is effectively broken. Host migration is not implemented.
- Host can cheat because host owns simulation.
- DataChannel uses unreliable-ish settings for gameplay feel:
  - `ordered: false`
  - `maxRetransmits: 1`
- Socket.IO gameplay fallback is intentionally disabled for multiplayer rooms. If P2P is not ready, gameplay packets are dropped instead of being relayed through the server.
