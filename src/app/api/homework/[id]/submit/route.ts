import { NextResponse } from "next/server";
import { gradeHomework, DeepSeekError } from "@/lib/teacher";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      answers?: Record<string, string>;
    };

    if (!body.answers || typeof body.answers !== "object") {
      return NextResponse.json({ error: "请提交答案" }, { status: 400 });
    }

    const result = await gradeHomework(id, body.answers);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof DeepSeekError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "批改失败" },
      { status: 500 }
    );
  }
}
