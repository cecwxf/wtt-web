"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { CLIENT_WTT_API_BASE } from "@/lib/api/base-url";

type BillingMe = {
  entitlement?: {
    plan?: string;
    can_access_learning?: boolean;
  };
};

type SessionWithAccessToken = {
  accessToken?: string;
};

export function PremiumGate({
  children,
  title = "Plus / Pro 专属板块",
  description = "普通用户可继续使用 Claude Code、Codex 和 AI Kernel 教程；技术面试与教育板块需要升级后进入。",
}: {
  children: ReactNode;
  title?: string;
  description?: string;
}) {
  const { data: session, status } = useSession();
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const token = (session as SessionWithAccessToken | null)?.accessToken;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) {
        setAllowed(false);
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
        if (!cancelled) {
          const plan = data.entitlement?.plan;
          setAllowed(Boolean(data.entitlement?.can_access_learning || plan === "plus" || plan === "pro"));
        }
      } catch {
        if (!cancelled) setAllowed(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [status, token]);

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-800 bg-[#1e1e1e] p-8 text-gray-400">
        正在校验会员权益...
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="rounded-2xl border border-amber-300/25 bg-[#1e1e1e] p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-2 text-amber-200">
                <Lock className="h-5 w-5" />
              </span>
              <h2 className="text-2xl font-black text-white">{title}</h2>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-400">{description}</p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs text-gray-400">
              <span className="rounded-full border border-gray-700 px-3 py-1">Plus: ¥20/月</span>
              <span className="rounded-full border border-gray-700 px-3 py-1">Pro: ¥30/月</span>
              <span className="rounded-full border border-gray-700 px-3 py-1">国内单次支付</span>
              <span className="rounded-full border border-gray-700 px-3 py-1">海外订阅</span>
            </div>
          </div>
          <Link
            href="/upgrade"
            className="inline-flex shrink-0 items-center justify-center rounded-md bg-[#3ce8e2] px-4 py-2 text-sm font-black text-black hover:opacity-90"
          >
            升级会员
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
