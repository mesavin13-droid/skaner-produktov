import { createWorker } from 'tesseract.js';
import { parseRussianLabel, type LabelRead } from './labelOcr';

/**
 * No photo is uploaded: this runs Tesseract WASM locally in the user's browser.
 * First invocation needs to download Russian/English language models.
 */
export async function readLabelOnDevice(image: string, onProgress?: (message:string)=>void): Promise<LabelRead> {
  onProgress?.('Загружаем русский словарь для распознавания…');
  const worker = await createWorker(['rus','eng'], 1, {
    logger(message) {
      if(message.status === 'recognizing text') {
        const progress=Math.round((message.progress ?? 0)*100);
        onProgress?.(`Читаем этикетку: ${progress}%`);
      }
    }
  });
  try {
    onProgress?.('Распознаём текст на фотографии…');
    const result=await worker.recognize(image);
    const value=result.data.text?.trim()||'';
    if (value.length < 12) throw new Error('Текст на этикетке не читается. Сделайте снимок ближе и при хорошем освещении.');
    return parseRussianLabel(value);
  } finally {
    await worker.terminate();
  }
}
