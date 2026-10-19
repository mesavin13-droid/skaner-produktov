import { createWorker } from 'tesseract.js';
import { parseRussianLabel, type LabelRead } from './labelOcr';

async function contrastCopy(dataUrl: string): Promise<string | null> {
  const img = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Снимок нельзя обработать'));
      img.src = dataUrl;
    });
    // Upscaling may help with modestly small text, but cannot restore out-of-focus letters.
    const ratio = Math.min(2, 2300 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = image.data;
    for (let i = 0; i < pixels.length; i += 4) {
      const grey = .299 * pixels[i] + .587 * pixels[i+1] + .114 * pixels[i+2];
      const value = Math.max(0, Math.min(255, Math.round((grey - 127) * 1.6 + 127)));
      pixels[i] = value;
      pixels[i+1] = value;
      pixels[i+2] = value;
    }
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
function quality(read: LabelRead): number {
  return Object.keys(read.nutrients).length * 10 +
    (read.ingredients.length >= 20 ? 18 : 0) +
    (read.hasBasis100 ? 5 : 0) +
    Math.min(15, read.rawText.length / 80);
}
/** OCR runs locally on the device; the raw image is never uploaded by this function. */
export async function readLabelOnDevice(image: string, onProgress?: (message: string) => void): Promise<LabelRead> {
  onProgress?.('Загружаем русский словарь для распознавания…');
  const worker = await createWorker(['rus', 'eng'], 1, {
    logger(message) {
      if (message.status === 'recognizing text') {
        const pct = Math.round((message.progress ?? 0) * 100);
        onProgress?.(`Читаем этикетку: ${pct}%`);
      }
    },
  });
  try {
    const first = await worker.recognize(image);
    let best = parseRussianLabel(first.data.text || '');
    if (Object.keys(best.nutrients).length < 3 || !best.ingredients) {
      onProgress?.('Мелкий текст: повторяем чтение с повышенной контрастностью…');
      const enhanced = await contrastCopy(image);
      if (enhanced) {
        const second = parseRussianLabel((await worker.recognize(enhanced)).data.text || '');
        if (quality(second) > quality(best)) best = second;
      }
    }
    if (best.rawText.replace(/[^\p{L}\p{N}]/gu, '').length < 8) {
      throw new Error('Текст слишком мелкий или размытый. Снимите таблицу БЖУ отдельно, ближе, без бликов и под прямым углом.');
    }
    return best;
  } finally {
    await worker.terminate();
  }
}
