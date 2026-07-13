import { chatCompletionJson } from "./deepseek";
import {
  createVocabularyEntry,
  findVocabularyByWord,
  getProfile,
} from "./db";
import type { VocabularyEntry, VocabularySource } from "./types";

interface VocabularyEnrichment {
  meaning_zh: string;
  example_en: string;
}

export async function enrichVocabularyWord(
  word: string,
  context?: string,
  meaningHint?: string
): Promise<{ meaningZh: string; exampleEn: string }> {
  const { level } = await getProfile();

  const result = await chatCompletionJson<VocabularyEnrichment>(
    `You help Chinese English learners build a vocabulary notebook.
Return JSON only: {"meaning_zh":" concise Chinese meaning","example_en":"one natural English example sentence"}
Rules:
- example_en must naturally use the target word or phrase (inflections OK)
- Match CEFR level ${level}
- Keep the example one sentence, clear and practical`,
    [
      {
        role: "user",
        content: [
          `Word/phrase: ${word}`,
          context ? `Chat context: ${context}` : null,
          meaningHint ? `Meaning hint: ${meaningHint}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    {
      temperature: 0.5,
      retryHint: "Fields: meaning_zh, example_en",
    }
  );

  return {
    meaningZh: result.meaning_zh?.trim() || meaningHint?.trim() || "",
    exampleEn: result.example_en?.trim() || "",
  };
}

export interface AddVocabularyInput {
  word: string;
  meaningZh?: string;
  exampleEn?: string;
  source?: VocabularySource;
  sourceMessageId?: string;
  context?: string;
}

export async function addVocabularyWord(
  input: AddVocabularyInput
): Promise<{ entry: VocabularyEntry; created: boolean }> {
  const word = input.word.trim();
  if (!word) {
    throw new Error("请输入单词或词组");
  }

  const existing = await findVocabularyByWord(word);
  if (existing) {
    return { entry: existing, created: false };
  }

  let meaningZh = input.meaningZh?.trim() ?? "";
  let exampleEn = input.exampleEn?.trim() ?? "";

  if (!exampleEn || !meaningZh) {
    const enriched = await enrichVocabularyWord(
      word,
      input.context,
      meaningZh || undefined
    );
    if (!meaningZh) meaningZh = enriched.meaningZh;
    if (!exampleEn) exampleEn = enriched.exampleEn;
  }

  if (!exampleEn) {
    throw new Error("无法为例句生成内容，请重试");
  }

  const entry = await createVocabularyEntry({
    word,
    meaningZh,
    exampleEn,
    source: input.source ?? "manual",
    sourceMessageId: input.sourceMessageId,
  });

  return { entry, created: true };
}
