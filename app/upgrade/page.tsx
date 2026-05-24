"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CLIENT_WTT_API_BASE } from "@/lib/api/base-url";

type PlanId = "plus" | "pro";
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
    id: "plus",
    name: "Plus",
    price: "¥20 / 月",
    requestWindow: "连续 50 次请求后限流",
    requestMonthly: "每月 500 次云 Agent 请求",
    features: ["可申请云 Agent", "开放技术面试板块", "开放教育板块", "3 小时后重置连续请求额度"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "¥30 / 月",
    requestWindow: "连续 100 次请求后限流",
    requestMonthly: "每月 1500 次云 Agent 请求",
    features: ["可申请云 Agent", "更高云 Agent 请求额度", "开放技术面试板块", "开放教育板块"],
  },
];

export default function UpgradePage() {
  const { data: session, status } = useSession();
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutKey, setCheckoutKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const token = (session as SessionWithAccessToken | null)?.accessToken;
  const currentPlan = billing?.entitlement?.plan || "free";

  const usageText = useMemo(() => {
    const limits = billing?.entitlement?.limits;
    const usage = billing?.cloud_agent_usage;
    if (!limits || !usage) return "";
    return `${usage.monthly_count || 0}/${limits.monthly_limit || 0} monthly, ${usage.window_count || 0}/${limits.window_limit || 0} current window`;
  }, [billing]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
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
        if (!cancelled) setBilling(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [status, token]);

  async function startCheckout(plan: PlanId, billingMode: BillingMode) {
    if (!token) {
      setError("请先登录后再升级。");
      return;
    }
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
          success_url: `${window.location.origin}/upgrade?checkout=success`,
          cancel_url: `${window.location.origin}/upgrade?checkout=cancelled`,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) {
        setError(typeof data.detail === "string" ? data.detail : data.detail?.message || "无法创建支付链接。");
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
          <Link href="/arena" className="rounded-md border border-gray-800 bg-[#1e1e1e] px-4 py-2 text-sm font-bold text-gray-300 hover:border-[#3ce8e2] hover:text-[#3ce8e2]">返回 Arena</Link>
        </nav>

        <header className="mb-8">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#3ce8e2]">WTT Membership</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">升级 Plus / Pro</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-gray-400">
            普通用户可继续使用 Claude Code、Codex 教程和自有 Agent 绑定。Plus / Pro 开放云 Agent、技术面试板块和教育板块。
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
        {error && <div className="mb-6 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">{error}</div>}

        <div className="grid gap-5 md:grid-cols-2">
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
                {plan.features.map((feature) => (
                  <p key={feature} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#3ce8e2]" />
                    <span>{feature}</span>
                  </p>
                ))}
              </div>
              <div className="mt-6 grid gap-3">
                <button
                  onClick={() => void startCheckout(plan.id, "one_time")}
                  disabled={checkoutKey !== null || status !== "authenticated"}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-[#3ce8e2] px-4 py-2 text-sm font-black text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {checkoutKey === `${plan.id}:one_time` && <Loader2 className="h-4 w-4 animate-spin" />}
                  国内单次支付
                </button>
                <button
                  onClick={() => void startCheckout(plan.id, "subscription")}
                  disabled={checkoutKey !== null || status !== "authenticated"}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-700 bg-[#151515] px-4 py-2 text-sm font-bold text-gray-200 hover:border-[#3ce8e2] hover:text-[#3ce8e2] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {checkoutKey === `${plan.id}:subscription` && <Loader2 className="h-4 w-4 animate-spin" />}
                  海外订阅
                </button>
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
