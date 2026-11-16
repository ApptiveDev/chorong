// 새 레슨 학습 진입. 홈 '다음 학습'과 별자리 상세가 같은 조건·모달을 쓴다.
// 에너지가 0이어도 학습은 막지 않는다. 에너지는 보상을 받는 완료 때 쓰고(#16), 에너지 없이 마친 레슨은
// 보상 미수령(rewardStatus=NO_ENERGY)으로 남아 에너지가 있을 때 다시 마치면 받는다. 앱은 알리기만 한다.
//
// 에너지 소진 안내(M02_4)는 두 곳에서 띄운다.
// - 처음 시작하는 레슨(UNLOCKED): 여기서 지갑(API-904)을 보고 진입 전에 띄운다. API-404 는 레슨을
//   IN_PROGRESS 로 바꾸므로, '돌아가기'를 고른 사용자가 다음에 이어하기 확인을 보지 않게 시작 전에 묻는다.
// - 그 밖(IN_PROGRESS 이어하기, 보상 미수령 레슨 다시 하기): 학습 화면이 API-404 energyNotice=true 를 보고 띄운다.
// 여기서 안내를 이미 보고 '학습하기'를 고르면 energyNotice=shown 을 넘겨 학습 화면이 다시 띄우지 않는다.
import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { integrationApi as api } from '../runtime';
import type { CourseDetail } from '../models';
import { SessionConfirmModal } from './SessionConfirmModal';

type StartableLesson = Pick<CourseDetail['lessons'][number], 'lessonId' | 'title' | 'status'>;

// 학습 화면 params.energyNotice 값. 진입 전에 안내를 보여 줬다는 뜻이다.
export const ENERGY_NOTICE_SHOWN = 'shown';

// Figma 알림창_선택지 2개_가로(656:4286). M02_4 에너지 소진.
export function EnergyNoticeModal({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <SessionConfirmModal
      visible={visible}
      title="에너지가 모두 소진됐어요."
      notice={'학습은 계속할 수 있지만\n이번에는 별가루를 받을 수 없어요.'}
      arrowBullet
      cancelLabel="돌아가기"
      confirmLabel="학습하기"
      busy={false}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

export function useLessonStart() {
  const router = useRouter();
  const [pending, setPending] = useState<StartableLesson | null>(null);
  const checking = useRef(false);

  const open = (lesson: StartableLesson, noticeShown = false) =>
    router.push({
      pathname: '/learn/study/[lessonId]',
      params: {
        lessonId: String(lesson.lessonId),
        title: lesson.title,
        resume: lesson.status === 'IN_PROGRESS' ? 'true' : 'false',
        ...(noticeShown ? { energyNotice: ENERGY_NOTICE_SHOWN } : {}),
      },
    });

  // 처음 시작하는 레슨(UNLOCKED)만 진입 전에 에너지를 확인한다. 이어 하기는 학습 화면이 서버 안내를 따른다.
  const start = async (lesson: StartableLesson) => {
    if (checking.current || pending) return;
    if (lesson.status !== 'UNLOCKED') return open(lesson);
    checking.current = true;
    try {
      // 누른 시점의 잔량(API-904). 조회에 실패하면 막지 않고 시작한다(학습 화면이 서버 안내를 따른다).
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

  const modal = (
    <EnergyNoticeModal
      visible={!!pending}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const lesson = pending;
        setPending(null);
        if (lesson) open(lesson, true);
      }}
    />
  );

  return { start, modal };
}
