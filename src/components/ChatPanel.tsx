"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, Homework, ScenarioId, UserProfile } from "@/lib/types";
import { getScenario, isScenarioMode, isClientScenario } from "@/lib/scenarios";
import { getTtsOptionsForScenario } from "@/lib/ttsConfig";
import { useSpeech } from "@/hooks/useSpeech";
import { MessageBubble, SelectionVocabularyPopover } from "./MessageBubble";
import { ScenarioBar } from "./ScenarioBar";

interface ChatPanelProps {
  profile: UserProfile;
  onHomeworkCreated: (homework: Homework) => void;
  onProfileUpdate: (profile: UserProfile) => void;
}

const CHAT_SCROLL_KEY = "emma-chat-scroll-top";

function isNearBottom(element: HTMLElement, threshold = 120) {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <= threshold
  );
}

export function ChatPanel({
  profile,
  onHomeworkCreated,
  onProfileUpdate,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState<ScenarioId>(profile.scenarioId);
  const [autoSpeak, setAutoSpeak] = useState(profile.autoSpeak);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stickToBottomRef = useRef(true);
  const historyLoadedRef = useRef(false);
  const [textSelection, setTextSelection] = useState<{
    text: string;
    messageId: string;
    context: string;
    left: number;
    top: number;
    right: number;
    height: number;
  } | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const {
    speak,
    stopSpeaking,
    speakingId,
    startListening,
    stopListening,
    listening,
    speechPreview,
    listenSecondsLeft,
    transcribing,
    sttSupported,
    ttsSupported,
  } = useSpeech();

  const activeScenario = getScenario(scenarioId);
  const clientMode = isClientScenario(scenarioId);
  const ttsOptions = getTtsOptionsForScenario(scenarioId);

  async function loadMessages(forScenario: ScenarioId) {
    const res = await fetch(
      `/api/chat?scenarioId=${encodeURIComponent(forScenario)}`
    );
    const data = await res.json();
    if (data.messages) {
      setMessages(data.messages);
      historyLoadedRef.current = false;
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadMessages(profile.scenarioId).catch(() => setError("无法加载对话历史"));
    });
  }, [profile.scenarioId]);

  useEffect(() => {
    queueMicrotask(() => {
      setScenarioId(profile.scenarioId);
      setAutoSpeak(profile.autoSpeak);
    });
  }, [profile.scenarioId, profile.autoSpeak]);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const saveScroll = () => {
      const nearBottom = isNearBottom(container);
      stickToBottomRef.current = nearBottom;
      setShowScrollDown(!nearBottom);
      sessionStorage.setItem(CHAT_SCROLL_KEY, String(container.scrollTop));
    };

    container.addEventListener("scroll", saveScroll, { passive: true });
    return () => container.removeEventListener("scroll", saveScroll);
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || messages.length === 0) return;

    if (!historyLoadedRef.current) {
      historyLoadedRef.current = true;
      const saved = sessionStorage.getItem(CHAT_SCROLL_KEY);
      requestAnimationFrame(() => {
        if (saved !== null) {
          const top = Number.parseInt(saved, 10);
          if (!Number.isNaN(top)) {
            container.scrollTop = Math.min(
              top,
              container.scrollHeight - container.clientHeight
            );
            stickToBottomRef.current = isNearBottom(container);
            setShowScrollDown(!stickToBottomRef.current);
            return;
          }
        }
        scrollToBottom("instant");
        stickToBottomRef.current = true;
        setShowScrollDown(false);
      });
      return;
    }

    if (stickToBottomRef.current) {
      scrollToBottom(loading ? "instant" : "smooth");
    }

    if (!loading) {
      requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
      });
    }
  }, [messages, loading, scrollToBottom]);

  const maybeSpeak = useCallback(
    (message: ChatMessage, forScenario?: ScenarioId) => {
      if (autoSpeak && ttsSupported && message.role === "assistant") {
        speak(
          message.content,
          message.id,
          getTtsOptionsForScenario(forScenario ?? scenarioId)
        );
      }
    },
    [autoSpeak, speak, ttsSupported, scenarioId]
  );

  async function persistProfile(
    updates: Partial<UserProfile>
  ): Promise<UserProfile | null> {
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onProfileUpdate(data.profile);
      return data.profile;
    } catch {
      return null;
    }
  }

  async function selectScenario(id: ScenarioId) {
    if (loading || id === scenarioId) return;

    stopSpeaking();
    setScenarioId(id);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/scenario/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "切换情景失败");

      onProfileUpdate(data.profile);

      if (data.messages) {
        setMessages(data.messages);
        historyLoadedRef.current = false;
      } else if (data.openingMessage) {
        setMessages([data.openingMessage]);
        historyLoadedRef.current = false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "切换情景失败");
      setScenarioId(profile.scenarioId);
    } finally {
      setLoading(false);
    }
  }

  async function toggleAutoSpeak() {
    const next = !autoSpeak;
    setAutoSpeak(next);
    if (!next) stopSpeaking();
    await persistProfile({ autoSpeak: next });
  }

  async function sendMessage(text?: string) {
    const message = (text ?? input).trim();
    if (!message || loading) return;
    const optimisticId = `temp-${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();

    setInput("");
    setError(null);
    setLoading(true);
    stopSpeaking();
    stickToBottomRef.current = true;

    const optimisticUser: ChatMessage = {
      id: optimisticId,
      role: "user",
      content: message,
      createdAt,
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, scenarioId }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "发送失败");
      }

      const assistantMessage = data.assistantMessage as ChatMessage;

      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== optimisticUser.id);
        return [
          ...withoutTemp,
          {
            id: `user-${crypto.randomUUID()}`,
            role: "user",
            content: message,
            createdAt,
          },
          assistantMessage,
        ];
      });

      maybeSpeak(assistantMessage);

      if (data.homework) {
        onHomeworkCreated(data.homework);
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
      setError(err instanceof Error ? err.message : "发送失败");
      setInput(message);
    } finally {
      setLoading(false);
    }
  }

  function handleMicClick() {
    if (transcribing) return;

    if (listening) {
      stopListening();
      return;
    }

    setError(null);
    startListening({
      onFinal: (spoken) => {
        setInput((prev) => {
          const base = prev.trim();
          const text = spoken.trim();
          if (!text) return prev;
          return base ? `${base} ${text}` : text;
        });
        inputRef.current?.focus({ preventScroll: true });
      },
      onError: (msg) => setError(msg),
    });
  }

  const inputDisplayValue =
    listening && speechPreview && !transcribing
      ? speechPreview.startsWith("🎤")
        ? input
        : input.trim()
          ? `${input.trim()} ${speechPreview}`
          : speechPreview
      : input;

  const quickPrompts = clientMode
    ? [
        "We can deliver EVT in 6 weeks with ESP32-S3 and on-device inference.",
        "Typical MOQ for a pilot run is 50 units — let me break down BOM cost.",
        "For FCC/CE, we handle pre-scan and support your certified module choice.",
      ]
    : isScenarioMode(scenarioId)
      ? [activeScenario.userHint, "Keep going, I'm into this.", "Switch tone—surprise me."]
      : [
          "Emma, rate my flirting skills. Be brutally honest.",
          "Let's pretend we matched on a dating app. You go first.",
          "Tell me your hottest take and I'll argue in English.",
        ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SelectionVocabularyPopover
        selection={textSelection}
        onDismiss={() => setTextSelection(null)}
      />
      <ScenarioBar
        activeId={scenarioId}
        loading={loading}
        onSelect={selectScenario}
      />

      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollContainerRef}
          className="h-full overflow-y-auto px-4 py-4 lg:py-6"
        >
        {messages.length === 0 && !loading && (
          <div className="mx-auto max-w-lg text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal-100 text-2xl dark:bg-teal-900">
              {activeScenario.emoji}
            </div>
            <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-100">
              {clientMode ? "Marcus · 欧美客户" : `Hey, ${profile.name}.`}
            </h2>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              {clientMode
                ? `工作场景已就绪。Marcus 是波士顿硬件创业公司的 Product Lead，正在找深圳 ODM 伙伴。用英文谈 AI 宠物、智能音箱等项目——${activeScenario.userHint}`
                : isScenarioMode(scenarioId)
                  ? `情景「${activeScenario.title}」已就绪。点上方情景或直接开聊——${activeScenario.userHint}`
                  : "我是 Emma——毒舌英语搭子。选个情景更带感，或随便聊。"}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              当前水平：{profile.level}
              {clientMode ? " · Edge TTS · Guy" : " · Edge TTS · Jenny"}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  className="rounded-full border border-teal-200 bg-white px-3 py-1.5 text-sm text-teal-800 transition hover:bg-teal-50 dark:border-teal-800 dark:bg-zinc-800 dark:text-teal-200 dark:hover:bg-teal-950"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mx-auto max-w-2xl space-y-6">
          {messages.map((msg, index) => {
            const correctionContext =
              msg.role === "assistant"
                ? [...messages]
                    .slice(0, index)
                    .reverse()
                    .find((m) => m.role === "user")?.content
                : undefined;

            return (
              <MessageBubble
                key={msg.id}
                message={msg}
                clientMode={clientMode}
                correctionContext={correctionContext}
                speaking={speakingId === msg.id}
                onSpeak={
                  ttsSupported
                    ? (text, id) => {
                        if (speakingId === id) {
                          stopSpeaking();
                        } else {
                          speak(text, id, ttsOptions);
                        }
                      }
                    : undefined
                }
                onTextSelect={(text, messageId, context) => {
                  const sel = window.getSelection();
                  const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
                  const rect = range?.getBoundingClientRect();
                  if (!rect) return;
                  setTextSelection({
                    text,
                    messageId,
                    context,
                    left: rect.left,
                    top: rect.top,
                    right: rect.right,
                    height: rect.height,
                  });
                }}
              />
            );
          })}
          {loading && (
            <div className="flex gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${
                  clientMode ? "bg-slate-700" : "bg-teal-600"
                }`}
              >
                {clientMode ? "M" : "E"}
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
                <span className="inline-flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" />
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

        {showScrollDown && messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              stickToBottomRef.current = true;
              setShowScrollDown(false);
              scrollToBottom("smooth");
            }}
            className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-md hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            ↓ 回到底部
          </button>
        )}
      </div>

      <div className="border-t border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto mb-2 flex max-w-2xl flex-wrap items-center justify-between gap-2">
          {ttsSupported && (
            <button
              type="button"
              onClick={toggleAutoSpeak}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                autoSpeak
                  ? "bg-teal-600 text-white"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {autoSpeak ? "🔊 自动朗读：开" : "🔊 自动朗读：关"}
            </button>
          )}
          {sttSupported ? (
            <button
              type="button"
              onClick={handleMicClick}
              disabled={loading || transcribing}
              className={`rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
                listening
                  ? "bg-rose-600 text-white animate-pulse"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {listening
                ? transcribing
                  ? "⏳ 识别中…"
                  : "🎤 结束录音"
                : "🎤 语音输入"}
            </button>
          ) : (
            <span className="text-xs text-zinc-400">
              语音输入需 Chrome / Edge
            </span>
          )}
        </div>

        {listening && (
          <div className="mx-auto mb-2 flex max-w-2xl items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-100">
            <span>
              {transcribing
                ? "⏳ 正在识别你的英语…"
                : `🎤 录音中 · 请用英语说话${
                    listenSecondsLeft !== null
                      ? ` · 还剩 ${listenSecondsLeft} 秒`
                      : ""
                  }`}
            </span>
            {!transcribing && (
              <button
                type="button"
                onClick={stopListening}
                className="shrink-0 rounded-full bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700"
              >
                结束并识别
              </button>
            )}
          </div>
        )}

        {error && (
          <p className="mb-2 text-center text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <form
          className="mx-auto flex max-w-2xl gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={inputDisplayValue}
            readOnly={listening}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              transcribing
                ? "正在转写你的英语…"
                : listening
                  ? "录音中，说完点「结束并识别」"
                  : clientMode
                    ? "Reply to Marcus in English — MOQ, timeline, specs…"
                    : isScenarioMode(scenarioId)
                      ? `${activeScenario.userHint}…`
                      : "跟 Emma 贫嘴…用英语"
            }
            className={`flex-1 rounded-2xl border px-4 py-3 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 ${
              listening
                ? "border-rose-300 bg-rose-50/50 text-zinc-700 dark:border-rose-800 dark:bg-rose-950/20"
                : "border-zinc-300 bg-white text-zinc-800"
            }`}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-2xl bg-teal-600 px-5 py-3 font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            发送
          </button>
        </form>
      </div>
    </div>
  );
}
