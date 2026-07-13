import { NextResponse } from "next/server";
import { getHomeworkById } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const homework = await getHomeworkById(id);

    if (!homework) {
      return NextResponse.json({ error: "作业不存在" }, { status: 404 });
    }

    return NextResponse.json({ homework });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "加载作业失败" }, { status: 500 });
  }
}
