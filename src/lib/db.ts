import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { neon } from "@neondatabase/serverless";
import type {
  ChatMessage,
  Correction,
  Homework,
  HomeworkGrade,
  HomeworkQuestion,
  HomeworkStatus,
  UserProfile,
  CEFRLevel,
  ScenarioId,
  VocabularyEntry,
  VocabularySource,
} from "./types";

const DB_PATH = path.join(process.cwd(), "data", "english-teacher.db");
const PROFILE_ID = "default";
const UPSTASH_STATE_KEY =
  process.env.APP_STATE_KEY ?? "english-teacher:app-state";
const NEON_STATE_KEY = process.env.APP_STATE_KEY ?? "default";
const MAX_LEARNING_MEMORY = 4000;
const MAX_WORK_MEMORY = 4000;
const MAX_ERROR_ARCHIVE = 100;

type PersistedMessage = ChatMessage & {
  archivedAt?: string;
  scenarioId: ScenarioId;
};

interface PersistedProfile {
  level: CEFRLevel;
  name: string;
  recentErrors: string[];
  errorArchive: string[];
  learningMemory: string;
  workMemory: string;
  autoSpeak: boolean;
  scenarioId: ScenarioId;
}

interface SupabaseProfileRow {
  id: string;
  level: string;
  name: string;
  recent_errors: string[] | null;
  error_archive: string[] | null;
  learning_memory: string | null;
  work_memory: string | null;
  auto_speak: boolean | null;
  scenario_id: string | null;
}

interface SupabaseMessageRow {
  id: string;
  role: string;
  content: string;
  corrections: Correction[] | null;
  scenario_id: string | null;
  archived_at: string | null;
  created_at: string;
}

interface SupabaseHomeworkRow {
  id: string;
  title: string;
  topic: string;
  questions: HomeworkQuestion[];
  status: string;
  grade: HomeworkGrade | null;
  created_at: string;
  due_at: string | null;
}

interface SupabaseVocabularyRow {
  id: string;
  word: string;
  meaning_zh: string;
  example_en: string;
  source: string;
  source_message_id: string | null;
  created_at: string;
}

interface RemoteAppState {
  profile: PersistedProfile;
  messages: PersistedMessage[];
  homework: Homework[];
  vocabulary: VocabularyEntry[];
}

let db: Database.Database | null = null;
let neonSql: ReturnType<typeof neon> | null = null;

function getPostgresUrl() {
  return process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
}

function shouldUseNeon() {
  return Boolean(getPostgresUrl());
}

function shouldUseRemoteState() {
  return shouldUseNeon() || shouldUseUpstash();
}

function shouldUseUpstash() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function shouldUseSupabase() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getDefaultProfile(): PersistedProfile {
  return {
    level: "B1",
    name: "Rocky",
    recentErrors: [],
    errorArchive: [],
    learningMemory: "",
    workMemory: "",
    autoSpeak: false,
    scenarioId: "free",
  };
}

function toUserProfile(profile: PersistedProfile): UserProfile {
  return {
    level: profile.level,
    name: profile.name,
    recentErrors: [...profile.recentErrors],
    autoSpeak: profile.autoSpeak,
    scenarioId: profile.scenarioId,
  };
}

function getDefaultState(): RemoteAppState {
  return {
    profile: getDefaultProfile(),
    messages: [],
    homework: [],
    vocabulary: [],
  };
}

function parseScenarioId(value: string | null | undefined): ScenarioId {
  switch (value) {
    case "dating":
    case "bar":
    case "interview":
    case "breakup":
    case "midnight":
    case "airport":
    case "work":
      return value;
    default:
      return "free";
  }
}

async function callUpstash<T>(command: Array<string | number>) {
  const baseUrl = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!baseUrl || !token) {
    throw new Error("缺少 Upstash Redis REST 配置");
  }

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  const data = (await response.json()) as { result?: T; error?: string };

  if (!response.ok || data.error) {
    throw new Error(data.error || "Upstash 请求失败");
  }

  return data.result ?? null;
}

function normalizeUpstashState(
  raw: Partial<RemoteAppState> | null | undefined
): RemoteAppState {
  const profile = raw?.profile
    ? {
        ...getDefaultProfile(),
        ...raw.profile,
        recentErrors: Array.isArray(raw.profile.recentErrors)
          ? raw.profile.recentErrors
          : [],
        errorArchive: Array.isArray(raw.profile.errorArchive)
          ? raw.profile.errorArchive
          : [],
        learningMemory: raw.profile.learningMemory ?? "",
        workMemory: raw.profile.workMemory ?? "",
        scenarioId: parseScenarioId(raw.profile.scenarioId),
      }
    : getDefaultProfile();

  return {
    profile,
    messages: Array.isArray(raw?.messages)
      ? raw.messages.map((message) => ({
          ...message,
          scenarioId: parseScenarioId(message.scenarioId),
        }))
      : [],
    homework: Array.isArray(raw?.homework) ? raw.homework : [],
    vocabulary: Array.isArray(raw?.vocabulary) ? raw.vocabulary : [],
  };
}

async function getUpstashState(): Promise<RemoteAppState> {
  const raw = await callUpstash<string | null>(["GET", UPSTASH_STATE_KEY]);

  if (!raw) {
    const initial = getDefaultState();
    await setUpstashState(initial);
    return initial;
  }

  try {
    return normalizeUpstashState(JSON.parse(raw) as Partial<RemoteAppState>);
  } catch {
    const fallback = getDefaultState();
    await setUpstashState(fallback);
    return fallback;
  }
}

async function setUpstashState(state: RemoteAppState) {
  await callUpstash(["SET", UPSTASH_STATE_KEY, JSON.stringify(state)]);
}

function getNeonSql() {
  const url = getPostgresUrl();
  if (!url) throw new Error("缺少 Neon PostgreSQL DATABASE_URL 配置");

  neonSql ??= neon(url);
  return neonSql;
}

async function ensureNeonSchema() {
  await getNeonSql()`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function getNeonState(): Promise<RemoteAppState> {
  await ensureNeonSchema();

  const rows = (await getNeonSql()`
    SELECT state FROM app_state WHERE key = ${NEON_STATE_KEY} LIMIT 1
  `) as Array<{ state?: Partial<RemoteAppState> }>;
  const row = rows[0] as { state?: Partial<RemoteAppState> } | undefined;

  if (!row?.state) {
    const initial = getDefaultState();
    await setNeonState(initial);
    return initial;
  }

  return normalizeUpstashState(row.state);
}

async function setNeonState(state: RemoteAppState) {
  await ensureNeonSchema();
  await getNeonSql()`
    INSERT INTO app_state (key, state, updated_at)
    VALUES (${NEON_STATE_KEY}, ${JSON.stringify(state)}::jsonb, NOW())
    ON CONFLICT (key)
    DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
  `;
}

async function getRemoteState(): Promise<RemoteAppState> {
  if (shouldUseNeon()) return getNeonState();
  return getUpstashState();
}

async function setRemoteState(state: RemoteAppState) {
  if (shouldUseNeon()) {
    await setNeonState(state);
    return;
  }
  await setUpstashState(state);
}

function getSupabaseBaseUrl() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  if (!url) throw new Error("缺少 SUPABASE_URL");
  return `${url}/rest/v1`;
}

async function supabaseRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");

  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");

  const response = await fetch(`${getSupabaseBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase 请求失败 (${response.status}): ${detail}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function parseSupabaseProfile(row: SupabaseProfileRow): PersistedProfile {
  return {
    level: row.level as CEFRLevel,
    name: row.name,
    recentErrors: row.recent_errors ?? [],
    errorArchive: row.error_archive ?? [],
    learningMemory: row.learning_memory ?? "",
    workMemory: row.work_memory ?? "",
    autoSpeak: Boolean(row.auto_speak),
    scenarioId: parseScenarioId(row.scenario_id),
  };
}

function toSupabaseProfilePayload(profile: PersistedProfile) {
  return {
    id: PROFILE_ID,
    level: profile.level,
    name: profile.name,
    recent_errors: profile.recentErrors,
    error_archive: profile.errorArchive,
    learning_memory: profile.learningMemory,
    work_memory: profile.workMemory,
    auto_speak: profile.autoSpeak,
    scenario_id: profile.scenarioId,
  };
}

async function getSupabaseProfile(): Promise<PersistedProfile> {
  const rows = await supabaseRequest<SupabaseProfileRow[]>(
    `/profiles?id=eq.${PROFILE_ID}&select=*`
  );
  if (rows[0]) return parseSupabaseProfile(rows[0]);

  const profile = getDefaultProfile();
  await supabaseRequest("/profiles", {
    method: "POST",
    headers: {
      Prefer: "return=minimal",
    },
    body: JSON.stringify(toSupabaseProfilePayload(profile)),
  });
  return profile;
}

async function updateSupabaseProfile(profile: PersistedProfile) {
  await supabaseRequest(`/profiles?id=eq.${PROFILE_ID}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=minimal",
    },
    body: JSON.stringify(toSupabaseProfilePayload(profile)),
  });
}

function parseSupabaseMessage(row: SupabaseMessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role as "user" | "assistant",
    content: row.content,
    corrections: row.corrections ?? undefined,
    createdAt: row.created_at,
  };
}

function parseSupabaseHomework(row: SupabaseHomeworkRow): Homework {
  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    questions: row.questions,
    status: row.status as HomeworkStatus,
    grade: row.grade ?? undefined,
    createdAt: row.created_at,
    dueAt: row.due_at ?? undefined,
  };
}

function parseSupabaseVocabulary(row: SupabaseVocabularyRow): VocabularyEntry {
  return {
    id: row.id,
    word: row.word,
    meaningZh: row.meaning_zh,
    exampleEn: row.example_en,
    source: row.source as VocabularySource,
    sourceMessageId: row.source_message_id ?? undefined,
    createdAt: row.created_at,
  };
}

function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initSchema(db);
  }
  return db;
}

function initSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      corrections TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS homework (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      questions TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      grade TEXT,
      created_at TEXT NOT NULL,
      due_at TEXT
    );

    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      level TEXT NOT NULL DEFAULT 'B1',
      name TEXT NOT NULL DEFAULT 'Rocky',
      recent_errors TEXT NOT NULL DEFAULT '[]'
    );

    INSERT OR IGNORE INTO profile (id, level, name, recent_errors)
    VALUES (1, 'B1', 'Rocky', '[]');

    CREATE TABLE IF NOT EXISTS vocabulary (
      id TEXT PRIMARY KEY,
      word TEXT NOT NULL,
      meaning_zh TEXT NOT NULL DEFAULT '',
      example_en TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual',
      source_message_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_vocabulary_word
      ON vocabulary(word COLLATE NOCASE);
  `);
  migrateProfileColumns(database);
  migrateMessageColumns(database);
  migrateDefaultName(database);
}

function migrateDefaultName(database: Database.Database) {
  database.exec(
    "UPDATE profile SET name = 'Rocky' WHERE id = 1 AND name = 'Student'"
  );
}

function migrateMessageColumns(database: Database.Database) {
  const columns = database
    .prepare("PRAGMA table_info(messages)")
    .all() as Array<{ name: string }>;
  const names = new Set(columns.map((c) => c.name));

  if (!names.has("archived_at")) {
    database.exec("ALTER TABLE messages ADD COLUMN archived_at TEXT");
  }
  if (!names.has("scenario_id")) {
    database.exec(
      "ALTER TABLE messages ADD COLUMN scenario_id TEXT NOT NULL DEFAULT 'free'"
    );
  }
}

function migrateProfileColumns(database: Database.Database) {
  const columns = database
    .prepare("PRAGMA table_info(profile)")
    .all() as Array<{ name: string }>;
  const names = new Set(columns.map((c) => c.name));

  if (!names.has("auto_speak")) {
    database.exec(
      "ALTER TABLE profile ADD COLUMN auto_speak INTEGER NOT NULL DEFAULT 0"
    );
  }
  if (!names.has("scenario_id")) {
    database.exec(
      "ALTER TABLE profile ADD COLUMN scenario_id TEXT NOT NULL DEFAULT 'free'"
    );
  }
  if (!names.has("error_archive")) {
    database.exec(
      "ALTER TABLE profile ADD COLUMN error_archive TEXT NOT NULL DEFAULT '[]'"
    );
  }
  if (!names.has("learning_memory")) {
    database.exec(
      "ALTER TABLE profile ADD COLUMN learning_memory TEXT NOT NULL DEFAULT ''"
    );
  }
  if (!names.has("work_memory")) {
    database.exec(
      "ALTER TABLE profile ADD COLUMN work_memory TEXT NOT NULL DEFAULT ''"
    );
  }
}

function parseErrorArchive(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function getProfileRow() {
  return getDb()
    .prepare(
      "SELECT level, name, recent_errors, error_archive, learning_memory, work_memory, auto_speak, scenario_id FROM profile WHERE id = 1"
    )
    .get() as {
    level: string;
    name: string;
    recent_errors: string;
    error_archive: string;
    learning_memory: string;
    work_memory: string;
    auto_speak: number;
    scenario_id: string;
  };
}

function parseProfileRow(row: {
  level: string;
  name: string;
  recent_errors: string;
  auto_speak?: number;
  scenario_id?: string;
}): UserProfile {
  return {
    level: row.level as CEFRLevel,
    name: row.name,
    recentErrors: JSON.parse(row.recent_errors) as string[],
    autoSpeak: Boolean(row.auto_speak),
    scenarioId: parseScenarioId(row.scenario_id),
  };
}

function parseMessageRows(
  rows: Array<{
    id: string;
    role: string;
    content: string;
    corrections: string | null;
    created_at: string;
  }>
): ChatMessage[] {
  return rows.map((row) => ({
    id: row.id,
    role: row.role as "user" | "assistant",
    content: row.content,
    corrections: row.corrections
      ? (JSON.parse(row.corrections) as Correction[])
      : undefined,
    createdAt: row.created_at,
  }));
}

function toChatMessage(message: PersistedMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    corrections: message.corrections,
    createdAt: message.createdAt,
  };
}

function compressSessionForMemory(
  messages: ChatMessage[],
  assistantLabel: string,
  userLabel: string
): string {
  if (messages.length === 0) return "";

  const date = new Date().toLocaleDateString("zh-CN");
  const lines = messages.slice(-30).map(
    (m) =>
      `${m.role === "user" ? userLabel : assistantLabel}: ${m.content.replace(/\s+/g, " ").slice(0, 120)}`
  );

  return `[${date} 对话摘要]\n${lines.join("\n")}`;
}

function parseHomeworkRow(row: {
  id: string;
  title: string;
  topic: string;
  questions: string;
  status: string;
  grade: string | null;
  created_at: string;
  due_at: string | null;
}): Homework {
  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    questions: JSON.parse(row.questions) as HomeworkQuestion[],
    status: row.status as HomeworkStatus,
    grade: row.grade ? (JSON.parse(row.grade) as HomeworkGrade) : undefined,
    createdAt: row.created_at,
    dueAt: row.due_at ?? undefined,
  };
}

function parseVocabularyRow(row: {
  id: string;
  word: string;
  meaning_zh: string;
  example_en: string;
  source: string;
  source_message_id: string | null;
  created_at: string;
}): VocabularyEntry {
  return {
    id: row.id,
    word: row.word,
    meaningZh: row.meaning_zh,
    exampleEn: row.example_en,
    source: row.source as VocabularySource,
    sourceMessageId: row.source_message_id ?? undefined,
    createdAt: row.created_at,
  };
}

function getVisibleMessagesForArchive(limit = 500): Array<{
  id: string;
  role: string;
  content: string;
  corrections: string | null;
  created_at: string;
  scenario_id: string;
}> {
  return getDb()
    .prepare(
      `SELECT id, role, content, corrections, created_at, scenario_id
       FROM messages
       WHERE archived_at IS NULL
       ORDER BY created_at ASC
       LIMIT ?`
    )
    .all(limit) as Array<{
    id: string;
    role: string;
    content: string;
    corrections: string | null;
    created_at: string;
    scenario_id: string;
  }>;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

export async function getProfile(): Promise<UserProfile> {
  if (shouldUseRemoteState()) {
    return toUserProfile((await getRemoteState()).profile);
  }

  if (shouldUseSupabase()) {
    return toUserProfile(await getSupabaseProfile());
  }

  return parseProfileRow(getProfileRow());
}

export async function getErrorsForTeacher(): Promise<string[]> {
  if (shouldUseRemoteState()) {
    const state = await getRemoteState();
    return uniqueStrings([
      ...state.profile.errorArchive,
      ...state.profile.recentErrors,
    ]).slice(-30);
  }

  if (shouldUseSupabase()) {
    const profile = await getSupabaseProfile();
    return uniqueStrings([
      ...profile.errorArchive,
      ...profile.recentErrors,
    ]).slice(-30);
  }

  const row = getProfileRow();
  const recent = JSON.parse(row.recent_errors) as string[];
  const archive = parseErrorArchive(row.error_archive);
  return uniqueStrings([...archive, ...recent]).slice(-30);
}

export async function getLearningMemory(): Promise<string> {
  if (shouldUseRemoteState()) {
    return (await getRemoteState()).profile.learningMemory;
  }

  if (shouldUseSupabase()) {
    return (await getSupabaseProfile()).learningMemory;
  }

  return getProfileRow().learning_memory ?? "";
}

export async function getWorkMemory(): Promise<string> {
  if (shouldUseRemoteState()) {
    return (await getRemoteState()).profile.workMemory;
  }

  if (shouldUseSupabase()) {
    return (await getSupabaseProfile()).workMemory;
  }

  return getProfileRow().work_memory ?? "";
}

export async function updateProfile(
  updates: Partial<UserProfile>
): Promise<UserProfile> {
  if (shouldUseRemoteState()) {
    const state = await getRemoteState();
    state.profile = {
      ...state.profile,
      ...updates,
      recentErrors: updates.recentErrors ?? state.profile.recentErrors,
      autoSpeak:
        typeof updates.autoSpeak === "boolean"
          ? updates.autoSpeak
          : state.profile.autoSpeak,
      scenarioId: updates.scenarioId ?? state.profile.scenarioId,
    };
    await setRemoteState(state);
    return toUserProfile(state.profile);
  }

  if (shouldUseSupabase()) {
    const profile = await getSupabaseProfile();
    const next = {
      ...profile,
      ...updates,
      recentErrors: updates.recentErrors ?? profile.recentErrors,
      autoSpeak:
        typeof updates.autoSpeak === "boolean"
          ? updates.autoSpeak
          : profile.autoSpeak,
      scenarioId: updates.scenarioId ?? profile.scenarioId,
    };
    await updateSupabaseProfile(next);
    return toUserProfile(next);
  }

  const current = parseProfileRow(getProfileRow());
  const next = { ...current, ...updates };

  getDb()
    .prepare(
      "UPDATE profile SET level = ?, name = ?, recent_errors = ?, auto_speak = ?, scenario_id = ? WHERE id = 1"
    )
    .run(
      next.level,
      next.name,
      JSON.stringify(next.recentErrors.slice(-20)),
      next.autoSpeak ? 1 : 0,
      next.scenarioId
    );

  return next;
}

export async function addRecentErrors(errors: string[]) {
  if (errors.length === 0) return;

  if (shouldUseRemoteState()) {
    const state = await getRemoteState();
    state.profile.recentErrors = [
      ...state.profile.recentErrors,
      ...errors,
    ].slice(-20);
    state.profile.errorArchive = [
      ...state.profile.errorArchive,
      ...errors,
    ].slice(-MAX_ERROR_ARCHIVE);
    await setRemoteState(state);
    return;
  }

  if (shouldUseSupabase()) {
    const profile = await getSupabaseProfile();
    profile.recentErrors = [
      ...profile.recentErrors,
      ...errors,
    ].slice(-20);
    profile.errorArchive = [
      ...profile.errorArchive,
      ...errors,
    ].slice(-MAX_ERROR_ARCHIVE);
    await updateSupabaseProfile(profile);
    return;
  }

  const row = getProfileRow();
  const recent = JSON.parse(row.recent_errors) as string[];
  const archive = parseErrorArchive(row.error_archive);
  const nextRecent = [...recent, ...errors].slice(-20);
  const nextArchive = [...archive, ...errors].slice(-MAX_ERROR_ARCHIVE);

  getDb()
    .prepare(
      "UPDATE profile SET recent_errors = ?, error_archive = ? WHERE id = 1"
    )
    .run(JSON.stringify(nextRecent), JSON.stringify(nextArchive));
}

export async function hideRecentErrorsFromUI() {
  if (shouldUseRemoteState()) {
    const state = await getRemoteState();
    state.profile.recentErrors = [];
    await setRemoteState(state);
    return;
  }

  if (shouldUseSupabase()) {
    const profile = await getSupabaseProfile();
    profile.recentErrors = [];
    await updateSupabaseProfile(profile);
    return;
  }

  getDb()
    .prepare("UPDATE profile SET recent_errors = '[]' WHERE id = 1")
    .run();
}

export async function getMessages(
  limit = 50,
  scenarioId: ScenarioId = "free"
): Promise<ChatMessage[]> {
  if (shouldUseRemoteState()) {
    return (await getRemoteState()).messages
      .filter(
        (message) => !message.archivedAt && message.scenarioId === scenarioId
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit)
      .map(toChatMessage);
  }

  if (shouldUseSupabase()) {
    const rows = await supabaseRequest<SupabaseMessageRow[]>(
      `/messages?archived_at=is.null&scenario_id=eq.${encodeURIComponent(
        scenarioId
      )}&select=*&order=created_at.asc&limit=${limit}`
    );
    return rows.map(parseSupabaseMessage);
  }

  const rows = getDb()
    .prepare(
      `SELECT id, role, content, corrections, created_at
       FROM messages
       WHERE archived_at IS NULL AND scenario_id = ?
       ORDER BY created_at ASC
       LIMIT ?`
    )
    .all(scenarioId, limit) as Array<{
    id: string;
    role: string;
    content: string;
    corrections: string | null;
    created_at: string;
  }>;

  return parseMessageRows(rows);
}

export async function saveMessage(
  role: "user" | "assistant",
  content: string,
  corrections?: Correction[],
  scenarioId: ScenarioId = "free"
): Promise<ChatMessage> {
  const message: ChatMessage = {
    id: randomUUID(),
    role,
    content,
    corrections,
    createdAt: new Date().toISOString(),
  };

  if (shouldUseRemoteState()) {
    const state = await getRemoteState();
    state.messages.push({ ...message, scenarioId });
    await setRemoteState(state);
    return message;
  }

  if (shouldUseSupabase()) {
    await supabaseRequest("/messages", {
      method: "POST",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        id: message.id,
        role: message.role,
        content: message.content,
        corrections: corrections ?? null,
        scenario_id: scenarioId,
        created_at: message.createdAt,
      }),
    });
    return message;
  }

  getDb()
    .prepare(
      "INSERT INTO messages (id, role, content, corrections, created_at, scenario_id) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      message.id,
      message.role,
      message.content,
      corrections ? JSON.stringify(corrections) : null,
      message.createdAt,
      scenarioId
    );

  return message;
}

export async function archiveVisibleMessages(): Promise<number> {
  if (shouldUseRemoteState()) {
    const state = await getRemoteState();
    const visible = state.messages.filter((message) => !message.archivedAt);
    if (visible.length === 0) return 0;

    const workMsgs = visible
      .filter((message) => message.scenarioId === "work")
      .map(toChatMessage);
    const casualMsgs = visible
      .filter((message) => message.scenarioId !== "work")
      .map(toChatMessage);

    if (casualMsgs.length > 0) {
      const note = compressSessionForMemory(casualMsgs, "Emma", "学生");
      state.profile.learningMemory = state.profile.learningMemory
        ? `${state.profile.learningMemory}\n\n${note}`.slice(
            -MAX_LEARNING_MEMORY
          )
        : note.slice(-MAX_LEARNING_MEMORY);
    }

    if (workMsgs.length > 0) {
      const note = compressSessionForMemory(workMsgs, "Marcus", "供应商");
      state.profile.workMemory = state.profile.workMemory
        ? `${state.profile.workMemory}\n\n${note}`.slice(-MAX_WORK_MEMORY)
        : note.slice(-MAX_WORK_MEMORY);
    }

    const now = new Date().toISOString();
    for (const message of state.messages) {
      if (!message.archivedAt) {
        message.archivedAt = now;
      }
    }

    await setRemoteState(state);
    return visible.length;
  }

  if (shouldUseSupabase()) {
    const rows = await supabaseRequest<SupabaseMessageRow[]>(
      "/messages?archived_at=is.null&select=*&order=created_at.asc&limit=500"
    );
    const visible = rows.map(parseSupabaseMessage);
    if (visible.length === 0) return 0;

    const workMsgs = visible
      .filter((_, index) => parseScenarioId(rows[index].scenario_id) === "work");
    const casualMsgs = visible
      .filter((_, index) => parseScenarioId(rows[index].scenario_id) !== "work");

    const profile = await getSupabaseProfile();

    if (casualMsgs.length > 0) {
      const note = compressSessionForMemory(casualMsgs, "Emma", "学生");
      profile.learningMemory = profile.learningMemory
        ? `${profile.learningMemory}\n\n${note}`.slice(-MAX_LEARNING_MEMORY)
        : note.slice(-MAX_LEARNING_MEMORY);
    }

    if (workMsgs.length > 0) {
      const note = compressSessionForMemory(workMsgs, "Marcus", "供应商");
      profile.workMemory = profile.workMemory
        ? `${profile.workMemory}\n\n${note}`.slice(-MAX_WORK_MEMORY)
        : note.slice(-MAX_WORK_MEMORY);
    }

    const now = new Date().toISOString();
    await supabaseRequest("/messages?archived_at=is.null", {
      method: "PATCH",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ archived_at: now }),
    });
    await updateSupabaseProfile(profile);
    return visible.length;
  }

  const visible = getVisibleMessagesForArchive();
  if (visible.length === 0) return 0;

  const row = getProfileRow();
  const workRows = visible.filter((m) => m.scenario_id === "work");
  const casualRows = visible.filter((m) => m.scenario_id !== "work");

  const workMsgs = parseMessageRows(workRows);
  const casualMsgs = parseMessageRows(casualRows);

  let learningMemory = row.learning_memory ?? "";
  let workMemory = row.work_memory ?? "";

  if (casualMsgs.length > 0) {
    const note = compressSessionForMemory(casualMsgs, "Emma", "学生");
    learningMemory = learningMemory
      ? `${learningMemory}\n\n${note}`.slice(-MAX_LEARNING_MEMORY)
      : note.slice(-MAX_LEARNING_MEMORY);
  }

  if (workMsgs.length > 0) {
    const note = compressSessionForMemory(workMsgs, "Marcus", "供应商");
    workMemory = workMemory
      ? `${workMemory}\n\n${note}`.slice(-MAX_WORK_MEMORY)
      : note.slice(-MAX_WORK_MEMORY);
  }

  const now = new Date().toISOString();
  const result = getDb()
    .prepare("UPDATE messages SET archived_at = ? WHERE archived_at IS NULL")
    .run(now);

  getDb()
    .prepare(
      "UPDATE profile SET learning_memory = ?, work_memory = ? WHERE id = 1"
    )
    .run(learningMemory, workMemory);

  return result.changes;
}

export async function clearMessages() {
  return archiveVisibleMessages();
}

export async function getHomeworkList(): Promise<Homework[]> {
  if (shouldUseRemoteState()) {
    return [...(await getRemoteState()).homework].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }

  if (shouldUseSupabase()) {
    const rows = await supabaseRequest<SupabaseHomeworkRow[]>(
      "/homework?select=*&order=created_at.desc"
    );
    return rows.map(parseSupabaseHomework);
  }

  const rows = getDb()
    .prepare(
      "SELECT id, title, topic, questions, status, grade, created_at, due_at FROM homework ORDER BY created_at DESC"
    )
    .all() as Array<{
    id: string;
    title: string;
    topic: string;
    questions: string;
    status: string;
    grade: string | null;
    created_at: string;
    due_at: string | null;
  }>;

  return rows.map(parseHomeworkRow);
}

export async function getHomeworkById(id: string): Promise<Homework | null> {
  if (shouldUseRemoteState()) {
    return (
      (await getRemoteState()).homework.find((homework) => homework.id === id) ??
      null
    );
  }

  if (shouldUseSupabase()) {
    const rows = await supabaseRequest<SupabaseHomeworkRow[]>(
      `/homework?id=eq.${encodeURIComponent(id)}&select=*`
    );
    return rows[0] ? parseSupabaseHomework(rows[0]) : null;
  }

  const row = getDb()
    .prepare(
      "SELECT id, title, topic, questions, status, grade, created_at, due_at FROM homework WHERE id = ?"
    )
    .get(id) as
    | {
        id: string;
        title: string;
        topic: string;
        questions: string;
        status: string;
        grade: string | null;
        created_at: string;
        due_at: string | null;
      }
    | undefined;

  return row ? parseHomeworkRow(row) : null;
}

export async function createHomework(
  title: string,
  topic: string,
  questions: Omit<HomeworkQuestion, "id">[],
  dueAt?: string
): Promise<Homework> {
  const homework: Homework = {
    id: randomUUID(),
    title,
    topic,
    questions: questions.map((question) => ({
      ...question,
      id: randomUUID(),
    })),
    status: "pending",
    createdAt: new Date().toISOString(),
    dueAt,
  };

  if (shouldUseRemoteState()) {
    const state = await getRemoteState();
    state.homework.unshift(homework);
    await setRemoteState(state);
    return homework;
  }

  if (shouldUseSupabase()) {
    await supabaseRequest("/homework", {
      method: "POST",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        id: homework.id,
        title: homework.title,
        topic: homework.topic,
        questions: homework.questions,
        status: homework.status,
        grade: homework.grade ?? null,
        created_at: homework.createdAt,
        due_at: homework.dueAt ?? null,
      }),
    });
    return homework;
  }

  getDb()
    .prepare(
      "INSERT INTO homework (id, title, topic, questions, status, created_at, due_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      homework.id,
      homework.title,
      homework.topic,
      JSON.stringify(homework.questions),
      homework.status,
      homework.createdAt,
      homework.dueAt ?? null
    );

  return homework;
}

export async function updateHomeworkGrade(id: string, grade: HomeworkGrade) {
  if (shouldUseRemoteState()) {
    const state = await getRemoteState();
    const homework = state.homework.find((entry) => entry.id === id);
    if (homework) {
      homework.grade = grade;
      homework.status = "graded";
      await setRemoteState(state);
    }
    return;
  }

  if (shouldUseSupabase()) {
    await supabaseRequest(`/homework?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ status: "graded", grade }),
    });
    return;
  }

  getDb()
    .prepare("UPDATE homework SET status = ?, grade = ? WHERE id = ?")
    .run("graded", JSON.stringify(grade), id);
}

export async function getVocabularyList(): Promise<VocabularyEntry[]> {
  if (shouldUseRemoteState()) {
    return [...(await getRemoteState()).vocabulary].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }

  if (shouldUseSupabase()) {
    const rows = await supabaseRequest<SupabaseVocabularyRow[]>(
      "/vocabulary?select=*&order=created_at.desc"
    );
    return rows.map(parseSupabaseVocabulary);
  }

  const rows = getDb()
    .prepare(
      "SELECT id, word, meaning_zh, example_en, source, source_message_id, created_at FROM vocabulary ORDER BY created_at DESC"
    )
    .all() as Array<{
    id: string;
    word: string;
    meaning_zh: string;
    example_en: string;
    source: string;
    source_message_id: string | null;
    created_at: string;
  }>;

  return rows.map(parseVocabularyRow);
}

export async function getVocabularyById(
  id: string
): Promise<VocabularyEntry | null> {
  if (shouldUseRemoteState()) {
    return (
      (await getRemoteState()).vocabulary.find((entry) => entry.id === id) ??
      null
    );
  }

  if (shouldUseSupabase()) {
    const rows = await supabaseRequest<SupabaseVocabularyRow[]>(
      `/vocabulary?id=eq.${encodeURIComponent(id)}&select=*`
    );
    return rows[0] ? parseSupabaseVocabulary(rows[0]) : null;
  }

  const row = getDb()
    .prepare(
      "SELECT id, word, meaning_zh, example_en, source, source_message_id, created_at FROM vocabulary WHERE id = ?"
    )
    .get(id) as
    | {
        id: string;
        word: string;
        meaning_zh: string;
        example_en: string;
        source: string;
        source_message_id: string | null;
        created_at: string;
      }
    | undefined;

  return row ? parseVocabularyRow(row) : null;
}

export async function findVocabularyByWord(
  word: string
): Promise<VocabularyEntry | null> {
  const trimmed = word.trim();
  if (!trimmed) return null;

  if (shouldUseRemoteState()) {
    return (
      (await getRemoteState()).vocabulary.find(
        (entry) => entry.word.toLowerCase() === trimmed.toLowerCase()
      ) ?? null
    );
  }

  if (shouldUseSupabase()) {
    const rows = await supabaseRequest<SupabaseVocabularyRow[]>(
      `/vocabulary?word=ilike.${encodeURIComponent(trimmed)}&select=*&limit=1`
    );
    return rows[0] ? parseSupabaseVocabulary(rows[0]) : null;
  }

  const row = getDb()
    .prepare(
      "SELECT id, word, meaning_zh, example_en, source, source_message_id, created_at FROM vocabulary WHERE word = ? COLLATE NOCASE"
    )
    .get(trimmed) as
    | {
        id: string;
        word: string;
        meaning_zh: string;
        example_en: string;
        source: string;
        source_message_id: string | null;
        created_at: string;
      }
    | undefined;

  return row ? parseVocabularyRow(row) : null;
}

export async function createVocabularyEntry(
  data: Omit<VocabularyEntry, "id" | "createdAt">
): Promise<VocabularyEntry> {
  const entry: VocabularyEntry = {
    id: randomUUID(),
    word: data.word.trim(),
    meaningZh: data.meaningZh,
    exampleEn: data.exampleEn,
    source: data.source,
    sourceMessageId: data.sourceMessageId,
    createdAt: new Date().toISOString(),
  };

  if (shouldUseRemoteState()) {
    const state = await getRemoteState();
    state.vocabulary.unshift(entry);
    await setRemoteState(state);
    return entry;
  }

  if (shouldUseSupabase()) {
    await supabaseRequest("/vocabulary", {
      method: "POST",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        id: entry.id,
        word: entry.word,
        meaning_zh: entry.meaningZh,
        example_en: entry.exampleEn,
        source: entry.source,
        source_message_id: entry.sourceMessageId ?? null,
        created_at: entry.createdAt,
      }),
    });
    return entry;
  }

  getDb()
    .prepare(
      "INSERT INTO vocabulary (id, word, meaning_zh, example_en, source, source_message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      entry.id,
      entry.word,
      entry.meaningZh,
      entry.exampleEn,
      entry.source,
      entry.sourceMessageId ?? null,
      entry.createdAt
    );

  return entry;
}

export async function deleteVocabularyEntry(id: string): Promise<boolean> {
  if (shouldUseRemoteState()) {
    const state = await getRemoteState();
    const before = state.vocabulary.length;
    state.vocabulary = state.vocabulary.filter((entry) => entry.id !== id);
    if (state.vocabulary.length === before) {
      return false;
    }
    await setRemoteState(state);
    return true;
  }

  if (shouldUseSupabase()) {
    const existing = await getVocabularyById(id);
    if (!existing) return false;
    await supabaseRequest(`/vocabulary?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        Prefer: "return=minimal",
      },
    });
    return true;
  }

  const result = getDb()
    .prepare("DELETE FROM vocabulary WHERE id = ?")
    .run(id);
  return result.changes > 0;
}
