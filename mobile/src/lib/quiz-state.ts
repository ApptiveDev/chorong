import type {
  CardFace,
  Quiz,
  QuizItem,
  QuizResponse,
  QuizSummary,
  SliderConfig,
} from '../types/quiz';

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const face = (v: unknown): v is CardFace =>
  object(v) &&
  ['title', 'text', 'imageUrl'].some((k) => text(v[k])) &&
  ['title', 'text', 'imageUrl'].every((k) => v[k] === undefined || typeof v[k] === 'string');
const items = (v: unknown): v is QuizItem[] =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.every(
    (i) =>
      object(i) &&
      text(i.id) &&
      (text(i.text) || text(i.imageUrl)) &&
      ['text', 'imageUrl'].every((k) => i[k] === undefined || typeof i[k] === 'string'),
  ) &&
  new Set(v.map((i) => i.id)).size === v.length;

// 0.1 + 0.2 같은 오차가 JSON 답안에 섞이지 않도록 십진수 간격을 정수로 계산한다.
function decimal(value: number) {
  const [coefficient, exponent = '0'] = value.toString().split('e');
  const decimals = coefficient.split('.')[1]?.length ?? 0;
  return { integer: BigInt(coefficient.replace('.', '')), scale: decimals - Number(exponent) };
}
function sliderGrid(config: SliderConfig) {
  const parts = [config.min, config.max, config.step].map(decimal);
  const scale = Math.max(...parts.map((p) => p.scale));
  const [min, max, step] = parts.map((p) => p.integer * 10n ** BigInt(scale - p.scale));
  return { min, max, step, scale };
}
export function sliderSteps(config: SliderConfig): number {
  const { min, max, step } = sliderGrid(config);
  return Number((max - min) / step);
}
export function sliderValue(config: SliderConfig, index: number): number {
  const { min, step, scale } = sliderGrid(config);
  const tick = Math.min(sliderSteps(config), Math.max(0, Math.round(index)));
  return Number(`${min + BigInt(tick) * step}e${-scale}`);
}
export function sliderIndex(config: SliderConfig, value: number): number {
  return Math.round((value - config.min) / config.step);
}

export function shuffled<T>(values: T[], random = Math.random): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function prepareQuiz(raw: QuizSummary): Quiz {
  const c = raw.config;
  let valid = false;
  if (object(c)) {
    const selection = (list: unknown) =>
      items(list) &&
      ['SINGLE', 'MULTIPLE'].includes(String(c.selectionType)) &&
      (c.maxSelections === undefined ||
        (Number.isInteger(c.maxSelections) && Number(c.maxSelections) > 0));
    switch (raw.interactionType) {
      case 'SLIDER': {
        valid = finite(c.min) && finite(c.max) && finite(c.step) && c.min < c.max && c.step > 0;
        if (valid) {
          const config = c as SliderConfig;
          const count = sliderSteps(config);
          valid =
            Number.isSafeInteger(count) &&
            (count === 0 || sliderValue(config, 1) > config.min) &&
            (c.initialValue === undefined ||
              (finite(c.initialValue) &&
                sliderValue(config, sliderIndex(config, c.initialValue)) === c.initialValue)) &&
            (c.unit === undefined || typeof c.unit === 'string') &&
            (c.showValue === undefined || typeof c.showValue === 'boolean');
        }
        break;
      }
      case 'SWIPE':
        valid =
          object(c.left) &&
          object(c.right) &&
          text(c.left.value) &&
          text(c.left.label) &&
          text(c.right.value) &&
          text(c.right.label) &&
          c.left.value !== c.right.value;
        break;
      case 'TAP':
        valid = selection(c.items);
        break;
      case 'MULTIPLE_CHOICE':
        valid = selection(c.options);
        break;
      case 'DRAG_DROP':
        valid = items(c.items) && items(c.targets);
        break;
      case 'SORT':
        valid = items(c.items);
        break;
      case 'MATCHING':
        valid =
          items(c.leftItems) && items(c.rightItems) && c.leftItems.length === c.rightItems.length;
        break;
      case 'FLIP_CARD':
        valid = face(c.front) && face(c.back);
        break;
      default:
        throw new Error(`지원하지 않는 문제 유형입니다. (${raw.interactionType})`);
    }
  }
  valid =
    valid &&
    object(c) &&
    (c.shuffle === undefined || typeof c.shuffle === 'boolean') &&
    (c.allowRetry === undefined || c.allowRetry === true) &&
    (c.showHint === undefined || c.showHint === false);
  if (!valid || !object(c))
    throw new Error('이 문제의 설정을 표시할 수 없습니다. 관리자에게 확인해 주세요.');
  const config = { ...c };
  if (c.shuffle === true) {
    for (const key of ['items', 'options', 'targets', 'leftItems', 'rightItems']) {
      if (Array.isArray(c[key])) config[key] = shuffled(c[key]);
    }
  }
  return { ...raw, config } as Quiz;
}

export function initialResponse(quiz: Quiz): QuizResponse {
  switch (quiz.interactionType) {
    case 'SLIDER':
      return { value: quiz.config.initialValue ?? quiz.config.min };
    case 'SWIPE':
      return { value: '' };
    case 'TAP':
      return { selectedItemIds: [] };
    case 'MULTIPLE_CHOICE':
      return { selectedOptionIds: [] };
    case 'DRAG_DROP':
      return { placements: {} };
    case 'SORT':
      return { order: quiz.config.items.map((i) => i.id) };
    case 'MATCHING':
      return { matches: {} };
    case 'FLIP_CARD':
      return { flipped: false };
  }
}

export function responseIssue(quiz: Quiz, response: QuizResponse): string | null {
  switch (quiz.interactionType) {
    case 'SLIDER':
      return 'value' in response && finite(response.value) ? null : '슬라이더 값을 선택해 주세요.';
    case 'SWIPE':
      return 'value' in response &&
        typeof response.value === 'string' &&
        [quiz.config.left.value, quiz.config.right.value].includes(response.value)
        ? null
        : '왼쪽 또는 오른쪽 답을 선택해 주세요.';
    case 'TAP':
      return 'selectedItemIds' in response && response.selectedItemIds.length
        ? null
        : '카드를 하나 이상 선택해 주세요.';
    case 'MULTIPLE_CHOICE':
      return 'selectedOptionIds' in response && response.selectedOptionIds.length
        ? null
        : '선택지를 하나 이상 선택해 주세요.';
    case 'DRAG_DROP':
      return 'placements' in response &&
        quiz.config.items.every((i) => Object.hasOwn(response.placements, i.id))
        ? null
        : '모든 카드를 영역에 배치해 주세요.';
    case 'MATCHING':
      return 'matches' in response &&
        quiz.config.leftItems.every((i) => Object.hasOwn(response.matches, i.id))
        ? null
        : '모든 항목을 연결해 주세요.';
    case 'FLIP_CARD':
      return 'flipped' in response && response.flipped
        ? null
        : '카드를 뒤집어 내용을 확인해 주세요.';
    default:
      return null;
  }
}

export function toggleSelection(
  selected: string[],
  id: string,
  single: boolean,
  limit: number,
): string[] {
  if (selected.includes(id)) return selected.filter((value) => value !== id);
  if (single) return [id];
  return selected.length < limit ? [...selected, id] : selected;
}
export function connectMatch(
  matches: Record<string, string>,
  left: string,
  right: string,
): Record<string, string> {
  return {
    ...Object.fromEntries(Object.entries(matches).filter(([l, r]) => l !== left && r !== right)),
    [left]: right,
  };
}
export function moveItem(order: string[], from: number, to: number): string[] {
  if (from < 0 || to < 0 || from >= order.length || to >= order.length) return order;
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
