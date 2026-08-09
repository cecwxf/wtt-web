"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Loader2, Mic, Square, Volume2, VolumeX, X } from "lucide-react";
import {
  getSpeechRuntime,
  type SpeechRuntimeEvent,
} from "@/lib/speech/runtime";

type SpeechInputControlProps = {
  value: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLTextAreaElement>;
  className?: string;
};

function setCursor(inputRef: RefObject<HTMLTextAreaElement>, position: number) {
  requestAnimationFrame(() => {
    inputRef.current?.focus();
    inputRef.current?.setSelectionRange(position, position);
  });
}

export function SpeechInputControl({
  value,
  onChange,
  inputRef,
  className = "",
}: SpeechInputControlProps) {
  const [available, setAvailable] = useState(false);
  const [state, setState] = useState<SpeechRuntimeEvent>({ state: "idle" });
  const activeRef = useRef(false);
  const baseRef = useRef({ value: "", start: 0, end: 0 });
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;

  useEffect(() => {
    const runtime = getSpeechRuntime();
    if (!runtime) return;
    const refresh = () => setAvailable(runtime.canRecognize());
    refresh();
    window.addEventListener("wtt-native-speech-ready", refresh);
    const unsubscribe = runtime.subscribe((event) => {
      if (event.model && event.model !== "asr") return;
      if (
        !activeRef.current &&
        !["downloading", "initializing"].includes(event.state)
      )
        return;
      setState(event);
      if (event.state === "partial" || event.state === "final") {
        const base = baseRef.current;
        const transcript = event.text || "";
        onChangeRef.current(
          `${base.value.slice(0, base.start)}${transcript}${base.value.slice(base.end)}`,
        );
        setCursor(inputRef, base.start + transcript.length);
      }
      if (event.state === "cancelled") {
        onChangeRef.current(baseRef.current.value);
        setCursor(inputRef, baseRef.current.start);
        activeRef.current = false;
      }
      if (event.state === "final" || event.state === "error")
        activeRef.current = false;
    });
    return () => {
      window.removeEventListener("wtt-native-speech-ready", refresh);
      unsubscribe();
      if (activeRef.current) runtime.stopRecognition(true);
    };
  }, [inputRef]);

  if (!available) return null;
  const busy = ["downloading", "initializing"].includes(state.state);
  const listening =
    activeRef.current && ["listening", "partial"].includes(state.state);
  const progress = Math.round(Number(state.progress || 0) * 100);

  return (
    <div className={`flex shrink-0 items-center gap-1 ${className}`}>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          const runtime = getSpeechRuntime();
          if (!runtime) return;
          if (listening) {
            runtime.stopRecognition(false);
            setState({ state: "initializing", model: "asr" });
            return;
          }
          const input = inputRef.current;
          baseRef.current = {
            value: valueRef.current,
            start: input?.selectionStart ?? valueRef.current.length,
            end: input?.selectionEnd ?? valueRef.current.length,
          };
          activeRef.current = true;
          setState({ state: "initializing", model: "asr" });
          runtime.startRecognition();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:cursor-wait dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        title={
          busy
            ? `语音模型 ${progress}%`
            : listening
              ? "结束语音输入"
              : "语音输入"
        }
        aria-label={listening ? "结束语音输入" : "语音输入"}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : listening ? (
          <Square className="h-3.5 w-3.5 fill-current" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
        {busy && progress > 0 ? (
          <span className="absolute -bottom-1 text-[8px] font-semibold">
            {progress}%
          </span>
        ) : null}
      </button>
      {listening ? (
        <button
          type="button"
          onClick={() => getSpeechRuntime()?.stopRecognition(true)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-rose-500 transition hover:bg-rose-50 dark:hover:bg-rose-950/40"
          title="取消语音输入并恢复原文"
          aria-label="取消语音输入"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export function SpeechReadButton({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const [available, setAvailable] = useState(false);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const requestedRef = useRef(false);

  useEffect(() => {
    const runtime = getSpeechRuntime();
    if (!runtime) return;
    const refresh = () => setAvailable(runtime.canSpeak());
    refresh();
    window.addEventListener("wtt-native-speech-ready", refresh);
    const unsubscribe = runtime.subscribe((event) => {
      if (event.model && event.model !== "tts") return;
      if (!requestedRef.current) return;
      setBusy(
        ["downloading", "initializing", "model-required"].includes(event.state),
      );
      if (event.state === "speaking") setActive(true);
      if (
        event.state === "idle" ||
        event.state === "error" ||
        event.state === "cancelled"
      ) {
        setActive(false);
        setBusy(false);
        requestedRef.current = false;
      }
    });
    return () => {
      window.removeEventListener("wtt-native-speech-ready", refresh);
      unsubscribe();
    };
  }, []);

  if (!available || !text.trim()) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        const runtime = getSpeechRuntime();
        if (!runtime) return;
        if (active) {
          runtime.stopSpeaking();
          return;
        }
        requestedRef.current = true;
        setBusy(true);
        runtime.speak(text);
      }}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition hover:bg-black/5 disabled:cursor-wait dark:hover:bg-white/10 ${className}`}
      title={active ? "停止朗读" : "朗读回复"}
      aria-label={active ? "停止朗读" : "朗读回复"}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : active ? (
        <VolumeX className="h-3 w-3" />
      ) : (
        <Volume2 className="h-3 w-3" />
      )}
    </button>
  );
}
