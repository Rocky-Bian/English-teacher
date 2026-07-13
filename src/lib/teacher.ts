import {
  chatCompletion,
  chatCompletionJson,
  extractPlainTextFallback,
  parseJsonResponse,
  DeepSeekError,
} from "./deepseek";
import {
  buildTeacherSystemPrompt,
  buildChatMessages,
  buildHomeworkGradePrompt,
  buildHomeworkGeneratePrompt,
} from "./prompts";
import { buildClientSystemPrompt } from "./clientPrompts";
import {
  filterCorrectionsForMessage,
  hasEnglishContent,
} from "./corrections";
import {
  getMessages,
  saveMessage,
  getProfile,
  addRecentErrors,
  createHomework,
  getHomeworkById,
  updateHomeworkGrade,
  updateProfile,
  getVocabularyList,
  getErrorsForTeacher,
  getLearningMemory,
  getWorkMemory,
} from "./db";
import type {
  TeacherResponse,
  Homework,
  HomeworkGrade,
  CEFRLevel,
  ScenarioId,
  ChatMessage,
} from "./types";
import {
  getScenario,
  resolveOpeningLine,
  isScenarioMode,
  isClientScenario,
} from "./scenarios";

export { DeepSeekError };

function normalizeTeacherResponse(
  data: Record<string, unknown>
): TeacherResponse {
  const corrections = Array.isArray(data.corrections)
    ? (data.corrections as TeacherResponse["corrections"])
    : [];

  const teacherReply =
    typeof data.teacher_reply === "string"
      ? data.teacher_reply
      : typeof data.teacherReply === "string"
        ? data.teacherReply
        : "";

  const homework =
    data.homework &&
    typeof data.homework === "object" &&
    data.homework !== null &&
    !Array.isArray(data.homework)
      ? (data.homework as TeacherResponse["homework"])
      : undefined;

  return {
    corrections,
    teacher_reply: teacherReply,
    homework: homework ?? undefined,
  };
}

async function requestTeacherResponse(
  systemPrompt: string,
  apiMessages: Array<{ role: "user" | "assistant"; content: string }>,
  temperature = 0.88
): Promise<TeacherResponse> {
  const raw = await chatCompletion(systemPrompt, apiMessages, {
    jsonMode: true,
    temperature,
  });

  try {
    return normalizeTeacherResponse(parseJsonResponse<Record<string, unknown>>(raw));
  } catch {
    console.warn("[teacher] JSON parse failed, retrying repair");
  }

  try {
    const repaired = await chatCompletion(
      `你是 JSON 修复工具。把内容修复成合法 JSON，只输出 JSON，不要 markdown。
必须包含 corrections (数组)、teacher_reply (字符串)、homework (对象或 null)。`,
      [{ role: "user", content: `修复以下 JSON：\n${raw}` }],
      { jsonMode: true, temperature: 0 }
    );
    return normalizeTeacherResponse(
      parseJsonResponse<Record<string, unknown>>(repaired)
    );
  } catch {
    return normalizeTeacherResponse({
      corrections: [],
      teacher_reply: extractPlainTextFallback(raw),
      homework: null,
    });
  }
}

async function handleClientChat(
  userMessage: string,
  scenarioId: ScenarioId
) {
  const profile = await getProfile();
  const history = await getMessages(30, scenarioId);
  const systemPrompt = buildClientSystemPrompt(
    profile.level,
    profile.name,
    userMessage,
    await getWorkMemory()
  );
  const apiMessages = buildChatMessages(history, userMessage);

  await saveMessage("user", userMessage, undefined, scenarioId);

  const parsed = await requestTeacherResponse(systemPrompt, apiMessages, 0.72);

  let corrections = parsed.corrections ?? [];
  corrections = filterCorrectionsForMessage(userMessage, corrections);

  if (!hasEnglishContent(userMessage)) {
    corrections = [];
  }

  const reply =
    parsed.teacher_reply?.trim() ||
    "Thanks for the note — can you walk me through your typical prototype timeline?";

  if (corrections.length > 0) {
    await addRecentErrors(
      corrections.map((c) => `${c.type}: ${c.explanation_zh}`)
    );
  }

  const assistantMessage = await saveMessage(
    "assistant",
    reply,
    corrections,
    scenarioId
  );

  return {
    userMessage,
    assistantMessage,
    homework: undefined,
    scenarioId,
  };
}

export async function handleChat(
  userMessage: string,
  scenarioId?: ScenarioId
) {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    throw new Error("消息不能为空");
  }

  const profile = await getProfile();
  const activeScenario = scenarioId ?? profile.scenarioId;

  if (isClientScenario(activeScenario)) {
    return handleClientChat(trimmed, activeScenario);
  }

  const history = await getMessages(30, activeScenario);
  const vocabularyWords = await getVocabularyList();
  const systemPrompt = buildTeacherSystemPrompt(
    profile.level,
    profile.name,
    await getErrorsForTeacher(),
    trimmed,
    activeScenario,
    vocabularyWords,
    await getLearningMemory()
  );
  const apiMessages = buildChatMessages(history, trimmed);

  await saveMessage("user", trimmed, undefined, activeScenario);

  const parsed = await requestTeacherResponse(systemPrompt, apiMessages);

  let corrections = parsed.corrections ?? [];
  corrections = filterCorrectionsForMessage(trimmed, corrections);

  if (!hasEnglishContent(trimmed)) {
    corrections = [];
  }
  const teacherReply =
    parsed.teacher_reply?.trim() ||
    "I'm here to help you practice English!";

  if (corrections.length > 0) {
    await addRecentErrors(
      corrections.map((c) => `${c.type}: ${c.explanation_zh}`)
    );
  }

  const assistantMessage = await saveMessage(
    "assistant",
    teacherReply,
    corrections,
    activeScenario
  );

  let homework: Homework | undefined;
  if (parsed.homework?.questions?.length) {
    homework = await createHomework(
      parsed.homework.title,
      parsed.homework.topic,
      parsed.homework.questions
    );
  }

  return {
    userMessage: trimmed,
    assistantMessage,
    homework,
    scenarioId: activeScenario,
  };
}

export async function startScenario(scenarioId: ScenarioId) {
  const profile = await getProfile();
  await updateProfile({ scenarioId });

  const scenario = getScenario(scenarioId);
  const existing = await getMessages(50, scenarioId);

  if (!isScenarioMode(scenarioId)) {
    return {
      profile: await getProfile(),
      openingMessage: null as ChatMessage | null,
      messages: existing,
    };
  }

  if (existing.length > 0) {
    return {
      profile: await getProfile(),
      openingMessage: null as ChatMessage | null,
      messages: existing,
    };
  }

  const opening = resolveOpeningLine(scenario, profile.name);
  if (!opening) {
    return {
      profile: await getProfile(),
      openingMessage: null as ChatMessage | null,
      messages: [] as ChatMessage[],
    };
  }

  const openingMessage = await saveMessage(
    "assistant",
    opening,
    undefined,
    scenarioId
  );
  return {
    profile: await getProfile(),
    openingMessage,
    messages: [openingMessage],
  };
}

export async function generateHomework(topic: string) {
  const profile = await getProfile();
  const systemPrompt = buildHomeworkGeneratePrompt(
    profile.level,
    topic,
    await getErrorsForTeacher()
  );

  const parsed = await chatCompletionJson<{
    title: string;
    topic: string;
    questions: Array<{
      prompt: string;
      type: "fill" | "correct" | "translate" | "writing";
      hint?: string;
      answer: string;
    }>;
  }>(
    systemPrompt,
    [{ role: "user", content: `请生成关于「${topic}」的作业` }],
    {
      temperature: 0.8,
      retryHint: "必须包含 title、topic、questions 数组。",
    }
  );

  return createHomework(
    parsed.title,
    parsed.topic || topic,
    parsed.questions
  );
}

export async function gradeHomework(
  homeworkId: string,
  answers: Record<string, string>
): Promise<{ homework: Homework; grade: HomeworkGrade }> {
  const homework = await getHomeworkById(homeworkId);
  if (!homework) {
    throw new Error("作业不存在");
  }

  if (homework.status === "graded" && homework.grade) {
    return { homework, grade: homework.grade };
  }

  const systemPrompt = buildHomeworkGradePrompt(
    homework.title,
    homework.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      answer: q.answer,
      type: q.type,
    })),
    answers
  );

  const grade = await chatCompletionJson<HomeworkGrade>(
    systemPrompt,
    [{ role: "user", content: "请批改这份作业" }],
    {
      temperature: 0.3,
      retryHint:
        "必须包含 score、total、feedback_zh、results 数组，results 里每题含 questionId、correct、userAnswer、correctAnswer。",
    }
  );
  await updateHomeworkGrade(homeworkId, grade);

  const updated = await getHomeworkById(homeworkId);
  if (!updated?.grade) {
    throw new Error("批改失败");
  }

  return { homework: updated, grade: updated.grade };
}

export async function updateUserLevel(level: CEFRLevel) {
  return updateProfile({ level });
}
