import { NextResponse } from "next/server";
import { EdgeTtsError, synthesizeSpeech } from "@/lib/edgeTts";
import { TTS_VOICE } from "@/lib/ttsConfig";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      text?: string;
      voice?: string;
      rate?: string;
      pitch?: string;
    };
    const text = body.text?.trim();

    if (!text) {
      return NextResponse.json({ error: "文本不能为空" }, { status: 400 });
    }

    const audio = await synthesizeSpeech(text, body.voice || TTS_VOICE, {
      rate: body.rate,
      pitch: body.pitch,
    });
    return new NextResponse(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    console.error("[tts]", error);
    if (error instanceof EdgeTtsError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: "语音合成失败" }, { status: 500 });
  }
}
