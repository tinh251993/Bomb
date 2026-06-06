export class Bomb {
  constructor(x, y, range, type, owner = 'player', options = {}) {
    this.gridX = x;
    this.gridY = y;
    this.range = range;
    this.type = type;
    this.owner = owner;
    this.damageDisabled = Boolean(options.damageDisabled);
    this.sprite = null;
    this.timer = null;
  }

  attachSprite(sprite) {
    this.sprite = sprite;
    return this;
  }

  setTimer(timer) {
    this.timer = timer;
    return this;
  }

  destroy() {
    if (this.timer) {
      this.timer.remove(false);
      this.timer = null;
    }
    if (this.sprite) this.sprite.destroy();
  }
}
