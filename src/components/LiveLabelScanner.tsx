import { useEffect, useRef, useState } from 'react';
import { Camera, ScanLine, VideoOff } from 'lucide-react';
import type { LabelRead } from '../lib/labelOcr';
import { readLabelOnDevice } from '../lib/ocrEngine';

interface Props {
  onRecognized: (result: LabelRead) => void;
  onCancel: () => void;
}
function captureFrame(video: HTMLVideoElement): string | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement('canvas');
  const w = video.videoWidth * .88;
  const h = video.videoHeight * .8;
  const scale = Math.min(1.8, 1900 / Math.max(w, h));
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, (video.videoWidth - w) / 2, (video.videoHeight - h) / 2,
    w, h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .89);
}
function quality(r: LabelRead): number {
  return Object.keys(r.nutrients).length * 12 + (r.ingredients.length >= 25 ? 20 : 0);
}

export function LiveLabelScanner({ onRecognized, onCancel }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const videoStream = useRef<MediaStream | null>(null);
  const isReading = useRef(false);
  const alive = useRef(true);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scan = useRef<() => Promise<void>>(async () => undefined);
  const callback = useRef(onRecognized);
  const best = useRef<LabelRead | null>(null);
  callback.current = onRecognized;
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Разрешите доступ к камере');
  const [attempts, setAttempts] = useState(0);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    alive.current = true;
    let disposed = false;
    const start = async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus('Камера доступна только через HTTPS и при разрешении браузера.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (disposed) { stream.getTracks().forEach(track => track.stop()); return; }
        videoStream.current = stream;
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
        }
        if (!disposed) {
          setReady(true);
          setStatus('Наведите камеру на таблицу БЖУ или ингредиенты');
        }
      } catch (error) {
        if (disposed) return;
        const name = error instanceof Error ? error.name : '';
        setStatus(name === 'NotAllowedError'
          ? 'Доступ к камере запрещён. Разрешите его в настройках Safari.'
          : 'Не удалось запустить камеру. Попробуйте загрузить фото этикетки.');
      }
    };
    void start();
    return () => {
      disposed = true;
      alive.current = false;
      if (retry.current) clearTimeout(retry.current);
      videoStream.current?.getTracks().forEach(track => track.stop());
      videoStream.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const schedule = (delay: number) => {
      if (retry.current) clearTimeout(retry.current);
      if (alive.current) retry.current = setTimeout(() => void scan.current(), delay);
    };
    scan.current = async () => {
      if (!alive.current || isReading.current) return;
      if (document.visibilityState === 'hidden') { schedule(1300); return; }
      const frame = video.current ? captureFrame(video.current) : null;
      if (!frame) { schedule(1200); return; }
      isReading.current = true;
      setWorking(true);
      setStatus('Читаем этикетку с камеры…');
      try {
        const parsed = await readLabelOnDevice(frame, message => {
          if (alive.current) setStatus(message);
        });
        if (!alive.current) return;
        setAttempts(n => n + 1);
        if (!best.current || quality(parsed) > quality(best.current)) best.current = parsed;
        if (quality(parsed) >= 24 || (parsed.ingredients.length >= 30 && parsed.rawText.length >= 50)) {
          alive.current = false;
          callback.current(parsed);
          return;
        }
        setStatus('Мало читаемых данных. Поднесите текст ближе и держите ровно.');
      } catch {
        if (alive.current) {
          setAttempts(n => n + 1);
          setStatus('Не удалось прочитать. Приблизьте надпись «на 100 г/мл» и уберите блики.');
        }
      } finally {
        isReading.current = false;
        if (alive.current) { setWorking(false); schedule(3200); }
      }
    };
    schedule(600);
    return () => { if (retry.current) clearTimeout(retry.current); };
  }, [ready]);

  const readNow = () => {
    if (!ready || isReading.current) return;
    if (retry.current) clearTimeout(retry.current);
    void scan.current();
  };
  const useBest = () => {
    if (!best.current) return;
    alive.current = false;
    callback.current(best.current);
  };

  return <section className="live-label-scanner" aria-label="Распознавание состава с камеры">
    <div className="live-label-top">
      <div><span className="overline">СКАНИРОВАНИЕ СОСТАВА</span><h2>Наведите на этикетку</h2></div>
      <button type="button" className="camera-round" onClick={onCancel} aria-label="Закрыть камеру"><VideoOff size={19}/></button>
    </div>
    <div className="live-label-feed">
      <video ref={video} muted autoPlay playsInline aria-label="Изображение этикетки с камеры"/>
      <div className="live-label-reticle" aria-hidden="true"><span/><span/><span/><span/></div>
      <div className="live-label-overlay"><Camera size={14}/> Текст внутри рамки</div>
    </div>
    <div className="live-label-message" role="status"><ScanLine size={18}/><span>{status}</span></div>
    <div className="live-label-buttons">
      <button type="button" className="live-label-snap" onClick={readNow} disabled={!ready || working}>
        {working ? 'Распознаём…' : 'Прочитать сейчас'}
      </button>
    </div>
    {best.current && attempts > 0 && <button className="live-label-use" type="button" onClick={useBest}>
      Использовать частично прочитанный текст
    </button>}
    {attempts >= 2 && <p className="live-label-guide">Если камера не может прочитать надписи, поднесите упаковку ближе или откройте режим фото.</p>}
    <p className="live-label-privacy">Распознавание происходит на телефоне. Фото не отправляются на сервер. Первый запуск загружает русскую языковую модель.</p>
  </section>;
}
