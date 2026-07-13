"use client";

import { useEffect, useState } from "react";
import type { UserProfile } from "@/lib/types";
import { isClientScenario } from "@/lib/scenarios";
import { ChatPanel } from "./ChatPanel";
import { HomeworkPanel } from "./HomeworkPanel";
import { SettingsPanel } from "./SettingsPanel";
import { VocabularyPanel } from "./VocabularyPanel";

type Tab = "chat" | "homework" | "vocabulary" | "settings";

export function AppShell() {
  const [tab, setTab] = useState<Tab>("chat");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [homeworkRefresh, setHomeworkRefresh] = useState(0);

  useEffect(() => {
    fetch("/api/profile")
      .then((res) => res.json())
      .then((data) => {
        if (data.profile) setProfile(data.profile);
      })
      .catch(() =>
        setProfile({
          level: "B1",
          name: "Rocky",
          recentErrors: [],
          autoSpeak: false,
          scenarioId: "free",
        })
      );
  }, []);

  if (!profile) {
    return (
      <div className="flex h-screen items-center justify-center text-zinc-500">
        加载中...
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "chat", label: "对话", icon: "💬" },
    { id: "homework", label: "作业", icon: "📝" },
    { id: "vocabulary", label: "生词本", icon: "📚" },
    { id: "settings", label: "设置", icon: "⚙️" },
  ];

  const clientMode = isClientScenario(profile.scenarioId);

  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,_rgba(20,184,166,0.16),_transparent_34%),linear-gradient(180deg,#f8f7f2_0%,#f1efe8_100%)] dark:bg-zinc-950">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-screen-2xl flex-col lg:px-4 lg:py-4">
        <div className="flex min-h-[100dvh] flex-1 flex-col overflow-hidden lg:min-h-0 lg:rounded-[32px] lg:border lg:border-white/60 lg:bg-white/70 lg:shadow-[0_24px_80px_rgba(15,23,42,0.08)] lg:backdrop-blur dark:lg:border-zinc-800 dark:lg:bg-zinc-950/70">
          <header className="safe-top border-b border-zinc-200/80 bg-white/88 px-4 pb-4 pt-3 backdrop-blur lg:px-6 dark:border-zinc-800 dark:bg-zinc-900/88">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg text-white shadow-sm ${
                    clientMode ? "bg-slate-700" : "bg-teal-600"
                  }`}
                >
                  {clientMode ? "🤝" : "😏"}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-400">
                    Mobile English Coach
                  </p>
                  <h1 className="truncate text-base font-semibold text-zinc-900 sm:text-lg dark:text-zinc-100">
                    {clientMode ? "Marcus · 欧美客户" : "Emma · 毒舌搭子"}
                  </h1>
                  <p className="truncate text-xs text-zinc-500">
                    {profile.name}
                    {clientMode ? " · 硬件商务英语" : ` · 当前水平 ${profile.level}`}
                  </p>
                </div>
              </div>

              <nav className="hidden gap-1 rounded-2xl bg-zinc-100 p-1 lg:flex dark:bg-zinc-800">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                      tab === t.id
                        ? "bg-white text-teal-700 shadow-sm dark:bg-zinc-700 dark:text-teal-300"
                        : "text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                    }`}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </nav>
            </div>
          </header>

          <main className="safe-bottom-space min-h-0 flex-1 overflow-hidden lg:pb-0">
            {tab === "chat" && (
              <ChatPanel
                profile={profile}
                onProfileUpdate={setProfile}
                onHomeworkCreated={() => {
                  setHomeworkRefresh((k) => k + 1);
                  setTab("homework");
                }}
              />
            )}
            {tab === "homework" && (
              <HomeworkPanel refreshKey={homeworkRefresh} />
            )}
            {tab === "vocabulary" && (
              <VocabularyPanel refreshKey={0} />
            )}
            {tab === "settings" && (
              <SettingsPanel
                profile={profile}
                onUpdate={(p) => setProfile(p)}
              />
            )}
          </main>
        </div>
      </div>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200/80 bg-white/92 px-3 py-2 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-900/92">
        <div className="mx-auto grid w-full max-w-screen-md grid-cols-4 gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex min-h-14 flex-col items-center justify-center rounded-2xl px-2 py-2 text-[11px] font-medium transition ${
                tab === t.id
                  ? "bg-teal-600 text-white shadow-[0_12px_30px_rgba(13,148,136,0.26)]"
                  : "text-zinc-500"
              }`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              <span className="mt-1">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
