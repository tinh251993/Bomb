export const BossTextures = Object.freeze({
  down: 'boss-down',
  up: 'boss-up',
  left: 'boss-left',
  right: 'boss-right',
  fire: 'boss-fire',
  dead: 'boss-dead'
});

const BossCrops = Object.freeze({
  down: { x: 38, y: 100, width: 178, height: 202 },
  right: { x: 44, y: 348, width: 178, height: 136 },
  left: { x: 690, y: 350, width: 185, height: 134 },
  up: { x: 716, y: 100, width: 172, height: 195 },
  fire: { x: 520, y: 380, width: 235, height: 205 },
  dead: { x: 500, y: 984, width: 190, height: 155 }
});

export function createBossSheetTextures(scene) {
  const source = scene.textures.get('boss-allmode-sheet')?.getSourceImage();
  if (!source) return;

  Object.entries(BossCrops).forEach(([state, crop]) => {
    createTextureFromCrop(scene, BossTextures[state], source, crop);
  });
}

function createTextureFromCrop(scene, key, source, crop) {
  if (scene.textures.exists(key)) return;

  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;

  const context = canvas.getContext('2d');
  if (!context) return;

  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  removeSheetBackground(context, crop.width, crop.height);
  trimTransparentEdges(scene, key, canvas);
}

function removeSheetBackground(context, width, height) {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const brightness = (red + green + blue) / 3;
    const blueBias = blue - Math.max(red, green);

    const isCheckerBackground = brightness < 42 && blueBias > 2;
    const isVeryDarkBackdrop = brightness < 26 && blue > red && blue > green;

    if (isCheckerBackground || isVeryDarkBackdrop) {
      data[index + 3] = 0;
    } else if (brightness < 52 && blueBias > 1) {
      data[index + 3] = Math.min(data[index + 3], 90);
    }
  }

  context.putImageData(imageData, 0, 0);
}

function trimTransparentEdges(scene, key, canvas) {
  const context = canvas.getContext('2d');
  if (!context) return;

  const { width, height } = canvas;
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha < 8) continue;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (minX > maxX || minY > maxY) {
    scene.textures.addCanvas(key, canvas);
    return;
  }

  const trimmed = document.createElement('canvas');
  trimmed.width = maxX - minX + 1;
  trimmed.height = maxY - minY + 1;
  trimmed.getContext('2d')?.drawImage(
    canvas,
    minX,
    minY,
    trimmed.width,
    trimmed.height,
    0,
    0,
    trimmed.width,
    trimmed.height
  );
  scene.textures.addCanvas(key, trimmed);
}
