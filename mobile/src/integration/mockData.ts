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
    topic: '작은곰자리',
    totalLessons: 4,
    completedLessons: 0,
    constellation: { constellationId: 1, name: '빛을 찾아서' },
    description: '우주, 경제, 예술에서 시작하는 네 가지 이야기',
    lessons: [
      {
        lessonId: 11,
        title: '별은 왜 빛날까',
        order: 1,
        status: 'UNLOCKED',
        unlocksAt: null,
        completedAt: null,
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
    topic: '오리온자리',
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
        status: 'UNLOCKED',
        unlocksAt: null,
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
    topic: '카시오페이아자리',
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
    topic: '백조자리',
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
const firstLessonSource = '출처 · OpenStax Astronomy 2e 16.1 · 16.2 · NASA Sun Facts';
const firstLessonQuestions = [
  {
    kind: 'ox',
    label: '질문',
    question: '태양은 거대한 불덩어리다.',
    choices: ['O', 'X'],
    answer: [1],
    explanation: '태양에서는 불이 타는 대신, 원자핵이 합쳐지는 핵융합이 일어나요.',
  },
  {
    kind: 'blank',
    label: '핵융합',
    question: '태양이 계속 빛나려면\n무엇이 있어야 할까요?',
    choices: ['산소가', '수소가', '불씨가'],
    answer: [1],
    explanation: '합쳐질 수소가 있어야 빛나요. 불이 아니라서 산소나 불씨는 필요 없어요.',
  },
  {
    kind: 'single',
    label: '줄어든 질량',
    question: '수소 넷이 헬륨 하나가 되면,\n무게는?',
    choices: ['더 무거워져', '똑같아', '조금 가벼워져'],
    answer: [2],
    explanation: '헬륨은 합쳐지기 전보다 약 0.7% 가벼워요. 줄어든 질량이 빛과 열이 돼요.',
  },
  {
    kind: 'range',
    label: '줄어든 질량',
    question: '태양이 1초에 빛으로 바꾸는\n질량은 어느 정도일까요?',
    choices: [],
    answer: [4000000],
    explanation:
      '태양은 1초마다 약 400만 톤의 질량을 에너지로 바꿔요. 아주 작은 변화가 쉬지 않고 일어나요.',
  },
  {
    kind: 'ox',
    label: '줄어든 질량',
    question: '태양은 빛을 낼수록\n조금씩 가벼워진다.',
    choices: ['O', 'X'],
    answer: [0],
    explanation: '빛이 된 만큼 질량이 줄어요. 그래도 태양은 워낙 커서 앞으로 50억 년쯤 더 빛나요.',
  },
  {
    kind: 'multi',
    label: '다른 별',
    question: '핵융합으로 빛나는 걸\n모두 고르세요.',
    choices: ['태양', '밤하늘의 별', '모닥불', '촛불'],
    answer: [0, 1],
    explanation:
      '태양과 밤하늘의 별은 핵융합으로 빛나요. 모닥불과 촛불은 산소와 반응하며 타는 불이에요.',
  },
  {
    kind: 'match',
    label: '정리',
    question: '서로 이어지는 이야기를\n짝지어 주세요.',
    choices: [],
    left: ['줄어든 질량', '수소 원자핵 넷', '모닥불', '1초마다'],
    right: ['약 400만 톤', '빛과 열', '산소로 탐', '헬륨 하나'],
    answer: [1, 3, 2, 0],
    explanation:
      '수소가 헬륨으로 합쳐질 때 줄어든 질량이 빛과 열이 돼요. 태양은 1초마다 약 400만 톤을 에너지로 바꾸죠.',
  },
  {
    kind: 'single',
    label: '정리',
    question: '친구가 “태양은 거대한\n불덩어리야”래요.\n뭐라고 해줄까요?',
    choices: [
      '맞아, 엄청 큰 불이야',
      '아니, 원자핵이 합쳐져',
      '아니, 뜨거운 돌이야',
      '아니, 산소가 타는 거야',
    ],
    answer: [1],
    explanation:
      '태양 속에서는 아무것도 타지 않아요. 원자핵이 합쳐지며 줄어든 질량이 빛과 열이 돼요.',
  },
] as const;
const firstLessonSteps = [
  { quiz: 0 },
  {
    label: '핵융합',
    body: `별지기: 태양이 불이었다면 몇천 년 만에 다 탔을 거예요. 그런데 벌써 46억 년째 빛나고 있어요.\n초롱이: 그럼 불이 아니라는 거냥?\n${firstLessonSource}`,
  },
  {
    label: '핵융합',
    image: 'fusion',
    body: '태양 한가운데서는 수소 원자핵 넷이 부딪쳐 헬륨 하나로 합쳐져요. 이게 핵융합이에요.',
  },
  { quiz: 1 },
  { quiz: 2 },
  {
    label: '줄어든 질량',
    image: 'mass',
    body: '헬륨은 합쳐지기 전 수소 넷보다 약 0.7% 가벼워요. 사라진 것처럼 보이는 질량은 빛과 열이 돼요.',
  },
  {
    label: '줄어든 질량',
    body: `초롱이: 겨우 그만큼으로 저렇게 밝다냥?\n별지기: 한 번은 아주 작아요. 대신 태양 속에서는 이 일이 쉬지 않고 일어나요.\n${firstLessonSource}`,
  },
  { quiz: 3 },
  {
    label: '줄어든 질량',
    body: `별지기: 태양은 1초에 약 400만 톤을 빛과 열로 바꿔요.\n초롱이: 매초 그렇게나 많이? 태양은 엄청 큰 별이구나냥!\n${firstLessonSource}`,
  },
  { quiz: 4 },
  {
    label: '다른 별',
    image: 'star',
    body: '밤하늘의 별들도 태양처럼 중심에서 핵융합을 하며 빛나요. 태양도 별이에요.',
  },
  { quiz: 5 },
  { quiz: 6 },
  { quiz: 7 },
] as const;
export const firstLessonContents: Content[] = firstLessonSteps.map((step, index) => {
  const question = 'quiz' in step ? firstLessonQuestions[step.quiz] : null;
  return {
    contentId: 1101 + index,
    order: index + 1,
    contentType: question ? 'QUIZ' : 'image' in step ? 'IMAGE' : 'TEXT',
    body: 'body' in step ? step.body : null,
    mediaUrl: question ? null : 'image' in step ? `mock-study-${step.image}` : null,
    quiz: question
      ? {
          quizId: 11001 + ('quiz' in step ? step.quiz : 0),
          type:
            question.kind === 'ox'
              ? 'OX'
              : question.kind === 'match'
                ? 'ORDERING'
                : question.kind === 'blank' || question.kind === 'range'
                  ? 'FILL_BLANK'
                  : 'MULTIPLE_CHOICE',
          question: question.question,
          options: {
            mockHtmlType: question.kind,
            label: question.label,
            choices: question.choices.map((label, choiceIndex) => ({ index: choiceIndex, label })),
            answer: [...question.answer],
            ...('left' in question ? { left: question.left, right: question.right } : {}),
          },
          hint: null,
        }
      : null,
  };
});
// CHOSUNG 목업. 서버 응답처럼 v2 명세 모양(interactionType/config)으로 두고 adapter 가 변환한다.
// 정답은 응답에 넣지 않고 mockApi 채점(chosungMockAnswers)에만 둔다.
export const chosungMockQuizId = 222;
const chosungMockContent = {
  contentId: 2204,
  order: 4,
  segmentId: 'a',
  contentType: 'QUIZ',
  body: null,
  mediaUrl: null,
  quiz: {
    quizId: chosungMockQuizId,
    interactionType: 'CHOSUNG',
    question: '물이 데워져 수증기가 되어 하늘로 올라가는 현상은?',
    instruction: '초성을 보고 낱말을 입력하세요.',
    quizOrder: 2,
    config: { hint: 'ㅈㅂ' },
  },
} as unknown as Content;
// 띄어쓰기가 있는 힌트 목업. 화면은 낱말별로 초성을 묶어 보여 주고 칸 수는 공백을 빼고 센다.
export const chosungCountMockQuizId = 312;
const chosungCountMockContent = {
  contentId: 3104,
  order: 4,
  segmentId: 'a',
  contentType: 'QUIZ',
  body: null,
  mediaUrl: null,
  quiz: {
    quizId: chosungCountMockQuizId,
    interactionType: 'CHOSUNG',
    question: '물건을 하나씩 셀 때 마지막에 말한 수가 알려 주는 것은?',
    instruction: '초성을 보고 낱말을 입력하세요.',
    quizOrder: 2,
    config: { hint: 'ㅈㅊ ㄱㅅ' },
  },
} as unknown as Content;

// SLIDER 목업. 정답 위치·허용 오차는 응답에 넣지 않고 mockApi 채점(sliderMockAnswers)에만 둔다.
export const sliderMockQuizId = 212;
const sliderMockContent = {
  contentId: 2104,
  order: 4,
  segmentId: 'a',
  contentType: 'QUIZ',
  body: null,
  mediaUrl: null,
  quiz: {
    quizId: sliderMockQuizId,
    interactionType: 'SLIDER',
    question: '지구가 한 바퀴 자전하는 데\n걸리는 시간은?',
    quizOrder: 2,
    config: {
      ticks: ['0시간', '12시간', '하루(24시간)', '36시간'],
      hint: '막대를 놓으면 제출돼요.',
    },
  },
} as unknown as Content;

// SINGLE 타일 벗기기 목업. 사진은 로컬 목업 키(lessonImagePreload.localStudyImages)를 쓴다.
// 정답은 응답에 넣지 않고 mockApi 채점(presentedMockAnswers)에만 둔다.
export const tileMockQuizId = 122;
const tileMockContent = {
  contentId: 1205,
  order: 5,
  contentType: 'QUIZ',
  body: null,
  mediaUrl: null,
  quiz: {
    quizId: tileMockQuizId,
    interactionType: 'SINGLE',
    question: '이것은  무엇일까요?',
    instruction: '타일이 벗겨지는 사진을 보고 고르세요.',
    quizOrder: 2,
    config: {
      options: ['핵융합', '핵분열', '연소'],
      presentation: {
        type: 'TILE',
        mediaUrl: 'mock-study-fusion',
        rows: 6,
        columns: 8,
        stages: [4, 8, 16, 32, 48],
      },
    },
  },
} as unknown as Content;
// SINGLE 점점 선명 목업. 같은 레슨에서 타일 다음 문항으로 둔다.
export const sharpenMockQuizId = 123;
const sharpenMockContent = {
  contentId: 1206,
  order: 6,
  contentType: 'QUIZ',
  body: null,
  mediaUrl: null,
  quiz: {
    quizId: sharpenMockQuizId,
    interactionType: 'SINGLE',
    question: '이것은  무엇일까요?',
    instruction: '점점 선명해지는 사진을 보고 고르세요.',
    quizOrder: 3,
    config: {
      options: ['핵융합', '핵분열', '연소'],
      presentation: {
        type: 'SHARPEN',
        mediaUrl: 'mock-study-fusion',
        stages: [24, 12, 4, 0],
      },
    },
  },
} as unknown as Content;
// SINGLE 축소 그림 목업. 같은 레슨에서 점점 선명 다음 문항으로 둔다.
export const zoomOutMockQuizId = 124;
const zoomOutMockContent = {
  contentId: 1207,
  order: 7,
  contentType: 'QUIZ',
  body: null,
  mediaUrl: null,
  quiz: {
    quizId: zoomOutMockQuizId,
    interactionType: 'SINGLE',
    question: '이것은  무엇일까요?',
    instruction: '점점 줄어드는 사진을 보고 고르세요.',
    quizOrder: 4,
    config: {
      options: ['핵융합', '핵분열', '연소'],
      presentation: { type: 'ZOOM_OUT', mediaUrl: 'mock-study-fusion', stages: [6, 4, 2, 1] },
    },
  },
} as unknown as Content;

export const lessons: Lesson[] = [
  {
    lessonId: 11,
    courseId: 1,
    title: '별은 왜 빛날까',
    description: '태양과 별이 빛나는 원리를 알아봅니다.',
    contents: firstLessonContents,
  },
  {
    lessonId: 12,
    courseId: 1,
    title: '달의 모양',
    description: '달의 모양이 달라 보이는 이유를 배웁니다.',
    contents: [
      ...pages(12, [
        '달은 태양빛을 반사합니다.',
        '달이 지구 둘레를 돕니다.',
        '우리가 보는 밝은 부분이 달라집니다.',
        '달의 모양은 날마다 달라 보입니다.',
      ]),
      tileMockContent,
      sharpenMockContent,
      zoomOutMockContent,
    ],
  },
  {
    lessonId: 21,
    courseId: 2,
    title: '낮과 밤',
    description: '지구의 자전을 배웁니다.',
    contents: [
      ...pages(21, [
        '지구는 하루에 한 바퀴 돕니다.',
        '태양을 향한 쪽은 낮입니다.',
        '반대쪽은 밤입니다.',
      ]),
      sliderMockContent,
    ],
  },
  {
    lessonId: 22,
    courseId: 2,
    title: '비가 오는 날',
    description: '물의 순환을 배웁니다.',
    contents: [
      ...pages(22, [
        '물이 증발해 구름이 됩니다.',
        '구름 속 물방울이 모이면 비가 옵니다.',
        '비는 다시 강과 바다로 흘러갑니다.',
      ]),
      chosungMockContent,
    ],
  },
  {
    lessonId: 31,
    courseId: 3,
    title: '하나씩 세기',
    description: '물건의 개수를 셉니다.',
    contents: [
      ...pages(31, [
        '물건 하나마다 수를 하나씩 말합니다.',
        '마지막에 말한 수가 전체 개수입니다.',
        '물건을 하나씩 세어 봅니다.',
      ]),
      chosungCountMockContent,
    ],
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
  wallet: { stardust: 180, energy: 5, energyResetsAt: '2026-11-12T00:00:00+09:00' },
  progress: { completedLessons: 1, totalLessons: 15 },
  housing: { isPublic: true, likeCount: 4 },
  onboardingCompleted: true,
  pushEnabled: false,
  streakDays: 2,
  lastStudyDate: '2026-11-01',
};

const furnitureColors = ['크림', '세이지', '라벤더', '로즈', '블루'];
const furnitureCatalog = [
  { itemId: 101, name: '의자', kind: 'chair', price: 30 },
  { itemId: 102, name: '책상', kind: 'desk', price: 40 },
  { itemId: 104, name: '화분', kind: 'plant', price: 20 },
  { itemId: 105, name: '러그', kind: 'rug', price: 20 },
  { itemId: 106, name: '조명', kind: 'lamp', price: 30 },
  { itemId: 107, name: '책장', kind: 'shelf', price: 50 },
  { itemId: 108, name: '침대', kind: 'bed', price: 40 },
];
export const shopItems: ShopItem[] = [
  ...furnitureCatalog.map(({ itemId, name, kind, price }) => ({
    itemId,
    name,
    itemType: 'FURNITURE' as const,
    unlocked: true,
    unlockHint: null,
    minPrice: { currency: 'STARDUST' as const, amount: price },
    options: furnitureColors.map((color, index) => ({
      optionId: itemId * 10 + index + 1,
      option: { color },
      currency: 'STARDUST' as const,
      price,
      previewAsset: `${kind}-${color}`,
      owned: itemId === 101 && index === 4,
    })),
  })),
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
    optionId: 1015,
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
      optionId: 1015,
      option: { color: '파랑' },
    },
  ],
  avatar: { x: 0.5, y: 0.5, state: 'IDLE', placementId: null },
};
export const socialCards: HousingCard[] = [
  {
    housingId: 2,
    ownerNickname: '별지기',
    name: '궤도의 작은 방',
    likeCount: 12,
    likedByMe: false,
    preview: [],
  },
  {
    housingId: 3,
    ownerNickname: '달빛',
    name: '달빛 정원',
    likeCount: 27,
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
