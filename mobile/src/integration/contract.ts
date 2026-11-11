import * as m from './models';
import { ContractError, num, object, objectValue, str, unknownObject } from './schema';

type QuizType = 'OX' | 'SINGLE' | 'MULTI' | 'BLANK' | 'SLIDER' | 'MATCH' | 'CHOSUNG';
const quizKinds: QuizType[] = ['OX', 'SINGLE', 'MULTI', 'BLANK', 'SLIDER', 'MATCH', 'CHOSUNG'];
const quizContract = new Map<number, { type: QuizType; config: Record<string, unknown> }>();
const reviewQuiz = new Map<number, number>();
const mapArray = <T>(
  value: unknown,
  path: string,
  parse: (item: unknown, path: string) => T,
): T[] => {
  if (!Array.isArray(value)) throw new ContractError(path);
  return value.map((item, index) => parse(item, `${path}[${index}]`));
};
const choices = (values: unknown): { index: number; label: string }[] => {
  if (!Array.isArray(values) || !values.every((value) => typeof value === 'string'))
    throw new ContractError('$.config.options');
  return values.map((label, index) => ({ index, label }));
};

export const quiz = (value: unknown, path = '$'): m.Quiz => {
  if (!objectValue(value) || !('interactionType' in value)) return m.quiz(value, path);
  const { quizId, interactionType, question, config } = value;
  num(quizId, `${path}.quizId`);
  str(question, `${path}.question`);
  num(value.quizOrder, `${path}.quizOrder`);
  if (!quizKinds.includes(interactionType as QuizType))
    throw new ContractError(`${path}.interactionType`);
  const options = unknownObject(config, `${path}.config`);
  const type = interactionType as QuizType;
  quizContract.set(quizId as number, { type, config: options });
  const base = { quizId: quizId as number, question: question as string, hint: null };
  if (type === 'OX') return { ...base, type: 'OX', options: {} };
  if (type === 'SINGLE')
    return { ...base, type: 'MULTIPLE_CHOICE', options: { choices: choices(options.options) } };
  if (type === 'BLANK') {
    const before = str(options.before, `${path}.config.before`);
    const after = str(options.after, `${path}.config.after`);
    return {
      ...base,
      question: `${before} [[blank]] ${after}`,
      type: 'FILL_BLANK',
      options: { choices: choices(options.options), mockHtmlType: 'blank' },
    };
  }
  if (type === 'MATCH') {
    const pairs = options.pairs;
    if (
      !Array.isArray(pairs) ||
      !pairs.every(
        (pair) =>
          Array.isArray(pair) && pair.length === 2 && pair.every((s) => typeof s === 'string'),
      )
    )
      throw new ContractError(`${path}.config.pairs`);
    const left = pairs.map((pair) => pair[0] as string);
    const right = pairs.map((pair) => pair[1] as string).reverse();
    return {
      ...base,
      type: 'ORDERING',
      options: {
        left,
        right,
        answer: left.map((_, index) => right.length - index - 1),
        mockHtmlType: 'match',
      },
    };
  }
  if (type === 'CHOSUNG')
    return {
      ...base,
      type: 'CHOSUNG',
      options: { hint: str(options.hint, `${path}.config.hint`) },
    };
  if (type === 'SLIDER') {
    const ticks = options.ticks;
    if (!Array.isArray(ticks) || ticks.length < 2 || !ticks.every((t) => typeof t === 'string'))
      throw new ContractError(`${path}.config.ticks`);
    const hint = options.hint === undefined ? undefined : str(options.hint, `${path}.config.hint`);
    return {
      ...base,
      type: 'SLIDER',
      options: { ticks: [...ticks], ...(hint === undefined ? {} : { hint }) },
    };
  }
  // These quiz types need interaction behavior that the existing screens cannot express.
  throw new UnsupportedQuizError(`${path}.interactionType=${type}`, quizId as number, type);
};

// 기존 화면이 표현하지 못하는 퀴즈 유형. 다른 유형으로 바꾸거나 정답을 만들지 않는다.
export class UnsupportedQuizError extends ContractError {
  constructor(
    path: string,
    readonly quizId: number,
    readonly interactionType: QuizType,
  ) {
    super(path);
  }
}
export type UnsupportedQuiz = { quizId: number; interactionType: QuizType };

// 레슨 콘텐츠에서는 미지원 퀴즈를 quiz=null 로 남긴다. 콘텐츠 순서·ID 는 그대로 두고,
// 학습 화면은 기존 "퀴즈 내용을 불러오지 못했습니다." 상태에서 진행을 막는다(제출·완료 보고 없음).
// 원래 quizId 와 유형은 unsupportedQuiz 에 보존한다.
const content = (value: unknown, path = '$', allowUnsupported = false): m.Content => {
  if (!objectValue(value)) throw new ContractError(path);
  const adapted = {
    ...value,
    body: value.body === undefined ? null : value.body,
    mediaUrl: value.mediaUrl === undefined ? null : value.mediaUrl,
    quiz: value.quiz === undefined ? null : value.quiz,
  };
  if (Array.isArray(value.dialogue)) {
    const lines = value.dialogue.map((line, index) => {
      const item = object({ speaker: str, text: str })(line, `${path}.dialogue[${index}]`);
      return `${item.speaker}: ${item.text}`;
    });
    adapted.body = lines.join('\n');
  }
  if (typeof value.source === 'string' && typeof adapted.body === 'string')
    adapted.body += `\n출처: ${value.source}`;
  if (value.quiz != null) {
    try {
      adapted.quiz = quiz(value.quiz, `${path}.quiz`);
    } catch (error) {
      if (!allowUnsupported || !(error instanceof UnsupportedQuizError)) throw error;
      adapted.quiz = null;
      const unsupported: UnsupportedQuiz = {
        quizId: error.quizId,
        interactionType: error.interactionType,
      };
      (adapted as Record<string, unknown>).unsupportedQuiz = unsupported;
    }
  }
  return m.content(adapted, path);
};

const contentList = (value: unknown, path: string, allowUnsupported = false) =>
  mapArray(value, path, (item, itemPath) => content(item, itemPath, allowUnsupported));
const lessonDetail = (value: unknown, path: string, allowUnsupported: boolean): m.Lesson => {
  if (!objectValue(value)) throw new ContractError(path);
  return m.lessonDetail(
    { ...value, contents: contentList(value.contents, `${path}.contents`, allowUnsupported) },
    path,
  );
};
export const lesson = (value: unknown, path = '$'): m.Lesson => lessonDetail(value, path, true);
export const lessonStart = (value: unknown, path = '$'): m.LessonStartResponse => {
  if (!objectValue(value)) throw new ContractError(path);
  return m.lessonStart(
    {
      ...value,
      contents: contentList(value.contents, `${path}.contents`, true),
      review: value.review == null ? value.review : reviewSet(value.review, `${path}.review`),
    },
    path,
  );
};
export const reviewSet = (value: unknown, path = '$'): m.ReviewSet => {
  if (!objectValue(value)) throw new ContractError(path);
  const items = mapArray(value.reviewItems, `${path}.reviewItems`, (item, itemPath) => {
    if (!objectValue(item)) throw new ContractError(itemPath);
    const adapted = m.reviewItem({ ...item, quiz: quiz(item.quiz, `${itemPath}.quiz`) }, itemPath);
    reviewQuiz.set(adapted.reviewItemId, adapted.quiz.quizId);
    return adapted;
  });
  return m.reviewSet({ ...value, reviewItems: items }, path);
};
// 온보딩·복습은 미지원 퀴즈를 허용하지 않는다. 온보딩 완료 버튼은 quiz=null 콘텐츠를 답한 것으로
// 보고 보상(API-602)을 받을 수 있고, 복습 완료(API-503)는 5문항 전부가 필요하다.
export const onboarding = (value: unknown, path = '$') => {
  if (!objectValue(value)) throw new ContractError(path);
  const parsed = lessonDetail(value.lesson, `${path}.lesson`, false);
  // 온보딩 화면에는 초성·슬라이더 UI 를 붙이지 않았다. 답할 수 없는 문항으로 보상을 받지 않게 막는다.
  parsed.contents.forEach((item, index) => {
    const type = item.quiz?.type;
    if (item.quiz && (type === 'CHOSUNG' || type === 'SLIDER'))
      throw new UnsupportedQuizError(
        `${path}.lesson.contents[${index}].quiz.interactionType=${type}`,
        item.quiz.quizId,
        type,
      );
  });
  return { lesson: parsed };
};

export const answerResult = (value: unknown, path = '$') => {
  if (!objectValue(value)) throw new ContractError(path);
  return m.answerResult({ ...value, correctAnswer: value.correctAnswer ?? {} }, path);
};
export const encodeReviewAnswer = (reviewItemId: number, answer: m.QuizAnswer) =>
  encodeAnswer(reviewQuiz.get(reviewItemId) ?? reviewItemId, answer);
export function encodeAnswer(quizId: number, answer: m.QuizAnswer): unknown {
  const contract = quizContract.get(quizId);
  if (!contract) return answer;
  switch (contract.type) {
    case 'OX':
      if ('value' in answer) return { answer: answer.value };
      break;
    case 'SINGLE':
      if ('index' in answer) return { answer: answer.index };
      break;
    case 'BLANK':
      if ('index' in answer) return { answer: answer.index };
      if ('texts' in answer && answer.texts.length === 1) {
        const options = contract.config.options;
        const index = Array.isArray(options) ? options.indexOf(answer.texts[0]) : -1;
        if (index >= 0) return { answer: index };
      }
      break;
    case 'CHOSUNG':
      // 입력 문자열을 그대로 보낸다. 공백 제거 비교와 채점은 서버가 한다.
      if ('texts' in answer && answer.texts.length === 1 && answer.texts[0].trim())
        return { answer: answer.texts[0].trim() };
      break;
    case 'SLIDER':
      // 트랙 위치 0~1 을 그대로 보낸다. 눈금 스냅·채점은 하지 않는다.
      if (
        'position' in answer &&
        Number.isFinite(answer.position) &&
        answer.position >= 0 &&
        answer.position <= 1
      )
        return { answer: answer.position };
      break;
    case 'MATCH':
      if ('order' in answer) {
        const pairs = contract.config.pairs as string[][];
        return { pairs: pairs.map(([left, right]) => [left, right]) };
      }
      break;
  }
  throw new ContractError(`quizId=${quizId}.answer`);
}

export const inventory = (value: unknown, path = '$') => {
  if (!objectValue(value)) throw new ContractError(path);
  const items = mapArray(value.items, `${path}.items`, (item, itemPath) => {
    if (objectValue(item) && 'copies' in item) {
      const group = m.inventoryGroup(item, itemPath);
      if (group.copies.length !== group.ownedCount) throw new ContractError(`${itemPath}.copies`);
      return group.copies.map((copy) =>
        m.inventoryItem(
          {
            ...copy,
            itemId: group.itemId,
            optionId: group.optionId,
            itemType: group.itemType,
            name: group.name,
            option: group.option,
          },
          itemPath,
        ),
      );
    }
    return [m.inventoryItem(item, itemPath)];
  }).flat();
  return { items };
};

export const shopItem = (value: unknown, path = '$') => {
  if (!objectValue(value)) throw new ContractError(path);
  const raw = value.options;
  if (!Array.isArray(raw)) throw new ContractError(`${path}.options`);
  const options = raw.map((option, index) => {
    if (!objectValue(option)) throw new ContractError(`${path}.options[${index}]`);
    const ownedCount = option.ownedCount;
    if (ownedCount !== undefined && num(ownedCount, `${path}.options[${index}].ownedCount`) < 0)
      throw new ContractError(`${path}.options[${index}].ownedCount`);
    return {
      ...option,
      owned: typeof option.owned === 'boolean' ? option.owned : (ownedCount as number) > 0,
    };
  });
  return m.shopItem({ ...value, options }, path);
};
export const shopItems = (value: unknown, path = '$') => {
  if (!objectValue(value)) throw new ContractError(path);
  return { items: mapArray(value.items, `${path}.items`, shopItem) };
};
export const shopDetail = (value: unknown, path = '$') => {
  if (!objectValue(value) || !objectValue(value.item)) throw new ContractError(path);
  const options = value.item.options ?? value.options;
  const item = shopItem({ ...value.item, options }, `${path}.item`);
  const detailOptions =
    value.options === undefined
      ? item.options
      : shopItem({ ...value.item, options: value.options }, `${path}.item`).options;
  return { item, options: detailOptions };
};

const placement = (value: unknown, path = '$') => {
  if (!objectValue(value) || !objectValue(value.transform)) throw new ContractError(path);
  const transform = value.transform;
  if (transform.flippedX !== undefined && typeof transform.flippedX !== 'boolean')
    throw new ContractError(`${path}.transform.flippedX`);
  // 옵션 없는 아이템은 optionId·option 이 생략된다. optionId 는 비워 두고,
  // option 은 "옵션 속성 없음"인 {} 로 둔다(화면은 option.color 를 읽는다).
  return m.placement(
    {
      ...value,
      option: value.option === undefined ? {} : value.option,
      transform: { ...transform, rotation: transform.rotation ?? 0, layer: transform.layer ?? 0 },
    },
    path,
  );
};
export const housingDetail = (value: unknown, path = '$') => {
  if (!objectValue(value)) throw new ContractError(path);
  return m.housingDetail(
    { ...value, placements: mapArray(value.placements, `${path}.placements`, placement) },
    path,
  );
};
export const housingVisit = (value: unknown, path = '$') => {
  if (!objectValue(value)) throw new ContractError(path);
  return m.housingVisit(
    { ...value, placements: mapArray(value.placements, `${path}.placements`, placement) },
    path,
  );
};
export const savedPlacements = (value: unknown, path = '$') => {
  if (!objectValue(value)) throw new ContractError(path);
  return { placements: mapArray(value.placements, `${path}.placements`, placement) };
};
// API-903 은 quantity 가 필수다. 같은 옵션을 여러 개 고른 경우 한 항목으로 묶는다.
export const purchaseRequest = (items: m.ShopSelection[]) => {
  const grouped = new Map<string, m.ShopSelection & { quantity: number }>();
  for (const { itemId, optionId } of items) {
    const key = `${itemId}:${optionId}`;
    const found = grouped.get(key);
    if (found) found.quantity += 1;
    else grouped.set(key, { itemId, optionId, quantity: 1 });
  }
  return [...grouped.values()];
};
export const placementRequest = (placements: m.PlacementInput[]) =>
  placements.map(({ inventoryId, area, transform }) => {
    const source = transform as Record<string, unknown>;
    return {
      inventoryId,
      area,
      transform: {
        x: transform.x,
        y: transform.y,
        layer: transform.layer,
        ...(typeof source.flippedX === 'boolean' ? { flippedX: source.flippedX } : {}),
      },
    };
  });
