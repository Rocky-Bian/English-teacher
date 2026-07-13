/** Prepare chat text for browser TTS — strip emojis, normalize casual English. */
export function prepareTextForSpeech(text: string): string {
  let result = text
    .replace(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{1F1E0}-\u{1F1FF}\u{E0020}-\u{E007F}]/gu,
      ""
    )
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")
    .replace(/[*~`_#]/g, "")
    .replace(/\.{3,}/g, ", ")
    .replace(/…/g, ", ")
    .replace(/\s*[-–—]\s*/g, ", ")
    .replace(/\blol\b/gi, "haha")
    .replace(/\blmao\b/gi, "haha")
    .replace(/\bomg\b/gi, "oh my god")
    .replace(/\bidk\b/gi, "I don't know")
    .replace(/\btbh\b/gi, "to be honest")
    .replace(/\bngl\b/gi, "not gonna lie")
    .replace(/\bbtw\b/gi, "by the way")
    .replace(/\s+/g, " ")
    .trim();

  // Drop trailing punctuation-only fragments left after emoji removal
  result = result.replace(/^[,;:\s]+|[,;:\s]+$/g, "").trim();
  return result;
}
