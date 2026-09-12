"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { Check, Laptop, Loader2, LockKeyhole, Moon, ShieldCheck, Sun, X } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { CLIENT_WTT_API_BASE } from "@/lib/api/base-url";
import { useI18n } from "@/lib/i18n-provider";

type SessionWithAccessToken = { accessToken?: string };
type DeviceRequest = {
  host_id: string;
  host_public_key: string;
  hostname: string;
  client_version: string;
  status: string;
  expires_at: string;
};

const copy = {
  zh: {
    eyebrow: "WTT PASEO 安全连接",
    title: "允许这台电脑访问你的 WTT？",
    subtitle: "批准后，WTT Paseo 可以使用你的账号连接 Agent Fabric。模型凭据和本机文件不会上传到 WTT。",
    login: "登录后确认",
    missing: "授权码缺失。请在 WTT Paseo 中重新生成二维码。",
    loading: "正在验证授权码…",
    invalid: "授权码无效或已过期，请回到桌面端重新生成。",
    host: "设备",
    hostId: "Host ID",
    version: "客户端版本",
    fingerprint: "密钥指纹",
    approve: "允许连接",
    deny: "拒绝",
    approving: "正在授权…",
    approved: "连接已批准",
    approvedHint: "可以回到 WTT Paseo。桌面端会自动完成登录并建立安全连接。",
    denied: "连接已拒绝",
    deniedHint: "该授权码已作废。",
    safety: "仅批准你正在操作的电脑。WTT 不会要求你把此授权码发送给其他人。",
    home: "返回 WTT",
  },
  en: {
    eyebrow: "WTT PASEO SECURE LINK",
    title: "Allow this computer to access your WTT account?",
    subtitle: "WTT Paseo will connect to Agent Fabric as you. Model credentials and local files remain on this computer.",
    login: "Sign in to continue",
    missing: "The authorization code is missing. Generate a new QR code in WTT Paseo.",
    loading: "Verifying authorization code…",
    invalid: "This authorization code is invalid or expired. Generate a new one on the desktop.",
    host: "Device",
    hostId: "Host ID",
    version: "Client version",
    fingerprint: "Key fingerprint",
    approve: "Allow connection",
    deny: "Deny",
    approving: "Authorizing…",
    approved: "Connection approved",
    approvedHint: "Return to WTT Paseo. The desktop will finish signing in and establish the secure link.",
    denied: "Connection denied",
    deniedHint: "This authorization code can no longer be used.",
    safety: "Only approve a computer you are using now. WTT will never ask you to send this code to someone else.",
    home: "Back to WTT",
  },
} as const;

export default function DeviceAuthorizationPage() {
  return (
    <Suspense fallback={<DeviceAuthorizationFallback />}>
      <DeviceAuthorizationContent />
    </Suspense>
  );
}

function DeviceAuthorizationContent() {
  const query = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  const { locale, toggleLocale } = useI18n();
  const { resolvedTheme, setTheme } = useTheme();
  const text = copy[locale];
  const token = (session as SessionWithAccessToken | null)?.accessToken;
  const code = String(query.get("code") || "").trim();
  const [request, setRequest] = useState<DeviceRequest | null>(null);
  const [fingerprint, setFingerprint] = useState("—");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<"approve" | "deny" | null>(null);
  const [result, setResult] = useState<"approved" | "denied" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (!code || !token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`${CLIENT_WTT_API_BASE}/auth/device/requests/${encodeURIComponent(code)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(apiMessage(body, text.invalid));
        return body as DeviceRequest;
      })
      .then(async (body) => {
        if (cancelled) return;
        setRequest(body);
        setFingerprint(await publicKeyFingerprint(body.host_public_key));
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : text.invalid);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, sessionStatus, text.invalid, token]);

  async function decide(decision: "approve" | "deny") {
    if (!token || !code) return;
    setSubmitting(decision);
    setError("");
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/auth/device/authorize`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_code: code, decision }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiMessage(body, text.invalid));
      setResult(decision === "approve" ? "approved" : "denied");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.invalid);
    } finally {
      setSubmitting(null);
    }
  }

  const callbackUrl = `/device?code=${encodeURIComponent(code)}`;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#edf5f1] px-4 py-8 text-[#10231f] transition-colors dark:bg-[#07110f] dark:text-[#edf8f3] sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(28,188,151,0.18),transparent_34%),radial-gradient(circle_at_85%_80%,rgba(45,111,181,0.16),transparent_34%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col">
        <nav className="flex items-center justify-between">
          <Link href="/" className="text-lg font-black tracking-[-0.04em]">WTT</Link>
          <div className="flex items-center gap-2">
            <button type="button" onClick={toggleLocale} className="rounded-full border border-black/10 bg-white/65 px-3 py-2 text-xs font-bold backdrop-blur dark:border-white/10 dark:bg-white/5">
              {locale === "zh" ? "EN" : "中"}
            </button>
            <button type="button" aria-label="Toggle color theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} className="rounded-full border border-black/10 bg-white/65 p-2 backdrop-blur dark:border-white/10 dark:bg-white/5">
              {resolvedTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </nav>

        <section className="my-auto grid items-stretch gap-5 py-10 lg:grid-cols-[0.82fr_1.18fr]">
          <aside className="relative overflow-hidden rounded-[2rem] bg-[#0b2922] p-7 text-white shadow-2xl shadow-emerald-950/15 sm:p-9">
            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full border border-white/10" />
            <div className="absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-[#25c49a]/15 blur-2xl" />
            <div className="relative flex h-full min-h-72 flex-col">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#38d7ac] text-[#08221c]"><LockKeyhole size={23} /></div>
              <p className="mt-7 text-xs font-black tracking-[0.2em] text-[#73e2c4]">{text.eyebrow}</p>
              <h1 className="mt-4 text-3xl font-black leading-tight tracking-[-0.04em] sm:text-4xl">{text.title}</h1>
              <p className="mt-5 text-sm leading-6 text-white/65">{text.subtitle}</p>
              <div className="mt-auto flex items-start gap-3 pt-10 text-xs leading-5 text-white/55">
                <ShieldCheck className="mt-0.5 shrink-0 text-[#73e2c4]" size={17} />
                <span>{text.safety}</span>
              </div>
            </div>
          </aside>

          <div className="rounded-[2rem] border border-black/8 bg-white/80 p-6 shadow-xl shadow-slate-900/5 backdrop-blur-xl dark:border-white/10 dark:bg-[#10201c]/85 sm:p-9">
            {!code ? <StateMessage icon={<X />} title={text.missing} /> : null}
            {code && sessionStatus !== "loading" && !token ? (
              <div className="flex h-full min-h-72 flex-col items-center justify-center text-center">
                <Laptop size={38} className="text-[#169c7b]" />
                <p className="mt-5 max-w-sm text-sm leading-6 text-black/55 dark:text-white/55">{text.subtitle}</p>
                <Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="mt-7 rounded-xl bg-[#102e27] px-6 py-3 text-sm font-black text-white transition hover:bg-[#174b3e] dark:bg-[#43d8ae] dark:text-[#071b15]">
                  {text.login}
                </Link>
              </div>
            ) : null}
            {code && token && loading ? <StateMessage spin title={text.loading} /> : null}
            {code && token && !loading && error && !request ? <StateMessage icon={<X />} title={error} /> : null}
            {request && !result ? (
              <div>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d9f7ed] text-[#118466] dark:bg-[#173b31]"><Laptop size={22} /></div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#16886b]">{text.host}</p>
                    <h2 className="mt-1 text-xl font-black">{request.hostname}</h2>
                  </div>
                </div>
                <dl className="mt-7 divide-y divide-black/7 overflow-hidden rounded-2xl border border-black/7 bg-white/50 text-sm dark:divide-white/8 dark:border-white/8 dark:bg-black/10">
                  <Detail label={text.hostId} value={request.host_id} mono />
                  <Detail label={text.version} value={request.client_version} />
                  <Detail label={text.fingerprint} value={fingerprint} mono />
                </dl>
                {error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p> : null}
                <div className="mt-7 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <button type="button" disabled={Boolean(submitting)} onClick={() => void decide("approve")} className="flex items-center justify-center gap-2 rounded-xl bg-[#123d32] px-5 py-3 text-sm font-black text-white transition hover:bg-[#185544] disabled:opacity-50 dark:bg-[#49d9b1] dark:text-[#082019]">
                    {submitting === "approve" ? <Loader2 className="animate-spin" size={17} /> : <Check size={17} />}
                    {submitting ? text.approving : text.approve}
                  </button>
                  <button type="button" disabled={Boolean(submitting)} onClick={() => void decide("deny")} className="rounded-xl border border-black/10 px-5 py-3 text-sm font-bold hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5">
                    {text.deny}
                  </button>
                </div>
              </div>
            ) : null}
            {result ? (
              <div className="flex h-full min-h-72 flex-col items-center justify-center text-center">
                <div className={`flex h-14 w-14 items-center justify-center rounded-full ${result === "approved" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950" : "bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-white/60"}`}>
                  {result === "approved" ? <Check size={27} /> : <X size={27} />}
                </div>
                <h2 className="mt-5 text-2xl font-black">{result === "approved" ? text.approved : text.denied}</h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-black/55 dark:text-white/55">{result === "approved" ? text.approvedHint : text.deniedHint}</p>
                <Link href="/" className="mt-7 text-sm font-bold text-[#16886b] hover:underline">{text.home}</Link>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function DeviceAuthorizationFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#edf5f1] text-[#169c7b] dark:bg-[#07110f]">
      <Loader2 className="animate-spin" size={30} />
    </main>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-1 px-4 py-3.5 sm:grid-cols-[9rem_1fr] sm:items-center">
      <dt className="text-xs font-bold text-black/45 dark:text-white/45">{label}</dt>
      <dd className={`min-w-0 break-all text-sm ${mono ? "font-mono text-xs" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}

function StateMessage({ icon, title, spin = false }: { icon?: React.ReactNode; title: string; spin?: boolean }) {
  return (
    <div className="flex h-full min-h-72 flex-col items-center justify-center text-center text-black/55 dark:text-white/55">
      {spin ? <Loader2 className="animate-spin text-[#169c7b]" size={30} /> : <span className="text-red-500">{icon}</span>}
      <p className="mt-5 max-w-sm text-sm leading-6">{title}</p>
    </div>
  );
}

function apiMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    const description = (detail as { error_description?: unknown }).error_description;
    if (typeof description === "string") return description;
  }
  return fallback;
}

async function publicKeyFingerprint(value: string): Promise<string> {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(`${normalized}=`), (character) => character.charCodeAt(0));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return Array.from(digest.slice(0, 12), (byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .match(/.{1,4}/g)!
      .join(":");
  } catch {
    return "—";
  }
}
