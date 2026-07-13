"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage, VocabularySource } from "@/lib/types";
import { CorrectionCard } from "./CorrectionCard";
import { AddToVocabularyButton } from "./AddToVocabularyButton";

interface MessageBubbleProps {
  message: ChatMessage;
  speaking?: boolean;
  onSpeak?: (text: string, id: string) => void;
  correctionContext?: string;
  onTextSelect?: (text: string, messageId: string, context: string) => void;
  clientMode?: boolean;
}

export function MessageBubble({
  message,
  speaking,
  onSpeak,
  correctionContext,
  onTextSelect,
  clientMode = false,
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  function handleMouseUp() {
    if (!onTextSelect) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || text.length > 80) return;
    if (!/[a-zA-Z]/.test(text)) return;
    onTextSelect(text, message.id, message.content);
  }

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {!isUser && (
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${
            clientMode ? "bg-slate-700" : "bg-teal-600"
          }`}
        >
          {clientMode ? "M" : "E"}
        </div>
      )}
      <div className={`max-w-[85%] ${isUser ? "text-right" : ""}`}>
        <div
          className={`inline-block rounded-2xl px-4 py-2.5 text-left ${
            isUser
              ? "bg-teal-600 text-white"
              : "bg-white text-zinc-800 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
          }`}
          onMouseUp={handleMouseUp}
          onTouchEnd={handleMouseUp}
        >
          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        </div>
        {!isUser && (
          <div className="mt-1 flex items-center gap-2">
            {onSpeak && (
              <button
                type="button"
                onClick={() => onSpeak(message.content, message.id)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition ${
                  speaking
                    ? "bg-teal-600 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                }`}
              >
                {speaking ? "🔊 朗读中…" : "🔊 朗读"}
              </button>
            )}
          </div>
        )}
        {!isUser && message.corrections && (
          <CorrectionCard
            corrections={message.corrections}
            contextMessage={correctionContext}
            sourceMessageId={message.id}
          />
        )}
      </div>
      {isUser && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-300 text-sm font-semibold text-zinc-700 dark:bg-zinc-600 dark:text-zinc-100">
          我
        </div>
      )}
    </div>
  );
}

export function SelectionVocabularyPopover({
  selection,
  onDismiss,
  onAdded,
  source = "chat",
}: {
  selection: {
    text: string;
    messageId: string;
    context: string;
    left: number;
    top: number;
    right: number;
    height: number;
  } | null;
  onDismiss: () => void;
  onAdded?: () => void;
  source?: VocabularySource;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selection) return;

    const isInsidePopover = (target: EventTarget | null) =>
      target instanceof Node && popoverRef.current?.contains(target);

    const dismissUnlessInsidePopover = (e: Event) => {
      if (isInsidePopover(e.target)) return;
      onDismiss();
    };

    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        onDismiss();
        return;
      }
      const text = sel.toString().trim();
      if (!text || text !== selection.text) {
        onDismiss();
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) onDismiss();
    };

    const onWindowBlur = () => {
      onDismiss();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };

    // 豆包等扩展在 Shadow DOM 内点击时，页面收不到 mousedown；用失焦检测兜底
    const focusCheck = window.setInterval(() => {
      if (!document.hasFocus()) {
        onDismiss();
      }
    }, 120);

    document.addEventListener("mousedown", dismissUnlessInsidePopover, true);
    document.addEventListener("mouseup", dismissUnlessInsidePopover, true);
    document.addEventListener("pointerdown", dismissUnlessInsidePopover, true);
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("scroll", onDismiss, true);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearInterval(focusCheck);
      document.removeEventListener("mousedown", dismissUnlessInsidePopover, true);
      document.removeEventListener("mouseup", dismissUnlessInsidePopover, true);
      document.removeEventListener("pointerdown", dismissUnlessInsidePopover, true);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("scroll", onDismiss, true);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selection, onDismiss]);

  if (!selection) return null;

  const gap = 10;
  const viewportWidth = window.innerWidth;
  const narrowScreen = viewportWidth < 640;
  const alignY = Math.max(72, selection.top - 18);
  const placeOnLeft = selection.left > 200;
  const centeredLeft = Math.min(
    Math.max(viewportWidth / 2, 120),
    viewportWidth - 120
  );
  const style = narrowScreen
    ? {
        left: centeredLeft,
        top: Math.max(88, selection.top + selection.height + 12),
        transform: "translate(-50%, 0)",
      }
    : placeOnLeft
      ? {
          left: selection.left - gap,
          top: alignY,
          transform: "translate(-100%, -50%)",
        }
      : {
          left: selection.right + gap,
          top: alignY,
          transform: "translateY(-50%)",
        };

  return (
    <div
      ref={popoverRef}
      className="fixed z-[10000] flex h-11 max-w-[calc(100vw-24px)] items-center gap-2.5 rounded-xl border border-zinc-200/80 bg-white px-3 text-sm font-medium leading-none text-zinc-900 shadow-[0_2px_12px_rgba(0,0,0,0.1)] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
      style={style}
    >
      <span className="max-w-[130px] truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
        「{selection.text}」
      </span>
      <AddToVocabularyButton
        word={selection.text}
        source={source}
        sourceMessageId={selection.messageId}
        context={selection.context}
        label="加入生词本"
        className="shrink-0 rounded-md bg-teal-100 px-2 py-1 text-sm font-medium text-zinc-900 hover:bg-teal-200 disabled:opacity-50 dark:bg-teal-900/60 dark:text-zinc-100 dark:hover:bg-teal-900"
        onSuccess={() => {
          window.getSelection()?.removeAllRanges();
          onAdded?.();
          onDismiss();
        }}
      />
      <button
        type="button"
        onClick={onDismiss}
        className="flex h-5 w-5 shrink-0 items-center justify-center text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
      >
        ✕
      </button>
    </div>
  );
}
