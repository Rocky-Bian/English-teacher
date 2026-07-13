"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prepareTextForSpeech } from "@/lib/speechText";

const LISTEN_MAX_SECONDS = 12;

export interface ListenCallbacks {
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (msg: string) => void;
}

function micPermissionMessage(error: unknown): string {
  const name =
    error instanceof DOMException
      ? error.name
      : error instanceof Error
        ? error.name
        : "";

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "麦克风被拒绝：在 Arc 地址栏粘贴 arc://settings/content/siteDetails?site=http%3A%2F%2Flocalhost%3A3000 回车 → 麦克风选「允许」→ 刷新页面";
    case "NotFoundError":
      return "未检测到麦克风，请检查设备是否已连接";
    case "NotReadableError":
      return "麦克风被其他应用占用，请关闭后重试";
    default:
      return "无法访问麦克风，请用 Chrome / Edge 打开 http://localhost:3000 并允许权限";
  }
}

function pickRecorderMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export function useSpeech() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speechPreview, setSpeechPreview] = useState("");
  const [listenSecondsLeft, setListenSecondsLeft] = useState<number | null>(
    null
  );
  const [sttSupported, setSttSupported] = useState(false);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const speakSessionRef = useRef(0);
  const listenTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacksRef = useRef<ListenCallbacks | null>(null);
  const listenSessionRef = useRef(0);

  const clearListenTimers = useCallback(() => {
    if (listenTimerRef.current) {
      clearInterval(listenTimerRef.current);
      listenTimerRef.current = null;
    }
    if (listenTimeoutRef.current) {
      clearTimeout(listenTimeoutRef.current);
      listenTimeoutRef.current = null;
    }
    setListenSecondsLeft(null);
  }, []);

  const releaseMicrophone = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const resetRecordingUi = useCallback(() => {
    clearListenTimers();
    releaseMicrophone();
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    setListening(false);
    setTranscribing(false);
    setSpeechPreview("");
  }, [clearListenTimers, releaseMicrophone]);

  useEffect(() => {
    queueMicrotask(() => {
      setSttSupported(
        typeof window !== "undefined" &&
          Boolean(navigator.mediaDevices?.getUserMedia) &&
          typeof MediaRecorder !== "undefined"
      );
    });

    return () => {
      resetRecordingUi();
      cleanupAudio();
    };
  }, [cleanupAudio, resetRecordingUi]);

  const stopSpeaking = useCallback(() => {
    speakSessionRef.current += 1;
    cleanupAudio();
    setSpeakingId(null);
  }, [cleanupAudio]);

  const speak = useCallback(
    async (
      text: string,
      messageId?: string,
      ttsOptions?: { voice?: string; rate?: string; pitch?: string }
    ) => {
      if (typeof window === "undefined") return;

      const spokenText = prepareTextForSpeech(text);
      if (!spokenText) return;

      stopSpeaking();
      const session = speakSessionRef.current;
      if (messageId) setSpeakingId(messageId);

      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: spokenText,
            voice: ttsOptions?.voice,
            rate: ttsOptions?.rate,
            pitch: ttsOptions?.pitch,
          }),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? "语音合成失败");
        }

        if (speakSessionRef.current !== session) return;

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;

        const finish = () => {
          if (speakSessionRef.current === session) {
            cleanupAudio();
            setSpeakingId(null);
          }
        };

        audio.onended = finish;
        audio.onerror = finish;
        await audio.play();
      } catch (error) {
        console.error("[speech]", error);
        if (speakSessionRef.current === session) {
          setSpeakingId(null);
        }
      }
    },
    [cleanupAudio, stopSpeaking]
  );

  const transcribeBlob = useCallback(
    async (blob: Blob, session: number) => {
      setTranscribing(true);
      setSpeechPreview("正在识别…");

      try {
        const formData = new FormData();
        formData.append("audio", blob, "speech.webm");

        const res = await fetch("/api/stt", {
          method: "POST",
          body: formData,
        });
        const data = (await res.json()) as { text?: string; error?: string };

        if (listenSessionRef.current !== session) return;

        if (!res.ok) {
          throw new Error(data.error ?? "语音识别失败");
        }

        const text = data.text?.trim();
        if (text) {
          setSpeechPreview(text);
          callbacksRef.current?.onFinal(text);
        } else {
          callbacksRef.current?.onError?.("没识别到内容，请再说一次");
        }
      } catch (error) {
        if (listenSessionRef.current === session) {
          callbacksRef.current?.onError?.(
            error instanceof Error ? error.message : "语音识别失败"
          );
        }
      } finally {
        if (listenSessionRef.current === session) {
          resetRecordingUi();
          callbacksRef.current = null;
        }
      }
    },
    [resetRecordingUi]
  );

  const stopListening = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      resetRecordingUi();
      callbacksRef.current = null;
      return;
    }

    clearListenTimers();
    setListening(false);

    recorder.onstop = () => {
      const session = listenSessionRef.current;
      const mimeType = recorder.mimeType || "audio/webm";
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      releaseMicrophone();
      mediaRecorderRef.current = null;

      if (blob.size < 800) {
        resetRecordingUi();
        callbacksRef.current?.onError?.("录音太短，请多说几个字");
        callbacksRef.current = null;
        return;
      }

      transcribeBlob(blob, session);
    };

    try {
      recorder.stop();
    } catch {
      resetRecordingUi();
      callbacksRef.current?.onError?.("停止录音失败");
      callbacksRef.current = null;
    }
  }, [clearListenTimers, releaseMicrophone, resetRecordingUi, transcribeBlob]);

  const startListening = useCallback(
    async (callbacks: ListenCallbacks) => {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        callbacks.onError?.("当前浏览器不支持录音");
        return;
      }

      listenSessionRef.current += 1;
      const session = listenSessionRef.current;

      resetRecordingUi();
      callbacksRef.current = callbacks;
      setSpeechPreview("");

      try {
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      } catch (error) {
        callbacks.onError?.(micPermissionMessage(error));
        callbacksRef.current = null;
        return;
      }

      const mimeType = pickRecorderMimeType();
      if (!mimeType) {
        releaseMicrophone();
        callbacks.onError?.("当前浏览器不支持音频录制");
        callbacksRef.current = null;
        return;
      }

      audioChunksRef.current = [];
      const recorder = new MediaRecorder(mediaStreamRef.current, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        if (listenSessionRef.current !== session) return;
        resetRecordingUi();
        callbacks.onError?.("录音出错，请重试");
        callbacksRef.current = null;
      };

      try {
        recorder.start(250);
      } catch {
        resetRecordingUi();
        callbacks.onError?.("无法开始录音");
        callbacksRef.current = null;
        return;
      }

      setListening(true);
      setListenSecondsLeft(LISTEN_MAX_SECONDS);
      setSpeechPreview("🎤 录音中…");

      listenTimerRef.current = setInterval(() => {
        setListenSecondsLeft((prev) => {
          if (prev === null || prev <= 1) return prev;
          return prev - 1;
        });
      }, 1000);

      listenTimeoutRef.current = setTimeout(() => {
        if (listenSessionRef.current === session) {
          stopListening();
        }
      }, LISTEN_MAX_SECONDS * 1000);
    },
    [releaseMicrophone, resetRecordingUi, stopListening]
  );

  return {
    speak,
    stopSpeaking,
    speakingId,
    startListening,
    stopListening,
    listening: listening || transcribing,
    speechPreview,
    listenSecondsLeft: listening ? listenSecondsLeft : null,
    transcribing,
    sttSupported,
    ttsSupported: true,
  };
}
