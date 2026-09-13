"use client";

import { signIn, useSession } from "next-auth/react";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

const PASEO_REMOTE_ORIGIN = "https://remote.ai-puppet.com";
const PASEO_OAUTH_MESSAGE = "wtt:paseo-oauth:success";
const PROVIDERS = new Set(["github", "google", "twitter"]);
const STATE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

type SessionWithAccessToken = { accessToken?: string };

export default function PaseoOAuthPage() {
  return (
    <Suspense fallback={<OAuthState title="正在准备 WTT 登录…" loading />}>
      <PaseoOAuthContent />
    </Suspense>
  );
}

function PaseoOAuthContent() {
  const query = useSearchParams();
  const { data: session, status } = useSession();
  const started = useRef(false);
  const delivered = useRef(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const provider = String(query.get("provider") || "").toLowerCase();
  const state = String(query.get("state") || "");
  const validRequest = PROVIDERS.has(provider) && STATE_PATTERN.test(state);
  const callbackUrl = useMemo(
    () => `/paseo/auth?provider=${encodeURIComponent(provider)}&state=${encodeURIComponent(state)}`,
    [provider, state],
  );

  useEffect(() => {
    if (!validRequest || status !== "unauthenticated" || started.current) return;
    started.current = true;
    void signIn(provider, { callbackUrl });
  }, [callbackUrl, provider, status, validRequest]);

  useEffect(() => {
    if (!validRequest || status !== "authenticated" || delivered.current) return;
    const accessToken = (session as SessionWithAccessToken | null)?.accessToken;
    if (!accessToken) {
      setError("WTT 登录会话中缺少访问凭据，请关闭窗口后重试。");
      return;
    }
    if (!window.opener) {
      setError("请从 WTT Remote 配对页打开此登录窗口。");
      return;
    }

    delivered.current = true;
    window.opener.postMessage(
      { type: PASEO_OAUTH_MESSAGE, state, accessToken },
      PASEO_REMOTE_ORIGIN,
    );
    setComplete(true);
    const closeTimer = window.setTimeout(() => window.close(), 450);
    return () => window.clearTimeout(closeTimer);
  }, [session, state, status, validRequest]);

  if (!validRequest) {
    return <OAuthState title="登录请求无效，请返回 WTT Remote 后重试。" error />;
  }
  if (error) return <OAuthState title={error} error />;
  if (status === "authenticated" && complete) {
    return <OAuthState title="登录成功，正在返回 WTT Remote…" success />;
  }
  return <OAuthState title={`正在通过 ${providerLabel(provider)} 登录…`} loading />;
}

function providerLabel(provider: string) {
  if (provider === "github") return "GitHub";
  if (provider === "google") return "Google";
  return "Twitter";
}

function OAuthState({
  title,
  loading = false,
  success = false,
  error = false,
}: {
  title: string;
  loading?: boolean;
  success?: boolean;
  error?: boolean;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7f6] px-5 text-[#142420] dark:bg-[#09110f] dark:text-white">
      <section className="w-full max-w-sm rounded-lg border border-black/10 bg-white p-7 text-center shadow-xl shadow-black/5 dark:border-white/10 dark:bg-[#111b18]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#dff7ef] text-[#168568] dark:bg-[#17372f] dark:text-[#68dfbd]">
          {loading ? <Loader2 className="animate-spin" size={23} /> : null}
          {success ? <CheckCircle2 size={23} /> : null}
          {error ? <ShieldAlert className="text-red-600 dark:text-red-400" size={23} /> : null}
        </div>
        <p className="mt-5 text-sm font-semibold leading-6">{title}</p>
        <p className="mt-3 text-xs leading-5 text-black/50 dark:text-white/45">
          登录凭据只会发送到 WTT Remote 官方域名，不会写入地址栏。
        </p>
      </section>
    </main>
  );
}
