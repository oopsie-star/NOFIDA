// PATCH 016H: AI Chat Thread Store
// Per-user, per-thread conversation memory for the NOFIDA AI panel. Each
// Penpot profile gets one JSON file holding all of their threads — this is
// what lets a follow-up message ("implement it") see what was said before,
// instead of every message starting from a blank slate.

import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const THREADS_DIR = path.resolve(
  process.env.NOFIDA_AI_THREADS_DIR || "/var/lib/nofida-hub-adapter/threads",
);

const MAX_THREADS_PER_USER = 200;
const MAX_MESSAGES_PER_THREAD = 400; // oldest turns trimmed past this
const MAX_TITLE_LENGTH = 80;
const DEFAULT_HISTORY_TURNS = 20;

function assertProfileId(profileId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(profileId || ""))) {
    throw Object.assign(new Error("invalid profile id"), { code: "invalid_profile_id", status: 400 });
  }
}

function threadFilePath(profileId) {
  assertProfileId(profileId);
  return path.join(THREADS_DIR, `${profileId}.json`);
}

async function ensureDir() {
  await fsp.mkdir(THREADS_DIR, { recursive: true, mode: 0o700 });
  try {
    await fsp.chmod(THREADS_DIR, 0o700);
  } catch (_error) {}
}

async function readStore(profileId) {
  const filePath = threadFilePath(profileId);
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data?.threads) ? data : { threads: [] };
  } catch (error) {
    if (error.code === "ENOENT") return { threads: [] };
    throw error;
  }
}

async function writeStore(profileId, store) {
  await ensureDir();
  const filePath = threadFilePath(profileId);
  await fsp.writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  try {
    await fsp.chmod(filePath, 0o600);
  } catch (_error) {}
}

function makeTitle(text) {
  const trimmed = String(text || "").trim().replace(/\s+/g, " ");
  if (!trimmed) return "New chat";
  return trimmed.length > MAX_TITLE_LENGTH ? `${trimmed.slice(0, MAX_TITLE_LENGTH)}…` : trimmed;
}

function threadSummary(thread) {
  return {
    id: thread.id,
    title: thread.title,
    taskType: thread.taskType || null,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    messageCount: thread.messages.length,
  };
}

function enforceThreadCap(store) {
  if (store.threads.length > MAX_THREADS_PER_USER) {
    store.threads.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    store.threads.length = MAX_THREADS_PER_USER;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function listThreads(profileId) {
  const store = await readStore(profileId);
  return store.threads
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map(threadSummary);
}

export async function getThread(profileId, threadId) {
  const store = await readStore(profileId);
  return store.threads.find((t) => t.id === threadId) || null;
}

export async function createThread(profileId, { title, taskType } = {}) {
  const store = await readStore(profileId);
  const now = new Date().toISOString();
  const thread = {
    id: crypto.randomUUID(),
    title: makeTitle(title),
    taskType: taskType || null,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  store.threads.unshift(thread);
  enforceThreadCap(store);
  await writeStore(profileId, store);
  return threadSummary(thread);
}

export async function renameThread(profileId, threadId, title) {
  const store = await readStore(profileId);
  const thread = store.threads.find((t) => t.id === threadId);
  if (!thread) throw Object.assign(new Error("thread not found"), { code: "thread_not_found", status: 404 });
  thread.title = makeTitle(title);
  thread.updatedAt = new Date().toISOString();
  await writeStore(profileId, store);
  return threadSummary(thread);
}

export async function deleteThread(profileId, threadId) {
  const store = await readStore(profileId);
  const next = store.threads.filter((t) => t.id !== threadId);
  const removed = next.length !== store.threads.length;
  store.threads = next;
  await writeStore(profileId, store);
  return removed;
}

// Appends a user+assistant turn to a thread, creating it on first use if the
// given threadId isn't known yet (frontend generates the id up front so it
// can reference it before the first round-trip completes).
export async function appendTurn(profileId, threadId, { userMessage, assistantMessage, taskType, autoTitle }) {
  assertProfileId(profileId);
  const store = await readStore(profileId);
  let thread = store.threads.find((t) => t.id === threadId);
  if (!thread) {
    const now = new Date().toISOString();
    thread = {
      id: threadId || crypto.randomUUID(),
      title: makeTitle(autoTitle),
      taskType: taskType || null,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    store.threads.unshift(thread);
  }

  const now = new Date().toISOString();
  if (userMessage) thread.messages.push({ role: "user", ...userMessage, at: now });
  if (assistantMessage) thread.messages.push({ role: "assistant", ...assistantMessage, at: now });
  if (thread.messages.length > MAX_MESSAGES_PER_THREAD) {
    thread.messages.splice(0, thread.messages.length - MAX_MESSAGES_PER_THREAD);
  }
  if (taskType) thread.taskType = taskType;
  thread.updatedAt = now;

  enforceThreadCap(store);
  await writeStore(profileId, store);
  return threadSummary(thread);
}

// Turns a stored thread into the {role, text, images?} shape the provider
// adapters expect, trimmed to a reasonable turn budget so long threads don't
// blow the model's context window.
export function historyForPrompt(thread, maxTurns = DEFAULT_HISTORY_TURNS) {
  if (!thread || !Array.isArray(thread.messages)) return [];
  const recent = thread.messages.slice(-maxTurns * 2);
  return recent.map((m) => ({ role: m.role, text: m.text || "", images: m.images || undefined }));
}

// The most recent Screen Spec produced in this thread, if any — lets a
// follow-up "implement it" find what to refine even when the frontend didn't
// resend it explicitly.
export function lastScreenSpecInThread(thread) {
  if (!thread || !Array.isArray(thread.messages)) return null;
  for (let i = thread.messages.length - 1; i >= 0; i -= 1) {
    const m = thread.messages[i];
    if (m.role === "assistant" && m.screenSpec) return m.screenSpec;
  }
  return null;
}
