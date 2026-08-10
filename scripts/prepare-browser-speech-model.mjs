import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(rootDir, "lib/speech/model-manifest.ts");
const cacheRoot = path.resolve(
  process.env.WTT_SPEECH_MODEL_CACHE || path.join(os.homedir(), ".cache/wtt-speech-models"),
);

function loadModel() {
  const source = fs.readFileSync(manifestPath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const loaded = { exports: {} };
  Function("module", "exports", compiled)(loaded, loaded.exports);
  return loaded.exports.browserAsrModel;
}

function digest(filePath) {
  const hash = crypto.createHash("sha256");
  const handle = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(handle, buffer, 0, buffer.length, null);
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    fs.closeSync(handle);
  }
  return hash.digest("hex");
}

function isValid(filePath, file) {
  try {
    return fs.statSync(filePath).size === file.size && digest(filePath) === file.sha256.toLowerCase();
  } catch {
    return false;
  }
}

function download(file, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.download`;
  fs.rmSync(temporary, { force: true });
  const result = spawnSync(
    "curl",
    [
      "--fail",
      "--location",
      "--retry",
      "5",
      "--retry-all-errors",
      "--connect-timeout",
      "20",
      "--output",
      temporary,
      file.sourceUrl,
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0 || !isValid(temporary, file)) {
    fs.rmSync(temporary, { force: true });
    throw new Error(`Failed to prepare browser speech model file: ${file.path}`);
  }
  fs.renameSync(temporary, destination);
}

const model = loadModel();
if (!model?.id || !model.files?.length) throw new Error("Browser speech model manifest is empty");

const outputRoot = path.join(rootDir, "public/speech-models", model.id);
fs.rmSync(path.join(rootDir, "public/speech-models"), { recursive: true, force: true });
for (const file of model.files) {
  const cachePath = path.join(cacheRoot, model.id, file.path);
  if (!isValid(cachePath, file)) download(file, cachePath);
  const outputPath = path.join(outputRoot, file.path);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.copyFileSync(cachePath, outputPath);
}

console.log(
  `Browser speech model prepared (${(
    model.files.reduce((total, file) => total + file.size, 0) /
    1024 /
    1024
  ).toFixed(2)} MiB)`,
);
