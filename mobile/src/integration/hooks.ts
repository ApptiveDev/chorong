import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { client } from './runtime';

export function useIntegration() {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  useEffect(() => {
    void client.initialize();
  }, []);
  return state;
}
export function useTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(undefined);
  const running = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function run<T>(
    action: () => Promise<T>,
    success?: (value: T) => void,
  ): Promise<T | undefined> {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    setResult(undefined);
    const generation = client.getSnapshot().generation;
    try {
      const value = await action();
      if (mounted.current && generation === client.getSnapshot().generation) {
        setResult(value ?? { status: '완료', httpStatus: 204 });
        success?.(value);
      }
      return value;
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : '요청 실패');
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return { busy, error, result, run };
}
