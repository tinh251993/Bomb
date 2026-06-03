import { BombTypes } from './constants.js';

export function createBombSheetTextures(scene) {
  const source = scene.textures.get('bomb-sheet')?.getSourceImage();
  if (!source) return;

  BombTypes.forEach((type) => {
    createTextureFromCrop(scene, `bomb-${type.id}`, source, type.bombCrop);
    createTextureFromCrop(scene, `explosion-${type.id}`, source, type.explosionCrop);
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
  removeDarkSheetBackground(context, crop.width, crop.height);

  scene.textures.addCanvas(key, canvas);
}

function removeDarkSheetBackground(context, width, height) {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const red = data[i];
    const green = data[i + 1];
    const blue = data[i + 2];
    const brightness = (red + green + blue) / 3;
    const blueBias = blue - Math.max(red, green);

    const isSheetBackdrop = brightness < 42 && blueBias > 4;

    if (isSheetBackdrop) {
      data[i + 3] = 0;
    } else if (brightness < 58 && blueBias > 0) {
      data[i + 3] = Math.min(data[i + 3], 90);
    }
  }

  context.putImageData(imageData, 0, 0);
}
