"use client";

import { useCallback, useEffect, useState } from "react";
import type { VocabularyEntry } from "@/lib/types";
import { SelectionVocabularyPopover } from "./MessageBubble";

interface VocabularyPanelProps {
  refreshKey: number;
}

function pickExampleSelection(
  exampleEn: string,
  entryId: string
): {
  text: string;
  messageId: string;
  context: string;
  left: number;
  top: number;
  right: number;
  height: number;
} | null {
  const sel = window.getSelection();
  const text = sel?.toString().trim();
  if (!text || text.length > 80 || !/[a-zA-Z]/.test(text)) return null;

  const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
  const rect = range?.getBoundingClientRect();
  if (!rect) return null;

  return {
    text,
    messageId: entryId,
    context: exampleEn,
    left: rect.left,
    top: rect.top,
    right: rect.right,
    height: rect.height,
  };
}

export function VocabularyPanel({ refreshKey }: VocabularyPanelProps) {
  const [entries, setEntries] = useState<VocabularyEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wordInput, setWordInput] = useState("");
  const [meaningInput, setMeaningInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [textSelection, setTextSelection] = useState<{
    text: string;
    messageId: string;
    context: string;
    left: number;
    top: number;
    right: number;
    height: number;
  } | null>(null);

  const selected = entries.find((e) => e.id === selectedId) ?? null;

  useEffect(() => {
    queueMicrotask(() => setTextSelection(null));
  }, [selectedId]);

  const loadList = useCallback(async () => {
    const res = await fetch("/api/vocabulary");
    const data = await res.json();
    if (data.vocabulary) {
      setEntries(data.vocabulary);
      if (
        selectedId &&
        !data.vocabulary.some((e: VocabularyEntry) => e.id === selectedId)
      ) {
        setSelectedId(null);
      }
    }
  }, [selectedId]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadList().catch(() => setError("加载生词本失败"));
    });
  }, [loadList, refreshKey]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function addWord() {
    const word = wordInput.trim();
    const meaningZh = meaningInput.trim();
    if (!word || adding) return;

    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word,
          ...(meaningZh ? { meaningZh } : {}),
          source: "manual",
        }),
      });
      const data = (await res.json()) as {
        entry?: VocabularyEntry;
        created?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "添加失败");

      await loadList();
      if (data.entry) setSelectedId(data.entry.id);
      setWordInput("");
      setMeaningInput("");
      showToast(data.created ? `已添加「${word}」` : `「${word}」已在生词本`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加失败");
    } finally {
      setAdding(false);
    }
  }

  async function removeWord(id: string, word?: string) {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/vocabulary/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "移出失败");

      if (selectedId === id) setSelectedId(null);
      await loadList();
      showToast(word ? `「${word}」已移出生词本` : "已移出生词本");
    } catch (err) {
      setError(err instanceof Error ? err.message : "移出失败");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <SelectionVocabularyPopover
        selection={textSelection}
        onDismiss={() => setTextSelection(null)}
        source="manual"
        onAdded={() => {
          const word = textSelection?.text;
          void loadList().then(() => {
            if (word) showToast(`已添加「${word}」`);
          });
        }}
      />
      <aside className="flex max-h-[48vh] min-h-0 shrink-0 flex-col border-b border-zinc-200 p-4 lg:h-full lg:max-h-none lg:w-80 lg:border-b-0 lg:border-r dark:border-zinc-800">
        <div className="mb-4 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
              生词本
            </h2>
            <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-800 dark:bg-teal-900 dark:text-teal-200">
              共 {entries.length} 个
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            手动输入，或在聊天、例句里划词添加
          </p>
        </div>

        <form
          className="mb-4 shrink-0 space-y-2 rounded-xl border border-teal-200 bg-teal-50/50 p-3 dark:border-teal-900 dark:bg-teal-950/20"
          onSubmit={(e) => {
            e.preventDefault();
            void addWord();
          }}
        >
          <p className="text-xs font-medium text-teal-800 dark:text-teal-300">
            手动添加生词
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={wordInput}
              onChange={(e) => setWordInput(e.target.value)}
              placeholder="英文单词或词组"
              className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
            <button
              type="submit"
              disabled={adding || !wordInput.trim()}
              className="shrink-0 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {adding ? "添加中…" : "添加"}
            </button>
          </div>
          <input
            type="text"
            value={meaningInput}
            onChange={(e) => setMeaningInput(e.target.value)}
            placeholder="中文释义（可选，不填则由 AI 生成）"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto lg:max-h-none">
          <div className="space-y-2 pb-2">
          {entries.length === 0 && (
            <p className="text-sm text-zinc-500">
              还没有生词。在上方输入英文添加，或在对话、例句里划词加入。
            </p>
          )}
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`flex items-stretch gap-1 rounded-xl border transition ${
                selectedId === entry.id
                  ? "border-teal-500 bg-teal-50 dark:bg-teal-950/30"
                  : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800"
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedId(entry.id)}
                className="min-w-0 flex-1 rounded-xl px-3 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-750"
              >
                <p className="font-medium text-zinc-800 dark:text-zinc-100">
                  {entry.word}
                </p>
              </button>
              <button
                type="button"
                title="移出生词本"
                onClick={(e) => {
                  e.stopPropagation();
                  removeWord(entry.id, entry.word);
                }}
                disabled={deleting}
                className="shrink-0 self-center rounded-lg px-2 py-3 text-xs text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950 dark:hover:text-red-400"
              >
                移出
              </button>
            </div>
          ))}
          </div>
        </div>
      </aside>

      <main className="relative min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:p-6">
        {toast && (
          <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
            {toast}
          </div>
        )}

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
            {error}
          </p>
        )}

        {!selected && (
          <div className="flex h-full items-center justify-center text-zinc-500">
            选择一条生词查看释义和例句
          </div>
        )}

        {selected && (
          <div className="mx-auto max-w-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-semibold text-zinc-800 dark:text-zinc-100">
                  {selected.word}
                </h3>
                {selected.meaningZh && (
                  <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-300">
                    {selected.meaningZh}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeWord(selected.id, selected.word)}
                disabled={deleting}
                className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {deleting ? "移出中…" : "移出生词本"}
              </button>
            </div>

            <div className="mt-8 rounded-xl border border-teal-200 bg-teal-50/60 p-5 dark:border-teal-900 dark:bg-teal-950/30">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-teal-700 dark:text-teal-400">
                例句
              </p>
              <p
                className="cursor-text select-text text-lg leading-relaxed text-zinc-800 dark:text-zinc-100"
                onMouseUp={() => {
                  const picked = pickExampleSelection(
                    selected.exampleEn,
                    selected.id
                  );
                  setTextSelection(picked);
                }}
                onTouchEnd={() => {
                  const picked = pickExampleSelection(
                    selected.exampleEn,
                    selected.id
                  );
                  setTextSelection(picked);
                }}
              >
                {selected.exampleEn}
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                选中例句里的单词或词组，可加入生词本
              </p>
            </div>

            <p className="mt-4 text-xs text-zinc-400">
              添加于 {new Date(selected.createdAt).toLocaleString("zh-CN")}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
