// 새 레슨 학습 진입. 홈 '다음 학습'과 별자리 상세가 같은 조건·모달을 쓴다.
// 에너지가 0이어도 학습은 막지 않는다. 서버(API-404)는 에너지가 없으면 쓰지 않고 시작하고,
// 그렇게 마친 레슨은 별가루를 주지 않는다(stardustSkipped). 앱은 시작 전에 알리기만 한다.
import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { integrationApi as api } from '../runtime';
import type { CourseDetail } from '../models';
import { SessionConfirmModal } from './SessionConfirmModal';

type StartableLesson = Pick<CourseDetail['lessons'][number], 'lessonId' | 'title' | 'status'>;

export function useLessonStart() {
  const router = useRouter();
  const [pending, setPending] = useState<StartableLesson | null>(null);
  const checking = useRef(false);

  const open = (lesson: StartableLesson) =>
    router.push({
      pathname: '/learn/study/[lessonId]',
      params: {
        lessonId: String(lesson.lessonId),
        title: lesson.title,
        resume: lesson.status === 'IN_PROGRESS' ? 'true' : 'false',
      },
    });

  // 처음 시작하는 레슨(UNLOCKED)만 에너지를 확인한다. 이어 하기는 이미 시작한 레슨이라 묻지 않는다.
  const start = async (lesson: StartableLesson) => {
    if (checking.current || pending) return;
    if (lesson.status !== 'UNLOCKED') return open(lesson);
    checking.current = true;
    try {
      // 누른 시점의 잔량(API-904). 조회에 실패하면 막지 않고 시작한다(에너지 판단은 서버가 한다).
      const energy = await api.benefits
        .wallet()
        .then((wallet) => wallet.energy)
        .catch(() => null);
      if (energy === 0) setPending(lesson);
      else open(lesson);
    } finally {
      checking.current = false;
    }
  };

  // Figma 알림창_선택지 2개_가로(656:4286). 버튼 문구는 Figma 템플릿 문구 대신 '취소 / 학습하기'.
  const modal = (
    <SessionConfirmModal
      visible={!!pending}
      title="에너지가 모두 소진됐어요"
      notice={'학습은 계속할 수 있지만\n이번에는 별가루를 받을 수 없어요.'}
      arrowBullet
      cancelLabel="취소"
      confirmLabel="학습하기"
      busy={false}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const lesson = pending;
        setPending(null);
        if (lesson) open(lesson);
      }}
    />
  );

  return { start, modal };
}
