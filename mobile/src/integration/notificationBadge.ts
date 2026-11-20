import { useSyncExternalStore } from 'react';
import { client, integrationApi as api } from './runtime';

// 학습 탭·내 우주선·구경하기의 알림 아이콘 닷. 세 화면이 같은 값을 본다.
// 값은 API-201 응답의 Me.hasUnreadNotifications 와 알림함의 읽음 처리 결과로만 채운다. 계정이 바뀌면(generation) 버린다.
// 아직 값이 없으면 로그인 복원 때 받은 사용자 정보(client 상태)를 쓴다.
type Entry = { generation: number; hasUnread: boolean };

let entry: Entry | null = null;
// 쓰기 순서. 읽음 처리(set) 전에 출발한 API-201 응답이 나중에 와도 닷을 되살리지 않게 한다.
let sequence = 0;
let lastWrite = 0;
let flight: { sequence: number; promise: Promise<void> } | null = null;
const listeners = new Set<() => void>();

function snapshot(): boolean {
  const { user, generation } = client.getSnapshot();
  if (!user || user.status !== 'ACTIVE') return false;
  if (entry && entry.generation === generation) return entry.hasUnread;
  return 'hasUnreadNotifications' in user && user.hasUnreadNotifications === true;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const unsubscribeClient = client.subscribe(listener);
  return () => {
    listeners.delete(listener);
    unsubscribeClient();
  };
}

function store(hasUnread: boolean, generation: number) {
  if (generation !== client.getSnapshot().generation) return;
  entry = { generation, hasUnread };
  listeners.forEach((listener) => listener());
}

const member = () => client.getSnapshot().user?.status === 'ACTIVE';

export const notificationBadge = {
  get: snapshot,
  // 알림함에서 확인한 값을 바로 반영한다. 회원이 아니면 무시한다.
  set: (hasUnread: boolean) => {
    if (!member()) return;
    lastWrite = ++sequence;
    store(hasUnread, client.getSnapshot().generation);
  },
  // API-201 로 서버 값을 다시 읽는다. 회원만 부른다. 실패하면 이전 값을 유지한다.
  // 진행 중인 요청이 마지막 set 보다 나중에 출발했으면 그 요청을 같이 기다린다.
  refresh: (): Promise<void> => {
    if (!member()) return Promise.resolve();
    if (flight && flight.sequence > lastWrite) return flight.promise;
    const mine = ++sequence;
    const generation = client.getSnapshot().generation;
    const promise = api.account
      .me()
      .then(
        (me) => {
          if (mine > lastWrite) store(me.hasUnreadNotifications === true, generation);
        },
        () => {},
      )
      .finally(() => {
        if (flight?.sequence === mine) flight = null;
      });
    flight = { sequence: mine, promise };
    return promise;
  },
};

export function useUnreadNotifications() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
