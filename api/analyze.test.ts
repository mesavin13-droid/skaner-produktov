import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './analyze';
import type { VercelRequest, VercelResponse } from '@vercel/node';

function response() {
  const record = { statusCode: 200, jsonValue: null as unknown };
  const res = {
    setHeader: vi.fn().mockReturnThis(),
    status: vi.fn((code: number) => { record.statusCode = code; return res; }),
    json: vi.fn((body: unknown) => { record.jsonValue = body; return res; }),
  };
  return { res: res as unknown as VercelResponse, record };
}
const request = (image: string, mode: string) => ({ method: 'POST', body: { image, mode } }) as VercelRequest;
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('ИИ API: серверная валидация', () => {
  it('не принимает данные без ключа', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const { res, record } = response();
    await handler(request('data:image/jpeg;base64,AA==', 'food'), res);
    expect(record.statusCode).toBe(503);
  });
  it('отклоняет не-изображение', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'fake');
    const { res, record } = response();
    await handler(request('data:text/plain;base64,AA==', 'package'), res);
    expect(record.statusCode).toBe(413);
  });
});
