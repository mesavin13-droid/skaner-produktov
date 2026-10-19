import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { Aperture, Flashlight, FlashlightOff, ScanLine, ShieldCheck, VideoOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Props {
  active: boolean;
  onDetected: (barcode: string) => void;
  onCancel: () => void;
}

export function CameraScanner({ active, onDetected, onCancel }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const onDetectedRef = useRef(onDetected);
  const finished = useRef(false);
  const [message, setMessage] = useState('Наведите камеру на штрихкод');
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torch, setTorch] = useState(false);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    if (!active) return;
    if (!window.isSecureContext) {
      setMessage('Камера доступна только по HTTPS или на localhost.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage('Этот браузер не поддерживает доступ к камере.');
      return;
    }
    let cancelled = false;
    finished.current = false;
    setMessage('Разрешите доступ к камере');
    const reader = new BrowserMultiFormatReader();
    const start = async () => {
      try {
        if (!video.current) return;
        const scannerControls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          video.current,
          (result, _error, currentControls) => {
            if (!result || finished.current || cancelled) return;
            const barcode = result.getText()?.replace(/[^\d]/g, '') ?? '';
            if (!/^\d{8,14}$/.test(barcode)) return;
            finished.current = true;
            currentControls.stop();
            onDetectedRef.current(barcode);
          },
        );
        if (cancelled || finished.current) { scannerControls.stop(); return; }
        controls.current = scannerControls;
        setTorchAvailable(typeof scannerControls.switchTorch === 'function');
        setMessage('Поместите штрихкод внутри рамки');
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : '';
        setMessage(name === 'NotAllowedError' ? 'Доступ к камере запрещён. Разрешите его в настройках браузера.' :
          name === 'NotFoundError' ? 'Камера не найдена. Попробуйте ручной ввод.' : 'Не удалось включить камеру. Попробуйте снова или введите код.');
      }
    };
    void start();
    return () => {
      cancelled = true;
      finished.current = true;
      controls.current?.stop();
      controls.current = null;
      setTorch(false);
      setTorchAvailable(false);
    };
  }, [active]);

  const switchTorch = async () => {
    if (!controls.current?.switchTorch) return;
    try { await controls.current.switchTorch(!torch); setTorch(!torch); }
    catch { setMessage('Вспышка недоступна на этом устройстве.'); }
  };

  return (
    <div className={`camera-preview ${active ? 'is-active' : ''}`}>
      <div className="camera-pattern" aria-hidden="true" />
      <video ref={video} className="camera-video" autoPlay muted playsInline aria-label="Изображение с камеры" style={{ opacity: active ? 1 : 0 }} />
      {!active && <div className="camera-idle"><div className="idle-orbit"><Aperture size={57} strokeWidth={1.15} /></div><strong>Готовы проверить?</strong><span>Узнайте, что внутри продукта</span></div>}
      {active && <>
        <div className="scan-corners" aria-hidden="true"><i /><i /><i /><i /><span className="scan-line" /></div>
        <div className="camera-controls">
          <button onClick={onCancel} type="button" className="camera-round" aria-label="Выключить камеру"><VideoOff size={19} /></button>
          {torchAvailable && <button onClick={() => void switchTorch()} type="button" className="camera-round" aria-label={torch ? 'Выключить вспышку' : 'Включить вспышку'}>{torch ? <FlashlightOff size={19} /> : <Flashlight size={19} />}</button>}
        </div>
      </>}
      <div className="camera-status">{active ? <ScanLine size={15} /> : <ShieldCheck size={15} />}<span>{active ? message : 'Быстро · Просто · Понятно'}</span></div>
    </div>
  );
}
