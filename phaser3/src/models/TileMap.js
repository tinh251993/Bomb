import { COLS, ROWS, TileType } from '../core/constants.js';

const LEVEL_TWO_LAYOUT = [
  '###############',
  '#..#...#...#..#',
  '#.C#C.C#C.C#C.#',
  '#.............#',
  '#C.#.C.#.C.#.C#',
  '#..#...#...#..#',
  '#.C.C.C.C.C.C.#',
  '#.............#',
  '#C.#.C.#.C.#.C#',
  '#..#...#...#..#',
  '#.C#C.C#C.C#C.#',
  '#.............#',
  '###############'
];

const LEVEL_THREE_LAYOUT = [
  '###############',
  '#.............#',
  '#..#.#...#.#..#',
  '#.............#',
  '#.#..#.#..#.#.#',
  '#.............#',
  '#..#.#...#.#..#',
  '#.............#',
  '#.#..#.#..#.#.#',
  '#.............#',
  '#..#.#...#.#..#',
  '#.............#',
  '###############'
];

export class TileMap {
  constructor(level = 1, seed = 'solo') {
    this.level = level;
    this.seed = seed;
    this.grid = this.buildGrid();
  }

  buildGrid() {
    if (this.level === 2) return this.buildFromLayout(LEVEL_TWO_LAYOUT);
    if (this.level === 3) return this.buildFromLayout(LEVEL_THREE_LAYOUT);

    const safe = new Set([
      '1,1', '2,1', '1,2',
      '13,11', '12,11', '13,10',
      '13,1', '12,1', '13,2',
      '1,11', '2,11', '1,10'
    ]);
    const grid = [];

    for (let y = 0; y < ROWS; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) {
        const border = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
        const pillar = x % 2 === 0 && y % 2 === 0;

        if (border || pillar) {
          row.push(TileType.WALL);
        } else if (!safe.has(`${x},${y}`) && this.randomAt(x, y) < 0.58) {
          row.push(TileType.CRATE);
        } else {
          row.push(TileType.EMPTY);
        }
      }
      grid.push(row);
    }

    return grid;
  }

  randomAt(x, y) {
    const input = `${this.seed}:${this.level}:${x}:${y}`;
    let hash = 2166136261;
    for (let index = 0; index < input.length; index++) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  }

  buildFromLayout(layout) {
    return layout.map((row) => {
      return row.split('').map((cell) => {
        if (cell === '#') return TileType.WALL;
        if (cell === 'C') return TileType.CRATE;
        return TileType.EMPTY;
      });
    });
  }

  get(x, y) {
    return this.inBounds(x, y) ? this.grid[y][x] : TileType.WALL;
  }

  set(x, y, tile) {
    if (this.inBounds(x, y)) this.grid[y][x] = tile;
  }

  isEmpty(x, y) {
    return this.get(x, y) === TileType.EMPTY;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < COLS && y < ROWS;
  }

  findNearestOpen(startX, startY) {
    for (let radius = 0; radius < COLS; radius++) {
      for (let y = Math.max(1, startY - radius); y < Math.min(ROWS - 1, startY + radius + 1); y++) {
        for (let x = Math.max(1, startX - radius); x < Math.min(COLS - 1, startX + radius + 1); x++) {
          if (this.isEmpty(x, y)) return { x, y };
        }
      }
    }
    return { x: 1, y: 1 };
  }
}
