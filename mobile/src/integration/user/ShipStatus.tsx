import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useIntegration, useTask } from '../hooks';
import { housingVisibility, useHousingVisibility } from '../housingVisibility';
import { PublicConfirmModal } from './VisibilityConfirmModals';

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

// Figma 651:1361 헤더 '내 우주선 • 구경하기'. 선택 탭(Frame 133 pressed)은 #F1F1F1 24, 나머지(default)는 #AAAAAA 23.
// Figma 는 선택 탭에 Pretendard ExtraBold 를 쓰지만 앱에 폰트 파일이 없어 Bold 로 대체한다.
export function ShipTabsHeader({
  active,
  onMine,
  onBrowse,
}: {
  active: 'mine' | 'browse';
  onMine?: () => void;
  onBrowse?: () => void;
}) {
  const tab = (key: 'mine' | 'browse', label: string, onPress?: () => void) => (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active === key }}
      onPress={active === key ? undefined : onPress}
      style={s.headerTab}
    >
      <Text style={active === key ? s.headerSelected : s.headerDefault}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={s.header} accessibilityRole="tablist">
      {tab('mine', '내 우주선', onMine)}
      <View style={s.headerStar}>
        <Svg width={6.9282} height={8} viewBox="0 0 6.9282 8" fill="none">
          <Path
            d="M3.4641 0L4.22803 2.67683L6.9282 2L4.99197 4L6.9282 6L4.22803 5.32317L3.4641 8L2.70017 5.32317L0 6L1.93624 4L0 2L2.70017 2.67683L3.4641 0Z"
            fill={shipColor.fale}
          />
        </Svg>
      </View>
      {tab('browse', '구경하기', onBrowse)}
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

// Figma 656:3852 Frame 162: Default(공개) · pressed(누름) · diasbled(비공개 모양, 누를 수 있음).
// 공개 설정을 바꾸지 않는다. 누르면 내 우주선 정보 팝업(M06_1)을 연다.
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

// 헤더 '구경하기' 접근 제어. 공개면 바로 구경하기로, 비공개면 공개하기 모달을 띄우고
// 공개 API 가 성공했을 때만 구경하기로 보낸다. (공개 상태 버튼은 정보 팝업만 연다. ShipInfoPopup 참고)
export function useVisibilityControl(onBrowse: () => void) {
  const session = useIntegration();
  const task = useTask();
  const isPublic = useHousingVisibility();
  const [dialog, setDialog] = useState<{ requested: boolean } | null>(null);
  const member = session.user?.status === 'ACTIVE';

  const requestBrowse = () => {
    if (!member || isPublic === null || task.busy) return;
    if (isPublic) onBrowse();
    else setDialog({ requested: false });
  };

  const close = () => {
    if (task.busy) return;
    setDialog(null);
  };

  const confirm = () => {
    if (!dialog || task.busy) return;
    setDialog({ requested: true });
    void task.run(
      () => housingVisibility.update(true),
      () => {
        setDialog(null);
        onBrowse();
      },
    );
  };

  const modals = (
    <PublicConfirmModal
      visible={dialog !== null}
      error={dialog?.requested ? task.error : null}
      busy={task.busy}
      onCancel={close}
      onConfirm={confirm}
    />
  );

  return { isPublic, member, requestBrowse, modals };
}

const s = StyleSheet.create({
  header: {
    height: 32,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTab: { height: 32, justifyContent: 'center' },
  headerSelected: {
    color: shipColor.fale,
    fontFamily: 'PretendardBold',
    fontSize: 24,
    includeFontPadding: false,
  },
  headerDefault: {
    color: shipColor.lght,
    fontFamily: 'PretendardBold',
    fontSize: 23,
    includeFontPadding: false,
  },
  headerStar: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
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
