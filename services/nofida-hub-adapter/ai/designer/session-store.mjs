// PATCH 026A.0 — Autonomous Designer session store.
// Per-user, per-session persistence for the designer pipeline (pipeline.mjs)
// — modeled directly on thread-store.mjs's file-per-profile pattern. A
// session holds one stage-artifact cache per pipeline stage, so a rerun or
// an "approve and continue" resumes from whatever already validated
// successfully instead of re-invoking the LLM for stages that already ran.

import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const SESSIONS_DIR = path.resolve(
  process.env.NOFIDA_AI_DESIGNER_SESSIONS_DIR || "/var/lib/nofida-hub-adapter/designer-sessions",
);

const MAX_SESSIONS_PER_USER = 100;

function assertProfileId(profileId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(profileId || ""))) {
    throw Object.assign(new Error("invalid profile id"), { code: "invalid_profile_id", status: 400 });
  }
}

function sessionFilePath(profileId) {
  assertProfileId(profileId);
  return path.join(SESSIONS_DIR, `${profileId}.json`);
}

async function ensureDir() {
  await fsp.mkdir(SESSIONS_DIR, { recursive: true, mode: 0o700 });
  try {
    await fsp.chmod(SESSIONS_DIR, 0o700);
  } catch (_error) {}
}

async function readStore(profileId) {
  const filePath = sessionFilePath(profileId);
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data?.sessions) ? data : { sessions: [] };
  } catch (error) {
    if (error.code === "ENOENT") return { sessions: [] };
    throw error;
  }
}

async function writeStore(profileId, store) {
  await ensureDir();
  const filePath = sessionFilePath(profileId);
  await fsp.writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  try {
    await fsp.chmod(filePath, 0o600);
  } catch (_error) {}
}

function enforceSessionCap(store) {
  if (store.sessions.length > MAX_SESSIONS_PER_USER) {
    store.sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    store.sessions.length = MAX_SESSIONS_PER_USER;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function createSession(profileId, { userPrompt } = {}) {
  const store = await readStore(profileId);
  const now = new Date().toISOString();
  const session = {
    id: crypto.randomUUID(),
    userPrompt: userPrompt || null,
    status: "in_progress",
    createdAt: now,
    updatedAt: now,
    stageArtifacts: {},
  };
  store.sessions.unshift(session);
  enforceSessionCap(store);
  await writeStore(profileId, store);
  return session;
}

export async function getSession(profileId, sessionId) {
  const store = await readStore(profileId);
  return store.sessions.find((s) => s.id === sessionId) || null;
}

export async function listSessions(profileId) {
  const store = await readStore(profileId);
  return store.sessions
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map((s) => ({
      id: s.id,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      completedStages: Object.keys(s.stageArtifacts || {}),
    }));
}

// Persists one stage's validated output into the session, keyed by stage
// name (see pipeline.mjs's STAGE_ORDER). Called only AFTER contract
// validation succeeds — this store never holds an unvalidated artifact.
export async function saveStageArtifact(profileId, sessionId, stage, output) {
  const store = await readStore(profileId);
  const session = store.sessions.find((s) => s.id === sessionId);
  if (!session) throw Object.assign(new Error("designer session not found"), { code: "session_not_found", status: 404 });

  session.stageArtifacts = session.stageArtifacts || {};
  session.stageArtifacts[stage] = { status: "ok", output, at: new Date().toISOString() };
  session.updatedAt = new Date().toISOString();

  await writeStore(profileId, store);
  return session;
}

export async function setSessionStatus(profileId, sessionId, status) {
  const store = await readStore(profileId);
  const session = store.sessions.find((s) => s.id === sessionId);
  if (!session) throw Object.assign(new Error("designer session not found"), { code: "session_not_found", status: 404 });
  session.status = status;
  session.updatedAt = new Date().toISOString();
  await writeStore(profileId, store);
  return session;
}

// PATCH 026A.6 — canvas capture artifacts. Keyed by board semanticId root
// (not by pipeline stage — a capture isn't a designer_* stage output, it's
// a snapshot of what's actually on the live canvas) and then by revision,
// so re-capturing after an edit doesn't overwrite the prior snapshot the
// Visual Critic (026A.7) may still want to compare against. Only ever
// called with an ALREADY-VALIDATED capture (see capture-validator.mjs) —
// this store, like saveStageArtifact(), never holds a rejected image.
export async function saveCaptureArtifact(profileId, sessionId, { semanticId, revision, pngBase64, width, height, scale }) {
  if (typeof semanticId !== "string" || !semanticId.trim()) {
    throw Object.assign(new Error("semanticId is required"), { code: "invalid_semantic_id", status: 400 });
  }
  const revisionKey = String(revision ?? "latest");

  const store = await readStore(profileId);
  const session = store.sessions.find((s) => s.id === sessionId);
  if (!session) throw Object.assign(new Error("designer session not found"), { code: "session_not_found", status: 404 });

  session.captures = session.captures || {};
  session.captures[semanticId] = session.captures[semanticId] || {};
  session.captures[semanticId][revisionKey] = {
    pngBase64, width, height, scale: scale || 1, capturedAt: new Date().toISOString(),
  };
  session.updatedAt = new Date().toISOString();

  await writeStore(profileId, store);
  return session;
}

export async function getCaptureArtifact(profileId, sessionId, semanticId, revision) {
  const session = await getSession(profileId, sessionId);
  if (!session) return null;
  const revisionKey = String(revision ?? "latest");
  return session.captures?.[semanticId]?.[revisionKey] || null;
}

// PATCH 026A.7 — critique/repair loop pass artifacts. Keyed by pass index
// (0 = the initial pre-repair evaluation, 1..N = post-repair re-evaluations
// — see pipeline.mjs's runCritiqueRepairLoop()), NOT by pipeline stage —
// unlike saveStageArtifact() above, the critique/repair cycle deliberately
// re-runs the same logical stage multiple times within one session, so a
// single stageArtifacts.critique slot can't hold the whole history.
export async function saveRepairPass(profileId, sessionId, passRecord) {
  if (typeof passRecord?.pass !== "number") {
    throw Object.assign(new Error("pass index is required"), { code: "invalid_pass_index", status: 400 });
  }
  const store = await readStore(profileId);
  const session = store.sessions.find((s) => s.id === sessionId);
  if (!session) throw Object.assign(new Error("designer session not found"), { code: "session_not_found", status: 404 });

  session.repairPasses = (session.repairPasses || []).filter((p) => p.pass !== passRecord.pass);
  session.repairPasses.push({ ...passRecord, at: new Date().toISOString() });
  session.repairPasses.sort((a, b) => a.pass - b.pass);
  session.updatedAt = new Date().toISOString();

  await writeStore(profileId, store);
  return session;
}

export async function getRepairPasses(profileId, sessionId) {
  const session = await getSession(profileId, sessionId);
  return session ? (session.repairPasses || []) : [];
}
