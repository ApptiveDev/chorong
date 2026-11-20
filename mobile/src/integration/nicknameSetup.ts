import type { IntegrationClient } from './client';
import type { Me, UserBrief } from './models';

type SessionSource = Pick<IntegrationClient, 'getSnapshot' | 'subscribe'>;

// 첫 닉네임 설정(M04_2) 필요 여부. 서버 응답의 nicknameRequired 만 본다(AuthResponse.user · Me).
// 회원(ACTIVE)이고 닉네임을 저장하지 않았으면 서버가 true 를 보낸다. 게스트는 항상 false.
export function nicknameRequired(user: UserBrief | Me | null | undefined) {
  return !!user && user.status === 'ACTIVE' && user.nicknameRequired === true;
}

// 인증 직후 원래 목적지로 가기 전에 부른다. 닉네임 저장(API-202)으로 nicknameRequired 가 풀리면 true.
// 그 사이 로그아웃·계정 전환(generation 변경)이 일어나면 false 를 돌려주고, 호출한 쪽은 이동하지 않는다.
export function waitForNickname(source: SessionSource): Promise<boolean> {
  if (!nicknameRequired(source.getSnapshot().user)) return Promise.resolve(true);
  const generation = source.getSnapshot().generation;
  return new Promise((resolve) => {
    const unsubscribe = source.subscribe(() => {
      const { user, generation: current } = source.getSnapshot();
      if (current !== generation) {
        unsubscribe();
        resolve(false);
      } else if (!nicknameRequired(user)) {
        unsubscribe();
        resolve(true);
      }
    });
  });
}
