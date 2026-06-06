const COLS = 26;
const ROWS = 13;
const Tiles = new Set(['.', '#', 'C', 'W']);

const board = document.querySelector('#board');
const output = document.querySelector('#layout-output');
const statusText = document.querySelector('#status');
const tools = Array.from(document.querySelectorAll('.tool'));
const mapTypeInput = document.querySelector('#map-type');
const mapNameInput = document.querySelector('#map-name');
const savedMaps = document.querySelector('#saved-maps');
const assetUpload = document.querySelector('#asset-upload');
const uploadedAssets = document.querySelector('#uploaded-assets');
const StorageKey = 'bombOnline.savedMaps';
const AssetStorageKey = 'bombOnline.uploadedAssets';

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
  output.value = `const ${layoutConstName()} = [\n${rows.join(',\n')}\n];`;
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

function layoutConstName() {
  const name = normalizeMapName(mapNameInput.value || 'custom');
  return `${name.toUpperCase()}_LAYOUT`;
}

function normalizeMapName(value) {
  return String(value || 'custom')
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'custom';
}

function readSavedMaps() {
  try {
    return JSON.parse(localStorage.getItem(StorageKey) || '[]');
  } catch (_error) {
    return [];
  }
}

function writeSavedMaps(maps) {
  localStorage.setItem(StorageKey, JSON.stringify(maps));
}

function saveMap() {
  const type = mapTypeInput.value;
  const name = normalizeMapName(mapNameInput.value);
  const layout = grid.map((row) => row.join(''));
  const maps = readSavedMaps();
  const existingIndex = maps.findIndex((map) => map.type === type && map.name === name);
  const entry = {
    type,
    name,
    layout,
    updatedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    maps[existingIndex] = entry;
  } else {
    maps.unshift(entry);
  }

  writeSavedMaps(maps);
  renderSavedMaps();
  updateOutput();
  setStatus(`Saved ${type}/${name}.`);
}

function loadSavedMap(map) {
  mapTypeInput.value = map.type;
  mapNameInput.value = map.name;
  grid = parseLayout(map.layout.map((row) => `'${row}'`).join('\n'));
  renderBoard();
  setStatus(`Loaded ${map.type}/${map.name}.`);
}

function deleteSavedMap(map) {
  const maps = readSavedMaps().filter((item) => item.type !== map.type || item.name !== map.name);
  writeSavedMaps(maps);
  renderSavedMaps();
  setStatus(`Deleted ${map.type}/${map.name}.`);
}

function renderSavedMaps() {
  const maps = readSavedMaps();
  savedMaps.innerHTML = '';
  maps.forEach((map) => {
    const row = document.createElement('div');
    row.className = 'saved-map';

    const loadButton = document.createElement('button');
    loadButton.type = 'button';
    loadButton.textContent = `${map.type}/${map.name}`;
    loadButton.addEventListener('click', () => loadSavedMap(map));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => deleteSavedMap(map));

    row.append(loadButton, deleteButton);
    savedMaps.appendChild(row);
  });
}

function readUploadedAssets() {
  try {
    return JSON.parse(localStorage.getItem(AssetStorageKey) || '[]');
  } catch (_error) {
    return [];
  }
}

function writeUploadedAssets(assets) {
  localStorage.setItem(AssetStorageKey, JSON.stringify(assets));
}

function uploadAssets(files) {
  const accepted = Array.from(files).filter((file) => {
    return file.type === 'image/png' || file.type === 'image/gif';
  });
  if (accepted.length === 0) {
    setStatus('Only PNG/GIF files are accepted.');
    return;
  }

  Promise.all(accepted.map(readAssetFile))
    .then((assets) => {
      const current = readUploadedAssets();
      writeUploadedAssets([...assets, ...current].slice(0, 20));
      renderUploadedAssets();
      setStatus(`Uploaded ${assets.length} asset(s).`);
      assetUpload.value = '';
    })
    .catch((error) => setStatus(error.message));
}

function readAssetFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        resolve({
          id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
          name: file.name,
          type: file.type,
          width: image.naturalWidth,
          height: image.naturalHeight,
          dataUrl: reader.result
        });
      };
      image.onerror = () => reject(new Error(`Cannot read ${file.name}.`));
      image.src = reader.result;
    };
    reader.onerror = () => reject(new Error(`Cannot load ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function renderUploadedAssets() {
  const assets = readUploadedAssets();
  uploadedAssets.innerHTML = '';
  assets.forEach((asset) => {
    const row = document.createElement('div');
    row.className = 'uploaded-asset';

    const meta = document.createElement('div');
    meta.className = 'uploaded-meta';
    const name = document.createElement('div');
    name.className = 'uploaded-name';
    name.textContent = asset.name;
    const size = document.createElement('div');
    size.className = 'uploaded-size';
    size.textContent = `${asset.width} x ${asset.height} - tile 48px / boss 96px`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => deleteUploadedAsset(asset.id));
    meta.append(name, size, remove);

    const preview = document.createElement('div');
    preview.className = 'uploaded-preview';
    preview.append(createPreviewImage(asset, 'preview-tile'), createPreviewImage(asset, 'preview-large'));

    row.append(meta, preview);
    uploadedAssets.appendChild(row);
  });
}

function createPreviewImage(asset, className) {
  const image = document.createElement('img');
  image.className = className;
  image.src = asset.dataUrl;
  image.alt = asset.name;
  return image;
}

function deleteUploadedAsset(assetId) {
  writeUploadedAssets(readUploadedAssets().filter((asset) => asset.id !== assetId));
  renderUploadedAssets();
  setStatus('Asset deleted.');
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
document.querySelector('#save-map').addEventListener('click', saveMap);
assetUpload.addEventListener('change', () => uploadAssets(assetUpload.files));
mapNameInput.addEventListener('input', updateOutput);

renderBoard();
renderSavedMaps();
renderUploadedAssets();
