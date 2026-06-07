export const WIDTH = 1280;
export const HEIGHT = 720;
export const GROUND_Y = 570;
export const PLAYER_BASE_X = 82;
export const ENEMY_BASE_X = WIDTH - 82;
export const MAX_UNITS_PER_SIDE = 200;

export const RESOURCE_TYPES = [
  { id: 'wood', name: 'Wood', color: 0x8b5a2b, gatherAmount: 10 },
  { id: 'food', name: 'Food', color: 0x22c55e, gatherAmount: 15 },
  { id: 'gold', name: 'Gold', color: 0xfacc15, gatherAmount: 10 },
  { id: 'stone', name: 'Stone', color: 0x94a3b8, gatherAmount: 6 }
];

export const FARMER = {
  cost: { food: 50 },
  gatherIntervalMs: 2000
};

export const BUILDINGS = [
  [
    { name: 'Cave Barracks', role: 'Train primitive fighters', cost: 120 },
    { name: 'Stone Workshop', role: 'Unlock stronger weapons', cost: 180 },
    { name: 'Watch Fire', role: 'Improve base defense', cost: 140 }
  ],
  [
    { name: 'Barracks', role: 'Train sword and knight units', cost: 220 },
    { name: 'Archery Range', role: 'Improve ranged damage', cost: 260 },
    { name: 'Blacksmith', role: 'Upgrade armor and weapons', cost: 300 }
  ],
  [
    { name: 'Factory', role: 'Produce vehicles and heavy units', cost: 420 },
    { name: 'Command Center', role: 'Improve income and control', cost: 520 },
    { name: 'Gun Turret Bay', role: 'Upgrade turret fire rate', cost: 460 }
  ],
  [
    { name: 'Cyber Lab', role: 'Unlock future technology', cost: 720 },
    { name: 'Mech Foundry', role: 'Produce advanced mech units', cost: 860 },
    { name: 'Plasma Core', role: 'Boost base and turret power', cost: 780 }
  ]
];

export const ERAS = [
  {
    name: 'Stone',
    color: 0x84cc16,
    base: 0x78716c,
    units: [
      { id: 'club', name: 'Club', cost: 35, hp: 100, damage: 14, range: 34, speed: 54, cooldown: 850, reward: 20 },
      { id: 'spear', name: 'Spear', cost: 55, hp: 82, damage: 18, range: 126, speed: 48, cooldown: 1120, reward: 28 },
      { id: 'brute', name: 'Brute', cost: 85, hp: 180, damage: 28, range: 38, speed: 38, cooldown: 1200, reward: 44 }
    ],
    turret: { cost: 120, damage: 22, range: 280, cooldown: 1050 }
  },
  {
    name: 'Castle',
    color: 0xf59e0b,
    base: 0x475569,
    units: [
      { id: 'sword', name: 'Sword', cost: 55, hp: 145, damage: 22, range: 36, speed: 58, cooldown: 820, reward: 34 },
      { id: 'archer', name: 'Archer', cost: 80, hp: 105, damage: 30, range: 170, speed: 50, cooldown: 1080, reward: 46 },
      { id: 'knight', name: 'Knight', cost: 130, hp: 260, damage: 42, range: 42, speed: 44, cooldown: 1180, reward: 70 }
    ],
    turret: { cost: 210, damage: 38, range: 320, cooldown: 940 }
  },
  {
    name: 'Modern',
    color: 0x38bdf8,
    base: 0x334155,
    units: [
      { id: 'soldier', name: 'Rifle', cost: 90, hp: 190, damage: 42, range: 190, speed: 60, cooldown: 920, reward: 58 },
      { id: 'rocket', name: 'Rocket', cost: 145, hp: 150, damage: 68, range: 230, speed: 48, cooldown: 1450, reward: 90 },
      { id: 'tank', name: 'Tank', cost: 240, hp: 430, damage: 82, range: 155, speed: 34, cooldown: 1300, reward: 150 }
    ],
    turret: { cost: 360, damage: 62, range: 360, cooldown: 820 }
  },
  {
    name: 'Future',
    color: 0xa78bfa,
    base: 0x312e81,
    units: [
      { id: 'blade', name: 'Blade', cost: 150, hp: 310, damage: 78, range: 48, speed: 72, cooldown: 720, reward: 100 },
      { id: 'laser', name: 'Laser', cost: 230, hp: 230, damage: 105, range: 260, speed: 56, cooldown: 980, reward: 155 },
      { id: 'mech', name: 'Mech', cost: 390, hp: 720, damage: 150, range: 190, speed: 38, cooldown: 1180, reward: 260 }
    ],
    turret: { cost: 560, damage: 110, range: 410, cooldown: 700 }
  }
];
