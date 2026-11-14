import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { EnergyIcon } from './CompletionResult';
import { StarIcon } from './ShipStatus';

export type PopoverAnchor = { x: number; y: number; width: number; height: number };

const POPOVER_WIDTH = 228;
const GAP = 8;
const EDGE = 16;

// Figma P01_1 별가루·에너지 팝오버(669:1375). 안내 문구만 보여 주고 API 를 부르지 않는다.
// 칩 바로 아래, 칩 오른쪽 끝에 맞춰 연다. 팝오버 밖을 누르거나 뒤로 가기를 누르면 닫는다.
export function WalletPopover({
  anchor,
  onClose,
}: {
  anchor: PopoverAnchor | null;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const popoverWidth = Math.min(POPOVER_WIDTH, width - EDGE * 2);
  const left = anchor
    ? Math.min(Math.max(EDGE, anchor.x + anchor.width - popoverWidth), width - EDGE - popoverWidth)
    : 0;
  return (
    <Modal
      visible={anchor !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="별가루와 에너지 안내 닫기"
        style={StyleSheet.absoluteFill}
        onPress={onClose}
      />
      {anchor ? (
        <View
          accessibilityRole="summary"
          style={[s.popover, { top: anchor.y + anchor.height + GAP, left, width: popoverWidth }]}
        >
          <View style={s.section}>
            <View style={s.titleRow}>
              <Text style={s.title}>별가루</Text>
              <StarIcon fill="#161616" />
            </View>
            <Text style={s.copy}>
              우주선 가구를 구매할 때 사용할 수 있어요. 에너지가 있을 때 아직 보상을 받지 않은
              학습을 완료하거나, 오늘 첫 복습을 마치면 얻을 수 있어요.
            </Text>
          </View>
          <View style={s.section}>
            <View style={s.titleRow}>
              <Text style={s.title}>에너지</Text>
              <EnergyIcon width={9.142857} height={16} body="#161616" cell="#f1f1f1" />
            </View>
            <Text style={s.copy}>
              에너지가 있으면 아직 보상을 받지 않은 학습을 완료할 때 별가루를 얻어요. 에너지는 매일
              00:00 (한국시간)에 최대치까지 충전돼요
            </Text>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

const s = StyleSheet.create({
  // 배경 rgba(241,241,241,0.8), 모서리 8, 안쪽 20, 묶음 간격 20
  popover: {
    position: 'absolute',
    padding: 20,
    gap: 20,
    borderRadius: 8,
    backgroundColor: 'rgba(241, 241, 241, 0.8)',
  },
  section: { gap: 8 },
  titleRow: { height: 17, flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: {
    color: '#161616',
    fontFamily: 'PretendardSemiBold',
    fontSize: 14,
    includeFontPadding: false,
  },
  copy: {
    color: '#161616',
    fontFamily: 'PretendardRegular',
    fontSize: 10,
    lineHeight: 14,
    includeFontPadding: false,
  },
});
