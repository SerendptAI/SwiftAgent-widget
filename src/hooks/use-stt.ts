import { useCallback, useRef } from "react";

import { voiceApiClient } from "../lib/api-client";

// --- Types ---

export interface UseSTTOptions {
  onTranscript: (text: string) => void;
  onSpeechStart?: () => void;
  onError?: (message: string) => void;
}

export interface UseSTTReturn {
  start: () => void;
  stop: () => void;
  abort: () => void;
}

// --- VAD Constants ---

const SPEECH_THRESHOLD = 25; // Volume level (0–255) to consider as speech
const SPEECH_START_FRAMES = 2; // Consecutive loud frames to trigger recording
const SILENCE_DURATION_MS = 400; // Silence duration before stopping recording
const MIN_RECORDING_MS = 200; // Minimum recording length to avoid noise blips

// --- Hook ---

export function useSTT({
  onTranscript,
  onSpeechStart,
  onError,
}: UseSTTOptions): UseSTTReturn {
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const rafRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);

  // VAD state refs
  const loudFramesRef = useRef(0);
  const isRecordingRef = useRef(false);
  const silenceStartRef = useRef(0);
  const recordingStartRef = useRef(0);
  const activeRef = useRef(false);

  // Stable refs for callbacks
  const onTranscriptRef = useRef(onTranscript);
  const onSpeechStartRef = useRef(onSpeechStart);
  const onErrorRef = useRef(onError);
  onTranscriptRef.current = onTranscript;
  onSpeechStartRef.current = onSpeechStart;
  onErrorRef.current = onError;

  const cleanup = useCallback(() => {
    activeRef.current = false;
    cancelAnimationFrame(rafRef.current);
    abortRef.current?.abort();
    abortRef.current = null;

    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;

    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    loudFramesRef.current = 0;
    isRecordingRef.current = false;
    silenceStartRef.current = 0;
    recordingStartRef.current = 0;
  }, []);

  const transcribe = useCallback(async (blob: Blob) => {
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const form = new FormData();
      form.append("audio", blob);

      const { data } = await voiceApiClient.post("/api/v1/stt", form, {
        signal: controller.signal,
      });

      if (data.text?.trim()) {
        onTranscriptRef.current(data.text.trim());
      }
    } catch (err) {
      if (
        (err as Error).name === "AbortError" ||
        (err as Error).name === "CanceledError"
      )
        return;
      onErrorRef.current?.("Failed to transcribe speech");
    } finally {
      abortRef.current = null;
    }
  }, []);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || isRecordingRef.current) return;

    isRecordingRef.current = true;
    recordingStartRef.current = Date.now();
    onSpeechStartRef.current?.();

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      isRecordingRef.current = false;
      const duration = Date.now() - recordingStartRef.current;

      if (duration >= MIN_RECORDING_MS && chunks.length > 0) {
        const blob = new Blob(chunks, { type: mimeType });
        transcribe(blob);
      }
    };

    recorderRef.current = recorder;
    recorder.start();
  }, [transcribe]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const monitorVolume = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser || !activeRef.current) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    // Average volume across frequency bins
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = sum / data.length;

    if (avg >= SPEECH_THRESHOLD) {
      loudFramesRef.current += 1;
      silenceStartRef.current = 0;

      // Start recording after enough consecutive loud frames
      if (
        loudFramesRef.current >= SPEECH_START_FRAMES &&
        !isRecordingRef.current
      ) {
        startRecording();
      }
    } else {
      loudFramesRef.current = 0;

      // Track silence while recording
      if (isRecordingRef.current) {
        if (silenceStartRef.current === 0) {
          silenceStartRef.current = Date.now();
        } else if (
          Date.now() - silenceStartRef.current >=
          SILENCE_DURATION_MS
        ) {
          stopRecording();
          silenceStartRef.current = 0;
        }
      }
    }

    rafRef.current = requestAnimationFrame(monitorVolume);
  }, [startRecording, stopRecording]);

  const start = useCallback(async () => {
    // Prevent double-start
    if (activeRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);

      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      activeRef.current = true;

      // Begin monitoring for speech
      monitorVolume();
    } catch {
      onErrorRef.current?.("Microphone access denied");
    }
  }, [monitorVolume]);

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const abort = useCallback(() => {
    // Stop without processing current recording
    if (recorderRef.current) {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = null;
      if (recorderRef.current.state === "recording") {
        recorderRef.current.stop();
      }
    }
    cleanup();
  }, [cleanup]);

  return { start, stop, abort };
}
