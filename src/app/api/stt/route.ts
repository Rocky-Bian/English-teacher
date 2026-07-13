import { NextResponse } from "next/server";
import {
  LocalWhisperError,
  transcribeAudioBuffer,
} from "@/lib/localWhisper";
import { OpenAiSttError, transcribeWithOpenAI } from "@/lib/openaiStt";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json({ error: "没有收到音频" }, { status: 400 });
    }

    const buffer = Buffer.from(await audio.arrayBuffer());
    const mimeType = audio.type || "audio/webm";
    let text: string;
    if (process.env.OPENAI_API_KEY) {
      text = await transcribeWithOpenAI(buffer, mimeType);
    } else if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "线上语音输入暂未开启，请先使用文字输入" },
        { status: 501 }
      );
    } else {
      text = await transcribeAudioBuffer(buffer, mimeType);
    }

    return NextResponse.json({ text });
  } catch (error) {
    console.error("[stt]", error);
    if (error instanceof LocalWhisperError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    if (error instanceof OpenAiSttError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: "语音转写失败" }, { status: 500 });
  }
}
