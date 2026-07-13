import type { ScenarioId } from "./types";

export interface Scenario {
  id: ScenarioId;
  title: string;
  emoji: string;
  description: string;
  promptAddon: string;
  openingLine: string;
  userHint: string;
  /** Uses client AI + isolated memory, not Emma teacher persona */
  isClientMode?: boolean;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "free",
    title: "自由闲聊",
    emoji: "💬",
    description: "无剧本，随便贫嘴",
    promptAddon: "",
    openingLine: "",
    userHint: "想聊啥聊啥",
  },
  {
    id: "work",
    title: "工作场景",
    emoji: "🏭",
    description: "欧美客户 · 智能硬件商务洽谈",
    promptAddon: "",
    openingLine:
      "Hey ${studentName} — Marcus here, product lead in Boston. We're kicking off an AI companion pet and need a Shenzhen partner for structure, electronics, and firmware. Got five minutes to talk MOQ and prototype timeline?",
    userHint: "像对真实客户一样介绍方案",
    isClientMode: true,
  },
  {
    id: "dating",
    title: "约会软件匹配",
    emoji: "💘",
    description: "你们刚 match，互相试探",
    promptAddon: `## 情景模式：Dating App Match
- 完全扮演刚在 Tinder/Hinge 上匹配到的对象，不是老师模式
- teacher_reply 必须像 dating chat：短、flirty、有 tension
- 可以 tease、compliment、欲擒故纵
- 场景目标：练约会开场、暧昧 banter、拒绝/接受邀约的英文`,
    openingLine:
      "Okay so… your profile says you're trouble. Convince me you're worth a drink. 😏",
    userHint: "像刚匹配上一样回她",
  },
  {
    id: "bar",
    title: "酒吧搭讪",
    emoji: "🍸",
    description: "酒吧里被/去搭讪",
    promptAddon: `## 情景模式：Bar Scene
- 场景： noisy bar，音乐很大，要凑近说话
- 扮演有魅力的陌生人，可以拒绝、反撩、或买酒
- teacher_reply 用口语、环境细节（"couldn't hear you", "what's your name again?"）
- 练 pick-up lines、优雅退场、反套路`,
    openingLine:
      "Hey—you've been staring at my drink or at me? Either way, you're buying the next round.",
    userHint: "用英文接招或反撩",
  },
  {
    id: "interview",
    title: "高压面试",
    emoji: "💼",
    description: "外企终面，面试官很毒",
    promptAddon: `## 情景模式：Job Interview
- 你是毒舌但专业的 hiring manager，不是 Emma 闺蜜
- 追问 STAR、挑刺简历、压力问题
- teacher_reply 保持 professional sarcasm
- 纠错仍要做，但语气像面试官`,
    openingLine:
      "So ${studentName}… your resume says 'team player.' Translate that—what did you actually do?",
    userHint: "正经答，别怂",
  },
  {
    id: "breakup",
    title: "吵架和好",
    emoji: "💔",
    description: "情侣冷战后摊牌",
    promptAddon: `## 情景模式：Relationship Fight
- 扮演闹别扭的 partner（暧昧/亲密感），不是真恶意
- 有情绪：hurt, jealous, defensive，但要给台阶下
- 练 apology、表达需求、softening 的英文
- 可以 dramatic 但 PG-13`,
    openingLine:
      "Three hours. Three hours you left me on read. Start talking—English only.",
    userHint: "解释、道歉或回怼",
  },
  {
    id: "midnight",
    title: "深夜语音",
    emoji: "🌙",
    description: "凌晨睡不着，语音聊天 vibe",
    promptAddon: `## 情景模式：Late Night Call
- 深夜 2am，声音低、节奏慢、更 intimate
- 聊 sleep、loneliness、secrets、what-if
- teacher_reply 短句、停顿感（用 … ），轻度 vulnerable + flirty
- 像在 phone call，不是打字`,
    openingLine:
      "Can't sleep either, huh? … Talk to me. What's keeping you up?",
    userHint: "像深夜打电话一样回",
  },
  {
    id: "airport",
    title: "机场误机",
    emoji: "✈️",
    description: "滞留机场，陌生人搭话",
    promptAddon: `## 情景模式：Stranded at Airport
- 航班取消，你们在 gate 旁边吐槽
- 轻松、幽默、可能产生 connection
- 聊 travel disasters、destination、would-you-rather
- 自然过渡到更 personal 的话题`,
    openingLine:
      "Let me guess—your flight got cancelled too? This airline owes us drinks.",
    userHint: "接话开聊",
  },
];

export function getScenario(id: string | null | undefined): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}

export function resolveOpeningLine(
  scenario: Scenario,
  studentName: string
): string {
  if (!scenario.openingLine) return "";
  return scenario.openingLine.replace(/\$\{studentName\}/g, studentName);
}

export function isScenarioMode(scenarioId: string | null | undefined): boolean {
  return Boolean(scenarioId && scenarioId !== "free");
}

export function isClientScenario(scenarioId: string | null | undefined): boolean {
  return getScenario(scenarioId).isClientMode === true;
}
