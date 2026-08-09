"use client";

import { browserAsrModel } from "./model-manifest";

export type SpeechState =
  | "ready"
  | "model-required"
  | "downloading"
  | "initializing"
  | "listening"
  | "partial"
  | "final"
  | "cancelled"
  | "speaking"
  | "idle"
  | "error"
  | "endpoint";

export type SpeechRuntimeEvent = {
  state: SpeechState;
  model?: "asr" | "tts";
  text?: string;
  progress?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  error?: string;
};

type NativeSpeechCommand = {
  type: "wtt-speech-command";
  command:
    | "status"
    | "start-asr"
    | "stop-asr"
    | "cancel-asr"
    | "speak"
    | "stop-speaking";
  allowDownload?: boolean;
  text?: string;
};

declare global {
  interface Window {
    __WTT_NATIVE_SPEECH__?: { version: number; platform: "android" } | null;
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

const SPEECH_ENABLED = process.env.NEXT_PUBLIC_WTT_SPEECH_ENABLED !== "0";

function isMobileBrowser() {
  if (typeof navigator === "undefined") return true;
  const touchMac =
    /Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
  return (
    touchMac || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  );
}

function nativeAvailable() {
  return Boolean(window.__WTT_NATIVE_SPEECH__ && window.ReactNativeWebView);
}

function workletSource() {
  return `
    class WttPcmProcessor extends AudioWorkletProcessor {
      constructor() {
        super();
        this.pending = new Float32Array(0);
        this.position = 0;
        this.output = [];
        this.ratio = sampleRate / 16000;
      }
      process(inputs) {
        var input = inputs[0] && inputs[0][0];
        if (!input || !input.length) return true;
        var merged = new Float32Array(this.pending.length + input.length);
        merged.set(this.pending, 0);
        merged.set(input, this.pending.length);
        while (this.position + 1 < merged.length) {
          var index = Math.floor(this.position);
          var fraction = this.position - index;
          this.output.push(merged[index] * (1 - fraction) + merged[index + 1] * fraction);
          this.position += this.ratio;
        }
        var consumed = Math.floor(this.position);
        this.pending = merged.slice(consumed);
        this.position -= consumed;
        while (this.output.length >= 1600) {
          var chunk = new Float32Array(this.output.splice(0, 1600));
          this.port.postMessage(chunk, [chunk.buffer]);
        }
        return true;
      }
    }
    registerProcessor('wtt-pcm-processor', WttPcmProcessor);
  `;
}

class BrowserAsrEngine {
  private worker: Worker | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private workletUrl = "";
  private active = false;
  private starting = false;
  private finalizing = false;

  constructor(private readonly emit: (event: SpeechRuntimeEvent) => void) {}

  private ensureWorker() {
    if (this.worker) return this.worker;
    const worker = new Worker("/workers/wtt-sherpa-online-worker.js");
    worker.onmessage = (message: MessageEvent<SpeechRuntimeEvent>) => {
      const event = message.data;
      if (event.state === "ready" && this.starting) {
        void this.startCapture();
        return;
      }
      if (event.state === "endpoint" && this.active && !this.finalizing) {
        void this.stop(false);
        return;
      }
      if (
        event.state === "final" ||
        event.state === "cancelled" ||
        event.state === "error"
      ) {
        this.starting = false;
        this.finalizing = false;
      }
      this.emit(event);
      if (event.state === "final" || event.state === "cancelled")
        this.emit({ state: "idle" });
    };
    worker.onerror = (event) => {
      this.starting = false;
      this.active = false;
      this.finalizing = false;
      void this.closeAudio();
      this.emit({
        state: "error",
        model: "asr",
        error: event.message || "Speech worker failed",
      });
    };
    this.worker = worker;
    return worker;
  }

  start(allowDownload = false) {
    if (this.active || this.starting) return;
    this.starting = true;
    this.emit({ state: "initializing", model: "asr" });
    this.ensureWorker().postMessage({
      type: "init",
      allowDownload,
      modelId: browserAsrModel.id,
      files: browserAsrModel.files,
    });
  }

  retryDownload() {
    if (!this.starting) this.starting = true;
    this.ensureWorker().postMessage({
      type: "init",
      allowDownload: true,
      modelId: browserAsrModel.id,
      files: browserAsrModel.files,
    });
  }

  private async startCapture() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const AudioContextClass = window.AudioContext;
      this.audioContext = new AudioContextClass({
        sampleRate: 16_000,
        latencyHint: "interactive",
      });
      this.workletUrl = URL.createObjectURL(
        new Blob([workletSource()], { type: "application/javascript" }),
      );
      await this.audioContext.audioWorklet.addModule(this.workletUrl);
      this.sourceNode = this.audioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        "wtt-pcm-processor",
        {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        },
      );
      this.workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (!this.active || !this.worker) return;
        const samples = event.data;
        this.worker.postMessage({ type: "audio", samples }, [samples.buffer]);
      };
      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);
      this.worker?.postMessage({ type: "start" });
      this.starting = false;
      this.active = true;
      this.emit({ state: "listening", model: "asr" });
    } catch (error) {
      await this.closeAudio();
      this.starting = false;
      this.active = false;
      this.emit({
        state: "error",
        model: "asr",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async closeAudio() {
    this.workletNode?.disconnect();
    this.sourceNode?.disconnect();
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    if (this.audioContext && this.audioContext.state !== "closed")
      await this.audioContext.close();
    if (this.workletUrl) URL.revokeObjectURL(this.workletUrl);
    this.workletNode = null;
    this.sourceNode = null;
    this.mediaStream = null;
    this.audioContext = null;
    this.workletUrl = "";
  }

  async stop(cancelled: boolean) {
    if ((!this.active && !this.starting) || this.finalizing) return;
    this.finalizing = true;
    this.active = false;
    this.starting = false;
    await this.closeAudio();
    this.worker?.postMessage({ type: cancelled ? "cancel" : "finish" });
  }
}

class SpeechRuntime {
  private listeners = new Set<(event: SpeechRuntimeEvent) => void>();
  private browserAsr: BrowserAsrEngine | null = null;
  private pendingNativeCommand: NativeSpeechCommand | null = null;
  private confirmationOpen = false;

  constructor() {
    window.addEventListener(
      "wtt-native-speech",
      this.handleNativeEvent as EventListener,
    );
  }

  subscribe(listener: (event: SpeechRuntimeEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit = (event: SpeechRuntimeEvent) => {
    if (event.state === "model-required") this.confirmModelDownload(event);
    this.listeners.forEach((listener) => listener(event));
  };

  private handleNativeEvent = (event: CustomEvent<SpeechRuntimeEvent>) => {
    const detail =
      typeof event.detail === "string"
        ? JSON.parse(event.detail)
        : event.detail;
    if (!detail || typeof detail.state !== "string") return;
    this.emit(detail);
  };

  private confirmModelDownload(event: SpeechRuntimeEvent) {
    if (this.confirmationOpen) return;
    this.confirmationOpen = true;
    const megabytes = Math.ceil(Number(event.totalBytes || 0) / 1024 / 1024);
    const english = document.documentElement.lang
      .toLowerCase()
      .startsWith("en");
    const label =
      event.model === "tts"
        ? english
          ? "offline voice"
          : "离线朗读"
        : english
          ? "offline speech recognition"
          : "离线语音识别";
    const message = english
      ? `Download the ${label} model (${megabytes || "?"} MB)? It is stored only on this device.`
      : `下载${label}模型（约 ${megabytes || "?"} MB）？模型仅保存在当前设备。`;
    window.setTimeout(() => {
      const accepted = window.confirm(message);
      this.confirmationOpen = false;
      if (accepted) this.retryWithDownload();
      else {
        this.pendingNativeCommand = null;
        this.emit({ state: "cancelled", model: event.model });
        this.emit({ state: "idle", model: event.model });
      }
    }, 0);
  }

  private sendNative(command: NativeSpeechCommand) {
    window.ReactNativeWebView?.postMessage(JSON.stringify(command));
  }

  private retryWithDownload() {
    if (nativeAvailable() && this.pendingNativeCommand) {
      this.sendNative({ ...this.pendingNativeCommand, allowDownload: true });
      return;
    }
    this.browserAsr?.retryDownload();
  }

  canRecognize() {
    if (!SPEECH_ENABLED || typeof window === "undefined") return false;
    if (nativeAvailable()) return true;
    return Boolean(
      !isMobileBrowser() &&
      window.isSecureContext &&
      "mediaDevices" in navigator &&
      "Worker" in window &&
      "AudioWorkletNode" in window,
    );
  }

  canSpeak() {
    if (!SPEECH_ENABLED || typeof window === "undefined") return false;
    return nativeAvailable() || "speechSynthesis" in window;
  }

  startRecognition() {
    if (nativeAvailable()) {
      this.pendingNativeCommand = {
        type: "wtt-speech-command",
        command: "start-asr",
      };
      this.sendNative(this.pendingNativeCommand);
      return;
    }
    this.browserAsr ??= new BrowserAsrEngine(this.emit);
    this.browserAsr.start(false);
  }

  stopRecognition(cancelled = false) {
    if (nativeAvailable()) {
      this.sendNative({
        type: "wtt-speech-command",
        command: cancelled ? "cancel-asr" : "stop-asr",
      });
      return;
    }
    void this.browserAsr?.stop(cancelled);
  }

  speak(text: string) {
    const cleaned = cleanSpeechText(text);
    if (!cleaned) return;
    if (nativeAvailable()) {
      this.pendingNativeCommand = {
        type: "wtt-speech-command",
        command: "speak",
        text: cleaned,
      };
      this.sendNative(this.pendingNativeCommand);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleaned);
    const wantsChinese = /[\u3400-\u9fff]/.test(cleaned);
    utterance.lang = wantsChinese ? "zh-CN" : "en-US";
    const voices = window.speechSynthesis.getVoices();
    utterance.voice =
      voices.find((voice) =>
        voice.lang.toLowerCase().startsWith(wantsChinese ? "zh" : "en"),
      ) || null;
    utterance.onstart = () => this.emit({ state: "speaking", model: "tts" });
    utterance.onend = () => this.emit({ state: "idle", model: "tts" });
    utterance.onerror = (event) =>
      this.emit({ state: "error", model: "tts", error: event.error });
    window.speechSynthesis.speak(utterance);
  }

  stopSpeaking() {
    if (typeof window === "undefined") return;
    if (nativeAvailable()) {
      this.sendNative({ type: "wtt-speech-command", command: "stop-speaking" });
    } else if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      this.emit({ state: "idle", model: "tts" });
    }
  }
}

let runtime: SpeechRuntime | null = null;

export function getSpeechRuntime() {
  if (typeof window === "undefined") return null;
  runtime ??= new SpeechRuntime();
  return runtime;
}

export function cleanSpeechText(markdown: string) {
  return String(markdown || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /^\s*\[WTT_[A-Z0-9_]+\][\s\S]*?^\s*\[\/WTT_[A-Z0-9_]+\]\s*$/gim,
      " ",
    )
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]+`/g, " ")
    .replace(/^\s*\|.*\|\s*$/gm, " ")
    .replace(/^\s*[-:| ]{3,}\s*$/gm, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}[#>*+-]+\s*/gm, "")
    .replace(/[~*_]/g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]+\$/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);
}
