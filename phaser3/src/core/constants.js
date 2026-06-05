export const TILE = 48;
export const COLS = 15;
export const ROWS = 13;
export const HUD = 56;
export const WIDTH = COLS * TILE;
export const HEIGHT = ROWS * TILE + HUD;

export const TileType = Object.freeze({
  EMPTY: 0,
  WALL: 1,
  CRATE: 2,
  WATER: 3
});

export const Direction = Object.freeze({
  DOWN: 'down',
  UP: 'up',
  LEFT: 'left',
  RIGHT: 'right'
});

export const DIRS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];

export const BombTypes = Object.freeze([
  {
    id: 'basic',
    name: 'Basic',
    bombCrop: { x: 80, y: 54, width: 190, height: 210 },
    explosionStyle: 'cross',
    explosionCrop: { x: 178, y: 370, width: 210, height: 175 }
  },
  {
    id: 'spark',
    name: 'Spark',
    bombCrop: { x: 335, y: 50, width: 210, height: 215 },
    explosionStyle: 'cross',
    explosionCrop: { x: 388, y: 340, width: 245, height: 225 }
  },
  {
    id: 'flare',
    name: 'Flare',
    bombCrop: { x: 606, y: 50, width: 210, height: 215 },
    explosionStyle: 'cross',
    explosionCrop: { x: 612, y: 334, width: 250, height: 230 }
  },
  {
    id: 'blast',
    name: 'Blast',
    bombCrop: { x: 870, y: 50, width: 210, height: 215 },
    explosionStyle: 'round',
    explosionCrop: { x: 810, y: 646, width: 240, height: 205 }
  },
  {
    id: 'smoke',
    name: 'Smoke',
    bombCrop: { x: 1132, y: 35, width: 230, height: 230 },
    explosionStyle: 'round',
    explosionCrop: { x: 1065, y: 656, width: 250, height: 190 }
  }
]);

export const BossBombType = Object.freeze({
  id: 'boss',
  name: 'Boss',
  explosionStyle: 'cross'
});

export const Characters = Object.freeze([
  {
    id: 'bebong',
    name: 'Be Bong',
    card: '../res/User/opbebong.png',
    sprites: {
      down: '../res/bebong_down.png',
      up: '../res/bebong_up.png',
      left: '../res/bebong_left.png',
      right: '../res/bebong_right.png',
      dead: '../res/bebong_dead.png'
    }
  },
  {
    id: 'khokho',
    name: 'Kho Kho',
    card: '../res/User/opkhokho.png',
    sprites: {
      down: '../res/khokho_down.png',
      up: '../res/khokho_up.png',
      left: '../res/khokho_left.png',
      right: '../res/khokho_right.png',
      dead: '../res/khokho_down.png'
    }
  },
  {
    id: 'tiachop',
    name: 'Tia Chop',
    card: '../res/User/optiachop.png',
    sprites: {
      down: '../res/User/tiachop_down.png',
      up: '../res/User/tiachop_up.png',
      left: '../res/User/tiachop_left.png',
      right: '../res/User/tiachop_right.png',
      dead: '../res/User/tiachop_down.png'
    }
  }
]);
