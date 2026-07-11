import fsp from "node:fs/promises";
import path from "node:path";
import { getDesignerFeatureFlags } from "./ai/designer/feature-flags.mjs";

const SETTINGS_SCHEMA_VERSION = 1;
const SETTINGS_PATH = path.resolve(
  process.env.NOFIDA_AI_SETTINGS_PATH || "/var/lib/nofida-hub-adapter/secrets/ai-settings.json",
);
const REGISTRY_CACHE_PATH = path.resolve(
  process.env.NOFIDA_AI_MODEL_CACHE_PATH || path.join(path.dirname(SETTINGS_PATH), "ai-model-registry.json"),
);
const REGISTRY_REFRESH_MS = Number(process.env.NOFIDA_AI_MODEL_REGISTRY_REFRESH_MS || 12 * 60 * 60 * 1000);
const PROVIDER_TEST_TIMEOUT_MS = Number(process.env.NOFIDA_AI_PROVIDER_TEST_TIMEOUT_MS || 15000);
const MODEL_TEST_TIMEOUT_MS = Number(process.env.NOFIDA_AI_MODEL_TEST_TIMEOUT_MS || 20000);
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export const PROVIDER_IDS = [
  "openrouter",
  "deepseek",
  "openai",
  "openai_compatible",
  "anthropic",
  "gemini",
  "groq",
  "mistral",
  "xiaomi",
  "qwen",
  "z_ai",
  "custom",
];

export const PROVIDER_MODES = ["role_assignments", "single_default"];

export const MODEL_ROLES = [
  "default",
  "file_summary",
  "design_audit",
  "library_recommendation",
  "screen_planner",
  "copywriter",
  "reviewer",
  "vision",
  "fast",
  "premium",
];

export const MODEL_CAPABILITIES = ["free", "vision", "coding", "reasoning", "fast", "cheap"];
export const PROVIDER_KEY_STATUSES = ["not_configured", "saved", "test_passed", "test_failed", "not_tested"];

const PROVIDER_DEFS = {
  openrouter: {
    label: "OpenRouter",
    adapter: "openai-compatible",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    baseUrlPlaceholder: "https://openrouter.ai/api/v1",
    supportsAllRegistryModels: true,
    familyPrefixes: ["openrouter"],
  },
  deepseek: {
    label: "DeepSeek",
    adapter: "openai-compatible",
    defaultBaseUrl: "https://api.deepseek.com",
    baseUrlPlaceholder: "https://api.deepseek.com",
    familyPrefixes: ["deepseek"],
  },
  openai: {
    label: "OpenAI",
    adapter: "openai-compatible",
    defaultBaseUrl: "https://api.openai.com/v1",
    baseUrlPlaceholder: "https://api.openai.com/v1",
    familyPrefixes: ["openai"],
  },
  openai_compatible: {
    label: "OpenAI-compatible",
    adapter: "openai-compatible",
    defaultBaseUrl: "",
    baseUrlPlaceholder: "https://your-endpoint.example/v1",
    supportsAllRegistryModels: true,
    requiresBaseUrl: true,
  },
  anthropic: {
    label: "Anthropic Claude",
    adapter: "anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    baseUrlPlaceholder: "https://api.anthropic.com",
    familyPrefixes: ["anthropic"],
  },
  gemini: {
    label: "Google Gemini",
    adapter: "gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    baseUrlPlaceholder: "https://generativelanguage.googleapis.com/v1beta",
    familyPrefixes: ["google"],
  },
  groq: {
    label: "Groq",
    adapter: "openai-compatible",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    baseUrlPlaceholder: "https://api.groq.com/openai/v1",
    familyPrefixes: ["groq"],
  },
  mistral: {
    label: "Mistral",
    adapter: "openai-compatible",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    baseUrlPlaceholder: "https://api.mistral.ai/v1",
    familyPrefixes: ["mistralai"],
  },
  xiaomi: {
    label: "Xiaomi",
    adapter: "openai-compatible",
    defaultBaseUrl: "",
    baseUrlPlaceholder: "https://your-xiaomi-endpoint.example/v1",
    familyPrefixes: ["xiaomi"],
    requiresBaseUrl: true,
  },
  qwen: {
    label: "Qwen",
    adapter: "openai-compatible",
    defaultBaseUrl: "",
    baseUrlPlaceholder: "https://your-qwen-endpoint.example/v1",
    familyPrefixes: ["qwen"],
    requiresBaseUrl: true,
  },
  z_ai: {
    label: "Z-ai",
    adapter: "openai-compatible",
    defaultBaseUrl: "",
    baseUrlPlaceholder: "https://your-z-ai-endpoint.example/v1",
    familyPrefixes: ["z-ai"],
    requiresBaseUrl: true,
  },
  custom: {
    label: "Custom Provider",
    adapter: "openai-compatible",
    defaultBaseUrl: "",
    baseUrlPlaceholder: "https://your-custom-endpoint.example/v1",
    supportsAllRegistryModels: true,
    requiresBaseUrl: true,
  },
};

const ENV_PROVIDER_ALIASES = {
  openrouter: "openrouter",
  deepseek: "deepseek",
  openai: "openai",
  anthropic: "anthropic",
  gemini: "gemini",
  custom: "custom",
  "openai-compatible": "openai_compatible",
  openai_compatible: "openai_compatible",
  groq: "groq",
  mistral: "mistral",
  xiaomi: "xiaomi",
  qwen: "qwen",
  "z-ai": "z_ai",
  z_ai: "z_ai",
};

const PRICE_TAG_THRESHOLDS = {
  cheapPrompt: 0.0000015,
  cheapCompletion: 0.000006,
  fastPrompt: 0.0000035,
};

function nowIso() {
  return new Date().toISOString();
}

function sanitizeText(value) {
  return String(value || "")
    .replace(/sk-[A-Za-z0-9_\-]{8,}/g, "sk-••••redacted")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer ••••redacted")
    .replace(/x-api-key["']?\s*[:=]\s*["'][^"']+["']/gi, "x-api-key: \"••••redacted\"")
    .trim();
}

function makeConfigError(code, message, status = 409, extra = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (extra && typeof extra === "object") Object.assign(error, extra);
  return error;
}

function normalizeProviderId(providerId) {
  const normalized = String(providerId || "").trim().toLowerCase().replace(/-/g, "_");
  return PROVIDER_IDS.includes(normalized) ? normalized : null;
}

function normalizeRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return MODEL_ROLES.includes(normalized) ? normalized : null;
}

function normalizeProviderMode(mode) {
  const normalized = String(mode || "").trim().toLowerCase();
  return PROVIDER_MODES.includes(normalized) ? normalized : null;
}

function normalizeStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return PROVIDER_KEY_STATUSES.includes(normalized) ? normalized : "not_configured";
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}

function parseNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  if (Number.isFinite(min) && numeric < min) return fallback;
  if (Number.isFinite(max) && numeric > max) return fallback;
  return numeric;
}

function parsePriceValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatPriceLabel(promptPrice, completionPrice) {
  if (promptPrice === 0 && completionPrice === 0) return "Free";
  if (promptPrice === null && completionPrice === null) return "Unknown";
  const fmt = (numeric) => (numeric === null ? "?" : `$${(numeric * 1_000_000).toFixed(2)}/M`);
  return `${fmt(promptPrice)} in · ${fmt(completionPrice)} out`;
}

function maskSecret(secret) {
  const raw = String(secret || "").trim();
  if (!raw) return "";
  if (raw.length <= 8) return `${raw.slice(0, 2)}••••`;
  return `${raw.slice(0, 3)}-••••••••${raw.slice(-4)}`;
}

function familyFromModelId(modelId) {
  const clean = String(modelId || "").replace(/^~/, "");
  const prefix = clean.split("/")[0];
  if (prefix === "google") return "gemini";
  if (prefix === "mistralai") return "mistral";
  if (prefix === "z-ai") return "z_ai";
  if (prefix === "openrouter") return "openrouter";
  if (prefix === "anthropic") return "anthropic";
  if (prefix === "openai") return "openai";
  if (prefix === "deepseek") return "deepseek";
  if (prefix === "groq") return "groq";
  if (prefix === "qwen") return "qwen";
  if (prefix === "xiaomi") return "xiaomi";
  return null;
}

function hasCapability(raw, name, promptPrice, completionPrice) {
  const supported = Array.isArray(raw?.supported_parameters) ? raw.supported_parameters : [];
  const modalities = Array.isArray(raw?.architecture?.input_modalities)
    ? raw.architecture.input_modalities
    : [];
  const text = `${raw?.name || ""} ${raw?.description || ""}`.toLowerCase();

  if (name === "free") return promptPrice === 0 && completionPrice === 0;
  if (name === "vision") return modalities.includes("image");
  if (name === "coding")
    return /code|coding|program|developer|software/.test(text);
  if (name === "reasoning")
    return supported.includes("reasoning")
      || supported.includes("include_reasoning")
      || /reason/.test(text);
  if (name === "fast")
    return /flash|fast|turbo|mini|swift/.test(text)
      || (promptPrice !== null && promptPrice <= PRICE_TAG_THRESHOLDS.fastPrompt);
  if (name === "cheap")
    return promptPrice === 0
      || (promptPrice !== null && promptPrice <= PRICE_TAG_THRESHOLDS.cheapPrompt
        && completionPrice !== null && completionPrice <= PRICE_TAG_THRESHOLDS.cheapCompletion);
  return false;
}

function compareModelsForDisplay(left, right) {
  const cheapLeft = left.price.prompt ?? Number.POSITIVE_INFINITY;
  const cheapRight = right.price.prompt ?? Number.POSITIVE_INFINITY;
  if (cheapLeft !== cheapRight) return cheapLeft - cheapRight;
  if (right.contextWindow !== left.contextWindow) return right.contextWindow - left.contextWindow;
  return String(left.displayName || "").localeCompare(String(right.displayName || ""));
}

function mapOpenRouterModel(raw) {
  const promptPrice = parsePriceValue(raw?.pricing?.prompt);
  const completionPrice = parsePriceValue(raw?.pricing?.completion);
  const familyProviderId = familyFromModelId(raw?.id);
  const compatibleProviders = new Set(["openrouter", "openai_compatible", "custom"]);
  if (familyProviderId) compatibleProviders.add(familyProviderId);

  const capabilities = MODEL_CAPABILITIES.filter((capability) =>
    hasCapability(raw, capability, promptPrice, completionPrice),
  );

  return {
    id: String(raw?.id || ""),
    canonicalSlug: String(raw?.canonical_slug || raw?.id || ""),
    displayName: String(raw?.name || raw?.id || "Unnamed model"),
    providerLabel: familyProviderId && PROVIDER_DEFS[familyProviderId]
      ? PROVIDER_DEFS[familyProviderId].label
      : "OpenRouter",
    familyProviderId: familyProviderId || "openrouter",
    compatibleProviders: Array.from(compatibleProviders),
    contextWindow: Number(raw?.context_length || 0),
    maxOutputTokens: Number(raw?.top_provider?.max_completion_tokens || raw?.context_length || 0),
    description: String(raw?.description || "").trim(),
    capabilities,
    price: {
      prompt: promptPrice,
      completion: completionPrice,
      label: formatPriceLabel(promptPrice, completionPrice),
    },
    modalities: Array.isArray(raw?.architecture?.input_modalities)
      ? raw.architecture.input_modalities
      : ["text"],
    source: "openrouter",
    sourceUrl: `https://openrouter.ai/models/${encodeURIComponent(String(raw?.id || ""))}`,
  };
}

function createDefaultProviderRecord(providerId) {
  const def = PROVIDER_DEFS[providerId];
  return {
    providerId,
    label: def.label,
    mode: providerId === "custom" || providerId === "openai_compatible" ? "manual_endpoint" : "managed",
    baseUrl: def.defaultBaseUrl || "",
    apiKey: "",
    maskedKey: "",
    status: "not_configured",
    lastTestedAt: null,
    lastTestLatencyMs: null,
    lastError: null,
    updatedAt: null,
  };
}

function createDefaultSettings() {
  const providers = {};
  for (const providerId of PROVIDER_IDS) providers[providerId] = createDefaultProviderRecord(providerId);

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    providerMode: "role_assignments",
    providers,
    modelAssignments: {},
    engine: {
      temperature: 0.25,
      // build_screen emits a full Screen Spec JSON tree (up to ~140 nodes) —
      // 1200 tokens truncates that mid-document; 45s is tight for a large
      // generation through an OpenRouter proxy hop. Both were sized for
      // short text replies, before build_screen was reachable from ordinary
      // free-text requests (see intent-router.mjs's editor-context default).
      maxTokens: 4096,
      timeoutMs: 90000,
      retries: 1,
      fallbackModelOrder: [],
    },
    registryMeta: {
      source: "openrouter",
      syncedAt: null,
      cachePath: REGISTRY_CACHE_PATH,
      lastError: null,
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeDefaults(raw) {
  const defaults = createDefaultSettings();
  const merged = cloneJson(defaults);

  if (raw && typeof raw === "object") {
    merged.schemaVersion = SETTINGS_SCHEMA_VERSION;
    merged.providerMode = normalizeProviderMode(raw.providerMode) || defaults.providerMode;
    merged.modelAssignments = raw.modelAssignments && typeof raw.modelAssignments === "object"
      ? raw.modelAssignments
      : {};
    merged.engine = {
      temperature: parseNumber(raw?.engine?.temperature, defaults.engine.temperature, 0, 2),
      maxTokens: parseNumber(raw?.engine?.maxTokens, defaults.engine.maxTokens, 64, 65536),
      timeoutMs: parseNumber(raw?.engine?.timeoutMs, defaults.engine.timeoutMs, 5000, 120000),
      retries: parseNumber(raw?.engine?.retries, defaults.engine.retries, 0, 5),
      fallbackModelOrder: Array.isArray(raw?.engine?.fallbackModelOrder) ? raw.engine.fallbackModelOrder : [],
    };
    merged.registryMeta = {
      source: "openrouter",
      syncedAt: raw?.registryMeta?.syncedAt || null,
      cachePath: REGISTRY_CACHE_PATH,
      lastError: raw?.registryMeta?.lastError ? sanitizeText(raw.registryMeta.lastError) : null,
    };
    merged.createdAt = raw.createdAt || defaults.createdAt;
    merged.updatedAt = raw.updatedAt || defaults.updatedAt;

    if (raw.providers && typeof raw.providers === "object") {
      for (const providerId of PROVIDER_IDS) {
        const next = raw.providers[providerId] || {};
        merged.providers[providerId] = {
          ...createDefaultProviderRecord(providerId),
          providerId,
          label: PROVIDER_DEFS[providerId].label,
          mode: String(next.mode || createDefaultProviderRecord(providerId).mode),
          baseUrl: normalizeBaseUrl(next.baseUrl || createDefaultProviderRecord(providerId).baseUrl),
          apiKey: String(next.apiKey || ""),
          maskedKey: "",
          status: normalizeStatus(next.status),
          lastTestedAt: next.lastTestedAt || null,
          lastTestLatencyMs: Number.isFinite(Number(next.lastTestLatencyMs)) ? Number(next.lastTestLatencyMs) : null,
          lastError: next.lastError ? sanitizeText(next.lastError) : null,
          updatedAt: next.updatedAt || null,
        };
      }
    }
  }

  return merged;
}

function migrateLegacyEnvIntoSettings(raw) {
  const providerEnv = normalizeProviderId(ENV_PROVIDER_ALIASES[String(process.env.NOFIDA_AI_PROVIDER || "").trim().toLowerCase()]);
  const apiKey = String(process.env.NOFIDA_AI_API_KEY || "").trim();
  const modelId = String(process.env.NOFIDA_AI_MODEL || "").trim();
  const baseUrl = normalizeBaseUrl(process.env.NOFIDA_AI_BASE_URL || "");
  const maxTokens = parseNumber(process.env.NOFIDA_AI_MAX_TOKENS, raw.engine.maxTokens, 64, 65536);

  if (!providerEnv || providerEnv === "stub" || (!apiKey && !modelId && !baseUrl)) return raw;

  const next = mergeDefaults(raw);
  const record = next.providers[providerEnv];
  record.apiKey = apiKey || record.apiKey;
  record.baseUrl = baseUrl || record.baseUrl || PROVIDER_DEFS[providerEnv].defaultBaseUrl || "";
  record.status = apiKey ? "saved" : record.status;
  record.updatedAt = nowIso();
  next.engine.maxTokens = maxTokens;
  if (modelId) next.modelAssignments.default = { role: "default", providerId: providerEnv, modelId };
  next.updatedAt = nowIso();
  return next;
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function ensureSecureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true, mode: 0o700 });
  try {
    await fsp.chmod(dirPath, 0o700);
  } catch (_error) {}
}

async function writeJsonSecure(filePath, data) {
  await ensureSecureDir(path.dirname(filePath));
  await fsp.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  try {
    await fsp.chmod(filePath, 0o600);
  } catch (_error) {}
}

function pickCheapestModel(models, providerId) {
  const compatible = models.filter((model) => model.compatibleProviders.includes(providerId));
  compatible.sort(compareModelsForDisplay);
  return compatible[0] || null;
}

function sanitizeAssignmentMap(assignments, registryModels) {
  const modelIndex = new Map(registryModels.map((model) => [model.id, model]));
  const out = {};
  for (const role of MODEL_ROLES) {
    const assignment = assignments?.[role];
    if (!assignment || typeof assignment !== "object") continue;
    const providerId = normalizeProviderId(assignment.providerId);
    const modelId = String(assignment.modelId || "").trim();
    if (!providerId || !modelId) continue;
    const model = modelIndex.get(modelId);
    out[role] = {
      role,
      providerId,
      providerLabel: PROVIDER_DEFS[providerId]?.label || providerId,
      modelId,
      modelLabel: model?.displayName || modelId,
      familyProviderId: model?.familyProviderId || null,
      capabilities: Array.isArray(model?.capabilities) ? model.capabilities : [],
    };
  }
  return out;
}

function sanitizeFallbackOrder(assignments, registryModels) {
  const modelIndex = new Map(registryModels.map((model) => [model.id, model]));
  return (assignments || [])
    .map((assignment) => {
      const providerId = normalizeProviderId(assignment?.providerId);
      const modelId = String(assignment?.modelId || "").trim();
      if (!providerId || !modelId) return null;
      const model = modelIndex.get(modelId);
      return {
        providerId,
        providerLabel: PROVIDER_DEFS[providerId]?.label || providerId,
        modelId,
        modelLabel: model?.displayName || modelId,
      };
    })
    .filter(Boolean);
}

// `message` is normally a plain string (unchanged for every existing caller).
// Callers that need to attach reference images pass { text, images } instead,
// where images is [{ mimeType, dataBase64 }]. Each provider builds its own
// multimodal content shape from the same normalized form.
function normalizeMessage(message) {
  if (message && typeof message === "object" && !Array.isArray(message)) {
    return {
      text: typeof message.text === "string" ? message.text : "",
      images: Array.isArray(message.images)
        ? message.images.filter((img) => img && typeof img.dataBase64 === "string" && typeof img.mimeType === "string")
        : [],
    };
  }
  return { text: String(message || ""), images: [] };
}

function buildOpenAiContent(normalized) {
  if (!normalized.images.length) return normalized.text;
  const parts = [];
  if (normalized.text) parts.push({ type: "text", text: normalized.text });
  for (const img of normalized.images) {
    parts.push({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.dataBase64}` } });
  }
  return parts;
}

function buildAnthropicContent(normalized) {
  if (!normalized.images.length) return normalized.text;
  const parts = [];
  if (normalized.text) parts.push({ type: "text", text: normalized.text });
  for (const img of normalized.images) {
    parts.push({ type: "image", source: { type: "base64", media_type: img.mimeType, data: img.dataBase64 } });
  }
  return parts;
}

function buildGeminiParts(normalized) {
  const parts = [];
  if (normalized.text) parts.push({ text: normalized.text });
  for (const img of normalized.images) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.dataBase64 } });
  }
  return parts.length ? parts : [{ text: "" }];
}

// `history` is prior thread turns: [{ role: "user"|"assistant", text, images? }, ...],
// oldest first. Each provider maps it into its own multi-turn message shape,
// then appends the current message last. Empty/missing history is a no-op —
// every existing single-shot caller keeps working unchanged.
function buildOpenAiHistoryMessages(history) {
  return (history || []).map((turn) => ({
    role: turn.role === "assistant" ? "assistant" : "user",
    content: buildOpenAiContent(normalizeMessage(turn)),
  }));
}

function buildAnthropicHistoryMessages(history) {
  return (history || []).map((turn) => ({
    role: turn.role === "assistant" ? "assistant" : "user",
    content: buildAnthropicContent(normalizeMessage(turn)),
  }));
}

function buildGeminiHistoryContents(history) {
  return (history || []).map((turn) => ({
    role: turn.role === "assistant" ? "model" : "user",
    parts: buildGeminiParts(normalizeMessage(turn)),
  }));
}

async function callOpenAICompatible({
  apiKey,
  baseUrl,
  model,
  providerId,
  message,
  systemPrompt,
  history,
  maxTokens,
  temperature,
  timeoutMs,
}) {
  const body = {
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      ...buildOpenAiHistoryMessages(history),
      { role: "user", content: buildOpenAiContent(normalizeMessage(message)) },
    ],
  };
  // Reasoning-capable models (OpenRouter's unified "reasoning" field — MiMo,
  // QwQ, R1-style, etc.) will spend as much of max_tokens as they're allowed
  // to "think" before answering. A generous max_tokens for a large structured
  // output (e.g. build_screen's Screen Spec JSON) gives them room to reason
  // for tens of seconds to minutes — a real model behaviour, not a hang —
  // which blew through every timeout we tried. Capping reasoning effort
  // keeps generation latency bounded without shrinking the output budget.
  // OpenRouter-only: other openai-compatible endpoints may reject an unknown
  // field, so this must not be sent to them.
  if (providerId === "openrouter") {
    body.reasoning = { effort: "low", exclude: true };
  }
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw makeConfigError(
      "provider_request_failed",
      `Upstream request failed with status ${response.status}. ${sanitizeText(text).slice(0, 280)}`,
      502,
    );
  }

  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_error) {
    throw makeConfigError("provider_response_invalid", "Provider returned invalid JSON.", 502);
  }

  const choice = data?.choices?.[0];
  const answer = choice?.message?.content;
  // DIAGNOSTIC (temporary): reasoning models (OpenRouter's "reasoning"
  // capability, e.g. MiMo/QwQ/R1-style) can spend the whole max_tokens
  // budget "thinking" in a separate reasoning/reasoning_content field before
  // ever emitting the actual answer, leaving `content` empty or cut off —
  // and finish_reason: "length" is the tell. We were reading only `content`
  // and had no visibility into either signal. Logging both until we've
  // confirmed which failure mode we're actually hitting.
  try {
    const reasoningLen = typeof choice?.message?.reasoning === "string" ? choice.message.reasoning.length
      : typeof choice?.message?.reasoning_content === "string" ? choice.message.reasoning_content.length
      : 0;
    const contentLen = typeof answer === "string" ? answer.length : 0;
    if (choice?.finish_reason === "length" || (reasoningLen > 0 && contentLen === 0)) {
      process.stderr.write(`[ai-diagnostic] model=${model} finish_reason=${choice?.finish_reason} reasoningLen=${reasoningLen} contentLen=${contentLen} usage=${JSON.stringify(data?.usage || {})}\n`);
    }
  } catch (_diagErr) { /* diagnostics must never break the real call */ }

  return typeof answer === "string" ? answer : Array.isArray(answer) ? answer.join("\n") : "";
}

async function callAnthropic({
  apiKey,
  baseUrl,
  model,
  message,
  systemPrompt,
  history,
  maxTokens,
  temperature,
  timeoutMs,
}) {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      system: systemPrompt,
      temperature,
      max_tokens: maxTokens,
      messages: [
        ...buildAnthropicHistoryMessages(history),
        { role: "user", content: buildAnthropicContent(normalizeMessage(message)) },
      ],
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw makeConfigError(
      "provider_request_failed",
      `Upstream request failed with status ${response.status}. ${sanitizeText(text).slice(0, 280)}`,
      502,
    );
  }

  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_error) {
    throw makeConfigError("provider_response_invalid", "Provider returned invalid JSON.", 502);
  }

  const parts = Array.isArray(data?.content) ? data.content : [];
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

async function callGemini({
  apiKey,
  baseUrl,
  model,
  message,
  systemPrompt,
  history,
  maxTokens,
  temperature,
  timeoutMs,
}) {
  const endpoint = `${normalizeBaseUrl(baseUrl)}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [
        ...buildGeminiHistoryContents(history),
        { role: "user", parts: buildGeminiParts(normalizeMessage(message)) },
      ],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw makeConfigError(
      "provider_request_failed",
      `Upstream request failed with status ${response.status}. ${sanitizeText(text).slice(0, 280)}`,
      502,
    );
  }

  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_error) {
    throw makeConfigError("provider_response_invalid", "Provider returned invalid JSON.", 502);
  }

  const candidate = Array.isArray(data?.candidates) ? data.candidates[0] : null;
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

export function createAISettingsService(log = () => {}) {
  let settingsCache = null;
  let registryCache = null;
  let registryPromise = null;

  async function loadSettingsRaw() {
    if (settingsCache) return settingsCache;
    const existing = await readJsonIfExists(SETTINGS_PATH);
    let settings = mergeDefaults(existing);
    if (!existing) {
      settings = migrateLegacyEnvIntoSettings(settings);
      await writeJsonSecure(SETTINGS_PATH, settings);
    }
    settingsCache = settings;
    return settingsCache;
  }

  async function saveSettingsRaw(next) {
    settingsCache = mergeDefaults(next);
    settingsCache.updatedAt = nowIso();
    await writeJsonSecure(SETTINGS_PATH, settingsCache);
    return settingsCache;
  }

  async function updateSettings(mutator) {
    const current = cloneJson(await loadSettingsRaw());
    const mutated = await mutator(current) || current;
    return saveSettingsRaw(mutated);
  }

  async function loadRegistryCache() {
    const existing = await readJsonIfExists(REGISTRY_CACHE_PATH);
    if (!existing || !Array.isArray(existing.models)) return null;
    return existing;
  }

  async function writeRegistryCache(cache) {
    registryCache = cache;
    await writeJsonSecure(REGISTRY_CACHE_PATH, cache);
    return registryCache;
  }

  function filterRegistryForUi(models) {
    return models
      .filter((model) => model.id && model.displayName)
      .sort(compareModelsForDisplay);
  }

  async function refreshRegistry() {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    const text = await response.text();
    if (!response.ok) {
      throw makeConfigError(
        "registry_fetch_failed",
        `OpenRouter registry request failed with status ${response.status}. ${sanitizeText(text).slice(0, 240)}`,
        502,
      );
    }

    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (_error) {
      throw makeConfigError("registry_invalid_json", "OpenRouter returned invalid JSON for the model registry.", 502);
    }

    const rawModels = Array.isArray(payload?.data) ? payload.data : [];
    const models = rawModels
      .map(mapOpenRouterModel)
      .filter((model) => model.id)
      .sort(compareModelsForDisplay);

    const cache = {
      source: "openrouter",
      syncedAt: nowIso(),
      models,
      total: models.length,
    };
    await writeRegistryCache(cache);
    await updateSettings((draft) => {
      draft.registryMeta.syncedAt = cache.syncedAt;
      draft.registryMeta.lastError = null;
      return draft;
    });
    return cache;
  }

  async function getModelRegistry(options = {}) {
    const force = options.force === true;
    if (!force && registryCache && Array.isArray(registryCache.models)) return registryCache;

    if (!force && registryPromise) return registryPromise;

    registryPromise = (async () => {
      const cache = registryCache || await loadRegistryCache();
      registryCache = cache;

      const isFresh = cache?.syncedAt
        ? (Date.now() - new Date(cache.syncedAt).getTime()) < REGISTRY_REFRESH_MS
        : false;

      if (!force && isFresh && cache?.models?.length) return cache;

      try {
        return await refreshRegistry();
      } catch (error) {
        if (cache?.models?.length) {
          await updateSettings((draft) => {
            draft.registryMeta.lastError = sanitizeText(error.message);
            return draft;
          });
          return cache;
        }

        const empty = {
          source: "openrouter",
          syncedAt: null,
          models: [],
          total: 0,
          error: sanitizeText(error.message),
        };
        registryCache = empty;
        await updateSettings((draft) => {
          draft.registryMeta.lastError = empty.error;
          return draft;
        });
        return empty;
      } finally {
        registryPromise = null;
      }
    })();

    return registryPromise;
  }

  function sanitizeProviderRecord(record) {
    const providerId = normalizeProviderId(record?.providerId) || "custom";
    const def = PROVIDER_DEFS[providerId];
    const apiKey = String(record?.apiKey || "");

    return {
      providerId,
      label: def.label,
      mode: String(record?.mode || createDefaultProviderRecord(providerId).mode),
      baseUrl: normalizeBaseUrl(record?.baseUrl || def.defaultBaseUrl || ""),
      baseUrlPlaceholder: def.baseUrlPlaceholder || "",
      hasKey: Boolean(apiKey),
      maskedKey: apiKey ? maskSecret(apiKey) : "",
      status: normalizeStatus(record?.status),
      lastTestedAt: record?.lastTestedAt || null,
      lastTestLatencyMs: Number.isFinite(Number(record?.lastTestLatencyMs)) ? Number(record.lastTestLatencyMs) : null,
      lastError: record?.lastError ? sanitizeText(record.lastError) : null,
      updatedAt: record?.updatedAt || null,
      adapter: def.adapter,
      requiresBaseUrl: Boolean(def.requiresBaseUrl),
      supportsAllRegistryModels: Boolean(def.supportsAllRegistryModels),
    };
  }

  async function getSettingsView(options = {}) {
    const [settings, registry] = await Promise.all([loadSettingsRaw(), getModelRegistry(options)]);
    return {
      providerMode: settings.providerMode,
      providers: PROVIDER_IDS.map((providerId) => sanitizeProviderRecord(settings.providers[providerId])),
      modelLibrary: filterRegistryForUi(registry.models || []),
      modelAssignments: sanitizeAssignmentMap(settings.modelAssignments, registry.models || []),
      engine: {
        temperature: settings.engine.temperature,
        maxTokens: settings.engine.maxTokens,
        timeoutMs: settings.engine.timeoutMs,
        retries: settings.engine.retries,
        fallbackModelOrder: Array.isArray(settings.engine.fallbackModelOrder)
          ? settings.engine.fallbackModelOrder
              .map((assignment) => {
                const providerId = normalizeProviderId(assignment?.providerId);
                const modelId = String(assignment?.modelId || "").trim();
                if (!providerId || !modelId) return null;
                const model = (registry.models || []).find((entry) => entry.id === modelId);
                return {
                  providerId,
                  providerLabel: PROVIDER_DEFS[providerId]?.label || providerId,
                  modelId,
                  modelLabel: model?.displayName || modelId,
                };
              })
              .filter(Boolean)
          : [],
      },
      metadata: {
        schemaVersion: settings.schemaVersion,
        settingsPath: SETTINGS_PATH,
        registrySource: "openrouter",
        registrySyncedAt: settings.registryMeta.syncedAt || registry.syncedAt || null,
        registryLastError: settings.registryMeta.lastError || null,
        totalModels: Number(registry.total || (registry.models || []).length || 0),
      },
      constants: {
        providerIds: PROVIDER_IDS,
        providerModes: PROVIDER_MODES,
        modelRoles: MODEL_ROLES,
        modelCapabilities: MODEL_CAPABILITIES,
      },
      // PATCH 026A.0 — Autonomous Designer feature flags, default off (see
      // ai/designer/feature-flags.mjs). Informative for the frontend only —
      // the frontend keeps its own hard gate constant and must AND the two
      // together, mirroring the ALLOW_BULK_UPDATE convention.
      flags: getDesignerFeatureFlags(),
    };
  }

  async function getHealthSummary() {
    const settings = await loadSettingsRaw();
    const configuredProviders = PROVIDER_IDS.filter((providerId) => Boolean(settings.providers?.[providerId]?.apiKey));
    return {
      configuredProviders,
      settingsPath: SETTINGS_PATH,
      registrySyncedAt: settings.registryMeta.syncedAt || null,
      providerMode: settings.providerMode,
    };
  }

  function findModelById(models, modelId) {
    return (models || []).find((model) => model.id === modelId) || null;
  }

  function validateAssignment(models, providerId, modelId) {
    const provider = normalizeProviderId(providerId);
    const roleModelId = String(modelId || "").trim();
    if (!provider) throw makeConfigError("invalid_provider_id", "Unknown provider id.", 400);
    if (!roleModelId) throw makeConfigError("missing_model_id", "modelId is required.", 400);

    const model = findModelById(models, roleModelId);
    if (!model) throw makeConfigError("model_not_found", "Selected model is not present in the NOFIDA model library.", 404);
    if (!model.compatibleProviders.includes(provider)) {
      throw makeConfigError("model_provider_mismatch", `Model ${roleModelId} is not compatible with ${PROVIDER_DEFS[provider].label}.`, 400);
    }
    return model;
  }

  async function setProviderMode(mode) {
    const normalized = normalizeProviderMode(mode);
    if (!normalized) throw makeConfigError("invalid_provider_mode", "Unknown provider mode.", 400);
    const settings = await updateSettings((draft) => {
      draft.providerMode = normalized;
      return draft;
    });
    const registry = await getModelRegistry();
    return {
      providerMode: settings.providerMode,
      providers: PROVIDER_IDS.map((providerId) => sanitizeProviderRecord(settings.providers[providerId])),
      modelAssignments: sanitizeAssignmentMap(settings.modelAssignments, registry.models || []),
      engine: settings.engine,
    };
  }

  async function saveProviderKey(payload) {
    const providerId = normalizeProviderId(payload?.providerId);
    if (!providerId) throw makeConfigError("invalid_provider_id", "providerId is required.", 400);

    const def = PROVIDER_DEFS[providerId];
    const nextBaseUrl = normalizeBaseUrl(payload?.baseUrl);
    const keepExistingKey = payload?.keepExistingKey === true;
    const incomingKey = String(payload?.apiKey || "").trim();

    const settings = await updateSettings((draft) => {
      const record = draft.providers[providerId] || createDefaultProviderRecord(providerId);
      const resolvedBaseUrl = nextBaseUrl || record.baseUrl || def.defaultBaseUrl || "";
      const apiKey = incomingKey || ((keepExistingKey || !incomingKey) ? record.apiKey : "");

      if (!apiKey && !record.apiKey) {
        throw makeConfigError("missing_api_key", `Enter an API key for ${def.label}.`, 400);
      }

      if (def.requiresBaseUrl && !resolvedBaseUrl) {
        throw makeConfigError("missing_base_url", `Base URL is required for ${def.label}.`, 400);
      }

      draft.providers[providerId] = {
        ...record,
        providerId,
        label: def.label,
        mode: record.mode,
        apiKey,
        baseUrl: resolvedBaseUrl,
        status: "saved",
        lastError: null,
        lastTestedAt: record.lastTestedAt,
        lastTestLatencyMs: record.lastTestLatencyMs,
        updatedAt: nowIso(),
      };
      return draft;
    });

    return sanitizeProviderRecord(settings.providers[providerId]);
  }

  async function deleteProviderKey(providerId) {
    const normalized = normalizeProviderId(providerId);
    if (!normalized) throw makeConfigError("invalid_provider_id", "providerId is required.", 400);

    const settings = await updateSettings((draft) => {
      const record = draft.providers[normalized] || createDefaultProviderRecord(normalized);
      draft.providers[normalized] = {
        ...record,
        apiKey: "",
        status: "not_configured",
        lastError: null,
        lastTestLatencyMs: null,
        updatedAt: nowIso(),
      };
      return draft;
    });

    return sanitizeProviderRecord(settings.providers[normalized]);
  }

  async function setModelAssignment(payload) {
    const role = normalizeRole(payload?.role);
    const clear = payload?.clear === true || payload?.modelId === null;
    if (!role) throw makeConfigError("invalid_role", "role is required.", 400);

    const registry = await getModelRegistry();
    const settings = await updateSettings((draft) => {
      if (clear) {
        delete draft.modelAssignments[role];
        return draft;
      }

      const providerId = normalizeProviderId(payload?.providerId);
      if (!providerId) throw makeConfigError("invalid_provider_id", "providerId is required.", 400);
      validateAssignment(registry.models || [], providerId, payload?.modelId);

      draft.modelAssignments[role] = {
        role,
        providerId,
        modelId: String(payload.modelId).trim(),
      };
      return draft;
    });

    return sanitizeAssignmentMap(settings.modelAssignments, registry.models || []);
  }

  async function setEngine(payload) {
    const registry = await getModelRegistry();
    const settings = await updateSettings((draft) => {
      draft.engine.temperature = parseNumber(payload?.temperature, draft.engine.temperature, 0, 2);
      draft.engine.maxTokens = parseNumber(payload?.maxTokens, draft.engine.maxTokens, 64, 65536);
      draft.engine.timeoutMs = parseNumber(payload?.timeoutMs, draft.engine.timeoutMs, 5000, 120000);
      draft.engine.retries = parseNumber(payload?.retries, draft.engine.retries, 0, 5);

      if (Array.isArray(payload?.fallbackModelOrder)) {
        const nextFallbacks = [];
        for (const assignment of payload.fallbackModelOrder) {
          const providerId = normalizeProviderId(assignment?.providerId);
          const modelId = String(assignment?.modelId || "").trim();
          if (!providerId || !modelId) continue;
          validateAssignment(registry.models || [], providerId, modelId);
          nextFallbacks.push({ providerId, modelId });
        }
        draft.engine.fallbackModelOrder = nextFallbacks;
      }

      return draft;
    });

    return {
      temperature: settings.engine.temperature,
      maxTokens: settings.engine.maxTokens,
      timeoutMs: settings.engine.timeoutMs,
      retries: settings.engine.retries,
      fallbackModelOrder: sanitizeFallbackOrder(settings.engine.fallbackModelOrder || [], registry.models || []),
    };
  }

  function getProviderRuntime(settings, providerId, overrides = undefined) {
    const normalized = normalizeProviderId(providerId);
    if (!normalized) throw makeConfigError("invalid_provider_id", "Unknown provider id.", 400);
    const def = PROVIDER_DEFS[normalized];
    const record = settings.providers?.[normalized] || createDefaultProviderRecord(normalized);
    const runtime = {
      providerId: normalized,
      label: def.label,
      adapter: def.adapter,
      apiKey: String(overrides?.apiKey ?? record.apiKey ?? "").trim(),
      baseUrl: normalizeBaseUrl(overrides?.baseUrl ?? record.baseUrl ?? def.defaultBaseUrl ?? ""),
      temperature: settings.engine.temperature,
      maxTokens: settings.engine.maxTokens,
      timeoutMs: settings.engine.timeoutMs,
      retries: settings.engine.retries,
    };

    if (!runtime.apiKey) {
      throw makeConfigError(
        "missing_provider_key",
        `No API key configured for ${def.label}. Open Settings → API Configuration.`,
        409,
        { providerId: normalized },
      );
    }

    if (def.requiresBaseUrl && !runtime.baseUrl) {
      throw makeConfigError(
        "missing_base_url",
        `Base URL is required for ${def.label}. Open Settings → API Configuration.`,
        409,
        { providerId: normalized },
      );
    }

    return runtime;
  }

  function getProviderModelId(providerId, modelId) {
    const normalized = normalizeProviderId(providerId);
    const raw = String(modelId || "").replace(/^~/, "").trim();
    if (!normalized) return raw;
    if (normalized === "openrouter" || normalized === "openai_compatible" || normalized === "custom") return raw;
    const slashIndex = raw.indexOf("/");
    return slashIndex >= 0 ? raw.slice(slashIndex + 1) : raw;
  }

  function resolveModelForProvider(providerId, registryModels) {
    const model = pickCheapestModel(registryModels, providerId);
    if (!model) {
      throw makeConfigError("missing_model_assignment", "No model assigned. Open Settings → Model Library.", 409);
    }
    return model;
  }

  async function runProviderTest({ providerId, apiKey, baseUrl, modelId, persistStatus }) {
    const settings = await loadSettingsRaw();
    const registry = await getModelRegistry();
    const runtime = getProviderRuntime(settings, providerId, { apiKey, baseUrl });
    const model = modelId
      ? validateAssignment(registry.models || [], runtime.providerId, modelId)
      : resolveModelForProvider(runtime.providerId, registry.models || []);

    const started = Date.now();
    try {
      const answer = await invokeProvider({
        runtime,
        modelId: model.id,
        message: "Reply with OK",
        systemPrompt: "Reply with OK and nothing else.",
        maxTokens: 16,
        temperature: 0,
        timeoutMs: PROVIDER_TEST_TIMEOUT_MS,
      });
      const latencyMs = Date.now() - started;

      if (persistStatus) {
        await updateSettings((draft) => {
          const record = draft.providers[runtime.providerId];
          record.status = "test_passed";
          record.lastError = null;
          record.lastTestedAt = nowIso();
          record.lastTestLatencyMs = latencyMs;
          return draft;
        });
      }

      return {
        providerId: runtime.providerId,
        providerLabel: PROVIDER_DEFS[runtime.providerId].label,
        modelId: model.id,
        modelLabel: model.displayName,
        status: "test_passed",
        latencyMs,
        message: answer.trim() || "OK",
      };
    } catch (error) {
      const latencyMs = Date.now() - started;
      const safeMessage = sanitizeText(error.message);
      if (persistStatus) {
        await updateSettings((draft) => {
          const record = draft.providers[runtime.providerId];
          record.status = "test_failed";
          record.lastError = safeMessage;
          record.lastTestedAt = nowIso();
          record.lastTestLatencyMs = latencyMs;
          return draft;
        });
      }
      return {
        providerId: runtime.providerId,
        providerLabel: PROVIDER_DEFS[runtime.providerId].label,
        modelId: model.id,
        modelLabel: model.displayName,
        status: "test_failed",
        latencyMs,
        message: safeMessage,
      };
    }
  }

  async function testProvider(payload) {
    const providerId = normalizeProviderId(payload?.providerId);
    if (!providerId) throw makeConfigError("invalid_provider_id", "providerId is required.", 400);
    return runProviderTest({
      providerId,
      apiKey: payload?.apiKey,
      baseUrl: payload?.baseUrl,
      modelId: payload?.modelId,
      persistStatus: payload?.persistStatus === true,
    });
  }

  async function testModel(payload) {
    const providerId = normalizeProviderId(payload?.providerId);
    const modelId = String(payload?.modelId || "").trim();
    if (!providerId) throw makeConfigError("invalid_provider_id", "providerId is required.", 400);
    if (!modelId) throw makeConfigError("missing_model_id", "modelId is required.", 400);

    const settings = await loadSettingsRaw();
    const registry = await getModelRegistry();
    const model = validateAssignment(registry.models || [], providerId, modelId);
    const runtime = getProviderRuntime(settings, providerId);

    const started = Date.now();
    try {
      const answer = await invokeProvider({
        runtime,
        modelId: model.id,
        message: "Reply with OK",
        systemPrompt: "Reply with OK and nothing else.",
        maxTokens: 16,
        temperature: 0,
        timeoutMs: MODEL_TEST_TIMEOUT_MS,
      });
      return {
        providerId,
        providerLabel: PROVIDER_DEFS[providerId].label,
        modelId: model.id,
        modelLabel: model.displayName,
        status: "test_passed",
        latencyMs: Date.now() - started,
        message: answer.trim() || "OK",
      };
    } catch (error) {
      return {
        providerId,
        providerLabel: PROVIDER_DEFS[providerId].label,
        modelId: model.id,
        modelLabel: model.displayName,
        status: "test_failed",
        latencyMs: Date.now() - started,
        message: sanitizeText(error.message),
      };
    }
  }

  async function resolveModelForRole(role) {
    const settings = await loadSettingsRaw();
    const registry = await getModelRegistry();
    const registryModels = registry.models || [];
    const normalizedRole = normalizeRole(role) || "default";
    const effectiveRole = settings.providerMode === "single_default" ? "default" : normalizedRole;

    const exactAssignment = settings.modelAssignments?.[effectiveRole];
    if (exactAssignment) {
      const model = validateAssignment(registryModels, exactAssignment.providerId, exactAssignment.modelId);
      getProviderRuntime(settings, exactAssignment.providerId);
      return {
        source: "role_assignment",
        role: effectiveRole,
        providerId: exactAssignment.providerId,
        providerLabel: PROVIDER_DEFS[exactAssignment.providerId].label,
        modelId: model.id,
        modelLabel: model.displayName,
        // PATCH 026A.7 — capability routing (see visual-critic.mjs): the
        // resolved model's own registry capabilities (from hasCapability()
        // above), not re-derived by the caller.
        capabilities: Array.isArray(model.capabilities) ? model.capabilities : [],
      };
    }

    const defaultAssignment = settings.modelAssignments?.default;
    if (defaultAssignment) {
      const model = validateAssignment(registryModels, defaultAssignment.providerId, defaultAssignment.modelId);
      getProviderRuntime(settings, defaultAssignment.providerId);
      return {
        source: "default_assignment",
        role: "default",
        providerId: defaultAssignment.providerId,
        providerLabel: PROVIDER_DEFS[defaultAssignment.providerId].label,
        modelId: model.id,
        modelLabel: model.displayName,
        capabilities: Array.isArray(model.capabilities) ? model.capabilities : [],
      };
    }

    let anyProviderHasKey = false;
    for (const providerId of PROVIDER_IDS) {
      const record = settings.providers?.[providerId];
      if (!record?.apiKey) continue;
      anyProviderHasKey = true;
      const model = pickCheapestModel(registryModels, providerId);
      if (!model) continue;
      getProviderRuntime(settings, providerId);
      return {
        source: "first_configured_valid_model",
        role: effectiveRole,
        providerId,
        providerLabel: PROVIDER_DEFS[providerId].label,
        modelId: model.id,
        modelLabel: model.displayName,
        capabilities: Array.isArray(model.capabilities) ? model.capabilities : [],
      };
    }

    if (!anyProviderHasKey) {
      throw makeConfigError(
        "missing_provider_key",
        "No AI provider configured. Open Account → NOFIDA AI → API Configuration.",
        409,
      );
    }
    throw makeConfigError("missing_model_assignment", "No model assigned. Open Settings → Model Library.", 409);
  }

  async function invokeProvider({ runtime, modelId, message, systemPrompt, history, maxTokens, temperature, timeoutMs }) {
    const payload = {
      apiKey: runtime.apiKey,
      baseUrl: runtime.baseUrl,
      model: getProviderModelId(runtime.providerId, modelId),
      providerId: runtime.providerId,
      message,
      systemPrompt,
      history,
      maxTokens,
      temperature,
      timeoutMs,
    };

    if (runtime.adapter === "anthropic") return callAnthropic(payload);
    if (runtime.adapter === "gemini") return callGemini(payload);
    return callOpenAICompatible(payload);
  }

  async function callWithResolvedModel({ resolved, message, systemPrompt, history }) {
    const settings = await loadSettingsRaw();
    const registry = await getModelRegistry();
    const primaryRuntime = getProviderRuntime(settings, resolved.providerId);
    const fallbacks = Array.isArray(settings.engine.fallbackModelOrder) ? settings.engine.fallbackModelOrder : [];
    const attempts = [
      { providerId: resolved.providerId, modelId: resolved.modelId },
      ...fallbacks,
    ];
    const seen = new Set();
    let lastError = null;

    for (const attempt of attempts) {
      const providerId = normalizeProviderId(attempt?.providerId);
      const modelId = String(attempt?.modelId || "").trim();
      if (!providerId || !modelId) continue;
      const key = `${providerId}::${modelId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      try {
        const runtime = providerId === primaryRuntime.providerId
          ? primaryRuntime
          : getProviderRuntime(settings, providerId);
        validateAssignment(registry.models || [], providerId, modelId);

        for (let retryIndex = 0; retryIndex <= settings.engine.retries; retryIndex += 1) {
          try {
            const answer = await invokeProvider({
              runtime,
              modelId,
              message,
              systemPrompt,
              history,
              maxTokens: settings.engine.maxTokens,
              temperature: settings.engine.temperature,
              timeoutMs: settings.engine.timeoutMs,
            });

            return {
              answer,
              providerId,
              providerLabel: PROVIDER_DEFS[providerId].label,
              modelId,
            };
          } catch (error) {
            lastError = error;
            log("WARN", "ai/provider-attempt-failed", {
              provider: providerId,
              model: modelId,
              retry: retryIndex,
              message: sanitizeText(error.message),
            });
          }
        }
      } catch (error) {
        lastError = error;
        log("WARN", "ai/provider-attempt-skipped", {
          provider: providerId,
          model: modelId,
          message: sanitizeText(error.message),
        });
      }
    }

    throw lastError || makeConfigError("ai_error", "AI provider error. Check server configuration.", 502);
  }

  return {
    getSettingsView,
    getHealthSummary,
    getModelRegistry,
    setProviderMode,
    saveProviderKey,
    deleteProviderKey,
    setModelAssignment,
    setEngine,
    testProvider,
    testModel,
    resolveModelForRole,
    callWithResolvedModel,
    sanitizeText,
  };
}
