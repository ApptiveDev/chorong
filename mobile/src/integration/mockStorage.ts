import { mockSnapshot, restoreMockSnapshot } from './mockApi';
import { storage } from './storage';

const key = 'chorong.mock.v1.state';
const chunkSize = 500;
let saveQueue: Promise<void> = Promise.resolve();

export async function restoreMockState() {
  try {
    const count = Number(await storage.get(`${key}.count`));
    if (!Number.isInteger(count) || count < 1 || count > 100) return;
    const chunks: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const chunk = await storage.get(`${key}.${index}`);
      if (chunk === null) return;
      chunks.push(chunk);
    }
    restoreMockSnapshot(JSON.parse(chunks.join('')));
  } catch {
    // 손상된 목업 저장 상태는 초기 데이터로 다시 시작한다.
  }
}

export function saveMockState() {
  const value = JSON.stringify(mockSnapshot());
  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      const previousCount = Number(await storage.get(`${key}.count`)) || 0;
      const characters = Array.from(value);
      const chunks: string[] = [];
      for (let index = 0; index < characters.length; index += chunkSize)
        chunks.push(characters.slice(index, index + chunkSize).join(''));
      for (let index = 0; index < chunks.length; index += 1)
        await storage.set(`${key}.${index}`, chunks[index]);
      await storage.set(`${key}.count`, String(chunks.length));
      for (let index = chunks.length; index < Math.min(previousCount, 100); index += 1)
        await storage.remove(`${key}.${index}`);
    });
  return saveQueue;
}
