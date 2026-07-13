"use client";

import { useState } from "react";
import type { VocabularySource } from "@/lib/types";

interface AddToVocabularyButtonProps {
  word: string;
  meaningZh?: string;
  exampleEn?: string;
  source?: VocabularySource;
  sourceMessageId?: string;
  context?: string;
  className?: string;
  label?: string;
  compact?: boolean;
  onSuccess?: () => void;
}

export function AddToVocabularyButton({
  word,
  meaningZh,
  exampleEn,
  source = "chat",
  sourceMessageId,
  context,
  className = "",
  label = "加入生词本",
  compact = false,
  onSuccess,
}: AddToVocabularyButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "exists">(
    "idle"
  );

  async function handleAdd() {
    if (status === "loading" || !word.trim()) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: word.trim(),
          meaningZh,
          exampleEn,
          source,
          sourceMessageId,
          context,
        }),
      });
      const data = (await res.json()) as { created?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "添加失败");

      setStatus(data.created ? "done" : "exists");
      onSuccess?.();
      if (!onSuccess) {
        setTimeout(() => setStatus("idle"), 2000);
      }
    } catch {
      setStatus("idle");
    }
  }

  const text =
    status === "loading"
      ? "添加中…"
      : status === "done"
        ? "已加入 ✓"
        : status === "exists"
          ? "已在生词本"
          : label;

  return (
    <button
      type="button"
      onClick={handleAdd}
      disabled={status === "loading"}
      className={
        className ||
        (compact
          ? "rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800 hover:bg-teal-200 disabled:opacity-50 dark:bg-teal-900 dark:text-teal-200 dark:hover:bg-teal-800"
          : "rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50")
      }
    >
      {text}
    </button>
  );
}
