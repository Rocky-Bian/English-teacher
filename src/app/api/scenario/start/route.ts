import { NextResponse } from "next/server";
import { startScenario } from "@/lib/teacher";
import type { ScenarioId } from "@/lib/types";
import { SCENARIOS } from "@/lib/scenarios";

const VALID_IDS = new Set(SCENARIOS.map((s) => s.id));

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { scenarioId?: string };
    const scenarioId = body.scenarioId as ScenarioId;

    if (!scenarioId || !VALID_IDS.has(scenarioId)) {
      return NextResponse.json({ error: "无效的情景" }, { status: 400 });
    }

    const result = await startScenario(scenarioId);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "启动失败" },
      { status: 500 }
    );
  }
}
