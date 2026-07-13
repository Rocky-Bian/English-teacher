import { NextResponse } from "next/server";
import { deleteVocabularyEntry, getVocabularyById } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const entry = await getVocabularyById(id);
    if (!entry) {
      return NextResponse.json({ error: "生词不存在" }, { status: 404 });
    }
    return NextResponse.json({ entry });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "加载失败" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = await deleteVocabularyEntry(id);
    if (!deleted) {
      return NextResponse.json({ error: "生词不存在" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
