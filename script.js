// script.js
import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.0.0/+esm";

// initialize chess logic
const chess = new Chess();
const board = document.querySelector(".chess-board");

let selectedSquare = null;

// Get all board squares (your HTML divs)
const squares = Array.from(board.children);

// Helper to get chess notation (a1, b2, etc.) from index
function indexToSquare(index) {
  const row = Math.floor(index / 8);
  const col = index % 8;
  const file = "abcdefgh"[col];
  const rank = 8 - row;
  return `${file}${rank}`;
}

// Render board pieces based on current chess state
function renderBoard() {
  const boardState = chess.board().flat();
  squares.forEach((square, i) => {
    square.innerHTML = ""; // clear old pieces
    const piece = boardState[i];
    if (piece) {
      const color = piece.color === "w" ? "white" : "black";
      const type = {
        p: "pawn",
        r: "rook",
        n: "knight",
        b: "bishop",
        q: "queen",
        k: "king"
      }[piece.type];

      const img = document.createElement("img");
      img.src = `./images/${color}-${type}.png`;
      img.alt = `${color} ${type}`;
      img.draggable = false;
      square.appendChild(img);
    }
  });
}

// Handle clicking on squares
function handleClick(index) {
  const squareName = indexToSquare(index);

  if (!selectedSquare) {
    // select a square if it has a piece of the current player's turn
    const piece = chess.get(squareName);
    if (piece && piece.color === chess.turn()) {
      selectedSquare = squareName;
      squares[index].style.outline = "3px solid yellow";
    }
  } else {
    // attempt move
    const move = chess.move({ from: selectedSquare, to: squareName });
    squares.forEach(sq => (sq.style.outline = ""));
    selectedSquare = null;

    if (move) {
      renderBoard();
      if (chess.isCheckmate()) alert("Checkmate! Game Over.");
      else if (chess.isDraw()) alert("Draw!");
    }
  }
}

// Add click listeners
squares.forEach((square, index) => {
  square.addEventListener("click", () => handleClick(index));
});

// Initial render
renderBoard();
