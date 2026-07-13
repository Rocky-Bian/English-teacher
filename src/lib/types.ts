export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export type CorrectionType =
  | "grammar"
  | "vocabulary"
  | "spelling"
  | "expression";

export interface Correction {
  original: string;
  corrected: string;
  type: CorrectionType;
  explanation_zh: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  corrections?: Correction[];
  createdAt: string;
}

export interface HomeworkQuestion {
  id: string;
  prompt: string;
  type: "fill" | "correct" | "translate" | "writing";
  hint?: string;
  answer: string;
}

export type HomeworkStatus = "pending" | "submitted" | "graded";

export interface Homework {
  id: string;
  title: string;
  topic: string;
  questions: HomeworkQuestion[];
  status: HomeworkStatus;
  createdAt: string;
  dueAt?: string;
  grade?: HomeworkGrade;
}

export interface HomeworkGrade {
  score: number;
  total: number;
  feedback_zh: string;
  results: Array<{
    questionId: string;
    correct: boolean;
    userAnswer: string;
    correctAnswer: string;
    explanation_zh?: string;
  }>;
}

export type ScenarioId =
  | "free"
  | "dating"
  | "bar"
  | "interview"
  | "breakup"
  | "midnight"
  | "airport"
  | "work";

export interface UserProfile {
  level: CEFRLevel;
  name: string;
  recentErrors: string[];
  autoSpeak: boolean;
  scenarioId: ScenarioId;
}

export interface TeacherResponse {
  corrections: Correction[];
  teacher_reply: string;
  homework?: {
    title: string;
    topic: string;
    questions: Omit<HomeworkQuestion, "id">[];
  };
}

export type VocabularySource = "manual" | "correction" | "chat";

export interface VocabularyEntry {
  id: string;
  word: string;
  meaningZh: string;
  exampleEn: string;
  source: VocabularySource;
  sourceMessageId?: string;
  createdAt: string;
}
