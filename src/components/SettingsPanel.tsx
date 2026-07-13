"use client";

import { useState } from "react";
import type { CEFRLevel, UserProfile } from "@/lib/types";

const LEVELS: CEFRLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

interface SettingsPanelProps {
  profile: UserProfile;
  onUpdate: (profile: UserProfile) => void;
}

export function SettingsPanel({ profile, onUpdate }: SettingsPanelProps) {
  const [name, setName] = useState(profile.name);
  const [level, setLevel] = useState(profile.level);
  const [autoSpeak, setAutoSpeak] = useState(profile.autoSpeak);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function saveSettings() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, level, autoSpeak }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存失败");
      onUpdate(data.profile);
      setMessage("已保存");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function clearChatHistory() {
    if (
      !window.confirm(
        "确定隐藏当前对话？网页里将不再显示，但 Emma 会在后台保留摘要用于了解你。"
      )
    ) {
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, level, autoSpeak, clearChat: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "清空失败");
      onUpdate(data.profile);
      sessionStorage.removeItem("emma-chat-scroll-top");
      setTimeout(() => window.location.reload(), 600);
      setMessage("对话已从界面隐藏，Emma 仍保留学习记忆");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "清空失败");
    } finally {
      setSaving(false);
    }
  }

  async function clearErrorHistory() {
    if (
      !window.confirm(
        "确定隐藏错误记录？设置页不再显示，但 Emma 仍会参考历史薄弱点。"
      )
    ) {
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearErrors: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "清空失败");
      onUpdate(data.profile);
      setMessage("错误记录已从界面隐藏，Emma 仍保留历史分析");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "清空失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-lg px-4 py-5 pb-10 lg:p-6">
        <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-100">
          学习设置
        </h2>
        <p className="mt-1 text-sm text-zinc-500">调整你的水平和昵称</p>

        <div className="mt-8 space-y-6">
          <label className="block">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              昵称
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              英语水平 (CEFR)
            </span>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as CEFRLevel)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800"
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-700">
            <div>
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                自动朗读 Emma 回复
              </span>
              <p className="text-xs text-zinc-500">
                使用 Edge TTS · JennyNeural，可在对话页随时开关
              </p>
            </div>
            <input
              type="checkbox"
              checked={autoSpeak}
              onChange={(e) => setAutoSpeak(e.target.checked)}
              className="h-5 w-5 rounded border-zinc-300 text-teal-600"
            />
          </label>

          <button
            type="button"
            onClick={saveSettings}
            disabled={saving}
            className="w-full rounded-xl bg-teal-600 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            保存设置
          </button>

          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  最近常见错误
                </span>
                <p className="text-xs text-zinc-500">
                  共 {profile.recentErrors.length} 条 · 隐藏后 Emma 仍会在后台参考
                </p>
              </div>
              {profile.recentErrors.length > 0 && (
                <button
                  type="button"
                  onClick={clearErrorHistory}
                  disabled={saving}
                  className="shrink-0 rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  隐藏记录
                </button>
              )}
            </div>

            {profile.recentErrors.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">暂无错误记录</p>
            ) : (
              <ul className="mt-3 max-h-52 space-y-1 overflow-y-auto pr-1 text-sm text-zinc-600 dark:text-zinc-400">
                {[...profile.recentErrors].reverse().map((err, i) => (
                  <li
                    key={`${i}-${err.slice(0, 24)}`}
                    className="rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-800"
                  >
                    {err}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              界面数据管理
            </span>
            <p className="mt-1 text-xs text-zinc-500">
              仅隐藏网页上的记录，本地后台仍保留，Emma 会继续据此了解你
            </p>
            <button
              type="button"
              onClick={clearChatHistory}
              disabled={saving}
              className="mt-3 w-full rounded-xl border border-red-300 bg-white py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950"
            >
              隐藏对话记录
            </button>
          </div>

          {message && (
            <p className="text-sm text-teal-600 dark:text-teal-400">{message}</p>
          )}
        </div>
      </div>
    </div>
  );
}
