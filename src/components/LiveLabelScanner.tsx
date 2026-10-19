import { useEffect, useRef, useState } from 'react';
import { Camera, Flashlight, FlashlightOff, ScanLine, VideoOff } from 'lucide-react';
import { createWorker, type Worker } from 'tesseract.js';
import { parseRussianLabel, type LabelRead } from '../lib/labelOcr';

interface Props {
  onRecognized: (result: LabelRead) => void;
  onCancel: () => void;
}
type TorchTrack = MediaStreamTrack & {
  getCapabilities?: () => MediaTrackCapabilities & { torch?: boolean };
};
function capture(video: HTMLVideoElement): HTMLCanvasElement | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement('canvas');
  const sourceWidth = video.videoWidth * .88;
  const sourceHeight = video.videoHeight * .78;
  const scale = Math.min(1.8, 1900 / Math.max(sourceWidth, sourceHeight));
  canvas.width = Math.round(sourceWidth * scale);
  canvas.height = Math.round(sourceHeight * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video,
    (video.videoWidth - sourceWidth) / 2, (video.videoHeight - sourceHeight) / 2,
    sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  // Increase contrast to help detect small print in the camera feed.
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const grey = .299 * pixels.data[i] + .587 * pixels.data[i + 1] + .114 * pixels.data[i + 2];
    const v = Math.max(0, Math.min(255, Math.round((grey - 128) * 1.35 + 128)));
    pixels.data[i] = v;
    pixels.data[i + 1] = v;
    pixels.data[i + 2] = v;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}
function score(read: LabelRead): number {
  const count = Object.keys(read.nutrients).length;
  return count * 12 + (read.ingredients.length >= 24 ? 20 : 0);
}

export function LiveLabelScanner({ onRecognized, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const activeRef = useRef(true);
  const scanningRef = useRef(false);
  const onRecognizedRef = useRef(onRecognized);
  const [status, setStatus] = useState('Разрешите доступ к камере');
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const bestRef = useRef<LabelRead | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<() => Promise<void>>(async () => undefined);
  onRecognizedRef.current = onRecognized;

  useEffect(() => {
    activeRef.current = true;
    let worker: Worker | null = null;
    const clearTimer = () => { if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = null; };
    const schedule = (delay: number) => {
      clearTimer();
      if (activeRef.current) timerRef.current = setTimeout(() => void tickRef.current(), delay);
    };
    const run = async () => {
      if (!activeRef.current || scanningRef.current || document.visibilityState === 'hidden') {
        schedule(1200);
        return;
      }
      const video = videoRef.current;
      if (!video || !worker) return;
      const canvas = capture(video);
      if (!canvas) { schedule(800); return; }
      scanningRef.current = true;
      setWorking(true);
      setStatus('Читаем текст с камеры…');
      try {
        const result = await worker.recognize(canvas);
        if (!activeRef.current) return;
        const parsed = parseRussianLabel(result.data.text || '');
        const letters = parsed.rawText.replace(/[^\p{L}\p{N}]/gu, '').length;
        setAttempts(n => n + 1);
        if (letters >= 12 && (!bestRef.current || score(parsed) > score(bestRef.current))) bestRef.current = parsed;
        if (score(parsed) >= 24 || (parsed.ingredients.length >= 30 && letters >= 50)) {
          clearTimer();
          activeRef.current = false;
          onRecognizedRef.current(parsed);
          return;
        }
        setStatus(letters < 12
          ? 'Текст слишком мелкий. Поднесите этикетку ближе и уберите блики.'
          : 'Вижу текст, но не таблицу БЖУ. Держите камеру прямо над надписью «на 100 г».');
      } catch {
        if (activeRef.current) setStatus('Не удаётся прочитать кадр. Попробуйте улучшить освещение.');
      } finally {
        scanningRef.current = false;
        if (activeRef.current) { setWorking(false); schedule(2500); }
      }
    };
    tickRef.current = run;
    const start = async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus('Для камеры требуется HTTPS и разрешение браузера.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (!activeRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0] as TorchTrack | undefined;
        if (track?.getCapabilities) setTorchAvailable(Boolean(track.getCapabilities().torch));
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (!activeRef.current) return;
        setStatus('Загружаем русский словарь для распознавания…');
        worker = await createWorker(['rus', 'eng']);
        if (!activeRef.current) { await worker.terminate(); return; }
        workerRef.current = worker;
        setReady(true);
        setStatus('Наведите камеру на состав или таблицу БЖУ');
        schedule(400);
      } catch (error) {
        if (!activeRef.current) return;
        const name = error instanceof Error ? error.name : '';
        setStatus(name === 'NotAllowedError' ? 'Камера запрещена. Разрешите доступ в настройках Safari.' :
          'Не удалось запустить камеру или распознавание. Попробуйте фото этикетки.');
      }
    };
    void start();
    return () => {
      activeRef.current = false;
      clearTimer();
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      const running = workerRef.current || worker;
      workerRef.current = null;
      if (running) void running.terminate().catch(() => undefined);
    };
  }, []);

  const scanNow = () => {
    if (!ready || scanningRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    void tickRef.current();
  };
  const acceptBest = () => {
    if (!bestRef.current) return;
    activeRef.current = false;
    onRecognizedRef.current(bestRef.current);
  };
  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0] as TorchTrack | undefined;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn(value => !value);
    } catch { setStatus('Фонарик недоступен в этом браузере.'); }
  };
  return <section className="live-label-scanner" aria-label="Распознавание состава с камеры">
    <div className="live-label-top">
      <div><span className="overline">УМНАЯ КАМЕРА</span><h2>Читаем состав и БЖУ</h2></div>
      <button type="button" className="camera-round" aria-label="Закрыть распознавание" onClick={onCancel}><VideoOff size={19}/></button>
    </div>
    <div className="live-label-feed">
      <video ref={videoRef} autoPlay playsInline muted aria-label="Камера, наведённая на этикетку"/>
      <div className="live-label-reticle" aria-hidden="true"><span/><span/><span/><span/></div>
      <div className="live-label-overlay"><Camera size={14}/> Наведите на текст, держите ровно</div>
    </div>
    <div className="live-label-message" role="status">
      <ScanLine size={18}/>
      <span>{status}</span>
    </div>
    <div className="live-label-buttons">
      <button type="button" className="live-label-snap" onClick={scanNow} disabled={!ready || working}>
        {working ? 'Распознаём…' : 'Прочитать сейчас'}
      </button>
      {torchAvailable && <button type="button" className="live-label-torch" onClick={() => void toggleTorch()} aria-label={torchOn ? 'Выключить фонарик' : 'Включить фонарик'}>
        {torchOn ? <FlashlightOff size={19}/> : <Flashlight size={19}/>}
      </button>}
    </div>
    {attempts >= 2 && <p className="live-label-guide">Не получается? Приблизьте камеру, чтобы буквы занимали больше кадра. Можно распознать и отдельно таблицу, и состав.</p>}
    {bestRef.current && attempts >= 2 && <button type="button" className="live-label-use" onClick={acceptBest}>Использовать прочитанный текст и проверить вручную</button>}
    <p className="live-label-privacy">Снимки никуда не отправляются. OCR работает на устройстве; первый запуск загрузит языковой словарь. Данные требуют проверки по упаковке.</p>
  </section>;
}
