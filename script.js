
import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.0.0/+esm";

const chess = new Chess();
const board = document.querySelector(".board");
const squares = Array.from(board.children);
const whiteCapturedDiv = document.querySelector(".white-captured");
const blackCapturedDiv = document.querySelector(".black-captured");
const statusEl = document.querySelector("#status");
const whiteClockEl = document.querySelector("#whiteClock");
const blackClockEl = document.querySelector("#blackClock");
const startBtn = document.querySelector("#startBtn");
const resetBtn = document.querySelector("#resetBtn");
const timeSelect = document.querySelector("#timeSelect");
const whiteCard = document.querySelector(".player-card.white");
const blackCard = document.querySelector(".player-card.black");
const hostBtn = document.querySelector("#hostBtn");
const joinBtn = document.querySelector("#joinBtn");
const roomInput = document.querySelector("#roomInput");
const spectateToggle = document.querySelector("#spectateToggle");
const roomInfo = document.querySelector("#roomInfo");
const helpBtn = document.querySelector("#helpBtn");
const helpModal = document.querySelector("#helpModal");
const closeHelp = document.querySelector("#closeHelp");

let selectedSquare = null;
let lastMove = null;
let gameActive = false;
let timerId = null;
let whiteTime = 300;
let blackTime = 300;
let audioContext = null;
let onlineMode = false;
let roomId = null;
let role = "local";
let isHost = false;
const socketServerUrl = window.SOCKET_SERVER_URL || "";
const socket = window.io ? window.io(socketServerUrl || undefined) : null;
let lastRemoteMoveKey = null;

const typeMap = { p: "pawn", r: "rook", n: "knight", b: "bishop", q: "queen", k: "king" };

function indexToSquare(index) {
  const row = Math.floor(index / 8);
  const col = index % 8;
  const file = "abcdefgh"[col];
  const rank = 8 - row;
  return `${file}${rank}`;
}

function squareToIndex(square) {
  const file = square[0];
  const rank = Number(square[1]);
  const col = "abcdefgh".indexOf(file);
  const row = 8 - rank;
  return row * 8 + col;
}

function formatTime(seconds) {
  const mins = Math.max(0, Math.floor(seconds / 60));
  const secs = Math.max(0, seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function setClocks() {
  whiteClockEl.textContent = formatTime(whiteTime);
  blackClockEl.textContent = formatTime(blackTime);
}

function updateStatus(message) {
  statusEl.textContent = message;
}

function setRoomInfo(text) {
  roomInfo.textContent = text || "";
}

function setRole(nextRole, nextRoomId, hostFlag) {
  role = nextRole;
  roomId = nextRoomId || roomId;
  isHost = Boolean(hostFlag);
  onlineMode = role !== "local";
  if (onlineMode) {
    const roleLabel = role[0].toUpperCase() + role.slice(1);
    setRoomInfo(`Room ${roomId} • ${roleLabel}`);
    startBtn.disabled = !isHost;
    resetBtn.disabled = !isHost;
    timeSelect.disabled = !isHost;
    stopTimer();
  } else {
    setRoomInfo("");
    startBtn.disabled = false;
    resetBtn.disabled = false;
    timeSelect.disabled = false;
  }
}

function applyRemoteState(state) {
  if (!state) return;
  const moveKey = state.lastMove
    ? `${state.lastMove.from}${state.lastMove.to}${state.lastMove.piece || ""}${state.lastMove.captured || ""}`
    : null;
  const isNewMove = moveKey && moveKey !== lastRemoteMoveKey;
  lastRemoteMoveKey = moveKey;
  if (state.baseTime) {
    const option = Array.from(timeSelect.options).find(opt => Number(opt.value) === Number(state.baseTime));
    if (option) timeSelect.value = option.value;
  }
  chess.load(state.fen);
  whiteTime = state.whiteTime;
  blackTime = state.blackTime;
  gameActive = state.running;
  lastMove = state.lastMove || null;
  if (onlineMode) timeSelect.disabled = !isHost || state.running;
  setClocks();
  renderBoard();
  if (isNewMove && state.lastMove?.captured) {
    flashCaptureSquare(squareToIndex(state.lastMove.to));
    playCaptureSound();
  }
  updateTurnStatus({ skipTimer: true, external: state });
}

function clearHighlights() {
  squares.forEach(square => {
    square.classList.remove("highlight", "move-target", "last-move", "capture-flash");
  });
}

function renderBoard() {
  const boardState = chess.board();
  const lastToIndex = lastMove ? squareToIndex(lastMove.to) : null;

  squares.forEach((square, i) => {
    square.innerHTML = "";
    const row = Math.floor(i / 8);
    const col = i % 8;
    const piece = boardState[row][col];

    if (piece) {
      const color = piece.color === "w" ? "white" : "black";
      const type = typeMap[piece.type];
      const img = document.createElement("img");
      img.src = `./images/${color}-${type}.png`;
      img.alt = `${color} ${type}`;
      img.draggable = false;
      if (lastToIndex === i) img.classList.add("piece-move");
      square.appendChild(img);
    }
  });

  whiteCapturedDiv.innerHTML = "";
  blackCapturedDiv.innerHTML = "";

  const history = chess.history({ verbose: true });
  const whiteCaptured = [];
  const blackCaptured = [];

  history.forEach(move => {
    if (!move.captured) return;
    const colorCaptured = move.color === "w" ? "b" : "w";
    const img = document.createElement("img");
    img.src = `./images/${colorCaptured === "w" ? "white" : "black"}-${typeMap[move.captured]}.png`;
    img.alt = `${colorCaptured} ${move.captured}`;

    if (colorCaptured === "w") whiteCaptured.push(img);
    else blackCaptured.push(img);
  });

  whiteCaptured.forEach(img => whiteCapturedDiv.appendChild(img));
  blackCaptured.forEach(img => blackCapturedDiv.appendChild(img));

  clearHighlights();
  if (lastMove) {
    const fromIndex = squareToIndex(lastMove.from);
    const toIndex = squareToIndex(lastMove.to);
    squares[fromIndex].classList.add("last-move");
    squares[toIndex].classList.add("last-move");
  }
}

function flashCaptureSquare(index) {
  const square = squares[index];
  square.classList.add("capture-flash");
  setTimeout(() => square.classList.remove("capture-flash"), 280);
}

function playCaptureSound() {
  if (!window.AudioContext && !window.webkitAudioContext) return;
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  const now = audioContext.currentTime;
  const master = audioContext.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  master.connect(audioContext.destination);

  const notes = [392, 523.25, 659.25];
  notes.forEach((freq, index) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = now + index * 0.03;
    osc.type = index === 1 ? "sine" : "triangle";
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.12, start + 0.12);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + 0.25);
  });
}

function highlightMoves(fromSquare) {
  clearHighlights();
  const fromIndex = squareToIndex(fromSquare);
  squares[fromIndex].classList.add("highlight");
  const moves = chess.moves({ square: fromSquare, verbose: true });
  moves.forEach(move => {
    const targetIndex = squareToIndex(move.to);
    squares[targetIndex].classList.add("move-target");
  });
}

function startTimer() {
  if (onlineMode) return;
  if (timerId) return;
  timerId = setInterval(() => {
    if (!gameActive) return;
    if (chess.turn() === "w") {
      whiteTime -= 1;
      if (whiteTime <= 0) {
        whiteTime = 0;
        endByTime("White");
      }
    } else {
      blackTime -= 1;
      if (blackTime <= 0) {
        blackTime = 0;
        endByTime("Black");
      }
    }
    setClocks();
  }, 1000);
}

function stopTimer() {
  if (!timerId) return;
  clearInterval(timerId);
  timerId = null;
}

function endByTime(player) {
  gameActive = false;
  stopTimer();
  whiteCard.classList.remove("active");
  blackCard.classList.remove("active");
  updateStatus(`${player} ran out of time. Game over.`);
}

function updateTurnStatus(options = {}) {
  const { skipTimer = false, external } = options;
  if (chess.isCheckmate()) {
    const winner = chess.turn() === "w" ? "Black" : "White";
    updateStatus(`Checkmate. ${winner} wins.`);
    gameActive = false;
    whiteCard.classList.remove("active");
    blackCard.classList.remove("active");
    if (!skipTimer) stopTimer();
    return;
  }
  if (chess.isDraw()) {
    updateStatus("Draw.");
    gameActive = false;
    whiteCard.classList.remove("active");
    blackCard.classList.remove("active");
    if (!skipTimer) stopTimer();
    return;
  }
  const side = chess.turn() === "w" ? "White" : "Black";
  const suffix = chess.isCheck() ? " - Check" : "";
  if (external && external.players && (!external.players.white || !external.players.black)) {
    updateStatus("Waiting for opponent to join...");
  } else if (external && !external.running) {
    updateStatus(isHost ? "Waiting to start..." : "Waiting for host to start...");
  } else {
    updateStatus(`${side} to move${suffix}`);
  }
  whiteCard.classList.toggle("active", chess.turn() === "w");
  blackCard.classList.toggle("active", chess.turn() === "b");
}

function handleClick(index) {
  if (!gameActive) return;
  const squareName = indexToSquare(index);

  if (!selectedSquare) {
    const piece = chess.get(squareName);
    const playerColor = role === "white" ? "w" : role === "black" ? "b" : null;
    if (piece && piece.color === chess.turn() && (!onlineMode || piece.color === playerColor)) {
      selectedSquare = squareName;
      highlightMoves(squareName);
    }
    return;
  }

  if (onlineMode) {
    socket?.emit("make-move", { roomId, from: selectedSquare, to: squareName, promotion: "q" });
    selectedSquare = null;
    clearHighlights();
    return;
  }

  const move = chess.move({ from: selectedSquare, to: squareName, promotion: "q" });
  selectedSquare = null;
  clearHighlights();
  if (move) {
    lastMove = move;
    if (move.captured) {
      flashCaptureSquare(squareToIndex(move.to));
      playCaptureSound();
    }
    renderBoard();
    updateTurnStatus();
  }
}

function resetGame() {
  if (onlineMode) {
    if (isHost) socket?.emit("reset-game", { roomId });
    return;
  }
  chess.reset();
  selectedSquare = null;
  lastMove = null;
  gameActive = false;
  stopTimer();
  const base = Number(timeSelect.value);
  whiteTime = base;
  blackTime = base;
  setClocks();
  updateStatus("Press Start to begin");
  whiteCard.classList.remove("active");
  blackCard.classList.remove("active");
  renderBoard();
}

startBtn.addEventListener("click", () => {
  if (onlineMode) {
    if (isHost) socket?.emit("start-game", { roomId });
    return;
  }
  if (!gameActive) {
    gameActive = true;
    updateTurnStatus();
    startTimer();
  }
});

resetBtn.addEventListener("click", resetGame);

timeSelect.addEventListener("change", () => {
  if (onlineMode) {
    if (isHost && !gameActive) {
      socket?.emit("set-time", { roomId, baseTime: Number(timeSelect.value) });
    }
    return;
  }
  if (!gameActive) {
    const base = Number(timeSelect.value);
    whiteTime = base;
    blackTime = base;
    setClocks();
  }
});

if (!socket) {
  hostBtn.disabled = true;
  joinBtn.disabled = true;
  setRoomInfo("Online disabled (run with server)");
} else {
  hostBtn.addEventListener("click", () => {
    socket.emit("host-room", { baseTime: Number(timeSelect.value) });
  });

  joinBtn.addEventListener("click", () => {
    const code = roomInput.value.trim().toUpperCase();
    if (!code) {
      updateStatus("Enter a room code to join.");
      return;
    }
    socket.emit("request-join", { roomId: code, spectator: Boolean(spectateToggle.checked) });
  });

  socket.on("room-created", ({ roomId: id, role: roomRole, state }) => {
    setRole(roomRole, id, true);
    roomInput.value = id;
    applyRemoteState(state);
  });

  socket.on("room-joined", ({ roomId: id, role: roomRole, state }) => {
    setRole(roomRole, id, false);
    applyRemoteState(state);
  });

  socket.on("room-state", ({ state }) => {
    applyRemoteState(state);
  });

  socket.on("join-request", ({ requesterId, spectator }) => {
    if (!isHost) return;
    const label = spectator ? "spectator" : "player";
    const approve = window.confirm(`Join request (${label}). Allow?`);
    if (approve) socket.emit("approve-join", { roomId, requesterId });
    else socket.emit("deny-join", { roomId, requesterId });
  });

  socket.on("join-denied", ({ reason }) => {
    updateStatus(reason || "Join denied.");
  });

  socket.on("error-message", ({ message }) => {
    updateStatus(message || "Server error.");
  });

  socket.on("game-over", ({ reason }) => {
    updateStatus(reason || "Game over.");
    gameActive = false;
    whiteCard.classList.remove("active");
    blackCard.classList.remove("active");
  });

  socket.on("room-closed", () => {
    updateStatus("Host left. Room closed.");
    setRole("local");
    resetGame();
  });
}

squares.forEach((square, index) => {
  square.addEventListener("click", () => handleClick(index));
});

helpBtn?.addEventListener("click", () => {
  helpModal?.classList.add("open");
  helpModal?.setAttribute("aria-hidden", "false");
});

closeHelp?.addEventListener("click", () => {
  helpModal?.classList.remove("open");
  helpModal?.setAttribute("aria-hidden", "true");
});

helpModal?.addEventListener("click", event => {
  if (event.target === helpModal) {
    helpModal.classList.remove("open");
    helpModal.setAttribute("aria-hidden", "true");
  }
});

resetGame();
  
