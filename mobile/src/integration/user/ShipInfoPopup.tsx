import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { RoomScene, type RoomSceneItem } from '../../components/house/RoomScene';
import type { HousingDetail, InventoryItem } from '../models';
import { shipColor as color } from './ShipStatus';

// 서버에 저장된 배치를 장면 아이템으로 바꾼다. 내 우주선 화면과 정보 팝업이 같은 결과를 그린다.
export function savedSceneItems(
  room: HousingDetail | null,
  inventory: InventoryItem[],
): RoomSceneItem[] {
  return (
    room?.placements.map((placement) => {
      const owned = inventory.find((item) => item.inventoryId === placement.inventoryId);
      const option = (owned?.option ?? placement.option) as Record<string, unknown>;
      return {
        key: placement.inventoryId,
        name: owned?.name ?? '배치 아이템',
        x: placement.transform.x,
        y: placement.transform.y,
        layer: placement.transform.layer,
        color: typeof option.color === 'string' ? option.color : undefined,
      };
    }) ?? []
  );
}

// Figma M06_1 중앙 팝업 · 내 공개 모습 (656:4410). 302×346, 배경 #F1F1F1, 모서리 8, 위 20 · 아래 24 · 좌우 20.
export function ShipInfoPopup({
  visible,
  nickname,
  isPublic,
  likeCount,
  items,
  onClose,
}: {
  visible: boolean;
  nickname: string | null;
  isPublic: boolean | null;
  likeCount: number | null;
  items: RoomSceneItem[];
  onClose: () => void;
}) {
  const status = isPublic === null ? '확인 중' : isPublic ? '공개' : '비공개';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.popup}>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={s.info}>
              <View style={s.heading}>
                <Text style={s.headingText}>
                  내 우주선 공개 상태
                  <Text style={s.statusText}> · {status}</Text>
                </Text>
              </View>
              <View style={s.owner}>
                <Text style={s.nickname} numberOfLines={1}>
                  {nickname?.trim() || '—'}
                </Text>
                <View style={s.like} accessible accessibilityLabel={`좋아요 ${likeCount ?? 0}개`}>
                  <Text style={s.likeText}>♡</Text>
                  <Text style={s.likeText}>{likeCount ?? 0}</Text>
                </View>
              </View>
            </View>
            <View style={s.ship}>
              <View style={s.sceneFit}>
                <RoomScene items={items} />
              </View>
            </View>
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="닫기"
            onPress={onClose}
            hitSlop={14}
            style={s.close}
          >
            <CloseIcon />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// Figma 656:4421 Union (12×12, #161616)
function CloseIcon() {
  return (
    <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
      <Path
        d="M10.4867 0.206751C10.7545 -0.0689167 11.1885 -0.0689167 11.4563 0.206751C11.724 0.482426 11.7241 0.929286 11.4563 1.20493L6.96968 5.82355L11.7992 10.7951C12.0669 11.0708 12.067 11.5177 11.7992 11.7933C11.5314 12.0689 11.0973 12.0689 10.8295 11.7933L6.00002 6.82172L1.1705 11.7933C0.902735 12.0689 0.468642 12.0689 0.200843 11.7933C-0.0669478 11.5176 -0.0669478 11.0708 0.200843 10.7951L5.03037 5.82355L0.543705 1.20493C0.275913 0.929258 0.275913 0.482418 0.543705 0.206751C0.811496 -0.068917 1.24557 -0.068917 1.51336 0.206751L6.00002 4.82537L10.4867 0.206751Z"
        fill={color.base}
      />
    </Svg>
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
  popup: {
    width: '100%',
    maxWidth: 302,
    maxHeight: '100%',
    backgroundColor: color.fale,
    borderRadius: 8,
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { gap: 8 },
  info: { gap: 8 },
  heading: { paddingHorizontal: 8 },
  headingText: { color: color.base, fontFamily: 'PretendardSemiBold', fontSize: 12 },
  // Figma 에 공개 여부 표시 칸이 없어 제목 옆에 같은 크기로 붙인다.
  statusText: { color: color.tertiary, fontFamily: 'PretendardRegular', fontSize: 12 },
  owner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 4,
  },
  nickname: { flexShrink: 1, color: color.base, fontFamily: 'PretendardBold', fontSize: 14 },
  // Figma 656:4419 Frame 134: 높이 20, 좌우 8, 글자 Pretendard Light 14 · 간격 8
  like: {
    height: 20,
    minWidth: 40,
    paddingHorizontal: 8,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  likeText: { color: color.base, fontFamily: 'PretendardLight', fontSize: 14 },
  // Figma 656:4420: 폭 262, 비율 239:230, 배경·테두리 #AAAAAA, 모서리 8
  ship: {
    width: '100%',
    aspectRatio: 239 / 230,
    backgroundColor: color.lght,
    borderWidth: 1,
    borderColor: color.lght,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sceneFit: { height: '100%', aspectRatio: 330 / 342 },
  // Figma 닫기: 왼쪽 278 · 위 14 (팝업 오른쪽 끝에서 12)
  close: { position: 'absolute', top: 14, right: 12, width: 12, height: 12 },
});
