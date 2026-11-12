import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { shipColor as color, StarIcon } from './ShipStatus';

// 우주선 꾸미기 확인 모달 3종. SessionConfirmModal 과 같은 틀(배경 #F1F1F1 · 모서리 8 · 버튼 48)을 쓰되
// 가격 줄, 버튼 1개, 내용 폭 버튼처럼 공용 모달이 표현하지 못하는 차이를 여기서만 둔다.

function Frame({
  visible,
  onRequestClose,
  padding,
  borderColor,
  children,
}: {
  visible: boolean;
  onRequestClose: () => void;
  padding: { horizontal: number; vertical: number };
  borderColor: string;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={s.overlay}>
        <View
          style={[
            s.box,
            {
              borderColor,
              paddingHorizontal: padding.horizontal,
              paddingVertical: padding.vertical,
            },
          ]}
        >
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Bullet() {
  return <Text style={s.bullet}>{'>'}</Text>;
}

function DialogButton({
  label,
  primary = false,
  bordered = true,
  disabled = false,
  style,
  onPress,
}: {
  label: string;
  primary?: boolean;
  bordered?: boolean;
  disabled?: boolean;
  style?: object;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        primary ? s.buttonPrimary : s.buttonSecondary,
        !bordered && s.buttonBorderless,
        style,
      ]}
    >
      <Text style={[s.buttonText, primary && s.buttonTextPrimary]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// Figma 477:452 Frame 45 · 구매하고 배치 저장
export function PurchaseConfirmModal({
  visible,
  total,
  busy,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  total: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Frame
      visible={visible}
      onRequestClose={() => !busy && onCancel()}
      padding={{ horizontal: 20, vertical: 28 }}
      borderColor="#000000"
    >
      <View style={s.purchase}>
        <View style={s.titleOffset}>
          <Text style={s.title}>구매하고 배치를 저장할까요?</Text>
        </View>
        <View style={s.priceRow}>
          <View style={s.priceLabel}>
            <Bullet />
            <Text style={s.copyMedium}>필요한 별가루</Text>
          </View>
          <View style={s.price} accessible accessibilityLabel={`별가루 ${total}`}>
            <StarIcon fill={color.base} />
            <Text style={s.priceText}>x {total}</Text>
          </View>
        </View>
        <View style={s.actions}>
          <DialogButton label="돌아가기" disabled={busy} style={s.buttonHalf} onPress={onCancel} />
          <DialogButton
            label="구매하고 저장"
            primary
            disabled={busy}
            style={s.buttonHalf}
            onPress={onConfirm}
          />
        </View>
      </View>
    </Frame>
  );
}

// Figma 501:770 알림창_선택지 2개_세로 · 별가루 부족
export function InsufficientStardustModal({
  visible,
  amount,
  onClose,
}: {
  visible: boolean;
  amount: number;
  onClose: () => void;
}) {
  return (
    <Frame
      visible={visible}
      onRequestClose={onClose}
      padding={{ horizontal: 28, vertical: 28 }}
      borderColor={color.base}
    >
      <View style={s.insufficient}>
        <View style={s.insufficientMessage}>
          <View style={s.insufficientHeading}>
            <Text style={s.title}>별가루가 부족해요.</Text>
          </View>
          <View style={s.insufficientNotice}>
            <Bullet />
            <Text style={s.copyRegular}>아이템을 구매하려면 {amount}별가루가 필요해요.</Text>
          </View>
        </View>
        <DialogButton
          label="배치로 돌아가기"
          primary
          bordered={false}
          style={s.buttonFull}
          onPress={onClose}
        />
      </View>
    </Frame>
  );
}

// Figma 293:7030 알림창_선택지 2개_가로 · 변경 취소 후 나가기
export function DiscardChangesModal({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Frame
      visible={visible}
      onRequestClose={onCancel}
      padding={{ horizontal: 20, vertical: 28 }}
      borderColor="#000000"
    >
      <View style={s.discard}>
        <View style={s.discardMessage}>
          <View style={s.titleOffset}>
            <Text style={s.title}>변경을 취소하고 나갈까요?</Text>
          </View>
          <View style={s.discardNotice}>
            <Bullet />
            <View style={s.discardLines}>
              <Text style={s.copyMedium}>저장하지 않은 배치와 구매 예정 가구가</Text>
              <Text style={s.copyMedium}>취소돼요.</Text>
            </View>
          </View>
        </View>
        <View style={s.actions}>
          <DialogButton label="계속 꾸미기" style={s.buttonFixed} onPress={onCancel} />
          <DialogButton
            label="저장하지 않고 나가기"
            primary
            style={s.buttonFit}
            onPress={onConfirm}
          />
        </View>
      </View>
    </Frame>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#16161680',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  box: {
    width: '100%',
    maxWidth: 358,
    maxHeight: '100%',
    backgroundColor: color.fale,
    borderWidth: 1,
    borderRadius: 8,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { alignItems: 'center' },
  title: {
    color: color.base,
    fontFamily: 'PretendardSemiBold',
    fontSize: 24,
    textAlign: 'center',
  },
  // Figma 제목 칸: 왼쪽 24 · 오른쪽 10 · 위아래 10
  titleOffset: { paddingLeft: 24, paddingRight: 10, paddingVertical: 10 },
  bullet: {
    color: '#000000',
    fontFamily: 'KkakdugiRegular',
    fontSize: 14,
    lineHeight: 18,
    includeFontPadding: false,
  },
  copyMedium: {
    flexShrink: 1,
    color: color.base,
    fontFamily: 'PretendardMedium',
    fontSize: 15,
    lineHeight: 18,
    includeFontPadding: false,
  },
  copyRegular: {
    flexShrink: 1,
    color: color.base,
    fontFamily: 'PretendardRegular',
    fontSize: 15,
    lineHeight: 18,
    includeFontPadding: false,
  },
  // 구매: 묶음 간격 20, 가격 줄 폭 295(왼쪽 칸 192 · 간격 18)
  purchase: { width: '100%', alignItems: 'center', gap: 20 },
  priceRow: {
    width: '100%',
    maxWidth: 295,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 18,
  },
  priceLabel: {
    width: 192,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    paddingLeft: 36,
  },
  price: { height: 20, flexDirection: 'row', alignItems: 'center', gap: 5 },
  priceText: {
    color: color.base,
    fontFamily: 'PretendardMedium',
    fontSize: 16,
    includeFontPadding: false,
  },
  actions: { flexDirection: 'row', gap: 12, maxWidth: '100%' },
  button: {
    height: 48,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: { backgroundColor: color.fale, borderWidth: 1, borderColor: color.base },
  buttonPrimary: { backgroundColor: color.base, borderWidth: 1, borderColor: color.base },
  buttonBorderless: { borderWidth: 0 },
  buttonText: {
    color: color.base,
    fontFamily: 'PretendardRegular',
    fontSize: 16,
    textAlign: 'center',
  },
  buttonTextPrimary: { color: color.fale },
  buttonHalf: { width: 144, flexShrink: 1 },
  buttonFull: { width: '100%' },
  buttonFixed: { width: 144, flexShrink: 1 },
  buttonFit: { flexShrink: 1, paddingHorizontal: 12 },
  // 별가루 부족: 폭 300, 묶음 간격 20, 제목·안내 간격 16, 제목 위아래 8
  insufficient: { width: '100%', maxWidth: 300, gap: 20, alignItems: 'center' },
  insufficientMessage: { width: '100%', gap: 16, alignItems: 'center' },
  insufficientHeading: { paddingVertical: 8 },
  insufficientNotice: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 7,
  },
  // 변경 취소: 묶음 간격 40, 제목·안내 간격 28, 안내 줄 폭 300(왼쪽 36), 줄 간격 4.
  // Figma 는 오른쪽 45 여백을 두지만 글자 칸(246)이 그 여백을 넘어선다. 첫 줄이 한 줄에 들어가도록 오른쪽 여백은 두지 않는다.
  discard: { alignItems: 'center', gap: 40 },
  discardMessage: { gap: 28, alignItems: 'flex-start' },
  discardNotice: {
    width: 300,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    paddingLeft: 36,
  },
  discardLines: { flexShrink: 1, gap: 4 },
});
