import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useIntegration, useTask } from '../hooks';
import { housingVisibility, useHousingVisibility } from '../housingVisibility';
import { PrivateConfirmModal, PublicConfirmModal } from './VisibilityConfirmModals';

// 내 우주선(D01_1)·우주선 꾸미기(D02_1)가 함께 쓰는 별가루 표시와 공개 상태 버튼.
export const shipColor = {
  base: '#161616',
  fale: '#f1f1f1',
  lght: '#aaaaaa',
  mist: '#d9d9d9',
  bg: '#e4e4e4',
  yellow: '#ebc60f',
  secondary: '#424242',
  tertiary: '#747474',
  pressedText: '#8c8c8c',
};

// Figma 'Star 1' (16×16 칸, 원본 13.8564×16). 별가루 #EBC60F, 저장 버튼 #F1F1F1 · 눌림 #AAAAAA · 비활성 #747474.
export function StarIcon({ fill }: { fill: string }) {
  return (
    <View style={s.star}>
      <Svg width={13.8564} height={16} viewBox="0 0 13.8564 16" fill="none">
        <Path
          d="M6.9282 0L8.45607 5.35366L13.8564 4L9.98393 8L13.8564 12L8.45607 10.6463L6.9282 16L5.40034 10.6463L0 12L3.87248 8L0 4L5.40034 5.35366L6.9282 0Z"
          fill={fill}
        />
      </Svg>
    </View>
  );
}

export function StardustCount({ value }: { value: number | null }) {
  return (
    <View style={s.stardust} accessible accessibilityLabel={`별가루 ${value ?? '정보 없음'}`}>
      <StarIcon fill={shipColor.yellow} />
      <Text style={s.stardustText}>x {value ?? '—'}</Text>
    </View>
  );
}

// Figma 656:3852 Frame 162: Default(공개) · pressed(누름) · diasbled(비공개 모양, 누를 수 있음)
export function VisibilityBadge({
  isPublic,
  disabled,
  onPress,
}: {
  isPublic: boolean | null;
  disabled: boolean;
  onPress: () => void;
}) {
  const label = isPublic === null ? '확인 중' : isPublic ? '공개' : '비공개';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`내 우주선 공개 상태: ${label}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.visibility,
        isPublic ? s.visibilityOn : s.visibilityOff,
        pressed && isPublic && s.visibilityPressed,
      ]}
    >
      {({ pressed }) => (
        <Text
          style={[
            s.visibilityText,
            !isPublic && s.visibilityTextOff,
            pressed && isPublic && s.visibilityTextPressed,
          ]}
        >
          내 우주선 공개 상태
        </Text>
      )}
    </Pressable>
  );
}

type VisibilityDialog = {
  kind: 'public' | 'private';
  // 헤더 '구경하기'에서 열었으면 공개 성공 뒤 구경하기 화면으로 이동한다.
  thenBrowse: boolean;
  requested: boolean;
};

// 공개 상태 버튼과 확인 모달 연결. 상태는 모달에서 확정하고 API가 성공했을 때만 바뀐다.
export function useVisibilityControl(onBrowse?: () => void) {
  const session = useIntegration();
  const task = useTask();
  const isPublic = useHousingVisibility();
  const [dialog, setDialog] = useState<VisibilityDialog | null>(null);
  const member = session.user?.status === 'ACTIVE';
  const badgeDisabled = !member || isPublic === null || task.busy;

  const pressBadge = () => {
    if (badgeDisabled) return;
    setDialog({ kind: isPublic ? 'private' : 'public', thenBrowse: false, requested: false });
  };

  const requestBrowse = () => {
    if (!member || isPublic === null || task.busy) return;
    if (isPublic) onBrowse?.();
    else setDialog({ kind: 'public', thenBrowse: true, requested: false });
  };

  const close = () => {
    if (task.busy) return;
    setDialog(null);
  };

  const confirm = () => {
    if (!dialog || task.busy) return;
    const { kind, thenBrowse } = dialog;
    setDialog({ ...dialog, requested: true });
    void task.run(
      () => housingVisibility.update(kind === 'public'),
      () => {
        setDialog(null);
        if (thenBrowse && kind === 'public') onBrowse?.();
      },
    );
  };

  const error = dialog?.requested ? task.error : null;
  const modals = (
    <>
      <PublicConfirmModal
        visible={dialog?.kind === 'public'}
        error={error}
        busy={task.busy}
        onCancel={close}
        onConfirm={confirm}
      />
      <PrivateConfirmModal
        visible={dialog?.kind === 'private'}
        error={error}
        busy={task.busy}
        onCancel={close}
        onConfirm={confirm}
      />
    </>
  );

  return { isPublic, member, badgeDisabled, pressBadge, requestBrowse, modals };
}

const s = StyleSheet.create({
  star: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  stardust: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stardustText: {
    color: shipColor.yellow,
    fontFamily: 'PretendardMedium',
    fontSize: 16,
    includeFontPadding: false,
  },
  visibility: {
    height: 24,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visibilityOn: { backgroundColor: shipColor.base, boxShadow: '0px 0px 4px 0px #f1f1f1' },
  visibilityPressed: { boxShadow: '0px 0px 2px 0px #f1f1f1' },
  visibilityOff: {
    backgroundColor: shipColor.secondary,
    borderWidth: 1,
    borderColor: shipColor.lght,
  },
  visibilityText: {
    color: shipColor.fale,
    fontFamily: 'PretendardSemiBold',
    fontSize: 10,
    includeFontPadding: false,
  },
  visibilityTextPressed: { color: shipColor.pressedText },
  visibilityTextOff: { color: shipColor.lght },
});
