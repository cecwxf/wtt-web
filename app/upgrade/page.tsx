"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Check, ExternalLink, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CLIENT_WTT_API_BASE } from "@/lib/api/base-url";

type PlanId = "pro";
type BillingMode = "one_time" | "subscription";

type BillingMe = {
  entitlement?: {
    plan?: string;
    status?: string;
    ends_at?: string | null;
    limits?: {
      window_limit?: number;
      monthly_limit?: number;
    };
  };
  cloud_agent_usage?: {
    window_count?: number;
    monthly_count?: number;
    blocked_until?: string | null;
  };
};

type CheckoutSession = {
  provider?: string;
  order_id?: string;
  plan?: PlanId;
  amount_cny?: string;
  pay_url?: string;
  qrcode_url?: string | null;
  expires_at?: string;
};

type SessionWithAccessToken = {
  accessToken?: string;
};

const plans: Array<{
  id: PlanId;
  name: string;
  price: string;
  requestWindow: string;
  requestMonthly: string;
  features: string[];
}> = [
  {
    id: "pro",
    name: "Pro",
    price: "¥30 / 月",
    requestWindow: "连续 30 次请求后限流",
    requestMonthly: "每月 500 次云 Agent 请求",
    features: ["可申请云 Agent", "开放技术面试板块", "开放教育板块", "开放高考板块", "更高云 Agent 请求额度"],
  },
];

export default function UpgradePage() {
  const { data: session, status } = useSession();
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutKey, setCheckoutKey] = useState<string | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState<string>("");
  const [error, setError] = useState("");
  const [source, setSource] = useState("");
  const token = (session as SessionWithAccessToken | null)?.accessToken;
  const currentPlan = billing?.entitlement?.plan || "free";
  const isPro = currentPlan === "pro";
  const isAndroidSource = source === "android";
  const isMobileSource = isAndroidSource || source === "mobile";
  const returnHref = isAndroidSource ? "/mobile/settings?source=android" : isMobileSource ? "/mobile/settings" : "/arena";
  const returnLabel = isMobileSource ? "返回设置" : "返回 Arena";
  const upgradeCopy = isMobileSource
    ? "Pro 开放云 Agent 使用能力，并提升移动端云 Agent 请求额度。"
    : "Free 用户可继续使用自有 Agent。Pro 开放云 Agent、技术面试板块、教育板块和高考板块。";
  const visiblePlanFeatures = (features: string[]) => (
    isMobileSource
      ? ["可申请云 Agent", "更高云 Agent 请求额度", "会员有效期 1 个月"]
      : features
  );

  const usageText = useMemo(() => {
    const limits = billing?.entitlement?.limits;
    const usage = billing?.cloud_agent_usage;
    if (!limits || !usage) return "";
    return `${usage.monthly_count || 0}/${limits.monthly_limit || 0} monthly, ${usage.window_count || 0}/${limits.window_limit || 0} current window`;
  }, [billing]);

  useEffect(() => {
    setSource(String(new URLSearchParams(window.location.search).get("source") || "").toLowerCase());
  }, []);

  async function loadBilling() {
    if (!token) {
      setLoading(status === "loading");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/billing/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as BillingMe;
      setBilling(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBilling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, token]);

  useEffect(() => {
    if (!token || !checkoutSession?.order_id) return;
    let cancelled = false;
    const poll = async () => {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/billing/orders/${encodeURIComponent(checkoutSession.order_id || "")}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (response.ok) {
        setCheckoutStatus(String(data.status || ""));
        if (data.status === "paid") {
          setCheckoutSession(null);
          await loadBilling();
        }
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutSession?.order_id, token]);

  async function startCheckout(plan: PlanId, billingMode: BillingMode) {
    if (!token) {
      setError("请先登录后再升级。");
      return;
    }
    if (isPro) {
      setError("当前账号已经是 Pro 会员，无需重复支付。");
      return;
    }
    const checkoutReturnUrl = (checkout: "success" | "cancelled") => {
      const params = new URLSearchParams({ checkout });
      if (source) params.set("source", source);
      return `${window.location.origin}/upgrade?${params.toString()}`;
    };

    const key = `${plan}:${billingMode}`;
    setCheckoutKey(key);
    setError("");
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plan,
          billing_mode: billingMode,
          success_url: checkoutReturnUrl("success"),
          cancel_url: checkoutReturnUrl("cancelled"),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) {
        setError(typeof data.detail === "string" ? data.detail : data.detail?.message || "无法创建支付链接。");
        return;
      }
      if (data.provider === "xunhupay" && data.order_id) {
        setCheckoutSession(data as CheckoutSession);
        setCheckoutStatus("pending");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("网络异常，支付链接创建失败。");
    } finally {
      setCheckoutKey(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#151515] text-white">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <nav className="mb-10 flex items-center justify-between">
          <Link href="/" className="bg-gradient-to-r from-[#3ce8e2] to-[#00b3b3] bg-clip-text text-2xl font-black text-transparent">WTT</Link>
          <Link href={returnHref} className="rounded-md border border-gray-800 bg-[#1e1e1e] px-4 py-2 text-sm font-bold text-gray-300 hover:border-[#3ce8e2] hover:text-[#3ce8e2]">{returnLabel}</Link>
        </nav>

        <header className="mb-8">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#3ce8e2]">WTT Membership</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">升级 Pro</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-gray-400">
            {upgradeCopy}
          </p>
        </header>

        <div className="mb-6 rounded-xl border border-gray-800 bg-[#1e1e1e] p-5 text-sm text-gray-300">
          {loading ? "正在读取当前会员权益..." : (
            <div className="flex flex-wrap items-center gap-3">
              <span>当前计划：<strong className="text-[#3ce8e2]">{currentPlan.toUpperCase()}</strong></span>
              {billing?.entitlement?.ends_at && <span>有效期至：{billing.entitlement.ends_at}</span>}
              {usageText && <span>云 Agent 用量：{usageText}</span>}
            </div>
          )}
        </div>

        {status !== "authenticated" && (
          <div className="mb-6 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
            请先登录 WTT 账号，再创建支付链接。
          </div>
        )}
        {isPro && (
          <div className="mb-6 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-4 text-sm text-emerald-100">
            当前账号已是 Pro 会员，有效期内无需重复支付。
          </div>
        )}
        {error && <div className="mb-6 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">{error}</div>}

        {checkoutSession && (
          <div className="mb-6 rounded-2xl border border-[#3ce8e2]/30 bg-[#102524] p-5 shadow-2xl shadow-black/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#3ce8e2]">Xunhupay Checkout</p>
                <h2 className="mt-2 text-2xl font-black">扫码或打开链接完成支付</h2>
                <p className="mt-2 text-sm text-gray-300">
                  {checkoutSession.plan?.toUpperCase()} · ¥{checkoutSession.amount_cny || "-"} · 状态：{checkoutStatus || "pending"}
                </p>
              </div>
              <button onClick={() => setCheckoutSession(null)} className="rounded-full border border-white/10 p-2 text-gray-300 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
              {checkoutSession.qrcode_url && (
                <img src={checkoutSession.qrcode_url} alt="支付二维码" className="h-44 w-44 rounded-xl border border-white/10 bg-white p-2" />
              )}
              <div className="space-y-3 text-sm text-gray-300">
                <p>支付成功后会自动刷新会员状态；如果没有自动刷新，可以稍后点“刷新权益”。</p>
                {checkoutSession.pay_url && (
                  <a href={checkoutSession.pay_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md bg-[#3ce8e2] px-4 py-2 font-black text-black hover:opacity-90">
                    打开支付页 <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-1">
          {plans.map((plan) => (
            <section key={plan.id} className="rounded-2xl border border-gray-800 bg-[#1b1b1b] p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-black">{plan.name}</h2>
                  <p className="mt-2 text-2xl font-black text-[#3ce8e2]">{plan.price}</p>
                </div>
                {currentPlan === plan.id && <span className="rounded-full border border-[#3ce8e2]/30 bg-[#3ce8e2]/10 px-3 py-1 text-xs font-bold text-[#3ce8e2]">当前计划</span>}
              </div>
              <div className="mt-5 space-y-3 text-sm text-gray-300">
                <p>{plan.requestWindow}</p>
                <p>{plan.requestMonthly}</p>
                {visiblePlanFeatures(plan.features).map((feature) => (
                  <p key={feature} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#3ce8e2]" />
                    <span>{feature}</span>
                  </p>
                ))}
              </div>
              {!isPro ? (
                <div className="mt-6 grid gap-3">
                  <button
                    onClick={() => void startCheckout(plan.id, "one_time")}
                    disabled={checkoutKey !== null || status !== "authenticated"}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-[#3ce8e2] px-4 py-2 text-sm font-black text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {checkoutKey === `${plan.id}:one_time` && <Loader2 className="h-4 w-4 animate-spin" />}
                    立即支付，开通 1 个月
                  </button>
                </div>
              ) : (
                <div className="mt-6 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-bold text-emerald-100">
                  Pro 已开通
                </div>
              )}
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
