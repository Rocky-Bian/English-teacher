"use client";

import { useEffect, useState } from "react";
import type { Homework, HomeworkGrade } from "@/lib/types";

interface HomeworkPanelProps {
  refreshKey: number;
}

export function HomeworkPanel({ refreshKey }: HomeworkPanelProps) {
  const [homeworkList, setHomeworkList] = useState<Homework[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Homework | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadList() {
    const res = await fetch("/api/homework");
    const data = await res.json();
    if (data.homework) setHomeworkList(data.homework);
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadList().catch(() => setError("加载作业失败"));
    });
  }, [refreshKey]);

  useEffect(() => {
    if (!selectedId) {
      queueMicrotask(() => setSelected(null));
      return;
    }

    fetch(`/api/homework/${selectedId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.homework) {
          setSelected(data.homework);
          if (data.homework.status !== "graded") {
            const initial: Record<string, string> = {};
            for (const q of data.homework.questions) {
              initial[q.id] = "";
            }
            setAnswers(initial);
          }
        }
      })
      .catch(() => setError("加载作业详情失败"));
  }, [selectedId]);

  async function generateHomework() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/homework", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim() || "综合练习" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "生成失败");

      await loadList();
      setSelectedId(data.homework.id);
      setTopic("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  }

  async function submitHomework() {
    if (!selectedId || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/homework/${selectedId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "提交失败");

      setSelected(data.homework);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  const statusLabel = (status: Homework["status"]) => {
    switch (status) {
      case "pending":
        return "待完成";
      case "submitted":
        return "已提交";
      case "graded":
        return "已批改";
    }
  };

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <aside className="border-b border-zinc-200 p-4 lg:w-80 lg:border-b-0 lg:border-r dark:border-zinc-800">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
            作业中心
          </h2>
          <p className="text-sm text-zinc-500">Emma 布置的练习</p>
        </div>

        <div className="mb-4 flex gap-2">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="主题，如 past tense"
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <button
            type="button"
            onClick={generateHomework}
            disabled={generating}
            className="shrink-0 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {generating ? "生成中..." : "生成"}
          </button>
        </div>

        <div className="space-y-2">
          {homeworkList.length === 0 && (
            <p className="text-sm text-zinc-500">暂无作业，可以让 Emma 布置或点击生成</p>
          )}
          {homeworkList.map((hw) => (
            <button
              key={hw.id}
              type="button"
              onClick={() => setSelectedId(hw.id)}
              className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                selectedId === hw.id
                  ? "border-teal-500 bg-teal-50 dark:bg-teal-950/30"
                  : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-750"
              }`}
            >
              <p className="font-medium text-zinc-800 dark:text-zinc-100">
                {hw.title}
              </p>
              <p className="text-xs text-zinc-500">{hw.topic}</p>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-zinc-400">
                  {new Date(hw.createdAt).toLocaleDateString("zh-CN")}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 ${
                    hw.status === "graded"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                  }`}
                >
                  {statusLabel(hw.status)}
                  {hw.grade ? ` · ${hw.grade.score}/${hw.grade.total}` : ""}
                </span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto px-4 py-5 lg:p-6">
        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
            {error}
          </p>
        )}

        {!selected && (
          <div className="flex h-full items-center justify-center text-zinc-500">
            选择一份作业开始练习
          </div>
        )}

        {selected && (
          <div className="mx-auto max-w-2xl">
            <h3 className="text-xl font-semibold text-zinc-800 dark:text-zinc-100">
              {selected.title}
            </h3>
            <p className="text-sm text-zinc-500">知识点：{selected.topic}</p>

            <div className="mt-6 space-y-6">
              {selected.questions.map((q, index) => (
                <div
                  key={q.id}
                  className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <p className="mb-2 font-medium text-zinc-800 dark:text-zinc-100">
                    {index + 1}. {q.prompt}
                  </p>
                  {q.hint && (
                    <p className="mb-2 text-sm text-zinc-500">提示：{q.hint}</p>
                  )}

                  {selected.status === "graded" && selected.grade ? (
                    <GradedAnswer
                      questionId={q.id}
                      grade={selected.grade}
                    />
                  ) : (
                    <textarea
                      value={answers[q.id] ?? ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                      rows={q.type === "writing" ? 4 : 2}
                      placeholder="在这里作答..."
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                    />
                  )}
                </div>
              ))}
            </div>

            {selected.status !== "graded" && (
              <button
                type="button"
                onClick={submitHomework}
                disabled={submitting}
                className="mt-6 w-full rounded-xl bg-teal-600 py-3 font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {submitting ? "Emma 正在批改..." : "提交作业"}
              </button>
            )}

            {selected.grade && (
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
                <p className="text-lg font-semibold text-emerald-800 dark:text-emerald-300">
                  得分：{selected.grade.score} / {selected.grade.total}
                </p>
                <p className="mt-2 text-zinc-700 dark:text-zinc-300">
                  {selected.grade.feedback_zh}
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function GradedAnswer({
  questionId,
  grade,
}: {
  questionId: string;
  grade: HomeworkGrade;
}) {
  const result = grade.results.find((r) => r.questionId === questionId);
  if (!result) return null;

  return (
    <div
      className={`rounded-lg px-3 py-2 text-sm ${
        result.correct
          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300"
      }`}
    >
      <p>你的答案：{result.userAnswer || "(未作答)"}</p>
      {!result.correct && (
        <p className="mt-1">参考答案：{result.correctAnswer}</p>
      )}
      {result.explanation_zh && (
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          {result.explanation_zh}
        </p>
      )}
    </div>
  );
}
