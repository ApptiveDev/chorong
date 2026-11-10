import type { Content } from '../models';
import type { NarrationMessage } from './NarrationDialogue';

export function toNarrationContent(content: Content): {
  messages: NarrationMessage[];
  source?: string;
} {
  const raw = content.body?.trim() ?? '';
  const sourceMatch = raw.match(/(?:^|\r?\n)\s*((?:출처\s*[·:]|Source\s*:)[^\r\n]*)\s*$/i);
  const body = sourceMatch ? raw.slice(0, sourceMatch.index).trim() : raw;
  const turns = [...body.matchAll(/(?:^|\r?\n)\s*(초롱이|별지기)\s*[:：]\s*/g)];
  const messages: NarrationMessage[] =
    turns.length && turns[0].index === 0
      ? turns.map((turn, index) => ({
          id: `${content.contentId}-${index}`,
          order: index,
          speaker: turn[1] as NarrationMessage['speaker'],
          text: body.slice(turn.index + turn[0].length, turns[index + 1]?.index).trim(),
        }))
      : body
        ? [{ id: `${content.contentId}-0`, order: 0, speaker: '별지기', text: body }]
        : [];
  return { messages, source: sourceMatch?.[1] };
}
