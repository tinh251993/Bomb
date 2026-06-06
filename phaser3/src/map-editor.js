const COLS = 26;
const ROWS = 13;
const Tiles = new Set(['.', '#', 'C', 'W']);

const board = document.querySelector('#board');
const output = document.querySelector('#layout-output');
const statusText = document.querySelector('#status');
const tools = Array.from(document.querySelectorAll('.tool'));
const objectTools = Array.from(document.querySelectorAll('.object-tool'));
const mapTypeInput = document.querySelector('#map-type');
const mapNameInput = document.querySelector('#map-name');
const savedMaps = document.querySelector('#saved-maps');
const assetUpload = document.querySelector('#asset-upload');
const uploadedAssets = document.querySelector('#uploaded-assets');
const placedObjects = document.querySelector('#placed-objects');
const StorageKey = 'bombOnline.savedMaps';
const AssetStorageKey = 'bombOnline.uploadedAssets';

let currentTile = '.';
let currentMode = 'tile';
let selectedAssetId = null;
let isPainting = false;
let grid = createEmptyGrid();
let objects = [];

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
        if (currentMode === 'tile') {
          isPainting = true;
          paintCell(x, y);
          return;
        }
        placeObject(x, y);
      });
      cell.addEventListener('pointerenter', () => {
        if (currentMode === 'tile' && isPainting) paintCell(x, y);
      });
      board.appendChild(cell);
    }
  }
  renderObjects();
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
  output.value = `const ${layoutConstName()} = [\n${rows.join(',\n')}\n];\n\nconst ${objectConstName()} = ${JSON.stringify(exportObjects(), null, 2)};`;
}

function setStatus(message) {
  statusText.textContent = message;
}

function parseLayout(text) {
  const rows = extractLayoutRows(text);
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

function extractLayoutRows(text) {
  const quotedRows = Array.from(text.matchAll(/'([^']+)'|"([^"]+)"/g))
    .map((match) => match[1] || match[2])
    .filter(isLayoutRow);
  if (quotedRows.length >= ROWS) return quotedRows.slice(0, ROWS);

  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^['"]|['"],?$/g, ''))
    .filter(isLayoutRow)
    .slice(0, ROWS);
}

function isLayoutRow(row) {
  if (row.length < COLS) return false;
  return row.slice(0, COLS).split('').every((tile) => Tiles.has(tile) || tile === ' ');
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
  objects = [];
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
    const importedObjects = parseObjects(output.value);
    grid = parseLayout(output.value);
    objects = importedObjects || [];
    renderBoard();
    setStatus(importedObjects ? 'Layout and objects imported.' : 'Layout imported.');
  } catch (error) {
    setStatus(error.message);
  }
}

function parseObjects(text) {
  const assignIndex = text.search(/\bconst\s+[A-Z0-9_]+_OBJECTS\s*=/);
  if (assignIndex === -1) return null;

  const startIndex = text.indexOf('[', assignIndex);
  if (startIndex === -1) return null;

  const jsonText = readBalancedArray(text, startIndex);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText);
    return Array.isArray(parsed) ? parsed.filter(isValidObject) : null;
  } catch (_error) {
    return null;
  }
}

function readBalancedArray(text, startIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index++) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '[') depth++;
    if (char === ']') {
      depth--;
      if (depth === 0) return text.slice(startIndex, index + 1);
    }
  }

  return null;
}

function isValidObject(object) {
  return object
    && ['boss', 'enemy', 'asset'].includes(object.kind)
    && Number.isInteger(object.x)
    && Number.isInteger(object.y);
}

function layoutConstName() {
  const name = normalizeMapName(mapNameInput.value || 'custom');
  return `${name.toUpperCase()}_LAYOUT`;
}

function objectConstName() {
  const name = normalizeMapName(mapNameInput.value || 'custom');
  return `${name.toUpperCase()}_OBJECTS`;
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
    objects: exportObjects(),
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
  objects = Array.isArray(map.objects) ? map.objects : [];
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
    row.classList.toggle('selected', asset.id === selectedAssetId);

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
    preview.addEventListener('click', () => selectUploadedAsset(asset.id));

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
  objects = objects.filter((object) => object.assetId !== assetId);
  if (selectedAssetId === assetId) selectedAssetId = null;
  renderUploadedAssets();
  renderBoard();
  setStatus('Asset deleted.');
}

function selectUploadedAsset(assetId) {
  selectedAssetId = assetId;
  currentMode = 'asset';
  setActiveTool(null);
  renderUploadedAssets();
  setStatus('Click map to place selected asset.');
}

function setActiveTool(tool) {
  tools.forEach((item) => item.classList.toggle('active', item === tool));
  objectTools.forEach((item) => item.classList.toggle('active', item === tool));
}

function placeObject(x, y) {
  if (currentMode === 'erase') {
    eraseObjectAt(x, y);
    return;
  }

  if (currentMode === 'boss') {
    objects = objects.filter((object) => object.kind !== 'boss');
    objects.push({ kind: 'boss', x: Math.min(x, COLS - 2), y: Math.min(y, ROWS - 2), width: 2, height: 2 });
    renderBoard();
    setStatus('Boss position set.');
    return;
  }

  if (currentMode === 'enemy') {
    objects.push({ kind: 'enemy', x, y, width: 1, height: 1 });
    renderBoard();
    setStatus('Enemy placed.');
    return;
  }

  if (currentMode === 'asset' && selectedAssetId) {
    const asset = readUploadedAssets().find((item) => item.id === selectedAssetId);
    if (!asset) return;
    objects.push({ kind: 'asset', assetId: asset.id, name: asset.name, x, y, width: 1, height: 1 });
    renderBoard();
    setStatus(`Placed ${asset.name}.`);
  }
}

function eraseObjectAt(x, y) {
  const reversedIndex = [...objects].reverse().findIndex((object) => objectContainsCell(object, x, y));
  if (reversedIndex === -1) {
    setStatus('No object at this cell.');
    return;
  }

  const objectIndex = objects.length - 1 - reversedIndex;
  const [removed] = objects.splice(objectIndex, 1);
  renderBoard();
  setStatus(`${objectLabel(removed)} removed.`);
}

function renderObjects() {
  const assets = readUploadedAssets();
  objects.forEach((object, index) => {
    markObjectCells(object);
    const cell = board.querySelector(`[data-x="${object.x}"][data-y="${object.y}"]`);
    if (!cell) return;

    const marker = document.createElement('span');
    marker.className = `cell-object ${object.kind === 'boss' ? 'boss-object' : object.kind === 'enemy' ? 'enemy-object' : 'asset-object'}`;
    marker.dataset.objectIndex = String(index);
    if (object.kind === 'enemy') {
      const image = document.createElement('img');
      image.src = mapTypeInput.value === 'forest' ? '../res/quaivat3new_down.png' : '../res/quaivat 3_down.png';
      image.alt = 'Enemy';
      marker.appendChild(image);
    }
    if (object.kind === 'asset') {
      const asset = assets.find((item) => item.id === object.assetId);
      if (!asset) return;
      marker.appendChild(createPreviewImage(asset, ''));
    }
    cell.appendChild(marker);
  });
  renderPlacedObjects();
}

function markObjectCells(object) {
  const width = object.width || 1;
  const height = object.height || 1;
  for (let y = object.y; y < object.y + height; y++) {
    for (let x = object.x; x < object.x + width; x++) {
      const cell = board.querySelector(`[data-x="${x}"][data-y="${y}"]`);
      if (!cell) continue;
      cell.classList.add('cell-has-object');
      cell.dataset.objectKind = object.kind;
      cell.title = `${x},${y} ${grid[y][x]} - ${objectLabel(object)}`;
    }
  }
}

function renderPlacedObjects() {
  placedObjects.innerHTML = '';
  if (objects.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-objects';
    empty.textContent = 'No objects placed.';
    placedObjects.appendChild(empty);
    return;
  }

  objects.forEach((object, index) => {
    const row = document.createElement('div');
    row.className = 'placed-object';

    const label = document.createElement('span');
    label.textContent = objectLabel(object);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => deleteObjectAtIndex(index));

    row.append(label, deleteButton);
    placedObjects.appendChild(row);
  });
}

function deleteObjectAtIndex(index) {
  const [removed] = objects.splice(index, 1);
  renderBoard();
  setStatus(`${objectLabel(removed)} removed.`);
}

function objectContainsCell(object, x, y) {
  const width = object.width || 1;
  const height = object.height || 1;
  return x >= object.x && x < object.x + width && y >= object.y && y < object.y + height;
}

function objectLabel(object) {
  if (!object) return 'Object';
  const size = `${object.width || 1}x${object.height || 1}`;
  if (object.kind === 'boss') return `Boss ${size} (${object.x},${object.y})`;
  if (object.kind === 'enemy') return `Enemy (${object.x},${object.y})`;
  return `${object.name || 'Asset'} (${object.x},${object.y})`;
}

function exportObjects() {
  return objects.map((object) => ({ ...object }));
}

tools.forEach((tool) => {
  tool.addEventListener('click', () => {
    currentMode = 'tile';
    selectedAssetId = null;
    currentTile = tool.dataset.tile;
    setActiveTool(tool);
    renderUploadedAssets();
  });
});

objectTools.forEach((tool) => {
  tool.addEventListener('click', () => {
    currentMode = tool.dataset.objectTool;
    selectedAssetId = null;
    setActiveTool(tool);
    renderUploadedAssets();
    if (currentMode === 'boss') {
      setStatus('Click map to place 2x2 boss.');
    } else if (currentMode === 'enemy') {
      setStatus('Click map to place enemy.');
    } else {
      setStatus('Click object to remove it.');
    }
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
mapTypeInput.addEventListener('change', renderBoard);
mapNameInput.addEventListener('input', updateOutput);

renderBoard();
renderSavedMaps();
renderUploadedAssets();
