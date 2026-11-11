// Mock 응답과 화면에서 공유하는 공개 상태다.
let isPublic = true;
const listeners = new Set<() => void>();

export const mockVisibility = {
  get: () => isPublic,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  set: (value: boolean) => {
    isPublic = value;
    listeners.forEach((listener) => listener());
  },
};
