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
export const userBrief = object({ userId: num, nickname: str, status });
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
  unlocksAt: nullable(str),
  completedAt: nullable(str),
});
const courseFields = {
  courseId: num,
  title: str,
  category: str,
  topic: str,
  totalLessons: num,
  completedLessons: num,
  constellation: nullable(object({ constellationId: num, name: str })),
};
const courseBase = object(courseFields);
export const courseSummary = (value: unknown, path = '$') => {
  const course = courseBase(value, path);
  optional(str)((value as Record<string, unknown>).topic, `${path}.topic`);
  return course as typeof course & { topic?: string };
};
const courseDetailBase = object({
  ...courseFields,
  description: str,
  lessons: array(lessonSummary),
});
export const courseDetail = (value: unknown, path = '$') => {
  courseSummary(value, path);
  return courseDetailBase(value, path) as Infer<typeof courseDetailBase> & { topic?: string };
};
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
  dialogue: optional(array(object({ speaker: str, text: str }))),
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
const lessonStartBase = object({
  reviewRequired: bool,
  review: nullable(reviewSet),
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
  isCorrect: bool,
  completed: optional(bool),
  correctAnswer: unknownObject,
  explanation: optional(str),
  closeness: optional(num),
  source: optional(str),
  streakDays: optional(num),
});
export const reward = object({
  type: enumeration('WALLET', 'UNLOCK', 'INVENTORY', 'CONSTELLATION', 'ARTWORK'),
  currency: optional(nullable(enumeration('STARDUST'))),
  amount: optional(nullable(num)),
  itemId: optional(nullable(num)),
  badge: optional(nullable(unknownObject)),
  artwork: optional(unknownObject),
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
export const itemType = enumeration('FURNITURE', 'OBJECT');
export const shopOption = object({
  optionId: num,
  option: unknownObject,
  currency: enumeration('STARDUST'),
  price: num,
  previewAsset: str,
  owned: bool,
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
});
export const rewardRecord = object({
  type: enumeration('WALLET', 'UNLOCK', 'INVENTORY', 'CONSTELLATION', 'ARTWORK'),
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
