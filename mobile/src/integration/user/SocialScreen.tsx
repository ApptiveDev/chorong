import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { TopDownRoom } from '../../components/house/TopDownRoom';
import { RoomScene, type RoomSceneItem } from '../../components/house/RoomScene';
import { useIntegration, useTask } from '../hooks';
import { mockVisibility } from '../mockVisibility';
import {
  type HousingCard,
  type HousingDetail,
  type HousingVisit,
  type InventoryItem,
  type ReportReason,
  type ShopItem,
} from '../models';
import { integrationApi as api, useMockApi } from '../runtime';
import { UserScreen, UserStatus } from './Screen';

const reportReasons: { value: ReportReason; label: string }[] = [
  { value: 'INAPPROPRIATE_NAME', label: '부적절한 이름' },
  { value: 'ABUSE', label: '괴롭힘' },
  { value: 'SPAM', label: '스팸' },
  { value: 'OTHER', label: '기타' },
];
const browseSort = 'recent';

export default function SocialScreen() {
  const session = useIntegration();
  const task = useTask();
  const router = useRouter();
  const { height: screenHeight } = useWindowDimensions();
  const mockPublic = useSyncExternalStore(
    mockVisibility.subscribe,
    mockVisibility.get,
    mockVisibility.get,
  );
  const [own, setOwn] = useState<HousingDetail | null>(null);
  const [cards, setCards] = useState<HousingCard[]>([]);
  const [visit, setVisit] = useState<HousingVisit | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [index, setIndex] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [showOwn, setShowOwn] = useState(true);
  const [dialog, setDialog] = useState<'login' | 'public' | 'private' | 'menu' | 'report' | null>(
    null,
  );
  const [reason, setReason] = useState<ReportReason>('OTHER');
  const [detail, setDetail] = useState('');
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const isPublic = useMockApi ? mockPublic : (own?.housing.isPublic ?? true);

  const load = () =>
    void task.run(async () => {
      const [myRoom, owned, shop] = await Promise.all([
        api.room.me(),
        api.room.inventory(),
        api.room.shop(),
      ]);
      setOwn(myRoom);
      setInventory(owned.items);
      setShopItems(shop.items);
      if (session.user?.status !== 'ACTIVE' || !myRoom.housing.isPublic) {
        setCards([]);
        setCursor(null);
        setVisit(null);
        setLoaded(true);
        return;
      }
      const page = await api.social.explore({ sort: browseSort, size: 20 });
      setCards(page.data.housings);
      setCursor(page.meta.nextCursor);
      setIndex(0);
      setVisit(
        page.data.housings.length ? await api.social.visit(page.data.housings[0].housingId) : null,
      );
      setLoaded(true);
    });
  useFocusEffect(
    useCallback(() => {
      if (session.ready && session.authenticated) load();
    }, [session.ready, session.authenticated, session.user?.status]),
  );
  useEffect(() => {
    if (!session.ready) return;
    if (session.user?.status === 'GUEST') setDialog('login');
    else setDialog((current) => (current === 'login' ? null : current));
  }, [session.ready, session.user?.status]);
  const browse = () => {
    if (session.user?.status !== 'ACTIVE') {
      setDialog('login');
      return;
    }
    if (!isPublic) {
      setDialog('public');
      return;
    }
    setShowOwn(false);
    setNotice('');
  };

  const next = () => {
    if (!cards.length) return;
    void task.run(async () => {
      let nextCards = cards;
      if (index + 1 >= cards.length && cursor) {
        const page = await api.social.explore({ sort: browseSort, size: 20, cursor });
        nextCards = [...cards, ...page.data.housings];
        setCards(nextCards);
        setCursor(page.meta.nextCursor);
      }
      const nextIndex = index + 1 < nextCards.length ? index + 1 : 0;
      setVisit(await api.social.visit(nextCards[nextIndex].housingId));
      setIndex(nextIndex);
      setShowOwn(false);
      setNotice('');
    });
  };
  const like = () => {
    if (!visit) return;
    void task.run(async () => {
      const state = visit.likedByMe
        ? await api.social.unlike(visit.housing.housingId)
        : await api.social.like(visit.housing.housingId);
      setVisit({
        ...visit,
        likedByMe: state.likedByMe,
        housing: { ...visit.housing, likeCount: state.likeCount },
      });
    });
  };
  const report = () => {
    if (!visit) return;
    void task.run(async () => {
      await api.social.report(visit.housing.housingId, reason, detail.trim() || undefined);
      setDialog(null);
      setNotice('신고를 접수했습니다.');
    });
  };
  const changeVisibility = (value: boolean) => {
    void task.run(async () => {
      const housing = await api.room.update({ isPublic: value });
      setOwn(
        (current) =>
          current && {
            ...current,
            housing: { ...current.housing, name: housing.name, isPublic: housing.isPublic },
          },
      );
      if (useMockApi) mockVisibility.set(housing.isPublic);
      setDialog(null);
      setNotice(value ? '우주선을 공개했습니다.' : '우주선을 비공개로 전환했습니다.');
      setShowOwn(!value);
      if (value) {
        const page = await api.social.explore({ sort: browseSort, size: 20 });
        setCards(page.data.housings);
        setCursor(page.meta.nextCursor);
        setIndex(0);
        setVisit(
          page.data.housings.length
            ? await api.social.visit(page.data.housings[0].housingId)
            : null,
        );
      } else {
        setCards([]);
        setCursor(null);
        setVisit(null);
      }
    });
  };

  const name = showOwn ? '내 우주선' : visit?.housing.name;
  const placements = showOwn ? (own?.placements ?? []) : visit ? visit.placements : [];
  const count = showOwn ? (own?.housing.likeCount ?? 0) : (visit?.housing.likeCount ?? 0);
  const sceneItems: RoomSceneItem[] = placements
    .filter((placement) => placement.area === 'INTERIOR')
    .map((placement) => ({
      key: placement.inventoryId,
      name:
        inventory.find((item) => item.inventoryId === placement.inventoryId)?.name ??
        shopItems.find((item) => item.itemId === placement.itemId)?.name ??
        '가구',
      color: typeof placement.option.color === 'string' ? placement.option.color : undefined,
      x: placement.transform.x,
      y: placement.transform.y,
      layer: placement.transform.layer,
    }));
  return (
    <UserScreen title="다른 우주선 구경" scroll={false} showTitle={false}>
      <View style={s.socialPage}>
        <View style={s.socialHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="뒤로"
            onPress={() => (showOwn ? router.back() : setShowOwn(true))}
            style={s.socialBack}
          >
            <Ionicons name="chevron-back" size={25} color="#282636" />
          </Pressable>
          <Text style={s.socialTitle} numberOfLines={1}>
            {name ?? '다른 우주선'}
          </Text>
          {!showOwn && visit ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="신고 또는 차단"
              onPress={() => setDialog('menu')}
              style={s.socialMenu}
            >
              <Ionicons name="ellipsis-horizontal" size={23} color="#655174" />
            </Pressable>
          ) : (
            <View style={s.socialMenu} />
          )}
        </View>
        <View style={s.socialMiddle}>
          {name && (isPublic || showOwn) ? (
            <>
              <View style={[s.socialScene, screenHeight < 750 && s.socialSceneShort]}>
                <RoomScene items={sceneItems} />
              </View>
              {showOwn ? (
                <View style={s.publicStatus}>
                  <Text style={s.socialMuted}>{isPublic ? '공개' : '비공개'}</Text>
                  <Text style={s.socialMuted}>♡ {count}</Text>
                </View>
              ) : null}
              <View style={s.socialBottom}>
                {!showOwn ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: task.busy }}
                    disabled={task.busy}
                    onPress={like}
                    style={[s.likeButton, visit?.likedByMe && s.likedButton]}
                  >
                    <Text style={s.likeText}>
                      {visit?.likedByMe ? '♥' : '♡'} {count}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: task.busy }}
                  disabled={task.busy}
                  onPress={showOwn ? browse : next}
                  style={s.socialPrimary}
                >
                  <Text style={s.socialPrimaryText}>
                    {showOwn ? '다른 우주선 구경하기' : '다음 우주선'}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : loaded ? (
            <View style={s.socialEmpty}>
              <Text style={s.socialMuted}>지금은 구경할 우주선이 없어요.</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowOwn(true)}
                style={s.socialPrimary}
              >
                <Text style={s.socialPrimaryText}>내 우주선으로 돌아가기</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={s.socialStatus}>
            <UserStatus task={task} />
            {notice ? <Text style={s.notice}>{notice}</Text> : null}
            {task.error && !loaded ? (
              <Pressable accessibilityRole="button" onPress={load} style={s.outlineButton}>
                <Text style={s.outlineText}>다시 불러오기</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <Modal
        visible={dialog !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDialog(null)}
      >
        <View style={s.overlay}>
          <View style={s.dialog}>
            {dialog === 'login' ? (
              <>
                <Text style={s.dialogTitle}>다른 우주선을 구경해요</Text>
                <Text style={s.dialogText}>로그인하면 다른 탐험가의 우주선을 볼 수 있어요.</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setDialog(null);
                    router.push({ pathname: '/more', params: { returnTo: '/social' } });
                  }}
                  style={s.primaryButton}
                >
                  <Text style={s.primaryText}>로그인·회원가입</Text>
                </Pressable>
              </>
            ) : dialog === 'public' ? (
              <>
                <Text style={s.dialogTitle}>공개하고 구경할까요?</Text>
                <Text style={s.dialogText}>
                  닉네임과 저장된 우주선이 공개돼요. 다른 우주선을 구경할 수 있어요.
                </Text>
                <Text style={s.caption}>이메일·별가루함은 공개하지 않아요.</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => changeVisibility(true)}
                  style={s.primaryButton}
                >
                  <Text style={s.primaryText}>공개하고 구경하기</Text>
                </Pressable>
              </>
            ) : dialog === 'private' ? (
              <>
                <Text style={s.dialogTitle}>비공개로 전환할까요?</Text>
                <Text style={s.dialogText}>내 우주선은 다른 사용자에게 보이지 않아요.</Text>
                <Text style={s.warning}>비공개하면 다른 우주선을 구경할 수 없어요!</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => changeVisibility(false)}
                  style={s.primaryButton}
                >
                  <Text style={s.primaryText}>비공개로 전환하기</Text>
                </Pressable>
              </>
            ) : dialog === 'menu' ? (
              <>
                <Text style={s.dialogTitle}>우주선 메뉴</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setDialog('report')}
                  style={s.outlineButton}
                >
                  <Text style={s.outlineText}>신고</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled
                  accessibilityState={{ disabled: true }}
                  style={[s.outlineButton, s.disabled]}
                >
                  <Text style={s.outlineText}>차단</Text>
                </Pressable>
                <Text style={s.caption}>
                  방문 응답에 사용자 ID가 없어 차단은 연결 대기 중입니다.
                </Text>
              </>
            ) : dialog === 'report' ? (
              <>
                <Text style={s.dialogTitle}>신고</Text>
                <Text style={s.dialogText}>
                  대상: {visit?.ownerNickname} · {visit?.housing.name}
                </Text>
                <View style={s.reasons}>
                  {reportReasons.map((entry) => (
                    <Pressable
                      key={entry.value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: reason === entry.value }}
                      onPress={() => setReason(entry.value)}
                      style={[s.reason, reason === entry.value && s.reasonSelected]}
                    >
                      <Text style={s.small}>{entry.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  accessibilityLabel="신고 내용"
                  placeholder="신고 내용 (선택)"
                  value={detail}
                  onChangeText={setDetail}
                  multiline
                  style={s.input}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: task.busy }}
                  disabled={task.busy}
                  onPress={report}
                  style={s.primaryButton}
                >
                  <Text style={s.primaryText}>신고 접수</Text>
                </Pressable>
              </>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => setDialog(null)}
              style={s.outlineButton}
            >
              <Text style={s.outlineText}>{dialog === 'login' ? '나중에 하기' : '취소'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </UserScreen>
  );
}

export function VisitScreen() {
  const { housingId } = useLocalSearchParams<{ housingId: string }>();
  const router = useRouter();
  const task = useTask();
  const [visit, setVisit] = useState<HousingVisit | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('OTHER');
  const [detail, setDetail] = useState('');
  const [notice, setNotice] = useState('');
  const id = Number(housingId);
  useEffect(() => {
    if (Number.isSafeInteger(id) && id > 0)
      void task.run(async () => setVisit(await api.social.visit(id)));
  }, [id]);
  const like = () => {
    if (!visit) return;
    void task.run(async () => {
      const result = visit.likedByMe ? await api.social.unlike(id) : await api.social.like(id);
      setVisit({
        ...visit,
        likedByMe: result.likedByMe,
        housing: { ...visit.housing, likeCount: result.likeCount },
      });
    });
  };
  const report = () =>
    void task.run(async () => {
      await api.social.report(id, reason, detail.trim() || undefined);
      setReportOpen(false);
      setNotice('신고를 접수했습니다.');
    });
  return (
    <UserScreen title="다른 우주선 구경" member>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={s.back}>
        <Ionicons name="chevron-back" size={18} color="#273a52" />
        <Text style={s.small}>돌아가기</Text>
      </Pressable>
      <UserStatus task={task} />
      {notice ? <Text style={s.notice}>{notice}</Text> : null}
      {visit ? (
        <>
          <View style={s.roomHeading}>
            <Text style={s.roomTitle}>
              {visit.ownerNickname} · {visit.housing.name}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="신고"
              onPress={() => setReportOpen(true)}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color="#273a52" />
            </Pressable>
          </View>
          <View style={s.roomFrame}>
            <TopDownRoom placements={visit.placements} />
          </View>
          <View style={s.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: task.busy }}
              disabled={task.busy}
              onPress={like}
              style={s.outlineButton}
            >
              <Text style={s.outlineText}>
                {visit.likedByMe ? '♥' : '♡'} {visit.housing.likeCount}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/social')}
              style={s.primaryButton}
            >
              <Text style={s.primaryText}>우주선 구경하기</Text>
            </Pressable>
          </View>
        </>
      ) : null}
      <Modal
        visible={reportOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setReportOpen(false)}
      >
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>신고</Text>
            <Text style={s.dialogText}>
              대상: {visit?.ownerNickname} · {visit?.housing.name}
            </Text>
            <View style={s.reasons}>
              {reportReasons.map((entry) => (
                <Pressable
                  key={entry.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: reason === entry.value }}
                  onPress={() => setReason(entry.value)}
                  style={[s.reason, reason === entry.value && s.reasonSelected]}
                >
                  <Text style={s.small}>{entry.label}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              accessibilityLabel="신고 내용"
              placeholder="신고 내용 (선택)"
              value={detail}
              onChangeText={setDetail}
              multiline
              style={s.input}
            />
            <Pressable accessibilityRole="button" onPress={report} style={s.primaryButton}>
              <Text style={s.primaryText}>신고 접수</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setReportOpen(false)}
              style={s.outlineButton}
            >
              <Text style={s.outlineText}>취소</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </UserScreen>
  );
}

const s = StyleSheet.create({
  socialPage: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: -18,
    marginTop: -12,
    backgroundColor: '#f8f6fc',
  },
  socialHeader: {
    minHeight: 74,
    paddingHorizontal: 21,
    paddingTop: 22,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  socialBack: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  socialTitle: { flex: 1, color: '#282636', fontSize: 17, fontWeight: '600' },
  socialMenu: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  socialMiddle: { flex: 1, minHeight: 0, position: 'relative' },
  socialScene: { marginTop: 28, paddingHorizontal: 20 },
  socialSceneShort: { width: 330, maxWidth: '100%', alignSelf: 'center' },
  publicStatus: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 17 },
  socialMuted: { color: '#a095ac', fontSize: 12, textAlign: 'center' },
  socialBottom: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    gap: 12,
    alignItems: 'center',
  },
  likeButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7dce9',
    borderRadius: 14,
  },
  likedButton: { backgroundColor: '#f5e7f0' },
  likeText: { color: '#ab8499', fontSize: 15 },
  socialPrimary: {
    minHeight: 52,
    width: '100%',
    borderRadius: 13,
    backgroundColor: '#373044',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  socialPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  socialEmpty: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 25 },
  socialStatus: { position: 'absolute', left: 24, right: 24, top: 400 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  small: { color: '#273a52', fontSize: 12 },
  ownButton: { borderWidth: 1, borderColor: '#dce2e8', borderRadius: 5, padding: 8 },
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#dce2e8',
    borderRadius: 7,
    padding: 11,
  },
  visibilityText: { flex: 1, gap: 3 },
  visibilityTitle: { color: '#273a52', fontSize: 13, fontWeight: '700' },
  caption: { color: '#7b8795', fontSize: 11, lineHeight: 17 },
  visibilityButton: {
    borderWidth: 1,
    borderColor: '#dce2e8',
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sortRow: { flexDirection: 'row', gap: 6 },
  sortButton: {
    borderWidth: 1,
    borderColor: '#dce2e8',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sortActive: { backgroundColor: '#273a52', borderColor: '#273a52' },
  sortActiveText: { color: '#fff' },
  roomHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roomTitle: { color: '#273a52', fontSize: 14, fontWeight: '700' },
  roomFrame: {
    backgroundColor: '#f2f4f7',
    borderWidth: 1,
    borderColor: '#dce2e8',
    borderRadius: 12,
    padding: 7,
  },
  actions: { flexDirection: 'row', gap: 7 },
  primaryButton: {
    flex: 1,
    minHeight: 52,
    backgroundColor: '#373044',
    borderRadius: 13,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  outlineButton: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#e7dce9',
    borderRadius: 13,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineText: { color: '#655174', fontSize: 12 },
  emptyRoom: {
    minHeight: 250,
    backgroundColor: '#f2f4f7',
    borderWidth: 1,
    borderColor: '#dce2e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    color: '#273a52',
    fontSize: 12,
    padding: 9,
    backgroundColor: '#f2f4f7',
    borderRadius: 5,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(52,39,60,0.39)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    backgroundColor: '#fff',
    borderRadius: 23,
    padding: 24,
    gap: 12,
  },
  dialogTitle: { color: '#282636', fontSize: 18, fontWeight: '700' },
  dialogText: { color: '#817790', fontSize: 13, lineHeight: 20 },
  warning: { color: '#b84b4b', fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reason: { borderWidth: 1, borderColor: '#e7dce9', borderRadius: 10, padding: 9 },
  reasonSelected: { borderColor: '#827299', backgroundColor: '#f4f1f8' },
  input: {
    borderWidth: 1,
    borderColor: '#e7dce9',
    borderRadius: 12,
    minHeight: 58,
    padding: 9,
    fontSize: 12,
    color: '#282636',
    textAlignVertical: 'top',
  },
});
