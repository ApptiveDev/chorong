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

const newTopics: {
  courseId: number;
  title: string;
  category: string;
  description: string;
  cards: [string, string, string, string];
  quizQuestion: string;
}[] = [
  {
    courseId: 4,
    title: '금리가 오르면 왜 채권값이 떨어질까?',
    category: '경제',
    description: '채권 가격과 시장 금리의 관계를 알아봅니다.',
    cards: [
      '예금 금리가 오르면 받는 이자가 늘어나죠. 그런데 이미 발행된 채권의 가격은 오히려 내려갈 수 있어요. 같은 금리 상승인데 왜 움직임이 다를까요?',
      '채권은 돈을 빌려주고 정해진 때에 이자와 원금을 받기로 한 약속이에요. 기존 고정금리 채권은 시장 금리가 바뀌어도 약속된 이자액이 그대로예요.',
      '새 채권이 더 높은 이자를 준다면 낮은 이자를 주는 옛 채권은 덜 매력적이에요. 누군가 그 채권을 사려면 가격이 내려가야 비슷한 수익률을 기대할 수 있죠.',
      '핵심은 비교예요. 시장 금리가 오를 때 기존 고정금리 채권의 가격은 대체로 내려가고, 금리가 내려갈 때는 반대로 오르는 경향이 있어요.',
    ],
    quizQuestion: '시장 금리가 오르면 기존 고정금리 채권의 가격은 일반적으로 내려갈까요?',
  },
  {
    courseId: 5,
    title: '모나리자는 왜 그렇게 유명할까?',
    category: '예술',
    description: '그림의 표현과 유명해진 과정을 살펴봅니다.',
    cards: [
      '모나리자의 얼굴을 보면 표정이 미묘하게 달라 보일 때가 있어요. 레오나르도 다빈치가 그린 이 초상화는 무엇 때문에 이렇게 오래 사람들의 관심을 끌었을까요?',
      '다빈치는 경계를 선명한 선으로 자르지 않고 명암을 부드럽게 이어 붙였어요. 이 스푸마토 기법 덕분에 얼굴과 배경이 자연스럽게 이어져 보입니다.',
      '1911년 모나리자가 루브르 박물관에서 도난당했을 때 사건은 널리 보도됐어요. 그림이 돌아오는 과정까지 관심을 받으며 이름을 아는 사람이 더 늘었습니다.',
      '모나리자의 유명세에는 뛰어난 회화 표현과 신비로운 표정, 그리고 도난 사건을 둘러싼 보도가 함께 작용했어요. 한 가지 이유만으로 설명하기는 어려워요.',
    ],
    quizQuestion: '스푸마토는 명암의 경계를 부드럽게 표현하는 기법일까요?',
  },
  {
    courseId: 6,
    title: '노래가 왜 머리에서 안 떠나갈까?',
    category: '음악',
    description: '멜로디가 머릿속에서 반복되는 이유를 알아봅니다.',
    cards: [
      '아침에 들은 노래 한 소절이 하루 종일 머릿속에서 맴돈 적 있나요? 일부러 떠올리지 않았는데도 멜로디가 반복되는 경험은 꽤 흔해요.',
      '이렇게 노래나 멜로디가 의도하지 않아도 머릿속에서 반복되는 현상을 이어웜이라고 해요. 실제로 소리가 들리는 것은 아니고, 음악을 마음속으로 떠올리는 거예요.',
      '짧고 반복적인 구절이나 따라 부르기 쉬운 멜로디는 기억에 남기 좋아요. 최근에 들었거나 어떤 상황과 연결된 노래라면 갑자기 다시 떠오르기도 하죠.',
      '이어웜은 음악과 기억이 만나는 사례예요. 반복하기 쉬운 멜로디가 머릿속에 남아 저절로 되풀이될 수 있지만, 누구에게나 같은 노래가 맴도는 것은 아니에요.',
    ],
    quizQuestion: '이어웜은 멜로디가 머릿속에서 반복되는 현상을 가리킬까요?',
  },
  {
    courseId: 7,
    title: '고양이는 왜 단맛을 모를까?',
    category: '동물',
    description: '고양이의 미각과 식성의 관계를 알아봅니다.',
    cards: [
      '사람은 설탕을 먹으면 단맛을 느끼지만 고양이는 반응이 다를 수 있어요. 고양이가 단 음식을 좋아하지 않는 이유는 단순한 취향의 차이일까요?',
      '혀에는 맛을 감지하는 수용체가 있어요. 고양이는 단맛 수용체를 만드는 데 필요한 유전자 하나가 기능하지 않아 사람처럼 단맛을 감지하기 어렵습니다.',
      '고양이는 육식에 특화된 동물이에요. 먹이를 고를 때 단맛보다 고기와 관련된 감각이 더 중요했을 수 있어요. 이 점이 고양이의 미각을 이해하는 단서가 됩니다.',
      '고양이가 단맛을 거의 느끼지 못하는 까닭은 단맛 수용체와 관련된 유전자에 있어요. 사람의 미각을 기준으로 고양이의 음식 취향을 짐작하면 맞지 않을 수 있죠.',
    ],
    quizQuestion: '고양이는 단맛 수용체와 관련된 유전자 때문에 단맛을 거의 느끼지 못할까요?',
  },
  {
    courseId: 8,
    title: '태양은 왜 불타고 있을까?',
    category: '천문',
    description: '태양이 빛과 열을 내는 원리를 알아봅니다.',
    cards: [
      '태양을 보면 거대한 불덩이처럼 보여요. 하지만 태양이 빛나는 방식은 장작불이 타는 것과 달라요. 우주 공간에서 태양은 어떻게 오래 빛을 낼까요?',
      '장작이 타려면 산소와 연료가 반응해야 해요. 태양의 에너지는 이런 연소가 아니라 중심부에서 수소 원자핵이 결합하는 핵융합에서 나옵니다.',
      '태양 중심부의 높은 온도와 압력 속에서 수소 원자핵이 결합해 헬륨이 만들어져요. 이 과정에서 나온 에너지가 여러 단계를 거쳐 바깥으로 전달됩니다.',
      '태양은 산소를 써서 불타는 물체가 아니에요. 수소가 헬륨으로 바뀌는 핵융합이 에너지를 만들고, 그 에너지가 빛과 열의 형태로 지구에도 도착합니다.',
    ],
    quizQuestion: '태양의 주된 에너지원은 수소 원자핵의 핵융합일까요?',
  },
  {
    courseId: 9,
    title: '녹음한 내 목소리는 왜 어색할까?',
    category: '과학·음향',
    description: '공기 전도와 골전도의 차이를 알아봅니다.',
    cards: [
      '녹음한 내 목소리를 듣고 낯설다고 느낀 적 있나요? 다른 사람은 평소처럼 들린다고 하는데, 정작 내 귀에는 음색이 달라진 것처럼 들릴 수 있어요.',
      '평소 말할 때는 입에서 나온 소리가 공기를 지나 귀로 들어와요. 이처럼 공기를 거쳐 전달되는 소리를 공기 전도라고 부릅니다.',
      '동시에 성대의 진동 일부는 두개골을 거쳐 귀에 전달돼요. 이를 골전도라고 해요. 내 목소리를 직접 들을 때는 공기 전도와 골전도의 소리를 함께 듣습니다.',
      '녹음된 목소리를 들을 때는 주로 공기를 거쳐 전달된 소리만 듣게 돼요. 평소 함께 듣던 골전도 성분이 달라지므로 내 목소리가 어색하게 느껴질 수 있어요.',
    ],
    quizQuestion: '평소 자기 목소리를 들을 때는 골전도도 영향을 줄까요?',
  },
  {
    courseId: 10,
    title: '달걀은 왜 양 끝을 쥐면 안 깨질까?',
    category: '공학',
    description: '곡면이 힘을 분산하는 방식을 알아봅니다.',
    cards: [
      '달걀 껍데기는 얇고 쉽게 깨질 것 같아요. 그런데 양 끝을 손바닥으로 감싸 고르게 누르면 생각보다 잘 버티기도 하죠. 껍데기의 어떤 모양이 힘을 받쳐 줄까요?',
      '달걀 껍데기는 평평한 판이 아니라 굽은 면으로 이루어져 있어요. 양 끝에서 들어온 힘이 껍데기의 여러 부분으로 퍼지면 한곳에 부담이 덜 쌓입니다.',
      '아치 구조도 위에서 받은 힘을 곡선을 따라 나누어 전달해요. 달걀 껍데기의 곡면도 비슷하게 작용하지만, 손가락 끝처럼 좁은 곳에 힘이 몰리면 깨질 수 있어요.',
      '달걀이 무조건 단단한 것은 아니에요. 양 끝에서 고르게 압력을 줄 때 곡면이 힘을 분산해 잘 버틸 수 있고, 한 점을 세게 누르면 얇은 껍데기가 깨집니다.',
    ],
    quizQuestion: '달걀 껍데기의 곡면은 힘을 여러 부분으로 분산할까요?',
  },
  {
    courseId: 11,
    title: '2천 년 전에 지구 둘레를 잰 방법?',
    category: '지리',
    description: '그림자와 각도로 지구 둘레를 추정한 방법을 알아봅니다.',
    cards: [
      '인공위성도 없던 시대에 지구의 크기를 어떻게 알 수 있었을까요? 고대 그리스 학자 에라토스테네스는 해가 만든 그림자를 관찰해 지구 둘레를 추정했어요.',
      '같은 무렵 두 지역에서 태양을 보면 그림자의 각도가 다를 수 있어요. 지구 표면이 굽어 있기 때문에 태양빛이 두 지역의 땅에 닿는 방향이 달라 보입니다.',
      '에라토스테네스는 두 지역의 그림자 각도 차이와 지역 사이 거리를 이용했어요. 각도 차이가 한 바퀴의 얼마인지 알면 그 거리를 몇 배 해야 지구 둘레인지 계산할 수 있죠.',
      '그림자 각도와 두 지역 사이 거리만 있으면 지구 둘레를 추정할 수 있어요. 에라토스테네스의 계산은 당시 관측과 거리 측정의 한계에도 불구하고 실제 값에 가까웠습니다.',
    ],
    quizQuestion: '에라토스테네스는 두 지역의 그림자 각도 차이를 이용했을까요?',
  },
  {
    courseId: 12,
    title: '맨홀 뚜껑은 왜 동그랄까?',
    category: '건축',
    description: '원형 뚜껑의 안전성과 편의성을 알아봅니다.',
    cards: [
      '길에서 보는 맨홀 뚜껑은 대부분 동그랗죠. 네모난 뚜껑도 만들 수 있을 텐데, 왜 원형을 자주 쓸까요? 구멍 안으로 빠지지 않는 모양이 중요해요.',
      '원은 어느 방향에서 재도 중심을 지나는 폭이 같아요. 그래서 원형 구멍에 맞는 뚜껑은 방향을 돌려도 구멍의 좁은 쪽을 통과해 아래로 빠질 위험이 적습니다.',
      '네모난 뚜껑은 방향에 따라 모서리가 구멍의 짧은 폭보다 좁게 들어갈 수 있어요. 반면 둥근 뚜껑은 굴려서 옮기기 쉽고, 덮을 때 방향을 맞출 필요도 없어요.',
      '원형 맨홀 뚜껑은 구멍 아래로 빠질 위험을 줄이고 다루기도 편리해요. 물론 모든 맨홀 뚜껑이 원형인 것은 아니지만, 원의 성질이 널리 쓰이는 이유예요.',
    ],
    quizQuestion: '원형 맨홀 뚜껑은 어느 방향으로 돌려도 폭이 같을까요?',
  },
  {
    courseId: 13,
    title: '나쁜 일은 왜 더 크게 느껴질까?',
    category: '심리',
    description: '부정성 편향이 기억에 미치는 영향을 알아봅니다.',
    cards: [
      '칭찬을 여러 번 들었는데도 작은 비판 한마디가 오래 남을 때가 있어요. 좋은 일보다 나쁜 일이 더 크게 느껴지는 경험에는 어떤 마음의 작용이 있을까요?',
      '사람은 부정적인 사건에 더 주의를 기울이고 오래 기억하는 경향이 있어요. 이런 경향을 부정성 편향이라고 부르며, 누구에게나 같은 정도로 나타나는 것은 아니에요.',
      '위험을 빨리 알아채고 피하는 일은 생존에 도움이 됐을 수 있어요. 그래서 불쾌한 경험이 머릿속에 오래 남는 경향을 위험에 대비하는 마음의 작용과 연결해 설명합니다.',
      '부정성 편향 때문에 한 번의 실수가 여러 번의 성공보다 크게 느껴질 수 있어요. 그럴 때는 좋은 일도 함께 떠올려 보면 기억이 한쪽으로 기울었는지 살펴볼 수 있어요.',
    ],
    quizQuestion: '부정성 편향은 나쁜 일이 더 오래 기억되는 경향과 관련이 있을까요?',
  },
];

const constellationForTopic = (topicId: number) =>
  topicId <= 5 ? 1 : topicId <= 7 ? 2 : topicId <= 10 ? 3 : 4;
const topicSummary = (topic: (typeof newTopics)[number], order: number) => ({
  lessonId: topic.courseId * 10 + 1,
  title: topic.title,
  order,
  status: 'UNLOCKED' as const,
  unlocksAt: null,
  completedAt: null,
});

export const courses: CourseDetail[] = [
  {
    courseId: 1,
    title: '작은곰자리',
    category: '교양',
    totalLessons: 4,
    completedLessons: 1,
    constellation: { constellationId: 1, name: '작은곰자리' },
    description: '우주, 경제, 예술에서 시작하는 네 가지 이야기',
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
      ...newTopics
        .filter((topic) => constellationForTopic(topic.courseId) === 1)
        .map((topic, index) => topicSummary(topic, index + 3)),
    ],
  },
  {
    courseId: 2,
    title: '오리온자리',
    category: '교양',
    totalLessons: 4,
    completedLessons: 0,
    constellation: { constellationId: 2, name: '오리온자리' },
    description: '자연과 소리, 동물에서 찾는 네 가지 궁금증',
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
      ...newTopics
        .filter((topic) => constellationForTopic(topic.courseId) === 2)
        .map((topic, index) => topicSummary(topic, index + 3)),
    ],
  },
  {
    courseId: 3,
    title: '카시오페이아자리',
    category: '교양',
    totalLessons: 4,
    completedLessons: 0,
    constellation: { constellationId: 3, name: '카시오페이아자리' },
    description: '수, 태양, 목소리, 구조를 살펴보는 네 가지 이야기',
    lessons: [
      {
        lessonId: 31,
        title: '하나씩 세기',
        order: 1,
        status: 'UNLOCKED',
        unlocksAt: null,
        completedAt: null,
      },
      ...newTopics
        .filter((topic) => constellationForTopic(topic.courseId) === 3)
        .map((topic, index) => topicSummary(topic, index + 2)),
    ],
  },
  {
    courseId: 4,
    title: '백조자리',
    category: '교양',
    totalLessons: 3,
    completedLessons: 0,
    constellation: { constellationId: 4, name: '백조자리' },
    description: '지리, 건축, 마음을 연결하는 세 가지 이야기',
    lessons: newTopics
      .filter((topic) => constellationForTopic(topic.courseId) === 4)
      .map((topic, index) => topicSummary(topic, index + 1)),
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
const topicPages = (lessonId: number, cards: string[], quizQuestion: string): Content[] => [
  ...cards.map((body, index) => ({
    contentId: lessonId * 100 + index + 1,
    order: index + 1,
    contentType: 'TEXT' as const,
    body,
    mediaUrl: null,
    quiz: null,
  })),
  {
    contentId: lessonId * 100 + cards.length + 1,
    order: cards.length + 1,
    contentType: 'QUIZ',
    body: null,
    mediaUrl: null,
    quiz: quiz(lessonId * 10 + 1, quizQuestion),
  },
];
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
  ...newTopics.map((topic) => ({
    lessonId: topic.courseId * 10 + 1,
    courseId: constellationForTopic(topic.courseId),
    title: topic.title,
    description: topic.description,
    contents: topicPages(topic.courseId * 10 + 1, topic.cards, topic.quizQuestion),
  })),
];

export const me: Me = {
  userId: 1,
  nickname: '초롱이',
  status: 'ACTIVE',
  providers: ['EMAIL'],
  wallet: { star: 120, stardust: 35 },
  progress: { completedLessons: 1, totalLessons: 15 },
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
