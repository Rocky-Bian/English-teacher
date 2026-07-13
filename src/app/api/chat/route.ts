import { NextResponse } from "next/server";
import { getMessages } from "@/lib/db";
import { handleChat, DeepSeekError } from "@/lib/teacher";
import type { ScenarioId } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const scenarioId = (searchParams.get("scenarioId") ||
      "free") as ScenarioId;
    const messages = await getMessages(50, scenarioId);
    return NextResponse.json({ messages, scenarioId });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "加载对话失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      message?: string;
      scenarioId?: ScenarioId;
    };
    const message = body.message?.trim();

    if (!message) {
      return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
    }

    const result = await handleChat(message, body.scenarioId);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof DeepSeekError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "发送失败" },
      { status: 500 }
    );
  }
}
