import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { RoomScene, type RoomSceneItem } from '../../components/house/RoomScene';
import type { HousingCard, HousingVisit, ShopItem } from '../models';
import { integrationApi as api } from '../runtime';
import { shipColor as color, ShipTabsHeader } from './ShipStatus';
import { BlockModal, ReportModal } from './SocialConfirmModals';

// Figma D01_2 구경하기 (547:2653) · 더보기 열린 상태 (656:1471)
const PAGE_SIZE = 20;
const MENU_WIDTH = 80;
const SWIPE_SLOP = 12;
type LikeView = { likeCount: number; likedByMe: boolean };
type MenuPosition = { left: number; top: number };

const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message.replace(/^[A-Z_]+:\s*/, '').replace(/\s*\(HTTP \d+\)$/, '')
    : '요청 실패';

export function BrowseView({
  shopItems,
  onMyShip,
}: {
  shopItems: ShopItem[];
  onMyShip: () => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  // 칸 폭은 스와이프 영역의 실제 폭을 쓴다. 웹에서는 앱이 창보다 좁은 틀(WebFrame) 안에 그려진다.
  const [width, setWidth] = useState(windowWidth);
  const [cards, setCards] = useState<HousingCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  // 하우징 ID 별 캐시. 이전·현재·다음 우주선을 미리 받아 두고, 받은 것은 다시 요청하지 않는다.
  const [visits, setVisits] = useState<Record<number, HousingVisit>>({});
  const [unavailable, setUnavailable] = useState<Record<number, true>>({});
  // 좋아요 API 응답(LikeState). 하우징 ID 별로 따로 둬서 다른 우주선에 섞이지 않는다.
  const [likes, setLikes] = useState<Record<number, LikeView>>({});
  const [likeBusy, setLikeBusy] = useState(false);
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const [dialog, setDialog] = useState<'report' | 'block' | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const run = useRef(0);
  const inflight = useRef(new Set<number>());
  const pageLoading = useRef(false);
  const visitsRef = useRef(visits);
  visitsRef.current = visits;
  const unavailableRef = useRef(unavailable);
  unavailableRef.current = unavailable;
  const dotsRef = useRef<View>(null);
  const current = cards[index] ?? null;

  const load = useCallback(async () => {
    const token = ++run.current;
    inflight.current = new Set();
    pageLoading.current = false;
    setStatus('loading');
    setLoadError(null);
    setMenu(null);
    setDialog(null);
    setNotice('');
    try {
      const page = await api.social.explore({ sort: 'recent', size: PAGE_SIZE });
      if (token !== run.current) return;
      setCards(page.data.housings);
      setCursor(page.meta.nextCursor);
      setIndex(0);
      setVisits({});
      setUnavailable({});
      setLikes({});
      setStatus('ready');
    } catch (error) {
      if (token !== run.current) return;
      setLoadError(errorText(error));
      setStatus('error');
    }
  }, []);
  // 탭에 돌아올 때마다 목록을 새로 받는다. 차단·차단 해제·공개 변경이 바로 반영된다.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const fetchVisit = useCallback((housingId: number) => {
    if (visitsRef.current[housingId] || unavailableRef.current[housingId]) return;
    const pending = inflight.current;
    if (pending.has(housingId)) return;
    const token = run.current;
    pending.add(housingId);
    api.social
      .visit(housingId)
      .then((visit) => {
        if (token === run.current) setVisits((prev) => ({ ...prev, [housingId]: visit }));
      })
      .catch(() => {
        // 비공개 전환·차단·정지 등으로 볼 수 없는 우주선(ERR-42)
        if (token === run.current) setUnavailable((prev) => ({ ...prev, [housingId]: true }));
      })
      .finally(() => pending.delete(housingId));
  }, []);

  const loadMore = useCallback(async () => {
    if (!cursor || pageLoading.current) return;
    const token = run.current;
    pageLoading.current = true;
    try {
      const page = await api.social.explore({ sort: 'recent', size: PAGE_SIZE, cursor });
      if (token !== run.current) return;
      setCards((prev) => {
        const seen = new Set(prev.map((card) => card.housingId));
        return [...prev, ...page.data.housings.filter((card) => !seen.has(card.housingId))];
      });
      setCursor(page.meta.nextCursor);
    } catch {
      // 다음 스와이프 때 다시 시도한다.
    } finally {
      if (token === run.current) pageLoading.current = false;
    }
  }, [cursor]);

  // 현재·다음·이전 우주선만 받는다. 끝에서 두 번째에 오면 다음 페이지를 한 번 받는다.
  useEffect(() => {
    if (status !== 'ready') return;
    [index, index + 1, index - 1].forEach((position) => {
      const card = cards[position];
      if (card) fetchVisit(card.housingId);
    });
    if (cursor && index >= cards.length - 2) void loadMore();
  }, [status, index, cards, cursor, fetchVisit, loadMore]);

  const likeOf = (card: HousingCard): LikeView => {
    const override = likes[card.housingId];
    if (override) return override;
    const visit = visits[card.housingId];
    return visit
      ? { likeCount: visit.housing.likeCount, likedByMe: visit.likedByMe }
      : { likeCount: card.likeCount, likedByMe: card.likedByMe };
  };

  const toggleLike = async () => {
    if (!current || likeBusy) return;
    const housingId = current.housingId;
    const state = likeOf(current);
    const token = run.current;
    setLikeBusy(true);
    try {
      const next = state.likedByMe
        ? await api.social.unlike(housingId)
        : await api.social.like(housingId);
      if (token === run.current) setLikes((prev) => ({ ...prev, [housingId]: next }));
    } catch {
      if (token !== run.current) return;
      setNotice('좋아요를 반영하지 못했습니다.');
      // 실패하면 서버의 최신 상태로 다시 맞춘다.
      try {
        const fresh = await api.social.visit(housingId);
        if (token !== run.current) return;
        setVisits((prev) => ({ ...prev, [housingId]: fresh }));
        setLikes((prev) => {
          const next = { ...prev };
          delete next[housingId];
          return next;
        });
      } catch {
        // 기존 표시를 유지한다.
      }
    } finally {
      setLikeBusy(false);
    }
  };

  // 좌우 스와이프: 이전·현재·다음 세 칸을 나란히 두고 끌면 다음 칸이 따라 들어온다.
  // 끄는 거리와 넘김 거리 모두 한 칸 폭까지만. 다음 칸이 가운데에 딱 맞으면 멈춘다(쇼츠·릴스처럼).
  const offset = useRef(new Animated.Value(0)).current;
  const locked = useRef(false);
  const shifted = useRef(false);
  const gate = useRef({ canPrev: false, canNext: false, blocked: true, width });
  gate.current = {
    canPrev: index > 0,
    canNext: index < cards.length - 1,
    blocked: status !== 'ready' || menu !== null || dialog !== null,
    width,
  };
  const actions = useRef({ step: (_delta: number) => {}, edge: (_next: boolean) => {} });
  actions.current = {
    step: (delta) => {
      setIndex((value) => value + delta);
      setMenu(null);
      setNotice('');
    },
    edge: (next) =>
      setNotice(
        next
          ? cursor
            ? '다음 우주선을 불러오는 중이에요.'
            : '마지막 우주선이에요.'
          : '첫 번째 우주선이에요.',
      ),
  };
  const pan = useRef(
    PanResponder.create({
      // 가로 이동이 세로보다 1.5배 이상 크고 12 를 넘을 때만 스와이프로 본다. 버튼 탭은 그대로 전달된다.
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        !locked.current &&
        !gate.current.blocked &&
        Math.abs(gesture.dx) > SWIPE_SLOP &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, gesture) => {
        const { canPrev, canNext, width: pageWidth } = gate.current;
        const edge = (gesture.dx > 0 && !canPrev) || (gesture.dx < 0 && !canNext);
        const dx = edge ? gesture.dx * 0.25 : gesture.dx;
        offset.setValue(Math.max(-pageWidth, Math.min(pageWidth, dx)));
      },
      onPanResponderRelease: (_, gesture) => {
        const { canPrev, canNext, width: pageWidth } = gate.current;
        const next = gesture.dx < 0;
        const passed =
          Math.abs(gesture.dx) > Math.min(80, pageWidth * 0.2) || Math.abs(gesture.vx) > 0.5;
        if (passed && (next ? canNext : canPrev)) {
          // 한 번에 한 칸만 넘긴다. 넘김이 끝나 위치를 되돌릴 때까지 새 스와이프를 받지 않는다.
          locked.current = true;
          Animated.timing(offset, {
            toValue: next ? -pageWidth : pageWidth,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            shifted.current = true;
            actions.current.step(next ? 1 : -1);
          });
          return;
        }
        if (passed) actions.current.edge(next);
        Animated.spring(offset, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
      onPanResponderTerminate: () =>
        Animated.spring(offset, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start(),
    }),
  ).current;
  // 칸 내용이 한 칸씩 밀린 뒤 화면에 그리기 전에 위치를 가운데로 되돌린다.
  useLayoutEffect(() => {
    if (!shifted.current) return;
    shifted.current = false;
    offset.setValue(0);
    locked.current = false;
  }, [index, offset]);

  const toggleMenu = () => {
    if (menu) {
      setMenu(null);
      return;
    }
    dotsRef.current?.measureInWindow((x, y) => {
      // Figma: 메뉴 오른쪽 끝은 ··· 왼쪽에서 12, 위쪽은 ··· 보다 2.5 위
      setMenu({
        left: Math.max(8, Math.min(x - 12 - MENU_WIDTH, windowWidth - MENU_WIDTH - 8)),
        top: Math.max(8, y - 2.5),
      });
    });
  };

  const openDialog = (kind: 'report' | 'block') => {
    setMenu(null);
    setDialogError(null);
    setDialog(kind);
  };
  const closeDialog = () => {
    if (dialogBusy) return;
    setDialog(null);
    setDialogError(null);
  };

  const submitReport = async (detail: string) => {
    if (!current || dialogBusy) return;
    setDialogBusy(true);
    setDialogError(null);
    try {
      await api.social.report(current.housingId, 'OTHER', detail);
      setDialog(null);
      setNotice('신고를 접수했습니다.');
    } catch (error) {
      setDialogError(errorText(error));
    } finally {
      setDialogBusy(false);
    }
  };

  const confirmBlock = async () => {
    if (!current || dialogBusy) return;
    const housingId = current.housingId;
    setDialogBusy(true);
    setDialogError(null);
    try {
      // API-806 은 userId 를 받는다. 탐색·구경 응답에는 userId 가 없고, 현재 서버는 하우징 ID 로
      // 소유자 user_id 를 쓴다(HousingExploreService). 계약에 소유자 ID 가 생기면 그 값으로 바꾼다.
      await api.social.block(housingId);
      const remaining = cards.filter((card) => card.housingId !== housingId);
      setCards(remaining);
      // 같은 자리에 다음 우주선이 온다. 마지막이었다면 앞 우주선으로 간다.
      setIndex(Math.min(index, Math.max(0, remaining.length - 1)));
      setVisits((prev) => {
        const next = { ...prev };
        delete next[housingId];
        return next;
      });
      setLikes((prev) => {
        const next = { ...prev };
        delete next[housingId];
        return next;
      });
      setDialog(null);
      setNotice('사용자를 차단했습니다.');
    } catch (error) {
      setDialogError(errorText(error));
    } finally {
      setDialogBusy(false);
    }
  };

  // 칸에 넘기는 콜백은 한 번만 만든다. 최신 상태는 ref 로 읽어 ShipPage memo 가 깨지지 않게 한다.
  const latest = useRef({ like: () => {}, more: () => {} });
  latest.current = { like: () => void toggleLike(), more: toggleMenu };
  const onLike = useCallback(() => latest.current.like(), []);
  const onMore = useCallback(() => latest.current.more(), []);
  const slots = [index - 1, index, index + 1];

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.page}>
        <ShipTabsHeader active="browse" onMine={onMyShip} />
        <View style={s.headerGap} />
        {status === 'loading' ? (
          <View style={s.state}>
            <ActivityIndicator color={color.fale} accessibilityLabel="우주선을 불러오는 중" />
          </View>
        ) : status === 'error' ? (
          <View style={s.state}>
            <Text style={s.stateText}>{loadError ?? '우주선을 불러오지 못했습니다.'}</Text>
            <Pressable accessibilityRole="button" onPress={() => void load()} hitSlop={8}>
              <Text style={s.retry}>다시 불러오기</Text>
            </Pressable>
          </View>
        ) : !cards.length ? (
          <View style={s.state}>
            <Text style={s.stateText}>지금은 구경할 우주선이 없어요.</Text>
            {notice ? <Text style={s.notice}>{notice}</Text> : null}
          </View>
        ) : (
          <View
            style={s.swipeArea}
            onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
            {...pan.panHandlers}
          >
            {/* 칸 위치는 퍼센트로 둔다(이전 -100% · 현재 0% · 다음 100%). 측정 폭과 관계없이 현재 칸이 가운데에 온다. */}
            <Animated.View
              style={[s.track, { transform: [{ translateX: offset }] }]}
              accessibilityHint="좌우로 밀어 다른 우주선을 봅니다"
            >
              {slots.map((position, slot) => {
                const card = cards[position];
                if (!card) return null;
                const active = slot === 1;
                return (
                  <View
                    key={card.housingId}
                    style={[s.slot, { left: `${(slot - 1) * 100}%` }]}
                    pointerEvents={active ? 'auto' : 'none'}
                    importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
                  >
                    <ShipPage
                      card={card}
                      visit={visits[card.housingId] ?? null}
                      unavailable={Boolean(unavailable[card.housingId])}
                      likeCount={likeOf(card).likeCount}
                      likedByMe={likeOf(card).likedByMe}
                      likeBusy={active && likeBusy}
                      shopItems={shopItems}
                      dotsRef={active ? dotsRef : undefined}
                      onLike={active ? onLike : undefined}
                      onMore={active ? onMore : undefined}
                    />
                    {active && notice ? <Text style={s.notice}>{notice}</Text> : null}
                  </View>
                );
              })}
            </Animated.View>
          </View>
        )}
      </View>

      {/* 더보기 메뉴: 바깥이나 ··· 자리를 누르면 닫힌다. */}
      <Modal
        visible={menu !== null}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setMenu(null)}
      >
        <Pressable
          accessibilityLabel="메뉴 닫기"
          style={StyleSheet.absoluteFill}
          onPress={() => setMenu(null)}
        />
        {menu ? (
          <View style={[s.menu, menu]}>
            <MenuItem label="신고하기" top onPress={() => openDialog('report')} />
            <MenuItem label="차단하기" onPress={() => openDialog('block')} />
          </View>
        ) : null}
      </Modal>

      <ReportModal
        visible={dialog === 'report'}
        busy={dialogBusy}
        error={dialogError}
        onCancel={closeDialog}
        onSubmit={(detail) => void submitReport(detail)}
      />
      <BlockModal
        visible={dialog === 'block'}
        busy={dialogBusy}
        error={dialogError}
        onCancel={closeDialog}
        onConfirm={() => void confirmBlock()}
      />
    </SafeAreaView>
  );
}

// 한 사용자의 우주선 칸. 같은 카드·방문 데이터면 다시 그리지 않는다.
const ShipPage = memo(function ShipPage({
  card,
  visit,
  unavailable,
  likeCount,
  likedByMe,
  likeBusy,
  shopItems,
  dotsRef,
  onLike,
  onMore,
}: {
  card: HousingCard;
  visit: HousingVisit | null;
  unavailable: boolean;
  likeCount: number;
  likedByMe: boolean;
  likeBusy: boolean;
  shopItems: ShopItem[];
  dotsRef?: React.RefObject<View | null>;
  onLike?: () => void;
  onMore?: () => void;
}) {
  const items = useMemo<RoomSceneItem[]>(
    () =>
      visit?.placements
        .filter((placement) => placement.area === 'INTERIOR')
        .map((placement) => ({
          key: placement.inventoryId,
          name: shopItems.find((item) => item.itemId === placement.itemId)?.name ?? '가구',
          color: typeof placement.option.color === 'string' ? placement.option.color : undefined,
          x: placement.transform.x,
          y: placement.transform.y,
          layer: placement.transform.layer,
        })) ?? [],
    [visit, shopItems],
  );
  const nickname = visit?.ownerNickname ?? card.ownerNickname;
  return (
    <View style={s.column}>
      <View style={s.nameRow}>
        <Text style={s.nickname} numberOfLines={1}>
          {nickname}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${nickname} 우주선 더보기`}
          disabled={!onMore}
          onPress={onMore}
          hitSlop={14}
        >
          <View ref={dotsRef} collapsable={false} style={s.dots}>
            <MoreDots />
          </View>
        </Pressable>
      </View>
      <View style={s.shipGroup}>
        <View style={s.roomBox}>
          {visit ? (
            <View style={s.sceneFit}>
              <RoomScene items={items} />
            </View>
          ) : unavailable ? (
            <Text style={s.boxText}>볼 수 없는 우주선이에요.</Text>
          ) : (
            <ActivityIndicator color={color.secondary} accessibilityLabel="우주선을 불러오는 중" />
          )}
        </View>
        <View style={s.likeRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`좋아요 ${likeCount}개`}
            accessibilityState={{ selected: likedByMe, disabled: likeBusy || !onLike }}
            disabled={likeBusy || !onLike}
            onPress={onLike}
            hitSlop={12}
            style={s.like}
          >
            <Heart liked={likedByMe} disabled={likeBusy} />
            <View style={s.likeCount}>
              <Text style={[s.likeText, likeBusy && s.likeTextDisabled]}>{likeCount}</Text>
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
});

// Figma 655:1462 Frame 147: 80×40, 배경 #F1F1F1, 테두리 1 #161616, 글자 SemiBold 14 #424242(눌림 #AAAAAA)
function MenuItem({
  label,
  top = false,
  onPress,
}: {
  label: string;
  top?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[s.menuItem, top ? s.menuItemTop : s.menuItemBottom]}
    >
      {({ pressed }) => <Text style={[s.menuText, pressed && s.menuTextPressed]}>{label}</Text>}
    </Pressable>
  );
}

// Figma 656:4074 Component 1: pressed(좋아요함) 채운 하트 #F92669, Variant2 빈 하트 #F1F1F1, disabled #AAAAAA
function Heart({ liked, disabled }: { liked: boolean; disabled: boolean }) {
  return (
    <Svg width={20} height={18} viewBox="0 0 20 18" fill="none">
      {liked ? (
        <Path
          d="M2.54172 10.9172C0.872914 9.32971 0.0256739 7.54681 0 5.69064C0.0256739 2.54003 2.69576 0 5.98203 0C7.47112 0 8.93453 0.537314 9.98716 1.51425C11.0911 0.537314 12.5289 0 14.0436 0C17.3042 0 19.9743 2.54003 20 5.69064C19.9743 7.54681 19.1271 9.32971 17.484 10.9172L9.98716 18L2.54172 10.9172Z"
          fill={disabled ? color.lght : '#f92669'}
        />
      ) : (
        <Path
          d="M2.54172 10.9172C0.872914 9.32971 0.0256739 7.54681 0 5.69064C0.0256739 2.54003 2.69576 0 5.98203 0C7.47112 0 8.93453 0.537313 9.98716 1.51425C11.0911 0.537313 12.5289 0 14.0436 0C17.3042 0 19.9743 2.54003 20 5.69064C19.9743 7.54681 19.1271 9.32971 17.484 10.9172L9.98716 18L2.54172 10.9172ZM16.3286 9.86703C17.715 8.54817 18.4082 7.13161 18.4339 5.69064C18.4082 3.37042 16.4313 1.51425 14.0436 1.51425C12.6829 1.51425 11.4506 2.07598 9.98716 3.76119C8.54942 2.07598 7.31707 1.51425 5.98203 1.51425C3.56868 1.51425 1.61746 3.37042 1.59178 5.69064C1.61746 7.13161 2.28498 8.54817 3.67137 9.86703L9.98716 15.8752L16.3286 9.86703Z"
          fill={disabled ? color.lght : color.fale}
        />
      )}
    </Svg>
  );
}

// Figma 655:1414 Frame 137 (점 3개, 20×4, #F1F1F1)
function MoreDots() {
  return (
    <Svg width={20} height={4} viewBox="0 0 20 4" fill="none">
      <Circle cx={2} cy={2} r={2} fill={color.fale} />
      <Circle cx={10} cy={2} r={2} fill={color.fale} />
      <Circle cx={18} cy={2} r={2} fill={color.fale} />
    </Svg>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.base },
  page: { flex: 1, minHeight: 0, paddingTop: 32 },
  // Figma 헤더와 우주선 묶음 사이 80. 화면이 짧으면 줄어든다.
  headerGap: { height: 80, flexShrink: 1, minHeight: 16 },
  state: { flex: 1, alignItems: 'center', paddingTop: 120, gap: 12, paddingHorizontal: 40 },
  stateText: {
    color: color.lght,
    fontFamily: 'PretendardRegular',
    fontSize: 14,
    textAlign: 'center',
  },
  retry: { color: color.fale, fontFamily: 'PretendardMedium', fontSize: 14 },
  swipeArea: { flex: 1, minHeight: 0, overflow: 'hidden' },
  track: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  slot: { position: 'absolute', top: 0, width: '100%' },
  // Figma 547:2660 Frame 88: 폭 312, 간격 12 (좌우 40 안쪽)
  column: {
    width: '100%',
    maxWidth: 312 + 80,
    paddingHorizontal: 40,
    alignSelf: 'center',
    gap: 12,
  },
  nameRow: {
    minHeight: 24,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  nickname: {
    flexShrink: 1,
    maxWidth: 216,
    color: color.fale,
    fontFamily: 'PretendardSemiBold',
    fontSize: 20,
  },
  dots: { width: 20, height: 4 },
  shipGroup: { gap: 20 },
  roomBox: {
    width: '100%',
    aspectRatio: 312 / 300,
    backgroundColor: color.mist,
    borderWidth: 1,
    borderColor: color.lght,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sceneFit: { height: '100%', aspectRatio: 330 / 342 },
  boxText: { color: color.secondary, fontFamily: 'PretendardRegular', fontSize: 14 },
  likeRow: { paddingHorizontal: 8, flexDirection: 'row', justifyContent: 'flex-end' },
  // Figma 656:4075: 하트 20×18 + 숫자 칸(폭 20, Medium 12 #F1F1F1)
  like: { height: 20, flexDirection: 'row', alignItems: 'center' },
  likeCount: { minWidth: 20, paddingHorizontal: 4, alignItems: 'center' },
  likeText: { color: color.fale, fontFamily: 'PretendardMedium', fontSize: 12 },
  likeTextDisabled: { color: color.lght },
  notice: {
    marginTop: 16,
    color: color.lght,
    fontFamily: 'PretendardRegular',
    fontSize: 12,
    textAlign: 'center',
  },
  menu: { position: 'absolute', width: MENU_WIDTH },
  menuItem: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fale,
    borderWidth: 1,
    borderColor: color.base,
  },
  menuItemTop: { marginBottom: -1, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  menuItemBottom: { borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  menuText: { color: color.secondary, fontFamily: 'PretendardSemiBold', fontSize: 14 },
  menuTextPressed: { color: color.lght },
});
