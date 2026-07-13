import { NextResponse } from "next/server";
import { getVocabularyList } from "@/lib/db";
import { addVocabularyWord } from "@/lib/vocabulary";
import { DeepSeekError } from "@/lib/deepseek";
import type { VocabularySource } from "@/lib/types";

export async function GET() {
  try {
    const vocabulary = await getVocabularyList();
    return NextResponse.json({ vocabulary });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "加载生词本失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      word?: string;
      meaningZh?: string;
      exampleEn?: string;
      source?: VocabularySource;
      sourceMessageId?: string;
      context?: string;
    };

    const word = body.word?.trim();
    if (!word) {
      return NextResponse.json({ error: "请输入单词或词组" }, { status: 400 });
    }

    const result = await addVocabularyWord({
      word,
      meaningZh: body.meaningZh,
      exampleEn: body.exampleEn,
      source: body.source,
      sourceMessageId: body.sourceMessageId,
      context: body.context,
    });

    return NextResponse.json(result, {
      status: result.created ? 201 : 200,
    });
  } catch (error) {
    console.error(error);
    if (error instanceof DeepSeekError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "添加失败" },
      { status: 500 }
    );
  }
}
