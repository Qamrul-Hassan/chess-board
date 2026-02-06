import express from "express";
import http from "http";
import { Server } from "socket.io";
import { Chess } from "chess.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "*",
    methods: ["GET", "POST"]
  }
});
const rooms = new Map();

app.use(express.static(__dirname));

function randomRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 5; i += 1) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function buildState(room) {
  return {
    fen: room.chess.fen(),
    whiteTime: room.whiteTime,
    blackTime: room.blackTime,
    running: room.running,
    lastMove: room.lastMove,
    baseTime: room.baseTime,
    players: {
      white: Boolean(room.players.white),
      black: Boolean(room.players.black)
    },
    spectatorsCount: room.spectators.size,
    moves: room.moves
  };
}

function broadcastState(room) {
  io.to(room.id).emit("room-state", { state: buildState(room) });
}

function emitPresence(room) {
  io.to(room.hostId).emit("presence", {
    state: buildState(room),
    spectators: Array.from(room.spectators)
  });
}

function stopRoomTimer(room) {
  if (room.timerId) clearInterval(room.timerId);
  room.timerId = null;
}

function startRoomTimer(room) {
  if (room.timerId) return;
  room.timerId = setInterval(() => {
    if (!room.running) return;
    if (room.chess.turn() === "w") room.whiteTime -= 1;
    else room.blackTime -= 1;

    if (room.whiteTime <= 0 || room.blackTime <= 0) {
      room.whiteTime = Math.max(0, room.whiteTime);
      room.blackTime = Math.max(0, room.blackTime);
      room.running = false;
      stopRoomTimer(room);
      const loser = room.whiteTime === 0 ? "White" : "Black";
      io.to(room.id).emit("game-over", { reason: `${loser} ran out of time.` });
    }
    broadcastState(room);
  }, 1000);
}

function createRoom(hostSocket, baseTime) {
  let id = randomRoomId();
  while (rooms.has(id)) id = randomRoomId();
  const room = {
    id,
    hostId: hostSocket.id,
    players: { white: hostSocket.id, black: null },
    spectators: new Set(),
    pending: new Map(),
    chess: new Chess(),
    baseTime,
    whiteTime: baseTime,
    blackTime: baseTime,
    running: false,
    lastMove: null,
    timerId: null,
    moves: []
  };
  rooms.set(id, room);
  hostSocket.join(id);
  return room;
}

function getRole(room, socketId) {
  if (room.players.white === socketId) return "white";
  if (room.players.black === socketId) return "black";
  if (room.spectators.has(socketId)) return "spectator";
  return null;
}

io.on("connection", socket => {
  socket.on("host-room", ({ baseTime }) => {
    const room = createRoom(socket, Number(baseTime) || 300);
    socket.emit("room-created", { roomId: room.id, role: "white", state: buildState(room) });
    emitPresence(room);
  });

  socket.on("request-join", ({ roomId, spectator }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit("join-denied", { reason: "Room not found." });
      return;
    }
    room.pending.set(socket.id, { spectator: Boolean(spectator) });
    io.to(room.hostId).emit("join-request", { requesterId: socket.id, spectator: Boolean(spectator) });
  });

  socket.on("approve-join", ({ roomId, requesterId }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;
    const request = room.pending.get(requesterId);
    if (!request) return;
    room.pending.delete(requesterId);
    const target = io.sockets.sockets.get(requesterId);
    if (!target) return;

    if (request.spectator) {
      room.spectators.add(requesterId);
      target.join(room.id);
      target.emit("room-joined", { roomId: room.id, role: "spectator", state: buildState(room) });
      broadcastState(room);
      emitPresence(room);
      return;
    }

    if (!room.players.black) {
      room.players.black = requesterId;
      target.join(room.id);
      target.emit("room-joined", { roomId: room.id, role: "black", state: buildState(room) });
      broadcastState(room);
      emitPresence(room);
      return;
    }

    target.emit("join-denied", { reason: "Players are full. Try spectating." });
  });

  socket.on("deny-join", ({ roomId, requesterId }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;
    room.pending.delete(requesterId);
    io.to(requesterId).emit("join-denied", { reason: "Host denied the request." });
  });

  socket.on("set-time", ({ roomId, baseTime }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id || room.running) return;
    room.baseTime = Number(baseTime) || 300;
    room.whiteTime = room.baseTime;
    room.blackTime = room.baseTime;
    broadcastState(room);
    emitPresence(room);
  });

  socket.on("start-game", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;
    if (!room.players.black) {
      socket.emit("error-message", { message: "Waiting for opponent to join." });
      return;
    }
    room.running = true;
    startRoomTimer(room);
    broadcastState(room);
    emitPresence(room);
  });

  socket.on("reset-game", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;
    room.chess.reset();
    room.whiteTime = room.baseTime;
    room.blackTime = room.baseTime;
    room.running = false;
    room.lastMove = null;
    room.moves = [];
    stopRoomTimer(room);
    broadcastState(room);
    emitPresence(room);
  });

  socket.on("make-move", ({ roomId, from, to, promotion }) => {
    const room = rooms.get(roomId);
    if (!room || !room.running) return;
    const playerRole = getRole(room, socket.id);
    if (!playerRole || playerRole === "spectator") return;
    if ((playerRole === "white" && room.chess.turn() !== "w") || (playerRole === "black" && room.chess.turn() !== "b")) {
      socket.emit("error-message", { message: "Not your turn." });
      return;
    }
    const move = room.chess.move({ from, to, promotion });
    if (!move) {
      socket.emit("error-message", { message: "Illegal move." });
      return;
    }
    room.lastMove = {
      from: move.from,
      to: move.to,
      piece: move.piece,
      captured: move.captured || null,
      color: move.color
    };
    room.moves.push({
      from: move.from,
      to: move.to,
      piece: move.piece,
      captured: move.captured || null,
      color: move.color
    });
    broadcastState(room);
    emitPresence(room);

    if (room.chess.isCheckmate()) {
      room.running = false;
      stopRoomTimer(room);
      io.to(room.id).emit("game-over", { reason: "Checkmate." });
    } else if (room.chess.isDraw()) {
      room.running = false;
      stopRoomTimer(room);
      io.to(room.id).emit("game-over", { reason: "Draw." });
    }
  });

  socket.on("kick-player", ({ roomId, color }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;
    const targetId = color === "black" ? room.players.black : room.players.white;
    if (!targetId || targetId === room.hostId) return;
    io.to(targetId).emit("kicked", { reason: "You were removed by the host." });
    if (color === "black") room.players.black = null;
    if (color === "white") room.players.white = null;
    room.running = false;
    stopRoomTimer(room);
    broadcastState(room);
    emitPresence(room);
  });

  socket.on("kick-spectators", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;
    for (const spectatorId of room.spectators) {
      io.to(spectatorId).emit("kicked", { reason: "Spectator removed by host." });
    }
    room.spectators.clear();
    emitPresence(room);
    broadcastState(room);
  });

  socket.on("kick-spectator", ({ roomId, spectatorId }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;
    if (!room.spectators.has(spectatorId)) return;
    io.to(spectatorId).emit("kicked", { reason: "Spectator removed by host." });
    room.spectators.delete(spectatorId);
    emitPresence(room);
    broadcastState(room);
  });

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      if (room.hostId === socket.id) {
        stopRoomTimer(room);
        io.to(room.id).emit("room-closed");
        rooms.delete(room.id);
        continue;
      }
      if (room.players.white === socket.id) room.players.white = null;
      if (room.players.black === socket.id) room.players.black = null;
      if (room.spectators.has(socket.id)) room.spectators.delete(socket.id);
      if (room.pending.has(socket.id)) room.pending.delete(socket.id);
      room.running = false;
      stopRoomTimer(room);
      broadcastState(room);
      emitPresence(room);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
