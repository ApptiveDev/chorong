import { useEffect, useState, useSyncExternalStore } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { TopDownRoom } from '../../components/house/TopDownRoom';
import { useIntegration, useTask } from '../hooks';
import { mockVisibility } from '../mockVisibility';
import {
  type HousingCard,
  type HousingDetail,
  type HousingVisit,
  type ReportReason,
} from '../models';
import { integrationApi as api, useMockApi } from '../runtime';
import { UserScreen, UserStatus } from './Screen';

const reportReasons: { value: ReportReason; label: string }[] = [
  { value: 'INAPPROPRIATE_NAME', label: '부적절한 이름' },
  { value: 'ABUSE', label: '괴롭힘' },
  { value: 'SPAM', label: '스팸' },
  { value: 'OTHER', label: '기타' },
];

export default function SocialScreen() {
  const session = useIntegration();
  const task = useTask();
  const router = useRouter();
  const mockPublic = useSyncExternalStore(
    mockVisibility.subscribe,
    mockVisibility.get,
    mockVisibility.get,
  );
  const [own, setOwn] = useState<HousingDetail | null>(null);
  const [cards, setCards] = useState<HousingCard[]>([]);
  const [visit, setVisit] = useState<HousingVisit | null>(null);
  const [index, setIndex] = useState(0);
  const [sort, setSort] = useState<'recent' | 'popular'>('recent');
  const [cursor, setCursor] = useState<string | null>(null);
  const [showOwn, setShowOwn] = useState(false);
  const [dialog, setDialog] = useState<'public' | 'private' | 'menu' | 'report' | null>(null);
  const [reason, setReason] = useState<ReportReason>('OTHER');
  const [detail, setDetail] = useState('');
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const isPublic = useMockApi ? mockPublic : (own?.housing.isPublic ?? true);

  const load = () =>
    void task.run(async () => {
      const myRoom = await api.room.me();
      setOwn(myRoom);
      if (!myRoom.housing.isPublic) {
        setCards([]);
        setCursor(null);
        setVisit(null);
        setLoaded(true);
        return;
      }
      const page = await api.social.explore({ sort, size: 20 });
      setCards(page.data.housings);
      setCursor(page.meta.nextCursor);
      setIndex(0);
      setVisit(
        page.data.housings.length ? await api.social.visit(page.data.housings[0].housingId) : null,
      );
      setLoaded(true);
    });
  useEffect(() => {
    if (session.ready && session.user?.status === 'ACTIVE') load();
  }, [session.ready, session.user?.status, sort]);
  useEffect(() => {
    if (own && !isPublic && !showOwn) setDialog('public');
  }, [own]);

  const next = () => {
    if (!cards.length) return;
    void task.run(async () => {
      let nextCards = cards;
      if (index + 1 >= cards.length && cursor) {
        const page = await api.social.explore({ sort, size: 20, cursor });
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
        const page = await api.social.explore({ sort, size: 20 });
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

  const name = showOwn ? own?.housing.name : visit?.housing.name;
  const owner = showOwn
    ? '내 우주선'
    : visit
      ? `${visit.ownerNickname} · ${visit.housing.name}`
      : '';
  const placements = showOwn ? (own?.placements ?? []) : visit ? visit.placements : [];
  const count = showOwn ? (own?.housing.likeCount ?? 0) : (visit?.housing.likeCount ?? 0);
  return (
    <UserScreen title="다른 우주선 구경" member>
      <View style={s.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={s.back}>
          <Ionicons name="chevron-back" size={18} color="#273a52" />
          <Text style={s.small}>나의 우주선</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowOwn((value) => !value)}
          style={s.ownButton}
        >
          <Text style={s.small}>{showOwn ? '다른 우주선 보기' : '내 우주선 보기'}</Text>
        </Pressable>
      </View>
      <View style={s.visibilityRow}>
        <View style={s.visibilityText}>
          <Text style={s.visibilityTitle}>내 우주선 {isPublic ? '공개 중' : '비공개'}</Text>
          <Text style={s.caption}>
            {isPublic
              ? '다른 사용자가 내 우주선을 볼 수 있어요.'
              : '비공개하면 다른 우주선을 구경할 수 없어요!'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: task.busy }}
          disabled={task.busy}
          onPress={() => setDialog(isPublic ? 'private' : 'public')}
          style={s.visibilityButton}
        >
          <Text style={s.small}>{isPublic ? '비공개' : '공개'}</Text>
        </Pressable>
      </View>
      <View style={s.sortRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSort('recent')}
          style={[s.sortButton, sort === 'recent' && s.sortActive]}
        >
          <Text style={[s.small, sort === 'recent' && s.sortActiveText]}>최신순</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSort('popular')}
          style={[s.sortButton, sort === 'popular' && s.sortActive]}
        >
          <Text style={[s.small, sort === 'popular' && s.sortActiveText]}>인기순</Text>
        </Pressable>
      </View>
      <UserStatus task={task} />
      {notice ? <Text style={s.notice}>{notice}</Text> : null}
      {name && (isPublic || showOwn) ? (
        <>
          <View style={s.roomHeading}>
            <Text style={s.roomTitle}>{owner}</Text>
            {!showOwn ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="신고 메뉴"
                onPress={() => setDialog('menu')}
              >
                <Ionicons name="ellipsis-horizontal" size={22} color="#273a52" />
              </Pressable>
            ) : null}
          </View>
          <View style={s.roomFrame}>
            <TopDownRoom placements={placements} />
          </View>
          <View style={s.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: showOwn || task.busy }}
              disabled={showOwn || task.busy}
              onPress={like}
              style={s.outlineButton}
            >
              <Text style={s.outlineText}>
                {visit?.likedByMe && !showOwn ? '♥' : '♡'} {count}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={showOwn ? () => setShowOwn(false) : next}
              style={s.primaryButton}
            >
              <Text style={s.primaryText}>{showOwn ? '다른 우주선 보기' : '다음 우주선'}</Text>
            </Pressable>
          </View>
        </>
      ) : loaded ? (
        <>
          <View style={s.emptyRoom}>
            <Text style={s.caption}>
              {!isPublic
                ? '내 우주선을 공개하면 다른 우주선을 구경할 수 있어요.'
                : '구경할 우주선이 없어요.'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => (!isPublic ? setDialog('public') : router.replace('/'))}
            style={s.primaryButton}
          >
            <Text style={s.primaryText}>
              {!isPublic ? '공개하고 구경하기' : '내 우주선으로 돌아가기'}
            </Text>
          </Pressable>
        </>
      ) : task.error ? (
        <Pressable accessibilityRole="button" onPress={load} style={s.outlineButton}>
          <Text style={s.outlineText}>다시 불러오기</Text>
        </Pressable>
      ) : null}

      <Modal
        visible={dialog !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDialog(null)}
      >
        <View style={s.overlay}>
          <View style={s.dialog}>
            {dialog === 'public' ? (
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
              <Text style={s.outlineText}>취소</Text>
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
    minHeight: 42,
    backgroundColor: '#273a52',
    borderRadius: 5,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  outlineButton: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#dce2e8',
    borderRadius: 5,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineText: { color: '#273a52', fontSize: 12 },
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
    backgroundColor: 'rgba(27,39,56,0.47)',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: { backgroundColor: '#fff', borderRadius: 8, padding: 17, gap: 10 },
  dialogTitle: { color: '#273a52', fontSize: 16, fontWeight: '700' },
  dialogText: { color: '#536578', fontSize: 12, lineHeight: 18 },
  warning: { color: '#b84b4b', fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reason: { borderWidth: 1, borderColor: '#dce2e8', borderRadius: 5, padding: 7 },
  reasonSelected: { borderColor: '#273a52', backgroundColor: '#f2f4f7' },
  input: {
    borderWidth: 1,
    borderColor: '#dce2e8',
    borderRadius: 5,
    minHeight: 58,
    padding: 9,
    fontSize: 12,
    color: '#273a52',
    textAlignVertical: 'top',
  },
});
