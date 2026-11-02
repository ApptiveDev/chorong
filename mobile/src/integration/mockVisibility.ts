// API-703이 확정되기 전까지 Mock 모드에서만 공개 설정 흐름을 시험한다.
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
