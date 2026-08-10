/* WTT desktop ASR worker. Audio and inference never leave the browser. */
"use strict";

self.window = self;

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@siteed/sherpa-onnx.rn@1.3.1/wasm/";
const CACHE_NAME = "wtt-speech-models-v1";
let runtimePromise = null;
let recognizer = null;
let stream = null;
let initializedModel = "";
let activeObjectUrls = [];
const validatedBlobs = new Map();

function post(state, extra) {
  self.postMessage(Object.assign({ state }, extra || {}));
}

async function sha256(blob) {
  const digest = await self.crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

async function cachedResponse(cache, file) {
  const validated = validatedBlobs.get(file.url);
  if (validated) return validated;
  const response = await cache.match(file.url);
  if (!response) return null;
  const blob = await response.blob();
  if (blob.size !== file.size) {
    await cache.delete(file.url);
    return null;
  }
  if (
    (await sha256(blob)).toLowerCase() !== String(file.sha256).toLowerCase()
  ) {
    await cache.delete(file.url);
    return null;
  }
  validatedBlobs.set(file.url, blob);
  return blob;
}

async function modelIsCached(files) {
  if (!("caches" in self)) return false;
  const cache = await caches.open(CACHE_NAME);
  const checks = await Promise.all(
    files.map((file) => cachedResponse(cache, file)),
  );
  return checks.every(Boolean);
}

async function downloadFile(cache, file, fileIndex, fileCount, aggregate) {
  const cached = await cachedResponse(cache, file);
  if (cached) {
    aggregate.loaded[fileIndex] = file.size;
    return cached;
  }

  const response = await fetch(file.url, { cache: "no-store" });
  if (!response.ok)
    throw new Error(`Speech model download failed: HTTP ${response.status}`);
  const reader = response.body && response.body.getReader();
  let blob;
  if (!reader) {
    blob = await response.blob();
    aggregate.loaded[fileIndex] = blob.size;
  } else {
    const chunks = [];
    let received = 0;
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(result.value);
      received += result.value.byteLength;
      aggregate.loaded[fileIndex] = received;
      const downloadedBytes = aggregate.loaded.reduce(
        (total, value) => total + value,
        0,
      );
      if (!aggregate.silent) {
        post("downloading", {
          model: "asr",
          downloadedBytes,
          totalBytes: aggregate.total,
          progress: Math.min(1, downloadedBytes / aggregate.total),
          fileIndex: fileIndex + 1,
          fileCount,
        });
      }
    }
    blob = new Blob(chunks, { type: "application/octet-stream" });
  }

  if (blob.size !== file.size)
    throw new Error(`Speech model size mismatch: ${file.path}`);
  if (
    (await sha256(blob)).toLowerCase() !== String(file.sha256).toLowerCase()
  ) {
    throw new Error(`Speech model checksum mismatch: ${file.path}`);
  }
  await cache.put(
    file.url,
    new Response(blob, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    }),
  );
  validatedBlobs.set(file.url, blob);
  aggregate.loaded[fileIndex] = file.size;
  return blob;
}

async function modelObjectUrls(files) {
  if (!("caches" in self))
    throw new Error("Browser model cache is unavailable");
  const cache = await caches.open(CACHE_NAME);
  const aggregate = {
    loaded: files.map(() => 0),
    total: files.reduce((total, file) => total + file.size, 0),
  };
  const blobs = await Promise.all(
    files.map((file, index) =>
      downloadFile(cache, file, index, files.length, aggregate),
    ),
  );
  return blobs.map((blob) => URL.createObjectURL(blob));
}

async function prefetch(message) {
  const files = Array.isArray(message.files) ? message.files : [];
  if (!files.length) throw new Error("Speech model manifest is empty");
  if (!(await modelIsCached(files))) {
    if (!("caches" in self))
      throw new Error("Browser model cache is unavailable");
    const cache = await caches.open(CACHE_NAME);
    const aggregate = {
      loaded: files.map(() => 0),
      total: files.reduce((total, file) => total + file.size, 0),
      silent: true,
    };
    await Promise.all(
      files.map((file, index) =>
        downloadFile(cache, file, index, files.length, aggregate),
      ),
    );
  }
  post("cached", { model: "asr" });
}

function waitForRuntime() {
  if (runtimePromise) return runtimePromise;
  runtimePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Speech WASM initialization timed out")),
      60_000,
    );
    let completed = false;
    self.Module = self.Module || {};
    self.Module.locateFile = (file) => WASM_BASE + file;
    const previous = self.Module.onRuntimeInitialized;
    const complete = () => {
      if (completed) return;
      completed = true;
      if (previous) previous();
      try {
        importScripts(WASM_BASE + "sherpa-onnx-core.js");
        importScripts(WASM_BASE + "sherpa-onnx-asr.js");
        clearTimeout(timeout);
        resolve();
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    self.Module.onRuntimeInitialized = complete;
    try {
      importScripts(WASM_BASE + "sherpa-onnx-wasm-combined.js");
      if (self.Module.calledRun) complete();
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  }).catch((error) => {
    runtimePromise = null;
    throw error;
  });
  return runtimePromise;
}

async function initialize(message) {
  const files = Array.isArray(message.files) ? message.files : [];
  const modelId = String(message.modelId || "wtt-paraformer");
  if (!files.length) throw new Error("Speech model manifest is empty");
  if (recognizer && initializedModel === modelId) {
    post("ready", { model: "asr" });
    return;
  }
  if (!(await modelIsCached(files)) && !message.allowDownload) {
    post("model-required", {
      model: "asr",
      totalBytes: files.reduce(
        (total, file) => total + Number(file.size || 0),
        0,
      ),
    });
    return;
  }

  post("initializing", { model: "asr" });
  await waitForRuntime();
  const urls = await modelObjectUrls(files);
  activeObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  activeObjectUrls = urls;
  if (stream) stream.free();
  if (recognizer) recognizer.free();
  const byPath = Object.fromEntries(
    files.map((file, index) => [file.path, urls[index]]),
  );
  const loadedModel = await self.SherpaOnnx.ASR.loadModel({
    type: "paraformer",
    modelDir: "/wtt-asr",
    encoder: byPath["encoder.onnx"],
    decoder: byPath["decoder.onnx"],
    tokens: byPath["tokens.txt"],
    debug: 0,
  });
  recognizer = self.SherpaOnnx.ASR.createOnlineRecognizer(loadedModel, {
    sampleRate: 16000,
    numThreads: 1,
    debug: 0,
    decodingMethod: "greedy_search",
    maxActivePaths: 4,
    enableEndpoint: 1,
    rule1MinTrailingSilence: 2.4,
    rule2MinTrailingSilence: 1.2,
    rule3MinUtteranceLength: 20,
  });
  if (!recognizer || !recognizer.handle)
    throw new Error("Failed to initialize speech recognizer");
  stream = recognizer.createStream();
  initializedModel = modelId;
  post("ready", { model: "asr" });
}

function resetStream() {
  if (!recognizer) return;
  if (stream) stream.free();
  stream = recognizer.createStream();
}

function accept(samples) {
  if (!recognizer || !stream) return;
  const chunk =
    samples instanceof Float32Array ? samples : new Float32Array(samples);
  stream.acceptWaveform(16000, chunk);
  while (recognizer.isReady(stream)) recognizer.decode(stream);
  const result = recognizer.getResult(stream);
  post("partial", { text: String(result.text || "") });
  if (recognizer.isEndpoint(stream)) post("endpoint");
}

function finish() {
  if (!recognizer || !stream) return post("final", { text: "" });
  stream.inputFinished();
  while (recognizer.isReady(stream)) recognizer.decode(stream);
  const result = recognizer.getResult(stream);
  post("final", { text: String(result.text || "") });
  resetStream();
}

self.onmessage = async (event) => {
  const message = event.data || {};
  try {
    if (message.type === "prefetch") await prefetch(message);
    else if (message.type === "init") await initialize(message);
    else if (message.type === "start") resetStream();
    else if (message.type === "audio") accept(message.samples);
    else if (message.type === "finish") finish();
    else if (message.type === "cancel") {
      resetStream();
      post("cancelled");
    }
  } catch (error) {
    post("error", {
      error: error && error.message ? error.message : String(error),
    });
  }
};
