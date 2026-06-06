const COLS = 26;
const ROWS = 13;
const Tiles = new Set(['.', '#', 'C', 'W']);

const board = document.querySelector('#board');
const output = document.querySelector('#layout-output');
const statusText = document.querySelector('#status');
const tools = Array.from(document.querySelectorAll('.tool'));

let currentTile = '.';
let isPainting = false;
let grid = createEmptyGrid();

function createEmptyGrid() {
  return Array.from({ length: ROWS }, (_row, y) => {
    return Array.from({ length: COLS }, (_cell, x) => {
      return x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1 ? '#' : '.';
    });
  });
}

function renderBoard() {
  board.innerHTML = '';
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const cell = document.createElement('button');
      cell.className = 'cell';
      cell.type = 'button';
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      cell.dataset.tile = grid[y][x];
      cell.title = `${x},${y} ${grid[y][x]}`;
      cell.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        isPainting = true;
        paintCell(x, y);
      });
      cell.addEventListener('pointerenter', () => {
        if (isPainting) paintCell(x, y);
      });
      board.appendChild(cell);
    }
  }
  updateOutput();
}

function paintCell(x, y) {
  grid[y][x] = currentTile;
  const cell = board.querySelector(`[data-x="${x}"][data-y="${y}"]`);
  if (cell) {
    cell.dataset.tile = currentTile;
    cell.title = `${x},${y} ${currentTile}`;
  }
  updateOutput();
}

function updateOutput() {
  const rows = grid.map((row) => `  '${row.join('')}'`);
  output.value = `const LEVEL_CUSTOM_LAYOUT = [\n${rows.join(',\n')}\n];`;
}

function setStatus(message) {
  statusText.textContent = message;
}

function parseLayout(text) {
  const matches = Array.from(text.matchAll(/'([^']+)'|"([^"]+)"/g));
  const rows = matches.map((match) => match[1] || match[2]);
  if (rows.length !== ROWS) {
    throw new Error(`Need ${ROWS} rows, found ${rows.length}.`);
  }

  return rows.map((row, y) => {
    const chars = row.padEnd(COLS, '.').slice(0, COLS).split('');
    return chars.map((tile, x) => {
      if (y === 0 || y === ROWS - 1 || x === 0 || x === COLS - 1) return '#';
      return Tiles.has(tile) ? tile : '.';
    });
  });
}

function fillBorder() {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) grid[y][x] = '#';
    }
  }
  renderBoard();
  setStatus('Border filled.');
}

function clearMap() {
  grid = createEmptyGrid();
  renderBoard();
  setStatus('Map cleared.');
}

function randomBoxes() {
  for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < COLS - 1; x++) {
      if ((x <= 2 && y <= 2) || (x >= COLS - 3 && y >= ROWS - 3)) continue;
      if (grid[y][x] === '.' && Math.random() < 0.32) grid[y][x] = 'C';
    }
  }
  renderBoard();
  setStatus('Boxes added.');
}

async function copyLayout() {
  updateOutput();
  try {
    await navigator.clipboard.writeText(output.value);
    setStatus('Layout copied.');
  } catch (_error) {
    output.select();
    document.execCommand('copy');
    setStatus('Layout selected/copied.');
  }
}

function importLayout() {
  try {
    grid = parseLayout(output.value);
    renderBoard();
    setStatus('Layout imported.');
  } catch (error) {
    setStatus(error.message);
  }
}

tools.forEach((tool) => {
  tool.addEventListener('click', () => {
    currentTile = tool.dataset.tile;
    tools.forEach((item) => item.classList.toggle('active', item === tool));
  });
});

document.addEventListener('pointerup', () => {
  isPainting = false;
});

document.querySelector('#fill-border').addEventListener('click', fillBorder);
document.querySelector('#clear-map').addEventListener('click', clearMap);
document.querySelector('#random-boxes').addEventListener('click', randomBoxes);
document.querySelector('#copy-layout').addEventListener('click', copyLayout);
document.querySelector('#import-layout').addEventListener('click', importLayout);

renderBoard();
