import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { neon } from "@neondatabase/serverless";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const dbPath = path.join(root, "data", "english-teacher.db");
const stateKey = process.env.APP_STATE_KEY ?? "default";

function loadEnvFile() {
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function getPostgresUrl() {
  const rawUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!rawUrl) return undefined;

  const trimmed = rawUrl.trim().replace(/^['"]|['"]$/g, "");
  const url = new URL(trimmed);
  url.searchParams.delete("channel_binding");
  return url.toString();
}

function safeJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function readLocalState() {
  const db = new Database(dbPath, { readonly: true });

  const profileRow = db
    .prepare(
      `SELECT level, name, recent_errors, error_archive, learning_memory,
              work_memory, auto_speak, scenario_id
       FROM profile WHERE id = 1`
    )
    .get();

  const messages = db
    .prepare(
      `SELECT id, role, content, corrections, created_at, scenario_id
       FROM messages
       WHERE archived_at IS NULL
       ORDER BY created_at ASC`
    )
    .all()
    .map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      corrections: safeJson(row.corrections, undefined),
      createdAt: row.created_at,
      scenarioId: row.scenario_id ?? "free",
    }));

  const homework = db
    .prepare(
      `SELECT id, title, topic, questions, status, grade, created_at, due_at
       FROM homework
       ORDER BY created_at DESC`
    )
    .all()
    .map((row) => ({
      id: row.id,
      title: row.title,
      topic: row.topic,
      questions: safeJson(row.questions, []),
      status: row.status,
      grade: safeJson(row.grade, undefined),
      createdAt: row.created_at,
      dueAt: row.due_at ?? undefined,
    }));

  const vocabulary = db
    .prepare(
      `SELECT id, word, meaning_zh, example_en, source, source_message_id, created_at
       FROM vocabulary
       ORDER BY created_at DESC`
    )
    .all()
    .map((row) => ({
      id: row.id,
      word: row.word,
      meaningZh: row.meaning_zh,
      exampleEn: row.example_en,
      source: row.source,
      sourceMessageId: row.source_message_id ?? undefined,
      createdAt: row.created_at,
    }));

  db.close();

  return {
    profile: {
      level: profileRow?.level ?? "B1",
      name: profileRow?.name ?? "Rocky",
      recentErrors: safeJson(profileRow?.recent_errors, []),
      errorArchive: safeJson(profileRow?.error_archive, []),
      learningMemory: profileRow?.learning_memory ?? "",
      workMemory: profileRow?.work_memory ?? "",
      autoSpeak: Boolean(profileRow?.auto_speak),
      scenarioId: profileRow?.scenario_id ?? "free",
    },
    messages,
    homework,
    vocabulary,
  };
}

function defaultState() {
  return {
    profile: {
      level: "B1",
      name: "Rocky",
      recentErrors: [],
      errorArchive: [],
      learningMemory: "",
      workMemory: "",
      autoSpeak: false,
      scenarioId: "free",
    },
    messages: [],
    homework: [],
    vocabulary: [],
  };
}

function byId(existing, incoming) {
  const map = new Map();
  for (const item of existing) map.set(item.id, item);
  for (const item of incoming) map.set(item.id, item);
  return [...map.values()];
}

function mergeVocabulary(existing, incoming) {
  const map = new Map();
  for (const item of existing) map.set(item.word.toLowerCase(), item);
  for (const item of incoming) map.set(item.word.toLowerCase(), item);
  return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function main() {
  loadEnvFile();

  const databaseUrl = getPostgresUrl();
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL or POSTGRES_URL for Neon");
  }
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Local database not found: ${dbPath}`);
  }

  const sql = neon(databaseUrl);
  await sql`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const rows = await sql`
    SELECT state FROM app_state WHERE key = ${stateKey} LIMIT 1
  `;
  const remote = rows[0]?.state ?? defaultState();
  const local = readLocalState();

  const merged = {
    profile: {
      ...defaultState().profile,
      ...remote.profile,
      ...local.profile,
      recentErrors: [
        ...new Set([
          ...(remote.profile?.recentErrors ?? []),
          ...local.profile.recentErrors,
        ]),
      ].slice(-20),
      errorArchive: [
        ...new Set([
          ...(remote.profile?.errorArchive ?? []),
          ...local.profile.errorArchive,
        ]),
      ].slice(-100),
    },
    messages: byId(remote.messages ?? [], local.messages).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    ),
    homework: byId(remote.homework ?? [], local.homework).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    ),
    vocabulary: mergeVocabulary(remote.vocabulary ?? [], local.vocabulary),
  };

  await sql`
    INSERT INTO app_state (key, state, updated_at)
    VALUES (${stateKey}, ${JSON.stringify(merged)}::jsonb, NOW())
    ON CONFLICT (key)
    DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
  `;

  console.log(
    JSON.stringify(
      {
        migrated: true,
        messages: merged.messages.length,
        homework: merged.homework.length,
        vocabulary: merged.vocabulary.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
