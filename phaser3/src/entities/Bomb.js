export class Bomb {
  constructor(x, y, range, type) {
    this.gridX = x;
    this.gridY = y;
    this.range = range;
    this.type = type;
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
