import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cleanSpeechText } from "../lib/speech/runtime";
import { browserAsrModel } from "../lib/speech/model-manifest";

test("speech reading removes code, tables, links, and markdown decoration", () => {
  const source = [
    "# 结论",
    "请查看 [说明](https://example.com/docs) 和 https://example.com/raw。",
    "| name | value |",
    "| --- | --- |",
    "| hidden | row |",
    "```ts",
    "const secret = true",
    "```",
    "**可以朗读的正文**",
    "[WTT_INTERNAL]",
    "private runtime metadata",
    "[/WTT_INTERNAL]",
  ].join("\n");

  const cleaned = cleanSpeechText(source);
  expect(cleaned).toContain("结论");
  expect(cleaned).toContain("说明");
  expect(cleaned).toContain("可以朗读的正文");
  expect(cleaned).not.toContain("secret");
  expect(cleaned).not.toContain("https://");
  expect(cleaned).not.toContain("|");
  expect(cleaned).not.toContain("private runtime metadata");
});

test("desktop sherpa worker recognizes speech with the pinned model locally", async ({
  page,
}) => {
  test.skip(
    process.env.WTT_SPEECH_MODEL_SMOKE !== "1",
    "Run explicitly because the pinned high-accuracy model is about 226 MiB",
  );
  test.setTimeout(240_000);
  const sampleAudio = execFileSync(
    "curl",
    [
      "--fail",
      "--location",
      "--silent",
      "--show-error",
      "--retry",
      "4",
      "--retry-all-errors",
      "https://huggingface.co/csukuangfj/sherpa-onnx-streaming-paraformer-bilingual-zh-en/resolve/8e40c43232a1c5c66c82111efc5820d3accca11b/test_wavs/0.wav",
    ],
    { maxBuffer: 1024 * 1024 },
  );
  expect(createHash("sha256").update(sampleAudio).digest("hex")).toBe(
    "7d93384ca14702cc584a7a33fe2fed92e89e708549161cb12ea38c916882103b",
  );
  await page.route("**/speech-model-test.wav", (route) =>
    route.fulfill({ body: sampleAudio, contentType: "audio/wav" }),
  );
  await page.goto("/");
  const finalText = await page.evaluate(async (model) => {
    const audioResponse = await fetch("/speech-model-test.wav");
    const audioContext = new AudioContext({ sampleRate: 16_000 });
    const decoded = await audioContext.decodeAudioData(
      await audioResponse.arrayBuffer(),
    );
    const samples = new Float32Array(decoded.getChannelData(0));
    await audioContext.close();
    const worker = new Worker("/workers/wtt-sherpa-online-worker.js");
    try {
      return await new Promise<string>((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error("Speech worker smoke timed out")),
          220_000,
        );
        worker.onerror = (event) =>
          reject(new Error(event.message || "Speech worker failed"));
        worker.onmessage = (
          event: MessageEvent<{
            state?: string;
            text?: string;
            error?: string;
          }>,
        ) => {
          if (event.data.state === "error") {
            window.clearTimeout(timeout);
            reject(new Error(event.data.error || "Speech worker failed"));
          } else if (event.data.state === "ready") {
            worker.postMessage({ type: "start" });
            worker.postMessage({ type: "audio", samples }, [samples.buffer]);
            worker.postMessage({ type: "finish" });
          } else if (event.data.state === "final") {
            window.clearTimeout(timeout);
            resolve(String(event.data.text || ""));
          }
        };
        worker.postMessage({
          type: "init",
          allowDownload: true,
          modelId: model.id,
          files: model.files,
        });
      });
    } finally {
      worker.terminate();
    }
  }, browserAsrModel);
  expect(finalText).toContain("昨天");
});

test("desktop sherpa worker supports silent model prefetch", async ({ page }) => {
  test.skip(
    process.env.WTT_SPEECH_MODEL_SMOKE !== "1",
    "Run explicitly because the pinned high-accuracy model is about 226 MiB",
  );
  test.setTimeout(180_000);
  await page.goto("/");
  const states = await page.evaluate(async (model) => {
    const worker = new Worker("/workers/wtt-sherpa-online-worker.js");
    try {
      return await new Promise<string[]>((resolve, reject) => {
        const observed: string[] = [];
        const timeout = window.setTimeout(
          () => reject(new Error("Speech model prefetch timed out")),
          160_000,
        );
        worker.onerror = (event) => reject(new Error(event.message || "Speech worker failed"));
        worker.onmessage = (event: MessageEvent<{ state?: string; error?: string }>) => {
          const state = String(event.data.state || "");
          observed.push(state);
          if (state === "error") reject(new Error(event.data.error || "Speech prefetch failed"));
          if (state === "cached") {
            window.clearTimeout(timeout);
            resolve(observed);
          }
        };
        worker.postMessage({ type: "prefetch", modelId: model.id, files: model.files });
      });
    } finally {
      worker.terminate();
    }
  }, browserAsrModel);
  expect(states).toEqual(["cached"]);
});
