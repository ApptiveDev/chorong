import { SessionConfirmModal } from './SessionConfirmModal';

type Props = {
  visible: boolean;
  busy: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

// M02_1 공개하고 구경. 내 우주선 헤더의 '구경하기'와 다른 우주선 구경 화면이 같은 문구·디자인을 쓴다.
export function PublicConfirmModal(props: Props) {
  return (
    <SessionConfirmModal
      {...props}
      title="우주선을 공개하고 구경할까요?"
      notice={'다른 사용자에게 내 우주선이 보여요.\n공개 여부는 제어실에서 바꿀 수 있어요.'}
      noticeWeight="medium"
      publicVisibility
      scrollable
      cancelLabel="나중에"
      confirmLabel="공개하고 구경"
    />
  );
}

// M02_10 내 공개 모습 · 공개 동의. 제어실 > 우주선 관리하기에서 공개를 켤 때 쓴다.
export function PublishConsentModal(props: Props) {
  return (
    <SessionConfirmModal
      {...props}
      title="우주선을 공개할까요?"
      notice={
        '공개하면 다른 사용자들이 내 우주선을 볼 수 있어요.\n공개 여부는 제어실에서 바꿀 수 있어요.'
      }
      noticeWeight="medium"
      publicVisibility
      scrollable
      cancelLabel="나중에"
      confirmLabel="공개하고 보기"
    />
  );
}

// M02_17 공개 해제. 제어실 > 우주선 관리하기에서 공개를 끌 때 쓴다.
export function PrivateConfirmModal(props: Props) {
  return (
    <SessionConfirmModal
      {...props}
      title="우주선 공개를 해제할까요?"
      notice="우주선 공개를 해제하면 다른 우주선을 구경할 수 없어요."
      noticeWeight="medium"
      scrollable
      confirmLabel="해제하기"
    />
  );
}
