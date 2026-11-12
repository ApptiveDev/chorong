import { useSyncExternalStore } from 'react';
import { client, integrationApi as api } from './runtime';

// 내 우주선·구경하기·제어실(우주선 관리하기)이 함께 보는 우주선 공개 상태.
// 서버 응답(API-701 · API-703 · API-001)으로만 값을 채운다. 계정이 바뀌면(generation) 값을 버린다.
type Entry = { generation: number; isPublic: boolean };

let entry: Entry | null = null;
const listeners = new Set<() => void>();

function snapshot(): boolean | null {
  return entry && entry.generation === client.getSnapshot().generation ? entry.isPublic : null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const unsubscribeClient = client.subscribe(listener);
  return () => {
    listeners.delete(listener);
    unsubscribeClient();
  };
}

function store(isPublic: boolean, generation = client.getSnapshot().generation) {
  if (generation !== client.getSnapshot().generation) return;
  entry = { generation, isPublic };
  listeners.forEach((listener) => listener());
}

export const housingVisibility = {
  get: snapshot,
  set: (isPublic: boolean) => store(isPublic),
  // 실패하면 예외를 그대로 던지고 저장된 값은 바꾸지 않는다.
  update: async (isPublic: boolean) => {
    const generation = client.getSnapshot().generation;
    const housing = await api.room.update({ isPublic });
    store(housing.isPublic, generation);
    return housing;
  },
};

export function useHousingVisibility() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
