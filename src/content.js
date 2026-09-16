(() => {
  const STATUS_ID = "__llm_page_translator_status";
  const EXCLUDED_SELECTOR = [
    "script",
    "style",
    "noscript",
    "template",
    "svg",
    "canvas",
    "code",
    "pre",
    "textarea",
    "input",
    "select",
    "option",
    "[contenteditable='true']",
    "[translate='no']",
    "[aria-hidden='true']",
    "[data-no-translate]",
    ".notranslate"
  ].join(",");

  const translatedRecords = new Map();
  let currentRun = null;
  let runSequence = 0;
  let statusTimer;
  let latestStatus = emptyStatus();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "START_TRANSLATION") {
      startTranslation(message.options);
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === "STOP_TRANSLATION") {
      stopTranslation();
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === "RESTORE_TRANSLATION") {
      restoreOriginalText();
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === "GET_TRANSLATION_STATUS") {
      sendResponse({ ok: true, status: latestStatus });
      return false;
    }
    return undefined;
  });

  function startTranslation(options) {
    restoreOriginalText(false);

    const run = {
      id: ++runSequence,
      options: normalizeOptions(options),
      stopped: false,
      scanning: 0,
      active: 0,
      total: 0,
      completed: 0,
      failed: 0,
      visibleQueue: [],
      deferredQueue: [],
      queuedValues: new WeakMap(),
      visibilityCache: new WeakMap(),
      jobs: new Map(),
      observer: null,
      mutationRoots: new Set(),
      mutationTimer: null,
      lastError: ""
    };

    currentRun = run;
    publishStatus(run, "scanning");
    scanRoot(document.body || document.documentElement, run);
    observePage(run);
  }

  function stopTranslation(showStatus = true) {
    const run = currentRun;
    if (!run) return;

    run.stopped = true;
    run.observer?.disconnect();
    clearTimeout(run.mutationTimer);
    currentRun = null;

    if (showStatus) {
      latestStatus = { ...statusFromRun(run), phase: "stopped" };
      renderStatus(latestStatus, "已停止翻译");
      broadcastStatus();
    }
  }

  function restoreOriginalText(showStatus = true) {
    stopTranslation(false);

    let restored = 0;
    for (const [node, record] of translatedRecords) {
      if (node.data === record.translated) {
        node.data = record.original;
        restored += 1;
      }
    }
    translatedRecords.clear();

    latestStatus = { ...emptyStatus(), phase: "idle" };
    if (showStatus) renderStatus(latestStatus, restored ? `已恢复 ${restored} 处原文` : "当前页面没有可恢复的翻译");
    broadcastStatus();
  }

  function scanRoot(root, run) {
    if (!root || run.stopped) return;
    run.scanning += 1;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return isTranslatable(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    const processSlice = (deadline) => {
      if (run.stopped) return;

      let processed = 0;
      let node;
      while ((node = walker.nextNode())) {
        enqueueNode(node, run);
        processed += 1;
        if (processed >= 350 || (deadline && deadline.timeRemaining() <= 2)) break;
      }

      pump(run);
      if (node) {
        scheduleIdle(processSlice);
      } else {
        run.scanning -= 1;
        publishStatus(run);
      }
    };

    scheduleIdle(processSlice);
  }

  function enqueueNode(node, run) {
    if (!isTranslatable(node)) return;

    const original = node.data;
    if (run.queuedValues.get(node) === original) return;

    const record = translatedRecords.get(node);
    if (record?.translated === original) return;
    if (record && original !== record.translated) translatedRecords.delete(node);

    const parts = splitOuterWhitespace(original);
    if (!parts.core) return;

    const id = `${run.id}:${run.total + 1}`;
    const job = { id, node, original, ...parts };
    run.jobs.set(id, job);
    run.queuedValues.set(node, original);
    run.total += 1;

    if (isInViewport(node.parentElement, run)) {
      run.visibleQueue.push(job);
    } else {
      run.deferredQueue.push(job);
    }
  }

  function pump(run) {
    if (run.stopped) return;

    while (run.active < run.options.concurrency) {
      const batch = takeBatch(run);
      if (!batch.length) break;
      run.active += 1;
      translateBatch(batch, run);
    }

    publishStatus(run);
  }

  function takeBatch(run) {
    const batch = [];
    let chars = 0;

    while (batch.length < run.options.batchItems) {
      const queue = run.visibleQueue.length ? run.visibleQueue : run.deferredQueue;
      const next = queue[0];
      if (!next) break;
      if (batch.length && chars + next.core.length > run.options.batchChars) break;

      queue.shift();
      batch.push(next);
      chars += next.core.length;
    }

    return batch;
  }

  async function translateBatch(batch, run) {
    try {
      const response = await sendRuntimeMessage({
        type: "TRANSLATE_BATCH",
        items: batch.map((job) => ({ id: job.id, text: job.core }))
      });

      if (!response?.ok) throw new Error(response?.error || "翻译请求失败");
      if (run.stopped) return;
      const byId = new Map(response.translations.map((item) => [String(item.id), item.text]));

      for (const job of batch) {
        const translation = byId.get(job.id);
        if (typeof translation !== "string" || !translation.trim()) {
          run.failed += 1;
          continue;
        }

        if (job.node.data !== job.original) {
          run.failed += 1;
          continue;
        }

        const translated = `${job.leading}${translation.trim()}${job.trailing}`;
        job.node.data = translated;
        translatedRecords.set(job.node, { original: job.original, translated });
        run.completed += 1;
      }
    } catch (error) {
      run.failed += batch.length;
      run.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      for (const job of batch) run.jobs.delete(job.id);
      run.active -= 1;
      pump(run);
    }
  }

  function observePage(run) {
    run.observer = new MutationObserver((mutations) => {
      if (run.stopped) return;

      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          const node = mutation.target;
          const record = translatedRecords.get(node);
          if (record?.translated === node.data) continue;
          run.mutationRoots.add(node.parentNode || node);
        } else {
          for (const node of mutation.addedNodes) run.mutationRoots.add(node);
        }
      }

      clearTimeout(run.mutationTimer);
      run.mutationTimer = setTimeout(() => flushMutationRoots(run), 250);
    });

    run.observer.observe(document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  function flushMutationRoots(run) {
    const roots = [...run.mutationRoots];
    run.mutationRoots.clear();

    for (const root of roots) {
      if (root.nodeType === Node.TEXT_NODE) enqueueNode(root, run);
      else if (root.nodeType === Node.ELEMENT_NODE && root.id !== STATUS_ID) scanRoot(root, run);
    }
    pump(run);
  }

  function isTranslatable(node) {
    if (!node?.isConnected || !node.parentElement) return false;
    const parent = node.parentElement;
    if (parent.id === STATUS_ID || parent.closest(EXCLUDED_SELECTOR)) return false;

    const text = node.data.trim();
    if (!text || text.length > 12000) return false;
    if (!/[\p{L}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text)) return false;
    if (/^(?:https?:\/\/|www\.)\S+$/i.test(text)) return false;
    if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(text)) return false;
    return true;
  }

  function splitOuterWhitespace(text) {
    const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
    return { leading: match?.[1] || "", core: match?.[2] || "", trailing: match?.[3] || "" };
  }

  function isInViewport(element, run) {
    if (!element) return false;
    if (run.visibilityCache.has(element)) return run.visibilityCache.get(element);
    const rect = element.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0 && rect.bottom >= -200 && rect.top <= innerHeight + 200;
    run.visibilityCache.set(element, visible);
    return visible;
  }

  function normalizeOptions(options = {}) {
    return {
      concurrency: clampNumber(options.concurrency, 1, 4, 2),
      batchChars: clampNumber(options.batchChars, 500, 8000, 2500),
      batchItems: clampNumber(options.batchItems, 5, 50, 20)
    };
  }

  function publishStatus(run, forcedPhase) {
    if (run.stopped) return;
    const pending = run.visibleQueue.length + run.deferredQueue.length + run.active;
    let phase = forcedPhase;
    if (!phase) {
      if (run.lastError && pending === 0 && run.scanning === 0) phase = "error";
      else if (pending > 0 || run.scanning > 0) phase = "translating";
      else phase = "watching";
    }

    latestStatus = { ...statusFromRun(run), phase };
    const message = phase === "error"
      ? run.lastError
      : phase === "watching"
        ? `翻译完成 ${run.completed}/${run.total}，正在监听页面更新`
        : `正在翻译 ${run.completed}/${run.total}`;
    renderStatus(latestStatus, message);
    broadcastStatus();
  }

  function statusFromRun(run) {
    return {
      phase: "idle",
      total: run.total,
      completed: run.completed,
      failed: run.failed,
      pending: run.visibleQueue.length + run.deferredQueue.length + run.active,
      error: run.lastError
    };
  }

  function emptyStatus() {
    return { phase: "idle", total: 0, completed: 0, failed: 0, pending: 0, error: "" };
  }

  function renderStatus(status, text) {
    let element = document.getElementById(STATUS_ID);
    if (!element) {
      element = document.createElement("div");
      element.id = STATUS_ID;
      element.dataset.noTranslate = "true";
      document.documentElement.appendChild(element);
    }

    clearTimeout(statusTimer);
    element.textContent = text;
    element.dataset.tone = status.phase === "error" ? "error" : "normal";
    element.dataset.hidden = "false";

    if (status.phase === "watching" || status.phase === "idle" || status.phase === "stopped") {
      statusTimer = setTimeout(() => {
        element.dataset.hidden = "true";
      }, 2600);
    }
  }

  function broadcastStatus() {
    chrome.runtime.sendMessage({ type: "TRANSLATION_STATUS", status: latestStatus }, () => {
      void chrome.runtime.lastError;
    });
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(response);
      });
    });
  }

  function scheduleIdle(callback) {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(callback, { timeout: 120 });
    } else {
      setTimeout(() => callback(null), 0);
    }
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }
})();
