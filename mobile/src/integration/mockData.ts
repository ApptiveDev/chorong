import type {
  Content,
  CourseDetail,
  HousingCard,
  HousingDetail,
  InventoryItem,
  Lesson,
  Me,
  ShopItem,
} from './models';

export const courses: CourseDetail[] = [
  {
    courseId: 1,
    title: '빛과 우주',
    category: '과학',
    totalLessons: 2,
    completedLessons: 1,
    constellation: { constellationId: 1, name: '작은곰자리' },
    description: '빛이 우주를 여행하는 방식을 배웁니다.',
    lessons: [
      {
        lessonId: 11,
        title: '별빛의 여행',
        order: 1,
        status: 'COMPLETED',
        unlocksAt: null,
        completedAt: '2026-11-01T09:00:00Z',
      },
      {
        lessonId: 12,
        title: '달의 모양',
        order: 2,
        status: 'UNLOCKED',
        unlocksAt: null,
        completedAt: null,
      },
    ],
  },
  {
    courseId: 2,
    title: '지구와 날씨',
    category: '과학',
    totalLessons: 2,
    completedLessons: 0,
    constellation: { constellationId: 2, name: '오리온자리' },
    description: '지구의 움직임과 날씨를 살펴봅니다.',
    lessons: [
      {
        lessonId: 21,
        title: '낮과 밤',
        order: 1,
        status: 'UNLOCKED',
        unlocksAt: null,
        completedAt: null,
      },
      {
        lessonId: 22,
        title: '비가 오는 날',
        order: 2,
        status: 'LOCKED',
        unlocksAt: '2026-11-03T00:00:00Z',
        completedAt: null,
      },
    ],
  },
  {
    courseId: 3,
    title: '우리 생활의 수',
    category: '수학',
    totalLessons: 1,
    completedLessons: 0,
    constellation: null,
    description: '일상에서 수를 찾습니다.',
    lessons: [
      {
        lessonId: 31,
        title: '하나씩 세기',
        order: 1,
        status: 'UNLOCKED',
        unlocksAt: null,
        completedAt: null,
      },
    ],
  },
];

const quiz = (quizId: number, question: string) => ({
  quizId,
  type: 'MULTIPLE_CHOICE' as const,
  question,
  options: {
    choices: [
      { index: 0, label: '맞아요' },
      { index: 1, label: '아니에요' },
    ],
  },
  hint: null,
});
const pages = (lessonId: number, subjects: string[]): Content[] =>
  subjects.map((body, index) => ({
    contentId: lessonId * 100 + index + 1,
    order: index + 1,
    contentType: index === subjects.length - 1 ? 'QUIZ' : 'TEXT',
    body,
    mediaUrl: null,
    quiz: index === subjects.length - 1 ? quiz(lessonId * 10 + 1, `${body} 이해했나요?`) : null,
  }));
export const lessons: Lesson[] = [
  {
    lessonId: 11,
    courseId: 1,
    title: '별빛의 여행',
    description: '별빛이 우리 눈에 도착하는 과정을 살펴봅니다.',
    contents: pages(11, [
      '별은 스스로 빛을 냅니다.',
      '빛은 우주 공간을 지나 지구에 도착합니다.',
      '멀리 있는 별빛은 오래전에 출발했습니다.',
      '별빛은 지구까지 여행합니다.',
    ]),
  },
  {
    lessonId: 12,
    courseId: 1,
    title: '달의 모양',
    description: '달의 모양이 달라 보이는 이유를 배웁니다.',
    contents: pages(12, [
      '달은 태양빛을 반사합니다.',
      '달이 지구 둘레를 돕니다.',
      '우리가 보는 밝은 부분이 달라집니다.',
      '달의 모양은 날마다 달라 보입니다.',
    ]),
  },
  {
    lessonId: 21,
    courseId: 2,
    title: '낮과 밤',
    description: '지구의 자전을 배웁니다.',
    contents: pages(21, [
      '지구는 하루에 한 바퀴 돕니다.',
      '태양을 향한 쪽은 낮입니다.',
      '반대쪽은 밤입니다.',
    ]),
  },
  {
    lessonId: 22,
    courseId: 2,
    title: '비가 오는 날',
    description: '물의 순환을 배웁니다.',
    contents: pages(22, [
      '물이 증발해 구름이 됩니다.',
      '구름 속 물방울이 모이면 비가 옵니다.',
      '비는 다시 강과 바다로 흘러갑니다.',
    ]),
  },
  {
    lessonId: 31,
    courseId: 3,
    title: '하나씩 세기',
    description: '물건의 개수를 셉니다.',
    contents: pages(31, [
      '물건 하나마다 수를 하나씩 말합니다.',
      '마지막에 말한 수가 전체 개수입니다.',
      '물건을 하나씩 세어 봅니다.',
    ]),
  },
];

export const me: Me = {
  userId: 1,
  nickname: '초롱이',
  status: 'ACTIVE',
  providers: ['EMAIL'],
  wallet: { star: 120, stardust: 35 },
  progress: { completedLessons: 1, totalLessons: 5 },
  housing: { isPublic: true, likeCount: 4 },
  onboardingCompleted: true,
  pushEnabled: false,
  streakDays: 2,
  lastStudyDate: '2026-11-01',
};

export const shopItems: ShopItem[] = [
  {
    itemId: 101,
    name: '별빛 의자',
    itemType: 'FURNITURE',
    unlocked: true,
    unlockHint: null,
    minPrice: { currency: 'STAR', amount: 30 },
    options: [
      {
        optionId: 1001,
        option: { color: '파랑' },
        currency: 'STAR',
        price: 30,
        previewAsset: 'chair-blue',
        owned: true,
      },
    ],
  },
  {
    itemId: 102,
    name: '달빛 탁자',
    itemType: 'FURNITURE',
    unlocked: true,
    unlockHint: null,
    minPrice: { currency: 'STAR', amount: 50 },
    options: [
      {
        optionId: 1002,
        option: { color: '흰색' },
        currency: 'STAR',
        price: 50,
        previewAsset: 'table-white',
        owned: false,
      },
    ],
  },
  {
    itemId: 103,
    name: '작은 별',
    itemType: 'OBJECT',
    unlocked: true,
    unlockHint: null,
    minPrice: { currency: 'STARDUST', amount: 10 },
    options: [
      {
        optionId: 1003,
        option: { color: '노랑' },
        currency: 'STARDUST',
        price: 10,
        previewAsset: 'star-yellow',
        owned: true,
      },
    ],
  },
];
export const inventory: InventoryItem[] = [
  {
    inventoryId: 'inv-101',
    itemId: 101,
    optionId: 1001,
    itemType: 'FURNITURE',
    name: '별빛 의자',
    option: { color: '파랑' },
    acquiredVia: 'STARTER',
    acquiredAt: '2026-10-30T00:00:00Z',
    placed: true,
  },
  {
    inventoryId: 'inv-103',
    itemId: 103,
    optionId: 1003,
    itemType: 'OBJECT',
    name: '작은 별',
    option: { color: '노랑' },
    acquiredVia: 'REWARD',
    acquiredAt: '2026-11-01T09:00:00Z',
    placed: false,
  },
];
export const room: HousingDetail = {
  housing: { housingId: 1, name: '초롱이의 우주', isPublic: true, likeCount: 4 },
  placements: [
    {
      placementId: 1,
      inventoryId: 'inv-101',
      area: 'INTERIOR',
      transform: { x: 0.4, y: 0.65, rotation: 0, layer: 1 },
      itemId: 101,
      optionId: 1001,
      option: { color: '파랑' },
    },
  ],
  avatar: { x: 0.5, y: 0.5, state: 'IDLE', placementId: null },
};
export const socialCards: HousingCard[] = [
  {
    housingId: 2,
    ownerNickname: '하늘',
    name: '하늘의 별방',
    likeCount: 8,
    likedByMe: false,
    preview: [],
  },
  {
    housingId: 3,
    ownerNickname: '달이',
    name: '달이의 우주',
    likeCount: 5,
    likedByMe: false,
    preview: [],
  },
  {
    housingId: 4,
    ownerNickname: '나래',
    name: '나래의 별자리',
    likeCount: 2,
    likedByMe: false,
    preview: [],
  },
];
