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
  { answer: number | string | boolean } | { answers: number[] } | { pairs: string[][] };
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
export const wallet = object({ star: num, stardust: num });
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
export const courseSummary = object(courseFields);
export const courseDetail = object({
  ...courseFields,
  description: str,
  lessons: array(lessonSummary),
});
export const quiz = object({
  quizId: num,
  interactionType: enumeration('OX', 'SINGLE', 'MULTI', 'BLANK', 'SLIDER', 'MATCH', 'CHOSUNG'),
  question: str,
  instruction: str,
  config: unknownObject,
  difficulty: optional(str),
  quizOrder: optional(num),
});
export const content = object({
  contentId: num,
  order: num,
  contentType: enumeration('TEXT', 'IMAGE', 'VIDEO', 'QUIZ'),
  body: nullable(str),
  mediaUrl: nullable(str),
  quiz: nullable(quiz),
});
export const lessonDetail = object({
  lessonId: num,
  courseId: num,
  title: str,
  description: str,
  contents: array(content),
});
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
export const lessonStart = object({
  reviewRequired: bool,
  review: nullable(reviewSet),
  progress,
  contents: array(content),
});
export const answerResult = object({
  attemptId: num,
  isCorrect: bool,
  completed: optional(bool),
  correctAnswer: optional(nullable(unknownObject)),
  explanation: optional(nullable(str)),
  streakDays: num,
  closeness: optional(num),
  source: optional(str),
});
export const reward = object({
  type: enumeration('WALLET', 'UNLOCK', 'INVENTORY', 'CONSTELLATION'),
  currency: optional(nullable(enumeration('STAR', 'STARDUST'))),
  amount: optional(nullable(num)),
  itemId: optional(nullable(num)),
  badge: optional(nullable(unknownObject)),
});
export const rewards = object({ rewards: array(reward), wallet });
export const lessonComplete = object({ rewards: array(reward), wallet, courseCompleted: bool });
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
export const transform = object({ x: real, y: real, rotation: num, layer: num });
export const placement = object({
  placementId: num,
  inventoryId: str,
  area: housingArea,
  transform,
  itemId: num,
  optionId: num,
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
  currency: enumeration('STAR', 'STARDUST'),
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
  minPrice: object({ currency: enumeration('STAR', 'STARDUST'), amount: num }),
  options: array(shopOption),
});
export const inventoryItem = object({
  inventoryId: str,
  itemId: num,
  optionId: num,
  itemType,
  name: str,
  option: unknownObject,
  acquiredVia: enumeration('PURCHASE', 'REWARD', 'STARTER'),
  acquiredAt: str,
  placed: bool,
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
  placements: array(unknownObject),
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
  type: enumeration('WALLET', 'UNLOCK', 'INVENTORY', 'CONSTELLATION'),
  source: unknownObject,
  grantedAt: str,
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
