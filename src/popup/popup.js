const SETTINGS_KEY = "translationSettings";
const PRESETS = {
  openai: {
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-5.6-luna"
  },
  deepseek: {
    endpoint: "https://api.deepseek.com/chat/completions",
    model: "deepseek-v4-flash"
  },
  anthropic: {
    endpoint: "https://api.anthropic.com/v1/messages",
    model: "claude-sonnet-4-6"
  },
  gemini: {
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-3.6-flash"
  }
};

const DEFAULTS = {
  protocol: "openai",
  ...PRESETS.openai,
  apiKey: "",
  sourceLanguage: "auto",
  targetLanguage: "zh-CN",
  concurrency: 2,
  batchChars: 2500,
  batchItems: 20
};

const fields = Object.fromEntries(
  [
    "protocol",
    "endpoint",
    "model",
    "apiKey",
    "sourceLanguage",
    "targetLanguage",
    "concurrency",
    "batchChars",
    "batchItems"
  ].map((id) => [id, document.getElementById(id)])
);
const message = document.getElementById("message");
const progress = document.getElementById("progress");
const statusBadge = document.getElementById("statusBadge");
const modelSettings = document.getElementById("modelSettings");
const modelSummary = document.getElementById("modelSummary");
const manualInput = document.getElementById("manualInput");
const manualWordCount = document.getElementById("manualWordCount");
const manualTranslateButton = document.getElementById("manualTranslateButton");
const manualMessage = document.getElementById("manualMessage");
const manualResult = document.getElementById("manualResult");
const manualTranslation = document.getElementById("manualTranslation");
const manualPronunciationRow = document.getElementById("manualPronunciationRow");
const manualPronunciation = document.getElementById("manualPronunciation");
const translateButton = document.getElementById("translateButton");
const testButton = document.getElementById("testButton");
const stopButton = document.getElementById("stopButton");
const restoreButton = document.getElementById("restoreButton");

let previousProtocol = DEFAULTS.protocol;
let pollTimer;
let popupBusy = false;

initialize();

async function initialize() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = { ...DEFAULTS, ...stored[SETTINGS_KEY] };
  fillForm(settings);
  previousProtocol = fields.protocol.value;
  modelSettings.open = !settings.apiKey;
  updateModelSummary();
  updateManualInputState();
  await refreshStatus();
  pollTimer = setInterval(refreshStatus, 700);
}

fields.protocol.addEventListener("change", () => {
  const oldPreset = PRESETS[previousProtocol];
  const nextPreset = PRESETS[fields.protocol.value];
  fields.apiKey.value = "";
  if (!fields.endpoint.value || fields.endpoint.value === oldPreset.endpoint) {
    fields.endpoint.value = nextPreset.endpoint;
  }
  if (!fields.model.value || fields.model.value === oldPreset.model) {
    fields.model.value = nextPreset.model;
  }
  previousProtocol = fields.protocol.value;
  updateModelSummary();
});

fields.model.addEventListener("input", updateModelSummary);
manualInput.addEventListener("input", () => {
  manualResult.hidden = true;
  showManualMessage("");
  updateManualInputState();
});

manualTranslateButton.addEventListener("click", async () => {
  const text = manualInput.value.trim();
  const wordCount = countWords(text);
  if (!text || wordCount === 0) {
    showManualMessage("请输入需要翻译的单词或文本", true);
    return;
  }
  if (wordCount > 50) {
    showManualMessage("最多只能输入 50 个单词", true);
    return;
  }

  setBusy(true);
  manualResult.hidden = true;
  showManualMessage("正在翻译…");

  try {
    const settings = readForm();
    validate(settings);
    await ensureEndpointPermission(settings.endpoint);
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });

    const result = await chrome.runtime.sendMessage({ type: "TRANSLATE_MANUAL", text });
    if (!result?.ok) throw new Error(result?.error || "主动翻译失败");

    manualTranslation.textContent = result.translation;
    manualPronunciation.textContent = result.pronunciation || "";
    manualPronunciationRow.hidden = !result.pronunciation;
    manualResult.hidden = false;
    modelSettings.open = false;
    showManualMessage("翻译完成", false, true);
  } catch (error) {
    modelSettings.open = true;
    showManualMessage(readableError(error), true);
  } finally {
    setBusy(false);
  }
});

translateButton.addEventListener("click", async () => {
  setBusy(true);
  showMessage("正在保存配置…");

  try {
    const settings = readForm();
    validate(settings);
    await ensureEndpointPermission(settings.endpoint);
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    await sendToActiveTab({ type: "START_TRANSLATION", options: settings });
    modelSettings.open = false;
    showMessage("翻译已开始，关闭面板后仍会继续");
    await refreshStatus();
  } catch (error) {
    showMessage(readableError(error), true);
  } finally {
    setBusy(false);
  }
});

testButton.addEventListener("click", async () => {
  setBusy(true);
  showMessage("正在发送测试请求…");

  try {
    const settings = readForm();
    validate(settings);
    await ensureEndpointPermission(settings.endpoint);
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });

    const result = await chrome.runtime.sendMessage({ type: "TEST_CONNECTION" });
    if (!result?.ok) throw new Error(result?.error || "连接测试失败");

    modelSettings.open = false;
    showMessage(`连接成功，耗时 ${result.latencyMs} ms，返回：${result.sample}`, false, true);
  } catch (error) {
    showMessage(readableError(error), true);
  } finally {
    setBusy(false);
  }
});

stopButton.addEventListener("click", async () => {
  try {
    await sendToActiveTab({ type: "STOP_TRANSLATION" });
    await refreshStatus();
  } catch (error) {
    showMessage(readableError(error), true);
  }
});

restoreButton.addEventListener("click", async () => {
  try {
    await sendToActiveTab({ type: "RESTORE_TRANSLATION" });
    await refreshStatus();
  } catch (error) {
    showMessage(readableError(error), true);
  }
});

chrome.runtime.onMessage.addListener((event) => {
  if (event?.type === "TRANSLATION_STATUS") updateStatus(event.status);
});

window.addEventListener("unload", () => clearInterval(pollTimer));

function fillForm(settings) {
  for (const [name, input] of Object.entries(fields)) {
    input.value = settings[name] ?? "";
  }
}

function updateModelSummary() {
  const protocolLabel = fields.protocol.selectedOptions[0]?.textContent || "模型配置";
  const model = fields.model.value.trim();
  modelSummary.textContent = model ? `${protocolLabel} · ${model}` : protocolLabel;
}

function readForm() {
  return {
    protocol: fields.protocol.value,
    endpoint: fields.endpoint.value.trim().replace(/\/$/, ""),
    model: fields.model.value.trim(),
    apiKey: fields.apiKey.value.trim(),
    sourceLanguage: fields.sourceLanguage.value,
    targetLanguage: fields.targetLanguage.value,
    concurrency: clamp(fields.concurrency.value, 1, 4, 2),
    batchChars: clamp(fields.batchChars.value, 500, 8000, 2500),
    batchItems: clamp(fields.batchItems.value, 5, 50, 20)
  };
}

function validate(settings) {
  let url;
  try {
    url = new URL(settings.endpoint);
  } catch {
    throw new Error("API 地址格式不正确");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("API 地址必须使用 http 或 https");
  }
  if (!settings.model) throw new Error("请输入模型名称");
  if (settings.protocol !== "openai" && !settings.apiKey) throw new Error("请输入 API Key");
}

async function ensureEndpointPermission(endpoint) {
  const url = new URL(endpoint);
  const origin = `${url.protocol}//${url.host}/*`;
  const accepted = await chrome.permissions.request({ origins: [origin] });
  if (!accepted) throw new Error("需要授权访问该 API 地址才能发送翻译请求");
}

async function refreshStatus() {
  try {
    const response = await sendToActiveTab({ type: "GET_TRANSLATION_STATUS" });
    updateStatus(response.status);
  } catch {
    updateStatus({ phase: "idle", total: 0, completed: 0, failed: 0 });
  }
}

function updateStatus(status = {}) {
  const labels = {
    idle: ["待命", "idle"],
    scanning: ["扫描中", "active"],
    translating: ["翻译中", "active"],
    watching: ["已完成", "success"],
    stopped: ["已停止", "idle"],
    error: ["出错", "error"]
  };
  const [label, tone] = labels[status.phase] || labels.idle;
  statusBadge.textContent = label;
  statusBadge.dataset.tone = tone;

  if (status.total) {
    const failed = status.failed ? `，失败 ${status.failed}` : "";
    progress.textContent = `已翻译 ${status.completed || 0} / ${status.total}${failed}`;
  } else {
    progress.textContent = status.phase === "idle" ? "尚未开始" : label;
  }

  if (status.error) showMessage(status.error, true);
}

async function sendToActiveTab(messageToSend) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/i.test(tab.url || "")) {
    throw new Error("此页面不允许扩展翻译，请打开普通网页后重试");
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, messageToSend);
  } catch {
    if (messageToSend.type !== "START_TRANSLATION") {
      return { ok: true, status: { phase: "idle", total: 0, completed: 0, failed: 0 } };
    }

    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["src/content.css"]
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/content.js"]
      });
      return await chrome.tabs.sendMessage(tab.id, messageToSend);
    } catch {
      throw new Error("无法注入当前页面，请刷新网页后重试");
    }
  }
}

function setBusy(busy) {
  popupBusy = busy;
  translateButton.disabled = busy;
  testButton.disabled = busy;
  updateManualInputState();
}

function showMessage(text, isError = false, isSuccess = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
  message.classList.toggle("success", isSuccess);
}

function showManualMessage(text, isError = false, isSuccess = false) {
  manualMessage.textContent = text;
  manualMessage.classList.toggle("error", isError);
  manualMessage.classList.toggle("success", isSuccess);
}

function updateManualInputState() {
  const wordCount = countWords(manualInput.value);
  const tooLong = wordCount > 50;
  manualWordCount.textContent = `${wordCount} / 50 单词`;
  manualWordCount.dataset.tone = tooLong ? "error" : "normal";
  manualTranslateButton.disabled = popupBusy || wordCount === 0 || tooLong;
  if (tooLong) showManualMessage("最多只能输入 50 个单词", true);
}

function countWords(text) {
  if (!text?.trim()) return 0;
  if (typeof Intl?.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
    return [...segmenter.segment(text)].filter((segment) => segment.isWordLike).length;
  }
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function readableError(error) {
  return error instanceof Error ? error.message : String(error || "未知错误");
}
