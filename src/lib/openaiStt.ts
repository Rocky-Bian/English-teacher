export class OpenAiSttError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAiSttError";
  }
}

function guessFilename(mimeType: string): string {
  if (mimeType.includes("webm")) return "speech.webm";
  if (mimeType.includes("mp4")) return "speech.mp4";
  if (mimeType.includes("ogg")) return "speech.ogg";
  if (mimeType.includes("wav")) return "speech.wav";
  return "speech.audio";
}

export async function transcribeWithOpenAI(
  audioBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new OpenAiSttError("未配置 OPENAI_API_KEY");
  }

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(audioBuffer)], { type: mimeType || "audio/webm" }),
    guessFilename(mimeType)
  );
  formData.append(
    "model",
    process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1"
  );

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  const data = (await response.json().catch(() => ({}))) as {
    text?: string;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new OpenAiSttError(
      data.error?.message ?? `OpenAI 转写失败 (${response.status})`
    );
  }

  const text = data.text?.trim();
  if (!text) {
    throw new OpenAiSttError("没识别到内容");
  }

  return text;
}
