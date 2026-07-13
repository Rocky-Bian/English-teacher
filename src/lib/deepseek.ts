const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

export class DeepSeekError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeepSeekError";
  }
}

export async function chatCompletion(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  options?: { jsonMode?: boolean; temperature?: number }
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new DeepSeekError(
      "未配置 DEEPSEEK_API_KEY，请在 .env.local 中设置你的 DeepSeek API Key"
    );
  }

  const body: Record<string, unknown> = {
    model: DEEPSEEK_MODEL,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    temperature: options?.temperature ?? 0.7,
  };

  if (options?.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new DeepSeekError(`DeepSeek API 错误 (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new DeepSeekError("DeepSeek 返回了空内容");
  }

  return content;
}

function stripCodeFence(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : text.trim();
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\" && inString) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

function sanitizeJson(json: string): string {
  return json
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2018|\u2019/g, "'");
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v?.trim())))];
}

export function parseJsonResponse<T>(raw: string): T {
  const candidates = uniqueStrings([
    raw,
    stripCodeFence(raw),
    extractJsonObject(raw),
    extractJsonObject(stripCodeFence(raw)),
  ]);

  for (const candidate of candidates) {
    for (const attempt of [candidate, sanitizeJson(candidate)]) {
      try {
        return JSON.parse(attempt) as T;
      } catch {
        continue;
      }
    }
  }

  throw new DeepSeekError("无法解析 AI 返回的 JSON");
}

export async function chatCompletionJson<T>(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  options?: { temperature?: number; retryHint?: string }
): Promise<T> {
  const raw = await chatCompletion(systemPrompt, messages, {
    jsonMode: true,
    temperature: options?.temperature ?? 0.7,
  });

  try {
    return parseJsonResponse<T>(raw);
  } catch (firstError) {
    console.warn("[deepseek] JSON parse failed, retrying repair:", raw.slice(0, 300));

    try {
      const repaired = await chatCompletion(
        `你是 JSON 修复工具。把用户给你的内容修复成合法 JSON，只输出 JSON，不要任何解释。
必须保留原有字段含义。${options?.retryHint ?? ""}`,
        [
          {
            role: "user",
            content: `以下内容不是合法 JSON，请修复：\n${raw}`,
          },
        ],
        { jsonMode: true, temperature: 0 }
      );
      return parseJsonResponse<T>(repaired);
    } catch {
      if (firstError instanceof DeepSeekError) throw firstError;
      throw new DeepSeekError("无法解析 AI 返回的 JSON");
    }
  }
}

export function extractPlainTextFallback(raw: string): string {
  const stripped = stripCodeFence(raw)
    .replace(/^[\s\S]*?"teacher_reply"\s*:\s*"/m, "")
    .replace(/"\s*,\s*"homework"[\s\S]*$/m, "")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .trim();

  if (stripped && !stripped.startsWith("{")) {
    return stripped;
  }

  return "Sorry, I had a little trouble responding. Could you say that again?";
}
