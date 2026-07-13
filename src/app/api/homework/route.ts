import { NextResponse } from "next/server";
import { getHomeworkList } from "@/lib/db";
import { generateHomework, DeepSeekError } from "@/lib/teacher";

export async function GET() {
  try {
    const homework = await getHomeworkList();
    return NextResponse.json({ homework });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "加载作业失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { topic?: string };
    const topic = body.topic?.trim() || "综合练习";

    const homework = await generateHomework(topic);
    return NextResponse.json({ homework });
  } catch (error) {
    console.error(error);
    if (error instanceof DeepSeekError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成作业失败" },
      { status: 500 }
    );
  }
}
