"use client";

import type { Correction } from "@/lib/types";
import { AddToVocabularyButton } from "./AddToVocabularyButton";

const TYPE_LABELS: Record<Correction["type"], string> = {
  grammar: "语法",
  vocabulary: "词汇",
  spelling: "拼写",
  expression: "表达",
};

interface CorrectionCardProps {
  corrections: Correction[];
  contextMessage?: string;
  sourceMessageId?: string;
}

export function CorrectionCard({
  corrections,
  contextMessage,
  sourceMessageId,
}: CorrectionCardProps) {
  if (corrections.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {corrections.map((item, index) => (
        <div
          key={`${item.original}-${index}`}
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900/50 dark:bg-amber-950/40"
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-800 dark:text-amber-100">
              {TYPE_LABELS[item.type]}
            </span>
            <AddToVocabularyButton
              word={item.corrected}
              meaningZh={item.explanation_zh}
              source="correction"
              sourceMessageId={sourceMessageId}
              context={contextMessage}
              compact
              label="+ 生词本"
            />
          </div>
          <p className="text-zinc-600 line-through dark:text-zinc-400">
            {item.original}
          </p>
          <p className="font-medium text-emerald-700 dark:text-emerald-400">
            ✓ {item.corrected}
          </p>
          <p className="mt-1 text-zinc-700 dark:text-zinc-300">
            {item.explanation_zh}
          </p>
        </div>
      ))}
    </div>
  );
}
