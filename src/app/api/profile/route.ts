import { NextResponse } from "next/server";
import {
  getProfile,
  updateProfile,
  archiveVisibleMessages,
  hideRecentErrorsFromUI,
} from "@/lib/db";
import type { CEFRLevel } from "@/lib/types";

import type { ScenarioId } from "@/lib/types";
import { SCENARIOS } from "@/lib/scenarios";

const LEVELS: CEFRLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const SCENARIO_IDS = new Set<string>(SCENARIOS.map((s) => s.id));

export async function GET() {
  try {
    const profile = await getProfile();
    return NextResponse.json({ profile });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "加载资料失败" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      level?: string;
      name?: string;
      clearChat?: boolean;
      clearErrors?: boolean;
      autoSpeak?: boolean;
      scenarioId?: string;
    };

    const updates: {
      level?: CEFRLevel;
      name?: string;
      autoSpeak?: boolean;
      scenarioId?: ScenarioId;
    } = {};

    if (body.level && LEVELS.includes(body.level as CEFRLevel)) {
      updates.level = body.level as CEFRLevel;
    }

    if (body.name?.trim()) {
      updates.name = body.name.trim();
    }

    if (typeof body.autoSpeak === "boolean") {
      updates.autoSpeak = body.autoSpeak;
    }

    if (body.scenarioId && SCENARIO_IDS.has(body.scenarioId)) {
      updates.scenarioId = body.scenarioId as ScenarioId;
    }

    if (body.clearChat) {
      await archiveVisibleMessages();
    }

    if (body.clearErrors) {
      await hideRecentErrorsFromUI();
    }

    const profile = await updateProfile(updates);
    return NextResponse.json({ profile });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}
