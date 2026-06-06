export const TILE = 48;
export const COLS = 26;
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

export const BossTypes = Object.freeze([
  {
    id: 'pirate',
    name: 'Pirate Boss',
    sprites: {
      down: '../res/Boss/piratenew/actions/front_view.png',
      up: '../res/Boss/piratenew/actions/back_view.png',
      left: '../res/Boss/piratenew/actions/left_move.png',
      right: '../res/Boss/piratenew/actions/right_move.png',
      fire: '../res/Boss/piratenew/actions/cannon_flash_phase_2.png',
      dead: '../res/Boss/piratenew/actions/defeated_phase_2.png',
      moveDown1: '../res/Boss/piratenew/actions/front_view.png',
      moveDown2: '../res/Boss/piratenew/actions/move_front_1.png',
      moveUp1: '../res/Boss/piratenew/actions/back_view.png',
      moveUp2: '../res/Boss/piratenew/actions/right_profile.png',
      moveLeft1: '../res/Boss/piratenew/actions/left_profile.png',
      moveLeft2: '../res/Boss/piratenew/actions/left_move.png',
      moveRight1: '../res/Boss/piratenew/actions/right_profile.png',
      moveRight2: '../res/Boss/piratenew/actions/right_move.png'
    }
  },
  {
    id: 'eagle',
    name: 'Eagle Boss',
    sprites: {
      down: '../res/Boss/eagle_new/move_front_1.png',
      up: '../res/Boss/eagle_new/idle_back_1.png',
      left: '../res/Boss/eagle_new/move_left.png',
      right: '../res/Boss/eagle_new/move_right_1.png',
      fire: '../res/Boss/eagle_new/cannon_flash.png',
      dead: '../res/Boss/eagle_new/defeated_fall_3.png',
      moveDown1: '../res/Boss/eagle_new/move_front_1.png',
      moveDown2: '../res/Boss/eagle_new/move_front_2.png',
      moveDown3: '../res/Boss/eagle_new/move_front_3.png',
      moveUp1: '../res/Boss/eagle_new/idle_back_1.png',
      moveUp2: '../res/Boss/eagle_new/idle_back_2.png',
      moveLeft1: '../res/Boss/eagle_new/idle_side_left.png',
      moveLeft2: '../res/Boss/eagle_new/move_left.png',
      moveRight1: '../res/Boss/eagle_new/move_right_1.png',
      moveRight2: '../res/Boss/eagle_new/move_right_2.png',
      flyDown: '../res/Boss/eagle_new/airborne_down_1.png',
      flyUp: '../res/Boss/eagle_new/airborne_up_1.png',
      flyLeft: '../res/Boss/eagle_new/fly_1.png',
      flyRight: '../res/Boss/eagle_new/fly_1.png',
      fly1: '../res/Boss/eagle_new/fly_1.png',
      fly2: '../res/Boss/eagle_new/fly_2.png',
      fly3: '../res/Boss/eagle_new/fly_3.png',
      fly4: '../res/Boss/eagle_new/fly_4.png',
      fly5: '../res/Boss/eagle_new/fly_5.png',
      fly6: '../res/Boss/eagle_new/fly_6.png',
      fly7: '../res/Boss/eagle_new/fly_7.png',
      fly8: '../res/Boss/eagle_new/fly_8.png'
    }
  }
]);

export const LevelOptions = Object.freeze([
  { level: 1, name: 'Pirate 1', theme: 'Pirate Map' },
  { level: 2, name: 'Pirate 2', theme: 'Pirate Map' },
  { level: 3, name: 'Pirate 3', theme: 'Pirate Map' },
  { level: 4, name: 'Forest', theme: 'Green Forest' },
  { level: 5, name: 'Forest 2', theme: 'Green Forest' },
  { level: 6, name: 'Forest 3', theme: 'Green Boss' }
]);

export const Characters = Object.freeze([
  {
    id: 'bebong',
    name: 'Be Bong',
    card: '../res/User/opbebong.png',
    stats: {
      maxBombs: 1,
      speed: 170,
      bombRange: 3
    },
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
    stats: {
      maxBombs: 2,
      speed: 160,
      bombRange: 2
    },
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
    stats: {
      maxBombs: 1,
      speed: 190,
      bombRange: 1
    },
    sprites: {
      down: '../res/User/tiachop_down.png',
      up: '../res/User/tiachop_up.png',
      left: '../res/User/tiachop_left.png',
      right: '../res/User/tiachop_right.png',
      dead: '../res/User/tiachop_down.png'
    }
  }
]);
