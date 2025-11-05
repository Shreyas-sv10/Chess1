const U = {
  clone: obj => JSON.parse(JSON.stringify(obj)),
  inside: (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8,
  sqName: (r, c) => 'abcdefgh'[c] + (8 - r),
  parseSq: s => {
    if (!s || s.length !== 2) return null;
    const file = 'abcdefgh'.indexOf(s[0]);
    const rank = 8 - parseInt(s[1], 10);
    if (file < 0 || rank < 0 || rank > 7) return null;
    return [rank, file];
  },
  opposite: color => (color === 'w' ? 'b' : 'w'),
  isUpper: ch => ch === ch.toUpperCase(),
  prettyPiece: (p) => {
    if (!p) return '';
    const map = { 'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚' };
    return p.color === 'w' ? map[p.type].toUpperCase() : map[p.type];
  }
};

const DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

let state = {
  board: null,
  turn: 'w',
  castling: { w: { K: true, Q: true }, b: { K: true, Q: true } },
  enPassant: null,
  halfmoveClock: 0,
  fullmoveNumber: 1,
  history: [],
  future: [],
  selected: null,
  legalHints: true
};

const DOM = {
  boardEl: null,
  historyList: null,
  turnDisplay: null,
  newGameBtn: null,
  themeToggle: null,
  undoBtn: null,
  redoBtn: null,
  resignBtn: null,
  offerDrawBtn: null,
  themeSelect: null,
  pieceSelect: null,
  legalHintsCheckbox: null,
  importBtn: null,
  exportBtn: null,
  whiteClock: null,
  blackClock: null
};

function fenToBoard(fen) {
  const parts = fen.trim().split(/\s+/);
  const boardPart = parts[0];
  const rows = boardPart.split('/');
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 8; r++) {
    const rowStr = rows[r];
    let c = 0;
    for (const ch of rowStr) {
      if (/\d/.test(ch)) {
        c += parseInt(ch, 10);
      } else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        const type = ch.toLowerCase();
        board[r][c] = { type, color, moved: false };
        c++;
      }
    }
  }
  const turn = (parts[1] || 'w');
  const castlingStr = parts[2] || '-';
  const castling = { w: { K: false, Q: false }, b: { K: false, Q: false } };
  if (castlingStr.indexOf('K') >= 0) castling.w.K = true;
  if (castlingStr.indexOf('Q') >= 0) castling.w.Q = true;
  if (castlingStr.indexOf('k') >= 0) castling.b.K = true;
  if (castlingStr.indexOf('q') >= 0) castling.b.Q = true;
  const enPassant = parts[3] && parts[3] !== '-' ? parts[3] : null;
  const half = parseInt(parts[4] || '0', 10);
  const full = parseInt(parts[5] || '1', 10);
  return {
    board, turn, castling, enPassant, halfmoveClock: half, fullmoveNumber: full
  };
}

function boardToFEN(stateObj) {
  let rows = [];
  for (let r = 0; r < 8; r++) {
    let row = '';
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const p = stateObj.board[r][c];
      if (!p) {
        empty++;
      } else {
        if (empty) { row += String(empty); empty = 0; }
        const ch = p.type;
        row += p.color === 'w' ? ch.toUpperCase() : ch;
      }
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  const boardPart = rows.join('/');
  const turn = stateObj.turn;
  const castling = [
    stateObj.castling.w.K ? 'K' : '',
    stateObj.castling.w.Q ? 'Q' : '',
    stateObj.castling.b.K ? 'k' : '',
    stateObj.castling.b.Q ? 'q' : ''
  ].filter(Boolean).join('') || '-';
  const ep = stateObj.enPassant || '-';
  const half = stateObj.halfmoveClock;
  const full = stateObj.fullmoveNumber;
  return `${boardPart} ${turn} ${castling} ${ep} ${half} ${full}`;
}

function initDOM() {
  DOM.boardEl = document.getElementById('chessBoard');
  DOM.historyList = document.getElementById('historyList');
  DOM.turnDisplay = document.getElementById('turnDisplay');
  DOM.newGameBtn = document.getElementById('newGameBtn');
  DOM.themeToggle = document.getElementById('themeToggle');
  DOM.undoBtn = document.getElementById('undoBtn');
  DOM.redoBtn = document.getElementById('redoBtn');
  DOM.resignBtn = document.getElementById('resignBtn');
  DOM.offerDrawBtn = document.getElementById('offerDrawBtn');
  DOM.themeSelect = document.getElementById('themeSelect');
  DOM.pieceSelect = document.getElementById('pieceSelect');
  DOM.legalHintsCheckbox = document.getElementById('legalHints');
  DOM.importBtn = document.getElementById('importBtn');
  DOM.exportBtn = document.getElementById('exportBtn');
  DOM.whiteClock = document.getElementById('whiteClock');
  DOM.blackClock = document.getElementById('blackClock');

  DOM.newGameBtn.addEventListener('click', () => startNewGame());
  DOM.undoBtn.addEventListener('click', undoMove);
  DOM.redoBtn.addEventListener('click', redoMove);
  DOM.resignBtn.addEventListener('click', () => endGame('resign'));
  DOM.offerDrawBtn.addEventListener('click', () => alert('Draw offered (UI only).'));
  DOM.themeToggle.addEventListener('click', toggleTheme);
  DOM.themeSelect.addEventListener('change', applyBoardTheme);
  DOM.pieceSelect.addEventListener('change', applyPieceStyle);
  DOM.legalHintsCheckbox.addEventListener('change', e => {
    state.legalHints = e.target.checked;
    renderBoard();
  });
  DOM.importBtn.addEventListener('click', importPGNDialog);
  DOM.exportBtn.addEventListener('click', exportPGN);

  createBoardSquares();
  attachBoardEvents();
}

function createBoardSquares() {
  DOM.boardEl.innerHTML = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      sq.className = 'square';
      const light = (r + c) % 2 === 0;
      sq.classList.add(light ? 'light' : 'dark');
      const sqName = U.sqName(r, c);
      sq.dataset.square = sqName;
      sq.setAttribute('role', 'button');
      sq.setAttribute('tabindex', '0');
      const pc = document.createElement('div');
      pc.className = 'piece-slot';
      sq.appendChild(pc);
      DOM.boardEl.appendChild(sq);
    }
  }
}

function startNewGame(fen = DEFAULT_FEN) {
  const parsed = fenToBoard(fen);
  state.board = parsed.board;
  state.turn = parsed.turn;
  state.castling = parsed.castling;
  state.enPassant = parsed.enPassant;
  state.halfmoveClock = parsed.halfmoveClock || 0;
  state.fullmoveNumber = parsed.fullmoveNumber || 1;
  state.history = [];
  state.future = [];
  state.selected = null;
  state.legalHints = DOM.legalHintsCheckbox ? DOM.legalHintsCheckbox.checked : true;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = state.board[r][c];
    if (p) p.moved = false;
  }
  refreshUI();
}

function renderBoard() {
  const squares = DOM.boardEl.querySelectorAll('.square');
  squares.forEach(sq => {
    const slot = sq.querySelector('.piece-slot');
    slot.innerHTML = '';
    sq.classList.remove('highlight', 'last-move');
    const existing = sq.querySelectorAll('.legal-hint, .legal-capture');
    existing.forEach(x => x.remove());
  });

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      const name = U.sqName(r, c);
      const sq = DOM.boardEl.querySelector(`.square[data-square="${name}"]`);
      const slot = sq.querySelector('.piece-slot');
      if (p) {
        const pieceEl = document.createElement('div');
        pieceEl.className = 'piece piece-appear';
        pieceEl.dataset.type = p.type;
        pieceEl.dataset.color = p.color;
        pieceEl.dataset.square = name;
        pieceEl.setAttribute('draggable', 'false');
        const styleChoice = (DOM.pieceSelect && DOM.pieceSelect.value) || 'svg';
        if (styleChoice === 'alpha') {
          pieceEl.textContent = p.color === 'w' ? p.type.toUpperCase() : p.type;
          pieceEl.classList.add(p.color === 'w' ? 'white-piece' : 'black-piece');
        } else if (styleChoice === 'emoji') {
          const emojiMap = { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' };
          let ch = emojiMap[p.type] || p.type;
          pieceEl.textContent = ch;
        } else {
          const img = document.createElement('img');
          img.alt = p.type;
          img.draggable = false;
          img.className = p.color === 'w' ? 'white-piece' : 'black-piece';
          const svg = svgForPiece(p.type, p.color);
          img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
          pieceEl.appendChild(img);
        }
        slot.appendChild(pieceEl);
      }
    }
  }

  if (state.history.length > 0) {
    const last = state.history[state.history.length - 1];
    highlightSquare(last.from);
    highlightSquare(last.to);
  }

  if (state.selected && state.legalHints) {
    const legal = getLegalMovesForSquare(state.selected);
    legal.forEach(m => {
      const sq = DOM.boardEl.querySelector(`.square[data-square="${m.to}"]`);
      if (m.capture) {
        const cap = document.createElement('div');
        cap.className = 'legal-capture';
        sq.appendChild(cap);
      } else {
        const dot = document.createElement('div');
        dot.className = 'legal-hint';
        sq.appendChild(dot);
      }
    });
    const selEl = DOM.boardEl.querySelector(`.square[data-square="${state.selected}"]`);
    if (selEl) selEl.classList.add('highlight');
  }

  if (DOM.turnDisplay) DOM.turnDisplay.textContent = (state.turn === 'w' ? 'White to move' : 'Black to move');
  updateMoveList();
}

function highlightSquare(sqName) {
  const el = DOM.boardEl.querySelector(`.square[data-square="${sqName}"]`);
  if (el) el.classList.add('last-move');
}

function svgForPiece(type, color) {
  const fill = color === 'w' ? '#ffffff' : '#0b1220';
  const stroke = color === 'w' ? '#0b1220' : '#ffffff';
  const shapes = {
    p: `<circle cx="50" cy="36" r="12" fill="${fill}" stroke="${stroke}" stroke-width="3"/><rect x="30" y="48" width="40" height="18" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`,
    r: `<rect x="24" y="30" width="56" height="36" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="3"/><rect x="20" y="20" width="12" height="12" fill="${fill}" stroke="${stroke}" stroke-width="3"/><rect x="60" y="20" width="12" height="12" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`,
    n: `<path d="M24 60c0-18 40-20 56-40 0 0-8 36-24 44-10 5-32 10-32-4z" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`,
    b: `<path d="M48 18c-12 10-24 20-28 34 18 6 40 6 58 0-4-16-16-28-30-34z" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`,
    q: `<circle cx="50" cy="26" r="6" fill="${fill}" stroke="${stroke}" stroke-width="3"/><path d="M26 48c12 12 36 12 60 0" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`,
    k: `<path d="M45 18v12" stroke="${stroke}" stroke-width="4" stroke-linecap="round"/><path d="M20 50c18 10 44 10 72 0" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`
  };
  const body = shapes[type] || shapes.p;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' width='200' height='200'>${body}</svg>`;
  return svg;
}

function generateLegalMoves(color) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (!p || p.color !== color) continue;
      const from = U.sqName(r, c);
      const pieceMoves = getPseudoMovesFrom(r, c, p);
      for (const m of pieceMoves) {
        moves.push(Object.assign({ from }, m));
      }
    }
  }
  const legal = moves.filter(m => {
    const simulated = simulateMove(state, m);
    return !isKingInCheck(simulated, state.turn);
  });
  return legal;
}

function getLegalMovesForSquare(sqName) {
  const coords = U.parseSq(sqName);
  if (!coords) return [];
  const [r, c] = coords;
  const p = state.board[r][c];
  if (!p || p.color !== state.turn) return [];
  const pseudo = getPseudoMovesFrom(r, c, p);
  const legal = pseudo.filter(m => {
    const simulated = simulateMove(state, Object.assign({ from: sqName }, m));
    return !isKingInCheck(simulated, state.turn);
  });
  return legal;
}

function getPseudoMovesFrom(r, c, piece) {
  const moves = [];
  const color = piece.color;
  const forward = color === 'w' ? -1 : 1;

  function pushMove(rr, cc, capture = false, meta = {}) {
    if (!U.inside(rr, cc)) return;
    moves.push({
      to: U.sqName(rr, cc),
      piece: piece,
      capture,
      ...meta
    });
  }

  switch (piece.type) {
    case 'p':
      {
        const oneR = r + forward;
        if (U.inside(oneR, c) && !state.board[oneR][c]) {
          if ((color === 'w' && oneR === 0) || (color === 'b' && oneR === 7)) {
            pushMove(oneR, c, false, { promo: 'q' });
          } else {
            pushMove(oneR, c, false);
          }
          const startRank = color === 'w' ? 6 : 1;
          const twoR = r + forward * 2;
          if (r === startRank && !state.board[twoR][c]) {
            pushMove(twoR, c, false, { doublePush: true });
          }
        }
        for (const dc of [-1, 1]) {
          const rr = r + forward, cc = c + dc;
          if (!U.inside(rr, cc)) continue;
          const target = state.board[rr][cc];
          if (target && target.color !== color) {
            if ((color === 'w' && rr === 0) || (color === 'b' && rr === 7)) {
              pushMove(rr, cc, true, { promo: 'q' });
            } else pushMove(rr, cc, true);
          }
          if (state.enPassant) {
            const epCoords = U.parseSq(state.enPassant);
            if (epCoords && epCoords[0] === rr && epCoords[1] === cc) {
              pushMove(rr, cc, true, { enPassant: true });
            }
          }
        }
      }
      break;

    case 'n':
      {
        const deltas = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
        for (const [dr, dc] of deltas) {
          const rr = r + dr, cc = c + dc;
          if (!U.inside(rr, cc)) continue;
          const t = state.board[rr][cc];
          if (!t || t.color !== color) pushMove(rr, cc, !!t);
        }
      }
      break;

    case 'b':
      slideMoves(r, c, piece, [[-1, -1], [-1, 1], [1, -1], [1, 1]]);
      break;

    case 'r':
      slideMoves(r, c, piece, [[-1, 0], [1, 0], [0, -1], [0, 1]]);
      break;

    case 'q':
      slideMoves(r, c, piece, [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]);
      break;

    case 'k':
      {
        const deltas = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
        for (const [dr, dc] of deltas) {
          const rr = r + dr, cc = c + dc;
          if (!U.inside(rr, cc)) continue;
          const t = state.board[rr][cc];
          if (!t || t.color !== color) pushMove(rr, cc, !!t);
        }
        const castleSide = state.castling[color === 'w' ? 'w' : 'b'];
        if (!piece.moved) {
          if (castleSide.K) {
            const row = color === 'w' ? 7 : 0;
            if (!state.board[row][5] && !state.board[row][6]) {
              pushMove(row, 6, false, { castle: 'K' });
            }
          }
          if (castleSide.Q) {
            const row = color === 'w' ? 7 : 0;
            if (!state.board[row][1] && !state.board[row][2] && !state.board[row][3]) {
              pushMove(row, 2, false, { castle: 'Q' });
            }
          }
        }
      }
      break;
  }

  return moves;

  function slideMoves(rr0, cc0, pieceX, directions) {
    for (const [dr, dc] of directions) {
      let rr = rr0 + dr, cc = cc0 + dc;
      while (U.inside(rr, cc)) {
        const t = state.board[rr][cc];
        if (!t) {
          pushMove(rr, cc, false);
        } else {
          if (t.color !== pieceX.color) pushMove(rr, cc, true);
          break;
        }
        rr += dr; cc += dc;
      }
    }
  }
}

function simulateMove(s, move) {
  const clone = U.clone(s);
  const [fr, fc] = U.parseSq(move.from);
  const [tr, tc] = U.parseSq(move.to);
  const moving = clone.board[fr][fc];
  clone.board[tr][tc] = moving ? U.clone(moving) : null;
  clone.board[fr][fc] = null;
  if (move.enPassant) {
    const dir = moving.color === 'w' ? 1 : -1;
    const capR = tr + dir;
    clone.board[capR][tc] = null;
  }
  if (move.castle) {
    if (move.castle === 'K') {
      const row = moving.color === 'w' ? 7 : 0;
      clone.board[row][5] = clone.board[row][7];
      clone.board[row][7] = null;
    } else {
      const row = moving.color === 'w' ? 7 : 0;
      clone.board[row][3] = clone.board[row][0];
      clone.board[row][0] = null;
    }
  }
  if (move.promo) {
    clone.board[tr][tc].type = move.promo;
  }
  clone.enPassant = null;
  if (move.doublePush) {
    const step = moving.color === 'w' ? -1 : 1;
    clone.enPassant = U.sqName(tr - step, tc);
  }
  clone.turn = U.opposite(clone.turn);
  if (moving.type === 'k') {
    clone.castling[moving.color] = { K: false, Q: false };
  } else if (moving.type === 'r') {
    if (move.from === (moving.color === 'w' ? 'a1' : 'a8')) clone.castling[moving.color].Q = false;
    if (move.from === (moving.color === 'w' ? 'h1' : 'h8')) clone.castling[moving.color].K = false;
  }
  if (moving.type === 'p' || move.capture) clone.halfmoveClock = 0;
  else clone.halfmoveClock = (clone.halfmoveClock || 0) + 1;
  if (clone.turn === 'w') clone.fullmoveNumber = (clone.fullmoveNumber || 1) + 1;
  return clone;
}

function findKing(s, color) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = s.board[r][c];
    if (p && p.type === 'k' && p.color === color) return [r, c];
  }
  return null;
}

function isKingInCheck(s, color) {
  const kpos = findKing(s, color);
  if (!kpos) return false;
  const [kr, kc] = kpos;
  const enemy = U.opposite(color);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = s.board[r][c];
      if (!p || p.color !== enemy) continue;
      const pseud = getPseudoMovesFromWithBoard(r, c, p, s);
      for (const m of pseud) {
        if (m.to === U.sqName(kr, kc)) return true;
      }
    }
  }
  return false;
}

function getPseudoMovesFromWithBoard(r, c, piece, s) {
  const moves = [];
  const color = piece.color;
  const forward = color === 'w' ? -1 : 1;

  function pushMove(rr, cc, capture = false, meta = {}) {
    if (!U.inside(rr, cc)) return;
    moves.push({
      to: U.sqName(rr, cc),
      piece: piece,
      capture,
      ...meta
    });
  }

  const boardLocal = s.board;

  switch (piece.type) {
    case 'p':
      {
        const oneR = r + forward;
        if (U.inside(oneR, c) && !boardLocal[oneR][c]) {
          pushMove(oneR, c, false);
          const startRank = color === 'w' ? 6 : 1;
          const twoR = r + forward * 2;
          if (r === startRank && !boardLocal[twoR][c]) {
            pushMove(twoR, c, false, { doublePush: true });
          }
        }
        for (const dc of [-1, 1]) {
          const rr = r + forward, cc = c + dc;
          if (!U.inside(rr, cc)) continue;
          const target = boardLocal[rr][cc];
          if (target && target.color !== color) pushMove(rr, cc, true);
          if (s.enPassant) {
            const epCoords = U.parseSq(s.enPassant);
            if (epCoords && epCoords[0] === rr && epCoords[1] === cc) {
              pushMove(rr, cc, true, { enPassant: true });
            }
          }
        }
      }
      break;

    case 'n':
      {
        const deltas = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
        for (const [dr, dc] of deltas) {
          const rr = r + dr, cc = c + dc;
          if (!U.inside(rr, cc)) continue;
          const t = boardLocal[rr][cc];
          if (!t || t.color !== color) pushMove(rr, cc, !!t);
        }
      }
      break;

    case 'b':
      slideLocal([[ -1, -1 ], [ -1, 1 ], [ 1, -1 ], [ 1, 1 ]]);
      break;
    case 'r':
      slideLocal([[ -1, 0 ], [ 1, 0 ], [ 0, -1 ], [ 0, 1 ]]);
      break;
    case 'q':
      slideLocal([[ -1, 0 ], [ 1, 0 ], [ 0, -1 ], [ 0, 1 ], [ -1, -1 ], [ -1, 1 ], [ 1, -1 ], [ 1, 1 ]]);
      break;
    case 'k':
      {
        const deltas = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
        for (const [dr, dc] of deltas) {
          const rr = r + dr, cc = c + dc;
          if (!U.inside(rr, cc)) continue;
          const t = boardLocal[rr][cc];
          if (!t || t.color !== color) pushMove(rr, cc, !!t);
        }
      }
      break;
  }

  return moves;

  function slideLocal(dirs) {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (U.inside(rr, cc)) {
        const t = boardLocal[rr][cc];
        if (!t) {
          pushMove(rr, cc, false);
        } else {
          if (t.color !== piece.color) pushMove(rr, cc, true);
          break;
        }
        rr += dr; cc += dc;
      }
    }
  }
}

function makeMove(move, options = {}) {
  const from = move.from;
  const to = move.to;
  const [fr, fc] = U.parseSq(from);
  const [tr, tc] = U.parseSq(to);
  const moving = state.board[fr][fc];
  if (!moving) return false;
  const target = state.board[tr][tc];
  const fenBefore = boardToFEN(state);
  state.board[tr][tc] = moving;
  state.board[fr][fc] = null;
  if (move.enPassant) {
    const dir = moving.color === 'w' ? 1 : -1;
    const capR = tr + dir;
    state.board[capR][tc] = null;
  }
  if (move.castle) {
    if (move.castle === 'K') {
      const row = moving.color === 'w' ? 7 : 0;
      state.board[row][5] = state.board[row][7];
      state.board[row][7] = null;
    } else {
      const row = moving.color === 'w' ? 7 : 0;
      state.board[row][3] = state.board[row][0];
      state.board[row][0] = null;
    }
  }
  if (move.promo) {
    state.board[tr][tc] = { type: move.promo, color: moving.color, moved: true };
  } else {
    state.board[tr][tc].moved = true;
  }
  if (moving.type === 'k') {
    state.castling[moving.color] = { K: false, Q: false };
  } else if (moving.type === 'r') {
    if (from === (moving.color === 'w' ? 'a1' : 'a8')) state.castling[moving.color].Q = false;
    if (from === (moving.color === 'w' ? 'h1' : 'h8')) state.castling[moving.color].K = false;
  }
  if (target && target.type === 'r') {
    if (to === (target.color === 'w' ? 'a1' : 'a8')) state.castling[target.color].Q = false;
    if (to === (target.color === 'w' ? 'h1' : 'h8')) state.castling[target.color].K = false;
  }
  state.enPassant = null;
  if (move.doublePush) {
    const step = moving.color === 'w' ? -1 : 1;
    state.enPassant = U.sqName(tr - step, tc);
  }
  if (moving.type === 'p' || move.capture) state.halfmoveClock = 0;
  else state.halfmoveClock++;
  if (state.turn === 'b') state.fullmoveNumber++;
  state.turn = U.opposite(state.turn);

  if (options.recordHistory !== false) {
    const san = simpleSAN(move, target);
    state.history.push({ from, to, piece: moving, capture: !!move.capture, promo: move.promo || null, san, fenBefore });
    state.future = [];
  }

  state.selected = null;
  refreshUI();
  return true;
}

function simpleSAN(move, capturedPiece) {
  const pieceLetter = move.piece.type === 'p' ? '' : move.piece.type.toUpperCase();
  const captureMark = move.capture || capturedPiece ? 'x' : '';
  const promo = move.promo ? '=' + move.promo.toUpperCase() : '';
  const to = move.to;
  const simulated = simulateMove(state, move);
  const enemy = simulated.turn;
  const isCheck = isKingInCheck(simulated, enemy);
  const checkMark = isCheck ? '+' : '';
  return `${pieceLetter}${captureMark}${to}${promo}${checkMark}`;
}

function undoMove() {
  if (state.history.length === 0) return;
  const last = state.history.pop();
  const fen = last.fenBefore;
  state.future.push(boardToFEN(state));
  const parsed = fenToBoard(fen);
  state.board = parsed.board;
  state.turn = parsed.turn;
  state.castling = parsed.castling;
  state.enPassant = parsed.enPassant;
  state.halfmoveClock = parsed.halfmoveClock;
  state.fullmoveNumber = parsed.fullmoveNumber;
  state.selected = null;
  refreshUI();
}

function redoMove() {
  if (state.future.length === 0) return;
  const fen = state.future.pop();
  const parsed = fenToBoard(fen);
  state.board = parsed.board;
  state.turn = parsed.turn;
  state.castling = parsed.castling;
  state.enPassant = parsed.enPassant;
  state.halfmoveClock = parsed.halfmoveClock;
  state.fullmoveNumber = parsed.fullmoveNumber;
  refreshUI();
}

let dragState = {
  draggingEl: null,
  origin: null,
  offsetX: 0,
  offsetY: 0
};

function attachBoardEvents() {
  DOM.boardEl.addEventListener('click', (ev) => {
    const sq = ev.target.closest('.square');
    if (!sq) return;
    const sqName = sq.dataset.square;
    onSquareClicked(sqName);
  });

  DOM.boardEl.addEventListener('keydown', ev => {
    const el = document.activeElement;
    if (!el || !el.classList.contains('square')) return;
    if (ev.key === 'Enter' || ev.key === ' ') {
      onSquareClicked(el.dataset.square);
      ev.preventDefault();
    }
  });

  DOM.boardEl.addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);
  DOM.boardEl.addEventListener('dragstart', e => e.preventDefault());
}

function pointerDown(ev) {
  const sq = ev.target.closest('.square');
  if (!sq) return;
  const pieceEl = sq.querySelector('.piece');
  if (!pieceEl) return;
  const sqName = sq.dataset.square;
  const coords = U.parseSq(sqName);
  const p = state.board[coords[0]][coords[1]];
  if (!p || p.color !== state.turn) return;
  dragState.origin = sqName;
  dragState.draggingEl = pieceEl.cloneNode(true);
  dragState.draggingEl.classList.add('dragging');
  document.body.appendChild(dragState.draggingEl);
  const rect = pieceEl.getBoundingClientRect();
  dragState.offsetX = ev.clientX - rect.left;
  dragState.offsetY = ev.clientY - rect.top;
  moveDragElement(ev.clientX, ev.clientY);
  const originSq = DOM.boardEl.querySelector(`.square[data-square="${sqName}"]`);
  if (originSq) originSq.classList.add('highlight');
  ev.preventDefault();
}

function pointerMove(ev) {
  if (!dragState.draggingEl) return;
  moveDragElement(ev.clientX, ev.clientY);
}

function pointerUp(ev) {
  if (!dragState.draggingEl) return;
  const elUnder = document.elementFromPoint(ev.clientX, ev.clientY);
  const targetSq = elUnder ? elUnder.closest('.square') : null;
  const from = dragState.origin;
  const to = targetSq ? targetSq.dataset.square : null;
  if (from && to && from !== to) {
    attemptMoveFromTo(from, to);
  }
  dragState.draggingEl.remove();
  dragState.draggingEl = null;
  const originSq = DOM.boardEl.querySelector(`.square[data-square="${from}"]`);
  if (originSq) originSq.classList.remove('highlight');
  dragState.origin = null;
}

function moveDragElement(clientX, clientY) {
  const el = dragState.draggingEl;
  if (!el) return;
  el.style.left = (clientX - dragState.offsetX + el.offsetWidth / 2) + 'px';
  el.style.top = (clientY - dragState.offsetY + el.offsetHeight / 2) + 'px';
}

function onSquareClicked(sqName) {
  const sel = state.selected;
  const coords = U.parseSq(sqName);
  const p = coords ? state.board[coords[0]][coords[1]] : null;
  if (!sel) {
    if (p && p.color === state.turn) {
      state.selected = sqName;
      renderBoard();
    }
    return;
  }
  if (sel === sqName) {
    state.selected = null;
    renderBoard();
    return;
  }
  attemptMoveFromTo(sel, sqName);
}

function attemptMoveFromTo(from, to) {
  const legal = getLegalMovesForSquare(from);
  const chosen = legal.find(m => m.to === to);
  if (!chosen) {
    const coords = U.parseSq(to);
    const p = coords ? state.board[coords[0]][coords[1]] : null;
    if (p && p.color === state.turn) {
      state.selected = to;
      renderBoard();
      return;
    }
    flashSquare(to);
    return;
  }
  if (chosen.promo) {
    const choice = prompt("Pawn promotion! Type q,r,b,n (default q):", "q");
    const promo = (choice && choice[0]) ? choice[0].toLowerCase() : 'q';
    chosen.promo = promo;
  }
  chosen.capture = chosen.capture || (state.board[U.parseSq(chosen.to)[0]][U.parseSq(chosen.to)[1]] !== null);
  makeMove(chosen, { recordHistory: true });
}

function flashSquare(sqName) {
  const el = DOM.boardEl.querySelector(`.square[data-square="${sqName}"]`);
  if (!el) return;
  const prev = el.style.boxShadow;
  el.style.boxShadow = '0 0 0 4px rgba(239,68,68,0.28)';
  setTimeout(() => el.style.boxShadow = prev, 300);
}

function updateMoveList() {
  if (!DOM.historyList) return;
  DOM.historyList.innerHTML = '';
  for (let i = 0; i < state.history.length; i += 2) {
    const white = state.history[i];
    const black = state.history[i + 1];
    const moveNum = (i / 2) + 1;
    const whiteSAN = white ? white.san : '';
    const blackSAN = black ? black.san : '';
    const li = document.createElement('li');
    li.textContent = `${moveNum}. ${whiteSAN} ${blackSAN}`;
    DOM.historyList.appendChild(li);
  }
}

function exportPGN() {
  let header = `[Event "Ultimate Chess"]\n[Site "Local"]\n[Date "${new Date().toISOString().slice(0,10)}"]\n[Round "-"]\n[White "White"]\n[Black "Black"]\n[Result "*"]\n\n`;
  const moves = state.history.map(h => h.san);
  let pgnMoves = '';
  for (let i = 0; i < moves.length; i += 2) {
    const num = (i / 2) + 1;
    const w = moves[i] || '';
    const b = moves[i + 1] || '';
    pgnMoves += `${num}. ${w} ${b} `;
  }
  const full = header + pgnMoves + '\n\n';
  copyToClipboard(full);
  alert('PGN exported to clipboard (basic).');
}

function importPGNDialog() {
  const pgn = prompt('Paste PGN or SAN sequence here (basic):');
  if (!pgn) return;
  const tokens = pgn.replace(/\{[^}]*\}/g, '').replace(/\([^\)]*\)/g, '').replace(/\d+\./g, '').replace(/\n/g, ' ').trim().split(/\s+/);
  startNewGame(DEFAULT_FEN);
  for (const token of tokens) {
    if (!token || token === '*') continue;
    if (/^(1-0|0-1|1\/2-1\/2)$/.test(token)) break;
    const legal = generateLegalMoves(state.turn);
    const found = legal.find(m => {
      const san = simpleSAN(m, state.board[U.parseSq(m.to)[0]][U.parseSq(m.to)[1]]);
      const s1 = san.replace(/\+|#/g, '');
      const s2 = token.replace(/\+|#/g, '');
      return s1 === s2 || s1.endsWith(s2) || s2.endsWith(s1);
    });
    if (found) {
      makeMove(found, { recordHistory: true });
    } else {
      console.warn('Could not parse or play token:', token);
      break;
    }
  }
  refreshUI();
}

function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(e => {
      fallbackCopyTextToClipboard(text);
    });
  } else fallbackCopyTextToClipboard(text);
}

function fallbackCopyTextToClipboard(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

function refreshUI() {
  renderBoard();
  DOM.undoBtn.disabled = state.history.length === 0;
  DOM.redoBtn.disabled = state.future.length === 0;
  if (DOM.whiteClock) DOM.whiteClock.textContent = `White: ${formatClockText(600)}`;
  if (DOM.blackClock) DOM.blackClock.textContent = `Black: ${formatClockText(600)}`;
  const legal = generateLegalMoves(state.turn);
  if (legal.length === 0) {
    if (isKingInCheck(state, state.turn)) {
      showGameEnd(`${state.turn === 'w' ? 'White' : 'Black'} is checkmated — ${U.opposite(state.turn)} wins`);
    } else {
      showGameEnd('Stalemate (draw)');
    }
  }
            }
function formatClockText(sec) {
  const mm = Math.floor(sec / 60).toString().padStart(2, '0');
  const ss = (sec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

function showGameEnd(msg) {
  const banner = document.createElement('div');
  banner.className = 'game-end-banner';
  banner.textContent = msg;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 5000);
}

function toggleTheme() {
  const body = document.body;
  const themes = ['board-theme-classic', 'board-theme-glass', 'board-theme-neon', 'board-theme-minimal'];
  const current = themes.find(t => body.classList.contains(t));
  let idx = current ? themes.indexOf(current) : -1;
  if (idx >= 0) body.classList.remove(themes[idx]);
  idx = (idx + 1) % themes.length;
  body.classList.add(themes[idx]);
}

function applyBoardTheme() {
  const sel = (DOM.themeSelect && DOM.themeSelect.value) || 'minimal';
  const body = document.body;
  body.classList.remove('board-theme-classic', 'board-theme-glass', 'board-theme-neon', 'board-theme-minimal');
  body.classList.add(sel === 'classic' ? 'board-theme-classic' : sel === 'glass' ? 'board-theme-glass' : sel === 'neon' ? 'board-theme-neon' : 'board-theme-minimal');
}

function applyPieceStyle() {
  const sel = (DOM.pieceSelect && DOM.pieceSelect.value) || 'svg';
  const boardWrap = document.querySelector('body');
  boardWrap.classList.remove('pieces-style-alpha', 'pieces-style-svg', 'pieces-style-emoji');
  boardWrap.classList.add(sel === 'alpha' ? 'pieces-style-alpha' : sel === 'emoji' ? 'pieces-style-emoji' : 'pieces-style-svg');
  renderBoard();
}

function endGame(reason) {
  if (reason === 'resign') {
    const loser = state.turn === 'w' ? 'White' : 'Black';
    const winner = U.opposite(state.turn) === 'w' ? 'White' : 'Black';
    showGameEnd(`${loser} resigned — ${winner} wins`);
    DOM.boardEl.style.pointerEvents = 'none';
  }
}

function init() {
  initDOM();
  applyBoardTheme();
  applyPieceStyle();
  startNewGame(DEFAULT_FEN);
  console.info('Ultimate Chess: ready. Start playing!');
}

document.addEventListener('DOMContentLoaded', init);
  
