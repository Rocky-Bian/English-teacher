"use client";

import { SCENARIOS } from "@/lib/scenarios";
import type { ScenarioId } from "@/lib/types";

interface ScenarioBarProps {
  activeId: ScenarioId;
  loading: boolean;
  onSelect: (id: ScenarioId) => void;
}

export function ScenarioBar({ activeId, loading, onSelect }: ScenarioBarProps) {
  const active = SCENARIOS.find((s) => s.id === activeId) ?? SCENARIOS[0];

  return (
    <div className="border-b border-zinc-200/80 bg-white/90 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="mx-auto max-w-2xl">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            情景模式
          </p>
          {active.id !== "free" && (
            <span className="max-w-[58vw] truncate rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              {active.emoji} {active.title}
            </span>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {SCENARIOS.map((scenario) => {
            const selected = scenario.id === activeId;
            return (
              <button
                key={scenario.id}
                type="button"
                disabled={loading}
                onClick={() => onSelect(scenario.id)}
                className={`shrink-0 rounded-2xl border px-3 py-2 text-left transition disabled:opacity-50 ${
                  selected
                    ? "border-teal-500 bg-teal-50 dark:border-teal-600 dark:bg-teal-950/40"
                    : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-750"
                }`}
              >
                <span className="text-base">{scenario.emoji}</span>
                <span className="ml-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-100">
                  {scenario.title}
                </span>
              </button>
            );
          })}
        </div>
        {active.id !== "free" && (
          <p className="mt-2 text-xs text-zinc-500">
            {active.description} · {active.userHint}
          </p>
        )}
      </div>
    </div>
  );
}
