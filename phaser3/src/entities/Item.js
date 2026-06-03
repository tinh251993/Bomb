export class Item {
  constructor(x, y, type) {
    this.gridX = x;
    this.gridY = y;
    this.type = type;
    this.sprite = null;
    this.expireTimer = null;
  }

  attachSprite(sprite) {
    this.sprite = sprite;
    return this;
  }

  setExpireTimer(timer) {
    this.expireTimer = timer;
    return this;
  }

  destroy() {
    if (this.expireTimer) {
      this.expireTimer.remove(false);
      this.expireTimer = null;
    }
    if (this.sprite) this.sprite.destroy();
  }
}
