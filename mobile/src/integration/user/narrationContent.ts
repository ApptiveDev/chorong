import type { Content } from '../models';

// speaker 는 서버 값을 그대로 보존한다. '초롱이' 만 캐릭터 스타일이 따로 있고,
// 그 밖의 값(예상하지 못한 화자 포함)은 별지기와 같은 기본 스타일로 표시된다.
export type NarrationMessage = {
  id: string;
  speaker: string;
  text: string;
  order: number;
};

// 화면 문구는 이전과 같은 "출처: …" 형식. 원본 값은 Content.source 에 그대로 남는다.
const sourceLabel = (source?: string) => (source ? `출처: ${source}` : undefined);

export function toNarrationContent(content: Content): {
  messages: NarrationMessage[];
  source?: string;
} {
  // API v2: dialogue 가 있으면 배열 순서·화자·대사 원문을 그대로 쓴다.
  if (content.dialogue?.length) {
    return {
      messages: content.dialogue.map((line, index) => ({
        id: `${content.contentId}-${index}`,
        order: index,
        speaker: line.speaker,
        text: line.text,
      })),
      source: sourceLabel(content.source),
    };
  }
  // dialogue 가 없으면 기존 body 문자열 파싱(목업·이전 데이터 호환).
  const raw = content.body?.trim() ?? '';
  const sourceMatch = raw.match(/(?:^|\r?\n)\s*((?:출처\s*[·:]|Source\s*:)[^\r\n]*)\s*$/i);
  const body = sourceMatch ? raw.slice(0, sourceMatch.index).trim() : raw;
  const turns = [...body.matchAll(/(?:^|\r?\n)\s*(초롱이|별지기)\s*[:：]\s*/g)];
  const messages: NarrationMessage[] =
    turns.length && turns[0].index === 0
      ? turns.map((turn, index) => ({
          id: `${content.contentId}-${index}`,
          order: index,
          speaker: turn[1],
          text: body.slice(turn.index + turn[0].length, turns[index + 1]?.index).trim(),
        }))
      : body
        ? [{ id: `${content.contentId}-0`, order: 0, speaker: '별지기', text: body }]
        : [];
  return { messages, source: sourceLabel(content.source) ?? sourceMatch?.[1] };
}
