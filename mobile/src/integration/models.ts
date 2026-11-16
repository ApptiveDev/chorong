import {
  array,
  bool,
  enumeration,
  nullable,
  num,
  object,
  optional,
  real,
  str,
  unknownObject,
  type Infer,
} from './schema';

export type Platform = 'IOS' | 'ANDROID';
export type Provider = 'email' | 'google' | 'kakao' | 'apple';
export type OAuthCredential = {
  idToken?: string;
  accessToken?: string;
  authorizationCode?: string;
};
export type QuizAnswer =
  | { index: number }
  | { texts: string[] }
  | { value: boolean }
  | { order: number[] }
  | { position: number };
export type PageQuery = { cursor?: string; size?: number };
export type ReportReason = 'INAPPROPRIATE_NAME' | 'ABUSE' | 'SPAM' | 'OTHER';
export const status = enumeration('GUEST', 'ACTIVE', 'WITHDRAWN');
// userCode: 42 로 시작하는 8자리 계정 고유번호(0.4.1). 서버가 아직 보내지 않으면 생략된다.
const userCode = optional(str);
export const userBrief = object({ userId: num, userCode, nickname: str, status });
export const tokenPair = object({ accessToken: str, refreshToken: str, expiresIn: num });
export const authResponse = object({
  accessToken: str,
  refreshToken: str,
  expiresIn: num,
  user: userBrief,
  isNew: bool,
});
export const wallet = object({
  stardust: num,
  energy: optional(num),
  energyResetsAt: optional(str),
});
export const providers = object({
  providers: array(enumeration('EMAIL', 'GOOGLE', 'KAKAO', 'APPLE', 'GUEST')),
});
export const me = object({
  userId: num,
  userCode,
  nickname: str,
  status,
  providers: array(str),
  wallet,
  progress: object({ completedLessons: num, totalLessons: num }),
  housing: object({ isPublic: bool, likeCount: num }),
  onboardingCompleted: bool,
  pushEnabled: bool,
  streakDays: num,
  lastStudyDate: nullable(str),
});
export const lessonStatus = enumeration('LOCKED', 'UNLOCKED', 'IN_PROGRESS', 'COMPLETED');
export const lessonSummary = object({
  lessonId: num,
  title: str,
  order: num,
  status: lessonStatus,
  // 0.4.1 에서 하루 해금이 없어져 명세에서 빠졌다. 서버는 호환용으로 null 을 보낸다.
  unlocksAt: optional(nullable(str)),
  completedAt: nullable(str),
});
const courseFields = {
  courseId: num,
  title: str,
  // 분야·주제는 0.4.0 에서 명세에서 빠졌다. 서버는 호환용으로 보내지만 가져오기로 넣은 별자리는 null 이다.
  category: optional(nullable(str)),
  topic: optional(nullable(str)),
  totalLessons: num,
  completedLessons: num,
  constellation: nullable(object({ constellationId: num, name: str })),
};
export const courseSummary = object(courseFields);
export const courseDetail = object({
  ...courseFields,
  description: str,
  lessons: array(lessonSummary),
});
export const quizInteractionType = enumeration(
  'OX',
  'SINGLE',
  'MULTI',
  'BLANK',
  'SLIDER',
  'MATCH',
  'CHOSUNG',
);
const singlePresentation = object({
  type: enumeration('AUDIO', 'TILE', 'ZOOM_OUT', 'SHARPEN', 'INLINE_WORD'),
  mediaUrl: optional(str),
  stages: optional(array(num)),
  rows: optional(num),
  columns: optional(num),
});
export type SinglePresentation = Pick<Infer<typeof singlePresentation>, 'type'> &
  Partial<Omit<Infer<typeof singlePresentation>, 'type'>>;
const quizConfig = (value: unknown, path = '$') => {
  const config = unknownObject(value, path);
  if (config.presentation !== undefined)
    singlePresentation(config.presentation, `${path}.presentation`);
  return config as Record<string, unknown> & { presentation?: SinglePresentation };
};
export const quizMetadata = object({
  interactionType: optional(quizInteractionType),
  config: optional(quizConfig),
  instruction: optional(str),
  difficulty: optional(str),
  quizOrder: optional(num),
  lessonId: optional(num),
  // 학습 레슨의 첫 퀴즈만 false(0.4.1). 점수·복습에 넣지 않고 결과는 정답·오답 없이 보여 준다.
  graded: optional(bool),
});
const quizBase = object({
  quizId: num,
  type: enumeration('MULTIPLE_CHOICE', 'FILL_BLANK', 'OX', 'ORDERING', 'CHOSUNG', 'SLIDER'),
  question: str,
  options: nullable(unknownObject),
  hint: nullable(str),
});
export const quiz = (value: unknown, path = '$') => {
  quizMetadata(value, path);
  return quizBase(value, path) as Infer<typeof quizBase> & Partial<Infer<typeof quizMetadata>>;
};
const contentBase = object({
  contentId: num,
  order: num,
  contentType: enumeration('TEXT', 'IMAGE', 'VIDEO', 'QUIZ'),
  body: nullable(str),
  mediaUrl: nullable(str),
  quiz: nullable(quiz),
});
// API v2 에서만 오는 선택 필드. TEXT 콘텐츠의 화자별 대사(배열 순서대로 표시)와 출처를
// body 와 별도로 보존한다. 목업 콘텐츠는 생략할 수 있게 선택 속성으로 둔다.
const contentExtra = object({
  // speaker 는 0.4.1 부터 선택값이다. 화자 없는 해설 대사는 생략된다.
  dialogue: optional(array(object({ speaker: optional(str), text: str }))),
  // IMAGE(개념) 화면에서 그림과 함께 강조하는 개념 키워드. 값이 없으면 생략된다.
  keyword: optional(nullable(str)),
  source: optional(str),
  segmentId: optional(str),
});
export const content = (v: unknown, p = '$') => {
  contentExtra(v, p);
  return contentBase(v, p) as Infer<typeof contentBase> & Partial<Infer<typeof contentExtra>>;
};
const lessonExtra = object({
  segments: optional(
    array(
      object({
        segmentId: str,
        title: str,
        order: num,
        contentIds: array(num),
      }),
    ),
  ),
});
const lessonDetailBase = object({
  lessonId: num,
  courseId: num,
  title: str,
  description: str,
  contents: array(content),
});
export const lessonDetail = (value: unknown, path = '$') => {
  lessonExtra(value, path);
  return lessonDetailBase(value, path) as Infer<typeof lessonDetailBase> &
    Partial<Infer<typeof lessonExtra>>;
};
export const progress = object({
  status: lessonStatus,
  lastContentId: nullable(num),
  resumeContentId: nullable(num),
});
export const reviewItem = object({ reviewItemId: num, quiz });
export const reviewSet = object({
  reviewItems: array(reviewItem),
  message: nullable(str),
  rewardEligible: bool,
});
// 레슨 전 필수 복습이 없어졌다(develop #15). reviewRequired 는 항상 false, review 는 오지 않는다.
const lessonStartBase = object({
  reviewRequired: optional(bool),
  review: optional(nullable(reviewSet)),
  progress,
  contents: array(content),
});
export const lessonStart = (value: unknown, path = '$') => {
  lessonExtra(value, path);
  return lessonStartBase(value, path) as Infer<typeof lessonStartBase> &
    Partial<Infer<typeof lessonExtra>>;
};
export const answerResult = object({
  attemptId: optional(num),
  // graded=false(채점하지 않는 첫 퀴즈)면 isCorrect 는 null 이고 correctAnswer 는 오지 않는다(빈 객체로 받는다).
  graded: optional(bool),
  isCorrect: nullable(bool),
  completed: optional(bool),
  correctAnswer: unknownObject,
  // 틀린 곳 찾기(INLINE_WORD)의 바른 낱말.
  correctWord: optional(str),
  explanation: optional(str),
  closeness: optional(num),
  source: optional(str),
  streakDays: optional(num),
});
// ARTWORK 는 0.4.1 에서 없어졌지만 서버가 아직 지급·기록하므로 받아만 두고 화면에는 쓰지 않는다.
const rewardType = enumeration(
  'WALLET',
  'UNLOCK',
  'INVENTORY',
  'CONSTELLATION',
  'STORY',
  'ARTWORK',
);
export const reward = object({
  type: rewardType,
  // ENERGY 는 보상 지급에만 쓴다. 상점 가격은 STARDUST 뿐이다.
  currency: optional(nullable(enumeration('STARDUST', 'ENERGY'))),
  amount: optional(nullable(num)),
  // 에너지가 가득 차 별가루로 바꿔 준 경우 넘친 에너지 개수.
  convertedEnergy: optional(num),
  itemId: optional(nullable(num)),
  optionId: optional(nullable(num)),
  storyId: optional(nullable(num)),
  badge: optional(nullable(unknownObject)),
});
export const rewards = object({ rewards: array(reward), wallet });
export const lessonComplete = object({
  rewards: array(reward),
  wallet,
  courseCompleted: bool,
  quizSummary: optional(object({ correctCount: num, totalCount: num })),
  stardustSkipped: optional(bool),
});
export const contentComplete = object({
  progress,
  lessonCompleted: bool,
  completion: optional(nullable(lessonComplete)),
});
export const onboardingComplete = object({
  rewards: array(reward),
  wallet,
  onboardingCompleted: bool,
});
export const overallProgress = object({
  courses: array(object({ courseId: num, completedLessons: num, totalLessons: num })),
  current: nullable(object({ lessonId: num, courseId: num, status: lessonStatus })),
});
export const housing = object({ housingId: num, name: str, isPublic: bool, likeCount: num });
export const housingArea = enumeration('INTERIOR', 'EXTERIOR');
const transformBase = object({ x: real, y: real, rotation: num, layer: num });
export const transform = (value: unknown, path = '$') => {
  const result = transformBase(value, path);
  optional(bool)((value as Record<string, unknown>).flippedX, `${path}.flippedX`);
  return result as typeof result & { flippedX?: boolean };
};
export const placement = object({
  placementId: num,
  inventoryId: str,
  area: housingArea,
  transform,
  itemId: num,
  optionId: optional(num),
  option: unknownObject,
});
export const housingDetail = object({
  housing,
  placements: array(placement),
  avatar: object({
    x: real,
    y: real,
    state: enumeration('IDLE', 'SIT', 'SLEEP'),
    placementId: nullable(num),
  }),
});
// FLOOR 바닥, WALL 벽지(별자리 완성 보너스로 상점에서 해금).
export const itemType = enumeration('FURNITURE', 'OBJECT', 'FLOOR', 'WALL');
export const shopOption = object({
  optionId: num,
  option: unknownObject,
  currency: enumeration('STARDUST'),
  price: num,
  previewAsset: str,
  owned: bool,
  // 색상 옵션 잠금(0.4.1). 서버가 아직 보내지 않으면 생략되며 살 수 있는 것으로 본다.
  unlocked: optional(bool),
  unlockHint: optional(nullable(str)),
});
export const shopItem = object({
  itemId: num,
  name: str,
  itemType,
  unlocked: bool,
  unlockHint: nullable(str),
  minPrice: object({ currency: enumeration('STARDUST'), amount: num }),
  options: array(shopOption),
});
export const inventoryItem = object({
  inventoryId: str,
  itemId: num,
  optionId: optional(num),
  itemType,
  name: str,
  option: unknownObject,
  acquiredVia: enumeration('PURCHASE', 'REWARD', 'STARTER'),
  acquiredAt: str,
  placed: bool,
});
export const inventoryGroup = object({
  itemId: num,
  optionId: optional(num),
  itemType,
  name: str,
  option: unknownObject,
  ownedCount: num,
  placedCount: num,
  availableCount: num,
  copies: array(
    object({
      inventoryId: str,
      acquiredVia: enumeration('PURCHASE', 'REWARD', 'STARTER'),
      acquiredAt: str,
      placed: bool,
    }),
  ),
});
export type PlacementInput = {
  inventoryId: string;
  area: Infer<typeof housingArea>;
  transform: Infer<typeof transform>;
};
export type ShopSelection = { itemId: number; optionId: number };
export const housingCard = object({
  housingId: num,
  ownerNickname: str,
  name: str,
  likeCount: num,
  likedByMe: bool,
  preview: array(unknownObject),
});
export const housingVisit = object({
  housing,
  placements: array(placement),
  avatar: unknownObject,
  ownerNickname: str,
  likedByMe: bool,
});
export const likeState = object({ likeCount: num, likedByMe: bool });
export const blockedUser = object({ userId: num, nickname: str, blockedAt: str });
export const constellation = object({
  constellationId: num,
  courseId: num,
  name: str,
  starCount: num,
  earnedStars: num,
  badgeEarned: bool,
  imageUrl: nullable(str),
  // 별자리 상세의 별 목록(0.4.1). 완료하지 않은 별은 title 이 null 이며 앱은 ??? 로 표시한다.
  stars: optional(
    array(
      object({
        lessonId: num,
        title: nullable(str),
        order: num,
        completed: bool,
        completedAt: optional(nullable(str)),
      }),
    ),
  ),
});
export const rewardRecord = object({
  type: rewardType,
  source: unknownObject,
  grantedAt: str,
  badge: optional(nullable(unknownObject)),
});
export const pageMeta = object({ nextCursor: nullable(str) });
export type Me = Infer<typeof me>;
export type UserBrief = Infer<typeof userBrief>;
export type TokenPair = Infer<typeof tokenPair>;
export type Course = Infer<typeof courseSummary>;
export type CourseDetail = Infer<typeof courseDetail>;
export type Lesson = Infer<typeof lessonDetail>;
export type Content = Infer<typeof content>;
export type Quiz = Infer<typeof quiz>;
export type AnswerResult = Infer<typeof answerResult>;
export type ReviewSet = Infer<typeof reviewSet>;
export type HousingCard = Infer<typeof housingCard>;
export type HousingVisit = Infer<typeof housingVisit>;
export type LessonStartResponse = Infer<typeof lessonStart>;
export type LessonCompleteResponse = Infer<typeof lessonComplete>;
export type HousingDetail = Infer<typeof housingDetail>;
export type Placement = Infer<typeof placement>;
export type ShopItem = Infer<typeof shopItem>;
export type ShopOption = Infer<typeof shopOption>;
export type InventoryItem = Infer<typeof inventoryItem>;
export type BlockedUser = Infer<typeof blockedUser>;
export type Page<T> = { data: T; meta: Infer<typeof pageMeta> };
