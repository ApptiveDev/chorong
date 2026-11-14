import { StyleSheet, Text, View } from 'react-native';
import { Bullet, DialogButton, Frame } from './HousingConfirmModals';

// Figma 342:632 Frame 87 · 복습할 문제 없음. 별가루 부족 모달과 같은 공용 틀(폭 358 · 안쪽 28)을 쓴다.
// 버튼은 Figma 문구대로 학습 홈으로 이동하고, 뒤로 가기(onRequestClose)는 모달만 닫는다.
export function ReviewEmptyModal({
  visible,
  onClose,
  onGoHome,
}: {
  visible: boolean;
  onClose: () => void;
  onGoHome: () => void;
}) {
  return (
    <Frame
      visible={visible}
      onRequestClose={onClose}
      padding={{ horizontal: 28, vertical: 28 }}
      borderColor="#000000"
    >
      <View style={s.content}>
        <View style={s.message}>
          <View style={s.heading}>
            <Text style={s.title} numberOfLines={1} adjustsFontSizeToFit>
              더 이상 복습할 문제가 없어요.
            </Text>
          </View>
          <View style={s.notice}>
            <Bullet />
            <Text style={s.copy}>새로운 내용을 배운 뒤 다시 확인해 주세요.</Text>
          </View>
        </View>
        <DialogButton
          label="학습 홈으로"
          primary
          bordered={false}
          style={s.button}
          onPress={onGoHome}
        />
      </View>
    </Frame>
  );
}

const s = StyleSheet.create({
  // Frame 40: 폭 300, 안내 묶음과 버튼 간격 16
  content: { width: '100%', maxWidth: 300, gap: 16, alignItems: 'center' },
  // Frame 39: 제목과 안내 간격 16
  message: { width: '100%', gap: 16, alignItems: 'center' },
  // Frame 38: 위아래 8
  heading: { maxWidth: '100%', paddingVertical: 8 },
  title: {
    maxWidth: '100%',
    color: '#161616',
    fontFamily: 'PretendardSemiBold',
    fontSize: 24,
    textAlign: 'center',
  },
  // Frame 27: 좌우 12, 기호와 문구 간격 7, 왼쪽 정렬
  notice: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    paddingHorizontal: 12,
  },
  copy: {
    flexShrink: 1,
    color: '#161616',
    fontFamily: 'PretendardRegular',
    fontSize: 15,
    lineHeight: 18,
    includeFontPadding: false,
  },
  button: { width: '100%' },
});
