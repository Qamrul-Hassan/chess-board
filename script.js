
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

let selectedSquare = null;
let lastMove = null;
let gameActive = false;
let timerId = null;
let whiteTime = 300;
let blackTime = 300;

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

function clearHighlights() {
  squares.forEach(square => {
    square.classList.remove("highlight", "move-target", "last-move");
  });
}

function renderBoard() {
  const boardState = chess.board();

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

function updateTurnStatus() {
  if (chess.isCheckmate()) {
    const winner = chess.turn() === "w" ? "Black" : "White";
    updateStatus(`Checkmate. ${winner} wins.`);
    gameActive = false;
    whiteCard.classList.remove("active");
    blackCard.classList.remove("active");
    stopTimer();
    return;
  }
  if (chess.isDraw()) {
    updateStatus("Draw.");
    gameActive = false;
    whiteCard.classList.remove("active");
    blackCard.classList.remove("active");
    stopTimer();
    return;
  }
  const side = chess.turn() === "w" ? "White" : "Black";
  const suffix = chess.isCheck() ? " - Check" : "";
  updateStatus(`${side} to move${suffix}`);
  whiteCard.classList.toggle("active", chess.turn() === "w");
  blackCard.classList.toggle("active", chess.turn() === "b");
}

function handleClick(index) {
  if (!gameActive) return;
  const squareName = indexToSquare(index);

  if (!selectedSquare) {
    const piece = chess.get(squareName);
    if (piece && piece.color === chess.turn()) {
      selectedSquare = squareName;
      highlightMoves(squareName);
    }
    return;
  }

  const move = chess.move({ from: selectedSquare, to: squareName, promotion: "q" });
  selectedSquare = null;
  clearHighlights();
  if (move) {
    lastMove = move;
    renderBoard();
    updateTurnStatus();
  }
}

function resetGame() {
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
  if (!gameActive) {
    gameActive = true;
    updateTurnStatus();
    startTimer();
  }
});

resetBtn.addEventListener("click", resetGame);

timeSelect.addEventListener("change", () => {
  if (!gameActive) {
    const base = Number(timeSelect.value);
    whiteTime = base;
    blackTime = base;
    setClocks();
  }
});

squares.forEach((square, index) => {
  square.addEventListener("click", () => handleClick(index));
});

resetGame();
  
