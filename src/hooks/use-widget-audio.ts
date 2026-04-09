import { useCallback, useEffect, useRef } from "react";

import dialingMp3 from "../../audio/dialing.mp3";
import pickAudio from "../../audio/pick_audio.aac";
import touchAudio from "../../audio/touch_audio.aac";

/** Create an Audio element with preload. */
function createAudio(src: string): HTMLAudioElement {
  const audio = new Audio(src);
  audio.preload = "auto";
  return audio;
}

interface UseWidgetAudioReturn {
  dialingAudioRef: React.RefObject<HTMLAudioElement | null>;
  pickupAudioRef: React.RefObject<HTMLAudioElement | null>;
  playTouchSound: () => void;
  stopDialingAudio: () => void;
}

export function useWidgetAudio(): UseWidgetAudioReturn {
  const dialingAudioRef = useRef<HTMLAudioElement | null>(null);
  const pickupAudioRef = useRef<HTMLAudioElement | null>(null);
  const touchAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    dialingAudioRef.current = createAudio(dialingMp3);
    pickupAudioRef.current = createAudio(pickAudio);
    touchAudioRef.current = createAudio(touchAudio);
    if (dialingAudioRef.current) dialingAudioRef.current.loop = true;
  }, []);

  const stopDialingAudio = useCallback(() => {
    if (dialingAudioRef.current) {
      dialingAudioRef.current.pause();
      dialingAudioRef.current.currentTime = 0;
    }
  }, []);

  const playTouchSound = useCallback(() => {
    touchAudioRef.current?.play().catch(() => {});
  }, []);

  return { dialingAudioRef, pickupAudioRef, playTouchSound, stopDialingAudio };
}
