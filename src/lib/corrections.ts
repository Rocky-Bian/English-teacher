import type { Correction } from "./types";

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function stripPunct(text: string): string {
  return text.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function correctionMatchesMessage(
  original: string,
  userMessage: string
): boolean {
  const normOriginal = normalize(original);
  const normMessage = normalize(userMessage);

  if (!normOriginal || !normMessage) return false;

  if (normMessage.includes(normOriginal)) return true;

  const plainOriginal = stripPunct(original);
  const plainMessage = stripPunct(userMessage);

  if (plainOriginal && plainMessage.includes(plainOriginal)) return true;

  // Allow matching when the correction cites a clause from a longer sentence
  const words = plainOriginal.split(" ").filter((w) => w.length > 2);
  if (words.length >= 2) {
    const matchedWords = words.filter((w) => plainMessage.includes(w));
    if (matchedWords.length >= Math.ceil(words.length * 0.6)) {
      return true;
    }
  }

  return false;
}

export function filterCorrectionsForMessage(
  userMessage: string,
  corrections: Correction[]
): Correction[] {
  return corrections.filter((c) =>
    correctionMatchesMessage(c.original, userMessage)
  );
}

export function hasEnglishContent(message: string): boolean {
  return /[a-zA-Z]{2,}/.test(message);
}
