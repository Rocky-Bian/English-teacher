import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { EdgeTTS } from "node-edge-tts";
import { prepareTextForSpeech } from "./speechText";
import { TTS_MAX_CHARS, TTS_PITCH, TTS_RATE, TTS_VOICE } from "./ttsConfig";

const CACHE_DIR =
  process.env.TTS_CACHE_DIR ??
  (process.env.NODE_ENV === "production"
    ? path.join(os.tmpdir(), "emma-tts-cache")
    : path.join(process.cwd(), "data", "tts_cache"));

function cacheKey(
  text: string,
  voice: string,
  rate: string,
  pitch: string
): string {
  return createHash("sha256")
    .update(`${voice}|${rate}|${pitch}|${text}`)
    .digest("hex")
    .slice(0, 20);
}

export class EdgeTtsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EdgeTtsError";
  }
}

export async function synthesizeSpeech(
  text: string,
  voice = TTS_VOICE,
  options?: { rate?: string; pitch?: string }
): Promise<Buffer> {
  const prepared = prepareTextForSpeech(text);
  if (!prepared) {
    throw new EdgeTtsError("没有可朗读的内容");
  }

  const rate = options?.rate ?? TTS_RATE;
  const pitch = options?.pitch ?? TTS_PITCH;

  let spoken = prepared;
  if (spoken.length > TTS_MAX_CHARS) {
    spoken = `${spoken.slice(0, TTS_MAX_CHARS).replace(/\s+\S*$/, "").trim()}...`;
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = path.join(
    CACHE_DIR,
    `${cacheKey(spoken, voice, rate, pitch)}.mp3`
  );

  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath);
  }

  const tmpPath = path.join(
    os.tmpdir(),
    `emma-tts-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`
  );

  try {
    const tts = new EdgeTTS({
      voice,
      lang: "en-US",
      rate,
      pitch,
      outputFormat: "audio-24khz-96kbitrate-mono-mp3",
      timeout: 15000,
    });

    await tts.ttsPromise(spoken, tmpPath);
    const audio = fs.readFileSync(tmpPath);
    fs.writeFileSync(cachePath, audio);
    return audio;
  } catch (error) {
    throw new EdgeTtsError(
      error instanceof Error ? error.message : "Edge TTS 合成失败"
    );
  } finally {
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
  }
}
