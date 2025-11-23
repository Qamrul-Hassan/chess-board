
    import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.0.0/+esm";

    const chess = new Chess();
    const board = document.querySelector(".board");
    const squares = Array.from(board.children);

    const whiteCapturedDiv = document.querySelector(".white-captured");
    const blackCapturedDiv = document.querySelector(".black-captured");

    let selectedSquare = null;

    function indexToSquare(index) {
      const row = Math.floor(index / 8);
      const col = index % 8;
      const file = "abcdefgh"[col];
      const rank = 8 - row;
      return `${file}${rank}`;
    }

    function renderBoard() {
      const boardState = chess.board();

      // Clear board
      squares.forEach((square, i) => {
        square.innerHTML = "";
        const row = Math.floor(i / 8);
        const col = i % 8;
        const piece = boardState[row][col];

        if (piece) {
          const color = piece.color === "w" ? "white" : "black";
          const typeMap = { p: "pawn", r: "rook", n: "knight", b: "bishop", q: "queen", k: "king" };
          const type = typeMap[piece.type];

          const img = document.createElement("img");
          img.src = `./Images/${color}-${type}.png`;
          img.alt = `${color} ${type}`;
          img.draggable = false;
          square.appendChild(img);
        }
      });

      // Reset captured areas
      whiteCapturedDiv.innerHTML = "";
      blackCapturedDiv.innerHTML = "";

      // Track captured pieces
      const history = chess.history({ verbose: true });
      const whiteCaptured = [];
      const blackCaptured = [];

      history.forEach(move => {
        if (move.captured) {
          const colorCaptured = move.captured === move.color ? move.color : (move.color === "w" ? "b" : "w");
          const typeMap = { p: "pawn", r: "rook", n: "knight", b: "bishop", q: "queen", k: "king" };
          const img = document.createElement("img");
          img.src = `./Images/${colorCaptured === "w" ? "white" : "black"}-${typeMap[move.captured]}.png`;
          img.alt = `${colorCaptured} ${move.captured}`;

          if (colorCaptured === "w") whiteCaptured.push(img);
          else blackCaptured.push(img);
        }
      });

      whiteCaptured.forEach(img => whiteCapturedDiv.appendChild(img));
      blackCaptured.forEach(img => blackCapturedDiv.appendChild(img));
    }

    function handleClick(index) {
      const squareName = indexToSquare(index);
      squares.forEach(sq => sq.style.outline = "");

      if (!selectedSquare) {
        const piece = chess.get(squareName);
        if (piece && piece.color === chess.turn()) {
          selectedSquare = squareName;
          squares[index].style.outline = "3px solid yellow";
        }
      } else {
        const move = chess.move({ from: selectedSquare, to: squareName, promotion: "q" });
        selectedSquare = null;
        if (move) renderBoard();

        if (chess.isCheckmate()) alert("Checkmate! Game Over.");
        else if (chess.isDraw()) alert("Draw!");
      }
    }

    squares.forEach((square, index) => {
      square.addEventListener("click", () => handleClick(index));
    });

    renderBoard();
  
