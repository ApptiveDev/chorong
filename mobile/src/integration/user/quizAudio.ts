// SINGLE + presentation.type === 'AUDIO'(소리 듣고 고르기)의 음원 처리.
// 재생 방식이 아직 정해지지 않아 화면은 이 파일의 훅만 쓰고, 실제 재생은 audioDriver 하나로 모은다.
// 네이티브 재생 라이브러리(expo-audio 등)를 붙일 때는 nativeDriver 만 바꾸면 된다.
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { Content, Quiz } from '../models';

/** 소리 듣고 고르기 문항이면 음원 주소, 아니면 null. 주소 형식 검증은 서버(QuizGrader)와 같다. */
export function quizAudioUrl(quiz: Quiz | null | undefined): string | null {
  const presentation = quiz?.config?.presentation;
  if (presentation?.type !== 'AUDIO') return null;
  const url = presentation.mediaUrl;
  return url && url === url.trim() && /^https?:\/\/[^/\s]+/i.test(url) ? url : null;
}

export function lessonAudioUrls(contents: Content[]): string[] {
  return [
    ...new Set(
      contents.map((content) => quizAudioUrl(content.quiz)).filter((url): url is string => !!url),
    ),
  ];
}

export type QuizAudioStatus = 'loading' | 'ready' | 'playing' | 'unavailable';

type AudioHandle = {
  play: () => Promise<void>;
  stop: () => void;
  release: () => void;
};

type AudioDriver = {
  /** 레슨 시작 때 음원을 미리 받아 둔다. 실패해도 문항 화면의 로딩을 막지 않는다. */
  prefetch: (url: string) => Promise<void>;
  /** 문항 화면에서 쓸 재생기. null 이면 이 환경에서 재생할 수 없다. */
  load: (url: string, onEnded: () => void) => Promise<AudioHandle | null>;
};

// 웹: HTMLAudioElement. 같은 주소의 요소를 보관해 사전 로딩한 버퍼를 문항에서 그대로 쓴다.
const webCache = new Map<string, HTMLAudioElement>();
const webElement = (url: string) => {
  const AudioCtor = (globalThis as { Audio?: new (src?: string) => HTMLAudioElement }).Audio;
  if (!AudioCtor) return null;
  let element = webCache.get(url);
  if (!element) {
    element = new AudioCtor(url);
    element.preload = 'auto';
    webCache.set(url, element);
  }
  return element;
};
const webDriver: AudioDriver = {
  prefetch: async (url) => {
    webElement(url)?.load();
  },
  load: async (url, onEnded) => {
    const element = webElement(url);
    if (!element) return null;
    element.onended = onEnded;
    return {
      play: async () => {
        element.currentTime = 0;
        await element.play();
      },
      stop: () => {
        element.pause();
        element.currentTime = 0;
      },
      release: () => {
        element.pause();
        element.onended = null;
      },
    };
  },
};

// 네이티브: 재생 라이브러리를 아직 넣지 않았다. 붙일 때 이 객체만 구현한다.
const nativeDriver: AudioDriver = {
  prefetch: async () => {},
  load: async () => null,
};

const audioDriver: AudioDriver = Platform.OS === 'web' ? webDriver : nativeDriver;

/** lessonImagePreload.prefetchLessonImages 와 같이 레슨 시작 때 한 번 부른다. */
export async function prefetchLessonAudio(contents: Content[], isCurrent: () => boolean) {
  for (const url of lessonAudioUrls(contents)) {
    if (!isCurrent()) return;
    try {
      await audioDriver.prefetch(url);
    } catch {
      // 사전 로딩 실패는 실제 문항 화면의 재생을 막지 않는다.
    }
  }
}

/** 문항 화면용. 재생 중에 누르면 멈추고, 멈춘 상태에서 누르면 처음부터 다시 재생한다. */
export function useQuizAudio(url: string | null) {
  const [status, setStatus] = useState<QuizAudioStatus>(url ? 'loading' : 'unavailable');
  const handle = useRef<AudioHandle | null>(null);

  useEffect(() => {
    if (!url) {
      setStatus('unavailable');
      return;
    }
    let active = true;
    setStatus('loading');
    audioDriver
      .load(url, () => active && setStatus('ready'))
      .then((loaded) => {
        if (!active) return loaded?.release();
        handle.current = loaded;
        setStatus(loaded ? 'ready' : 'unavailable');
      })
      .catch(() => active && setStatus('unavailable'));
    return () => {
      active = false;
      handle.current?.release();
      handle.current = null;
    };
  }, [url]);

  const toggle = () => {
    const current = handle.current;
    if (!current) return;
    if (status === 'playing') {
      current.stop();
      setStatus('ready');
      return;
    }
    setStatus('playing');
    current.play().catch(() => setStatus('ready'));
  };
  const stop = () => {
    if (status !== 'playing') return;
    handle.current?.stop();
    setStatus('ready');
  };

  return { status, toggle, stop };
}
