"use client";

import { useSession } from "next-auth/react";
import {
  Activity,
  Bot,
  Bell,
  Brush,
  Camera,
  Check,
  ClipboardCopy,
  CreditCard,
  KeyRound,
  Loader2,
  Lock,
  ExternalLink,
  RefreshCw,
  Save,
  Smartphone,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CLIENT_WTT_API_BASE } from "@/lib/api/base-url";
import { useI18n } from "@/lib/i18n-provider";
import { Avatar } from "@/components/ui/avatar";

type SettingsPage =
  | "profile"
  | "membership"
  | "binding"
  | "llm-proxy"
  | "metrics"
  | "notifications"
  | "poll"
  | "privacy"
  | "appearance"
  | "api"
  | "about";

interface AgentOption {
  id: string;
  agent_id: string;
  display_name: string;
  is_primary: boolean;
  invite_code?: string;
  invite_status?: "active" | "none";
  binding_method?: string;
  bound_via?: string;
}

interface MobileLoginSession {
  session_id: string;
  status: "pending" | "consumed" | "rejected" | "expired";
  nonce: string;
  login_uri: string;
  fallback_url?: string;
  expires_at: string;
  expires_in_seconds: number;
}

interface WttSettingsModalProps {
  open: boolean;
  onClose: () => void;
  activePage: SettingsPage;
  onPageChange: (page: SettingsPage) => void;
  agents: AgentOption[];
  selectedAgentId: string;
  onBindingChanged?: () => void;
}

const PAGE_ITEMS: Array<{
  key: SettingsPage;
  labelKey: string;
  icon: typeof User;
}> = [
  { key: "profile", labelKey: "settings.profile", icon: User },
  { key: "membership", labelKey: "settings.membership", icon: CreditCard },
  { key: "binding", labelKey: "settings.binding", icon: Bot },
  { key: "llm-proxy", labelKey: "settings.llmProxy", icon: KeyRound },
  { key: "metrics", labelKey: "settings.metrics", icon: Activity },
  { key: "notifications", labelKey: "settings.notifications", icon: Bell },
  { key: "privacy", labelKey: "settings.privacy", icon: Lock },
  { key: "appearance", labelKey: "settings.appearance", icon: Brush },
  { key: "about", labelKey: "settings.about", icon: Bot },
];

type BillingMode = "one_time" | "subscription";
type PlanId = "pro";

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

type AgentOperationJob = {
  job_id?: string;
  status?: string;
  phase?: string;
  result?: Record<string, unknown>;
  error_message?: string;
};

function settingsDelay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function settingsFetchJsonWithTimeout(input: string, init: RequestInit, timeoutMs = 25_000): Promise<{ response: Response; data: unknown }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function isRetryableSettingsOperationStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function isRetryableSettingsOperationError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes("timed out") || message.includes("failed to fetch") || message.includes("network");
  }
  return false;
}

function settingsErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const detail = (data as { detail?: unknown; message?: unknown }).detail ?? (data as { message?: unknown }).message;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    const nested = (detail as { message?: unknown; detail?: unknown; error?: unknown }).message
      ?? (detail as { detail?: unknown }).detail
      ?? (detail as { error?: unknown }).error;
    if (typeof nested === "string") return nested;
    try {
      return JSON.stringify(detail);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

type CloudModelOption = {
  id: string;
  label: string;
  supports_reasoning?: boolean;
  tier?: string;
};

type CloudAgentInfo = {
  has_cloud_agent?: boolean;
  agent_id?: string;
  agent_type?: string;
  model_id?: string;
  resource_profile?: string;
  status?: string;
  docker_status?: string;
  workspace_bytes?: number;
  workspace_limit_bytes?: number;
  usage_totals?: {
    requests?: number;
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
};

type LlmProxyToken = {
  id: string;
  name: string;
  agent_id?: string;
  token_prefix: string;
  scope: string;
  status: string;
  plan_id: string;
  provider_plan?: string;
  allowed_models?: string[];
  monthly_token_limit?: number;
  concurrency_limit?: number;
  is_managed?: boolean;
  last_used_at?: string | null;
  created_at?: string | null;
  usage_month?: {
    requests?: number;
    input_tokens?: number;
    output_tokens?: number;
    cache_tokens?: number;
    total_tokens?: number;
  };
  secret?: string;
};

type LlmProxyPlans = {
  proxy_base_url?: string;
  plans?: Array<{
    id: string;
    name: string;
    adapter?: string;
    status?: string;
    models?: string[];
    copy_target?: string;
    proxy_path?: string;
    monthly_token_limit?: number;
    concurrency_limit?: number;
    description?: string;
  }>;
  provider_plans?: Array<{
    id: string;
    name: string;
    adapter?: string;
    status?: string;
    models?: string[];
    copy_target?: string;
    proxy_path?: string;
    monthly_token_limit?: number;
    concurrency_limit?: number;
    description?: string;
  }>;
  model_price_reference?: Array<{
    provider: string;
    model: string;
    context: string;
    input_cache_hit: string;
    input_cache_miss: string;
    output: string;
    note?: string;
  }>;
};

type SessionWithAccessToken = {
  accessToken?: string;
};

const CLOUD_AGENT_FALLBACK_MODELS: CloudModelOption[] = [
  { id: "deepseek-v4-pro[1m]", label: "DeepSeek V4 Pro", supports_reasoning: true, tier: "standard" },
  { id: "anthropic/claude-opus-4.7", label: "Claude Opus 4.7", supports_reasoning: true, tier: "premium" },
  { id: "anthropic/claude-sonnet-4.7", label: "Claude Sonnet 4.7", supports_reasoning: true, tier: "standard" },
  { id: "openai-codex/gpt-5.5", label: "GPT-5.5", supports_reasoning: true, tier: "premium" },
];

function mergeCloudModels(models: CloudModelOption[]): CloudModelOption[] {
  const merged = new Map<string, CloudModelOption>();
  const supportedIds = new Set(CLOUD_AGENT_FALLBACK_MODELS.map((item) => item.id));
  for (const item of CLOUD_AGENT_FALLBACK_MODELS) merged.set(item.id, item);
  for (const item of models) {
    if (!item?.id) continue;
    if (!supportedIds.has(item.id)) continue;
    merged.set(item.id, { ...item, supports_reasoning: item.supports_reasoning ?? true });
  }
  return Array.from(merged.values());
}

function formatBytes(value?: number): string {
  if (!value || value <= 0) return "-";
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(value / 1024)} KB`;
}

export function WttSettingsModal({
  open,
  onClose,
  activePage,
  onPageChange,
  agents,
  selectedAgentId,
  onBindingChanged,
}: WttSettingsModalProps) {
  const { data: session } = useSession();
  const { t } = useI18n();
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.agent_id === selectedAgentId),
    [agents, selectedAgentId],
  );
  const hasCloudAgent = useMemo(
    () => agents.some((agent) => (agent.binding_method || agent.bound_via || "") === "cloud_trial"),
    [agents],
  );
  const [messageNotify, setMessageNotify] = useState(true);
  const [agentAlert, setAgentAlert] = useState(true);
  const [soundOn, setSoundOn] = useState(false);
  const [provisionDisplayName, setProvisionDisplayName] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState("");
  const [provisionSuccess, setProvisionSuccess] = useState("");
  const [provisioned, setProvisioned] = useState<{
    agent_id: string;
    agent_token: string;
    api_key?: string;
  } | null>(null);
  const [cloudClaiming, setCloudClaiming] = useState(false);
  const [cloudClaimError, setCloudClaimError] = useState("");
  const [cloudClaimSuccess, setCloudClaimSuccess] = useState("");
  const [cloudModels, setCloudModels] = useState<CloudModelOption[]>(CLOUD_AGENT_FALLBACK_MODELS);
  const [cloudAgentInfo, setCloudAgentInfo] = useState<CloudAgentInfo | null>(null);
  const [cloudAgentInfoLoading, setCloudAgentInfoLoading] = useState(false);
  const [pluginCommandCreds, setPluginCommandCreds] = useState<{
    agent_id: string;
    agent_token: string;
  } | null>(null);

  const [mobileLoginSession, setMobileLoginSession] =
    useState<MobileLoginSession | null>(null);
  const [mobileLoginError, setMobileLoginError] = useState("");
  const [mobileLoginInfo, setMobileLoginInfo] = useState("");
  const [mobileLoginLoading, setMobileLoginLoading] = useState(false);

  const [existingAgentId, setExistingAgentId] = useState("");
  const [existingAgentToken, setExistingAgentToken] = useState("");
  const [existingDisplayName, setExistingDisplayName] = useState("");
  const [claimingExisting, setClaimingExisting] = useState(false);
  const [claimExistingError, setClaimExistingError] = useState("");
  const [claimExistingSuccess, setClaimExistingSuccess] = useState("");

  // Reset agent token
  const [resettingToken, setResettingToken] = useState<string | null>(null);
  const [agentTokens, setAgentTokens] = useState<Record<string, string>>({});

  // Profile editing state
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileUploading, setProfileUploading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState("");
  const [llmProxyPlans, setLlmProxyPlans] = useState<LlmProxyPlans | null>(null);
  const [llmProxyTokens, setLlmProxyTokens] = useState<LlmProxyToken[]>([]);
  const [llmProxyLoading, setLlmProxyLoading] = useState(false);
  const [llmProxyCreating, setLlmProxyCreating] = useState(false);
  const [llmProxyError, setLlmProxyError] = useState("");
  const [llmProxyReveal, setLlmProxyReveal] = useState<LlmProxyToken | null>(null);
  const [llmProxyProviderPlan, setLlmProxyProviderPlan] = useState("deepseek");
  const [llmProxyTokenName, setLlmProxyTokenName] = useState("DeepSeek Claude Code token");
  const [llmProxyAllowedModels, setLlmProxyAllowedModels] = useState("deepseek-v4-pro[1m]");

  const accessToken = (session as SessionWithAccessToken | null)?.accessToken;
  const canViewMetrics = useMemo(() => {
    const values = [session?.user?.name, session?.user?.email]
      .map((value) => (value || "").trim().toLowerCase())
      .filter(Boolean);
    return values.some((value) => value === "saiph" || value.split("@", 1)[0] === "saiph");
  }, [session?.user?.email, session?.user?.name]);
  const visiblePageItems = useMemo(
    () => PAGE_ITEMS.filter((item) => item.key !== "metrics" || canViewMetrics),
    [canViewMetrics],
  );
  const isPaidPlan = billing?.entitlement?.plan === "pro";
  const hasCloudAgentRecord = hasCloudAgent || Boolean(cloudAgentInfo?.has_cloud_agent);
  const cloudAgentModelLabel = useMemo(() => {
    const modelId = cloudAgentInfo?.model_id || "";
    return cloudModels.find((item) => item.id === modelId)?.label || modelId || "-";
  }, [cloudAgentInfo?.model_id, cloudModels]);

  const loadBilling = useCallback(async () => {
    if (!accessToken) return;
    setBillingLoading(true);
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/billing/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (response.ok) {
        setBilling((await response.json()) as BillingMe);
      }
    } finally {
      setBillingLoading(false);
    }
  }, [accessToken]);

  const loadCloudModels = useCallback(async () => {
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/workers/models/available`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = await response.json();
      const rows = Array.isArray(data?.models) ? data.models : [];
      setCloudModels(mergeCloudModels(rows as CloudModelOption[]));
    } catch {
      // keep fallback model list
    }
  }, []);

  const loadCloudAgentInfo = useCallback(async () => {
    if (!accessToken) return;
    setCloudAgentInfoLoading(true);
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/cloud-agents/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (response.ok) {
        setCloudAgentInfo((await response.json()) as CloudAgentInfo);
      }
    } finally {
      setCloudAgentInfoLoading(false);
    }
  }, [accessToken]);

  const loadLlmProxy = useCallback(async () => {
    if (!accessToken) return;
    setLlmProxyLoading(true);
    setLlmProxyError("");
    try {
      const [plansRes, tokensRes] = await Promise.all([
        fetch(`${CLIENT_WTT_API_BASE}/llm-proxy/plans`, { cache: "no-store" }),
        fetch(`${CLIENT_WTT_API_BASE}/llm-proxy/tokens`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        }),
      ]);
      if (plansRes.ok) setLlmProxyPlans((await plansRes.json()) as LlmProxyPlans);
      const tokenData = await tokensRes.json().catch(() => ({}));
      if (!tokensRes.ok) {
        const detail = tokenData.detail;
        setLlmProxyError(typeof detail === "string" ? detail : detail?.message || "LLM Proxy tokens 加载失败");
        return;
      }
      setLlmProxyTokens(Array.isArray(tokenData.tokens) ? tokenData.tokens : []);
    } catch {
      setLlmProxyError(t("settings.networkError"));
    } finally {
      setLlmProxyLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => {
    if (activePage !== "membership") return;
    void loadBilling();
  }, [activePage, loadBilling]);

  useEffect(() => {
    if (!accessToken) return;
    if (!["membership", "binding", "llm-proxy"].includes(activePage)) return;
    const timer = window.setInterval(() => void loadBilling(), 30_000);
    return () => window.clearInterval(timer);
  }, [accessToken, activePage, loadBilling]);

  useEffect(() => {
    if (!accessToken || !checkoutSession?.order_id) return;
    let cancelled = false;
    const pollOrder = async () => {
      try {
        const response = await fetch(`${CLIENT_WTT_API_BASE}/billing/orders/${encodeURIComponent(checkoutSession.order_id || "")}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (response.ok) {
          setCheckoutStatus(String(data.status || "pending"));
          if (data.status === "paid") {
            setCheckoutSession(null);
            await loadBilling();
          }
        }
      } catch {
        if (!cancelled) setCheckoutStatus("polling");
      }
    };
    void pollOrder();
    const timer = window.setInterval(() => void pollOrder(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [accessToken, checkoutSession?.order_id, loadBilling]);

  useEffect(() => {
    if (activePage !== "binding") return;
    void loadBilling();
    void loadCloudModels();
    void loadCloudAgentInfo();
  }, [activePage, loadBilling, loadCloudModels, loadCloudAgentInfo]);

  useEffect(() => {
    if (activePage !== "llm-proxy") return;
    void loadBilling();
    void loadLlmProxy();
  }, [activePage, loadBilling, loadLlmProxy]);

  // Load profile from backend
  useEffect(() => {
    if (!accessToken || activePage !== "profile") return;
    fetch(`${CLIENT_WTT_API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((d) => {
        setProfileDisplayName(d.display_name || "");
        setProfileBio(d.bio || "");
        setProfileAvatarUrl(d.avatar_url || null);
      })
      .catch(() => {});
  }, [accessToken, activePage]);

  const handleAvatarUpload = useCallback(
    async (file: File) => {
      if (!accessToken) return;
      setProfileUploading(true);
      setProfileError("");
      try {
        // Step 1: Sign
        const signRes = await fetch(`${CLIENT_WTT_API_BASE}/media/sign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            filename: file.name,
            mime_type: file.type,
            size: file.size,
          }),
        });
        if (!signRes.ok) throw new Error("Sign failed");
        const { upload_token, upload_url } = await signRes.json();

        // Step 2: Upload (upload_url is relative like /media/upload-direct/xxx,
        // must route through the Next.js proxy)
        const fullUploadUrl = upload_url.startsWith("/")
          ? `${CLIENT_WTT_API_BASE}${upload_url}`
          : upload_url;
        const uploadRes = await fetch(fullUploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!uploadRes.ok) throw new Error("Upload failed");

        // Step 3: Commit
        const commitRes = await fetch(`${CLIENT_WTT_API_BASE}/media/commit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ upload_token }),
        });
        if (!commitRes.ok) throw new Error("Commit failed");
        const asset = await commitRes.json();
        const newUrl = asset.url || asset.thumbnail_url;
        setProfileAvatarUrl(newUrl);

        // Auto-save avatar to backend immediately
        const saveRes = await fetch(`${CLIENT_WTT_API_BASE}/auth/profile`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ avatar_url: newUrl }),
        });
        if (saveRes.ok) {
          setProfileSaved(true);
          setTimeout(() => setProfileSaved(false), 2000);
        }
      } catch (e) {
        console.error("Avatar upload failed:", e);
        setProfileError(t("settings.avatarUploadFailed"));
        setTimeout(() => setProfileError(""), 4000);
      } finally {
        setProfileUploading(false);
      }
    },
    [accessToken, t],
  );

  const handleProfileSave = useCallback(async () => {
    if (!accessToken) return;
    setProfileSaving(true);
    setProfileSaved(false);
    try {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/auth/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          display_name: profileDisplayName || undefined,
          avatar_url: profileAvatarUrl,
          bio: profileBio || undefined,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch (e) {
      console.error("Profile save failed:", e);
    } finally {
      setProfileSaving(false);
    }
  }, [accessToken, profileDisplayName, profileAvatarUrl, profileBio]);

  const handleResetToken = async (agentId: string) => {
    const token = session?.accessToken as string | undefined;
    if (!token) return;
    const ok = confirm(t("settings.resetTokenConfirm"));
    if (!ok) return;
    setResettingToken(agentId);
    try {
      const response = await fetch(
        `${CLIENT_WTT_API_BASE}/agents/${encodeURIComponent(agentId)}/reset-token`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data.agent_token) {
          setAgentTokens((prev) => ({ ...prev, [agentId]: data.agent_token }));
        }
      } else {
        const err = await response.json().catch(() => ({ detail: "Failed" }));
        alert(err.detail || t("settings.resetTokenFailed"));
      }
    } catch {
      alert(t("settings.networkError"));
    } finally {
      setResettingToken(null);
    }
  };

  const handleProvisionAgent = async () => {
    const token = session?.accessToken as string | undefined;
    if (!token) {
      setProvisionError(t("settings.sessionExpired"));
      return;
    }

    setProvisioning(true);
    setProvisionError("");
    setProvisionSuccess("");
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/agents/provision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          display_name: provisionDisplayName.trim() || undefined,
          platform: "openclaw",
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setProvisionError(data.detail ?? t("settings.failedCreateAgent"));
        return;
      }

      setProvisioned({
        agent_id: data.agent_id,
        agent_token: data.agent_token,
        api_key: data.api_key,
      });
      setPluginCommandCreds({
        agent_id: data.agent_id,
        agent_token: data.agent_token,
      });
      setProvisionSuccess(t("settings.claimNewSuccess"));
      setProvisionDisplayName("");
      onBindingChanged?.();
    } catch {
      setProvisionError(t("settings.networkError"));
    } finally {
      setProvisioning(false);
    }
  };

  const submitCloudAgentCreateJob = async (payload: Record<string, unknown>): Promise<AgentOperationJob> => {
    if (!accessToken) throw new Error(t("settings.sessionExpired"));
    let response: Response | null = null;
    let data: unknown = null;
    let lastCreateError: unknown = null;
    const operationBody = JSON.stringify({
      operation_type: "cloud_agent_create",
      idempotency_key: "cloud-agent-create",
      payload,
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await settingsFetchJsonWithTimeout(`${CLIENT_WTT_API_BASE}/agent-operations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: operationBody,
        });
        response = result.response;
        data = result.data;
        if (response.ok || !isRetryableSettingsOperationStatus(response.status) || attempt === 2) {
          break;
        }
      } catch (error) {
        lastCreateError = error;
        if (!isRetryableSettingsOperationError(error) || attempt === 2) {
          throw error;
        }
      }
      await settingsDelay(650 * (attempt + 1));
    }

    if (!response) {
      if (lastCreateError instanceof Error) throw lastCreateError;
      throw new Error("Cloud Agent operation request failed");
    }
    if (!response.ok) {
      throw new Error(settingsErrorMessage(data, `Cloud Agent operation failed (${response.status})`));
    }
    const jobId = String((data as AgentOperationJob).job_id || "").trim();
    if (!jobId) throw new Error("Cloud Agent operation did not return a job id");
    let job = data as AgentOperationJob;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 240_000) {
      const status = String(job.status || "").toLowerCase();
      if (status === "succeeded") return job;
      if (status === "failed" || status === "timeout" || status === "cancelled") {
        throw new Error(job.error_message || `Cloud Agent operation ${status}`);
      }
      await settingsDelay(1500);
      const { response: poll, data: next } = await settingsFetchJsonWithTimeout(`${CLIENT_WTT_API_BASE}/agent-operations/${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!poll.ok) {
        throw new Error(settingsErrorMessage(next, `Cloud Agent operation polling failed (${poll.status})`));
      }
      job = next as AgentOperationJob;
    }
    throw new Error("Cloud Agent operation is still running; refresh the Agent list to check progress.");
  };

  const handleClaimCloudAgent = async () => {
    if (!accessToken) {
      setCloudClaimError(t("settings.sessionExpired"));
      return;
    }

    setCloudClaiming(true);
    setCloudClaimError("");
    setCloudClaimSuccess("");
    try {
      let paid = isPaidPlan;
      if (!paid) {
        const response = await fetch(`${CLIENT_WTT_API_BASE}/billing/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });
        if (response.ok) {
          const nextBilling = (await response.json()) as BillingMe;
          setBilling(nextBilling);
          const plan = nextBilling.entitlement?.plan;
          paid = plan === "pro";
        }
      }
      if (!paid) {
        setCloudClaimError("Cloud Agent 需要升级为 Pro 账户后才能使用。");
        return;
      }
      if (hasCloudAgentRecord) {
        setCloudClaimError("该账号已经创建过 Cloud Agent，每个账号只能创建一个。");
        return;
      }

      const job = await submitCloudAgentCreateJob({
          accepted_terms: true,
          display_name: provisionDisplayName.trim() || "Cloud Agent",
          agent_type: "claude-code",
          adapter: "claude-code",
          provider_plan: "deepseek",
          default_model: "deepseek-v4-pro[1m]",
          model: "deepseek-v4-pro[1m]",
          pricing_addon_rmb_per_hour: 0.5,
      });

      setCloudClaimSuccess(`Cloud Agent 已开通：${String(job.result?.agent_id || "")}`);
      void loadBilling();
      void loadCloudAgentInfo();
      onBindingChanged?.();
    } catch (error) {
      setCloudClaimError(error instanceof Error ? error.message : t("settings.networkError"));
    } finally {
      setCloudClaiming(false);
    }
  };

  const handleCheckout = async (plan: PlanId, billingMode: BillingMode) => {
    if (!accessToken) {
      setCheckoutError(t("settings.sessionExpired"));
      return;
    }
    if (isPaidPlan) {
      setCheckoutError("当前账号已经是 Pro 会员，无需重复支付。");
      return;
    }

    const key = `${plan}:${billingMode}`;
    setCheckoutLoading(key);
    setCheckoutError("");
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
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
        const detail = data.detail;
        setCheckoutError(typeof detail === "string" ? detail : detail?.message || "创建支付链接失败");
        return;
      }
      if (data.provider === "xunhupay" && data.order_id) {
        setCheckoutSession(data as CheckoutSession);
        setCheckoutStatus("pending");
        return;
      }
      window.location.href = data.url;
    } catch {
      setCheckoutError(t("settings.networkError"));
    } finally {
      setCheckoutLoading(null);
    }
  };

  const llmProxyProviderPlans = llmProxyPlans?.provider_plans || llmProxyPlans?.plans || [];
  const selectedLlmProxyPlan = llmProxyProviderPlans.find((plan) => plan.id === llmProxyProviderPlan) || llmProxyProviderPlans[0];
  const selectedLlmProxyPlanAvailable = (selectedLlmProxyPlan?.status || "available") === "available";

  const applyLlmProxyPlan = (planId: string) => {
    const plan = llmProxyProviderPlans.find((item) => item.id === planId);
    setLlmProxyProviderPlan(planId);
    if (plan?.models?.length) setLlmProxyAllowedModels(plan.models.join("\n"));
    if (plan?.name) setLlmProxyTokenName(`${plan.name} ${plan.copy_target === "codex" ? "Codex" : "Claude Code"} token`);
  };

  const buildLlmProxyEnv = (secret: string, providerPlan = llmProxyReveal?.provider_plan || llmProxyProviderPlan) => {
    const base = (llmProxyPlans?.proxy_base_url || "https://www.waxbyte.com/cloud-agent-proxy").replace(/\/+$/, "");
    if (providerPlan === "gpt") {
      return [
        "# GPT / Codex token",
        `export OPENAI_BASE_URL=${base}/openai/v1`,
        `export OPENAI_API_KEY=${secret}`,
        "# Requires wtt-connect >= 0.2.23 for Codex custom provider / no websocket.",
      ].join("\n");
    }
    const label = providerPlan === "claude" ? "Claude" : "DeepSeek";
    return [
      `# ${label} / Claude Code token`,
      `export ANTHROPIC_BASE_URL=${base}/anthropic`,
      `export ANTHROPIC_AUTH_TOKEN=${secret}`,
      "# This token is for Claude Code only. It is not a Codex/OpenAI Responses token.",
    ].join("\n");
  };

  const handleCreateLlmProxyToken = async () => {
    if (!accessToken) {
      setLlmProxyError(t("settings.sessionExpired"));
      return;
    }
    setLlmProxyCreating(true);
    setLlmProxyError("");
    setLlmProxyReveal(null);
    try {
      const allowedModels = llmProxyAllowedModels
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
      const response = await fetch(`${CLIENT_WTT_API_BASE}/llm-proxy/tokens`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: llmProxyTokenName.trim() || `${selectedLlmProxyPlan?.name || "DeepSeek"} token`,
          scope: "external_agent",
          provider_plan: llmProxyProviderPlan,
          allowed_models: allowedModels,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data.detail;
        setLlmProxyError(typeof detail === "string" ? detail : detail?.message || "Token 创建失败");
        return;
      }
      if (data.token) setLlmProxyReveal(data.token as LlmProxyToken);
      await loadLlmProxy();
    } catch {
      setLlmProxyError(t("settings.networkError"));
    } finally {
      setLlmProxyCreating(false);
    }
  };

  const handleRotateLlmProxyToken = async (tokenId: string) => {
    if (!accessToken) return;
    setLlmProxyError("");
    setLlmProxyReveal(null);
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/llm-proxy/tokens/${encodeURIComponent(tokenId)}/rotate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLlmProxyError(typeof data.detail === "string" ? data.detail : "Token rotate 失败");
        return;
      }
      if (data.token) setLlmProxyReveal(data.token as LlmProxyToken);
      await loadLlmProxy();
    } catch {
      setLlmProxyError(t("settings.networkError"));
    }
  };

  const handleDisableLlmProxyToken = async (tokenId: string) => {
    if (!accessToken) return;
    setLlmProxyError("");
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/llm-proxy/tokens/${encodeURIComponent(tokenId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ status: "disabled" }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setLlmProxyError(typeof data.detail === "string" ? data.detail : "Token 禁用失败");
        return;
      }
      await loadLlmProxy();
    } catch {
      setLlmProxyError(t("settings.networkError"));
    }
  };

  const handleClaimExisting = async () => {
    const token = session?.accessToken as string | undefined;
    if (!token) {
      setClaimExistingError(t("settings.sessionExpired"));
      return;
    }

    if (!existingAgentId.trim() || !existingAgentToken.trim()) {
      setClaimExistingError(t("settings.claimEmpty"));
      return;
    }

    setClaimingExisting(true);
    setClaimExistingError("");
    setClaimExistingSuccess("");

    try {
      const response = await fetch(
        `${CLIENT_WTT_API_BASE}/agents/claim-existing`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            agent_id: existingAgentId.trim(),
            agent_token: existingAgentToken.trim(),
            display_name: existingDisplayName.trim() || undefined,
          }),
        },
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setClaimExistingError(data.detail ?? t("settings.failedClaimExisting"));
        return;
      }

      setPluginCommandCreds({
        agent_id: data.agent_id || existingAgentId.trim(),
        agent_token: data.agent_token || existingAgentToken.trim(),
      });
      setClaimExistingSuccess(t("settings.claimExistingSuccess"));
      setExistingAgentId("");
      setExistingAgentToken("");
      setExistingDisplayName("");
      onBindingChanged?.();
    } catch {
      setClaimExistingError(t("settings.networkError"));
    } finally {
      setClaimingExisting(false);
    }
  };

  const handleCopy = async (text: string, okText = t("settings.copyOk")) => {
    try {
      await navigator.clipboard.writeText(text);
      alert(okText);
    } catch {
      alert(t("settings.copyFail"));
    }
  };

  const buildPluginCommand = (agentId: string, agentToken: string) => {
    const aid = JSON.stringify(agentId);
    const tok = JSON.stringify(agentToken);
    return [
      "# WTT plugin bootstrap (works after npm/plugin install)",
      `openclaw wtt-bootstrap --agent-id ${aid} --token ${tok}`,
      "",
      "# optional shortcut if standalone binary is installed",
      `openclaw-wtt-bootstrap --agent-id ${aid} --token ${tok}`,
      "",
      "# verify",
      "openclaw status",
    ].join("\n");
  };

  const buildWttConnectCommand = (
    adapter: "codex" | "claude-code" | "gemini",
    agentId: string,
    agentToken: string,
  ) => {
    const aid = shellQuote(agentId);
    const tok = shellQuote(agentToken);
    const setup = adapter === "gemini"
      ? [
          "# Gemini CLI uses Google OAuth. Run this once on the agent host if Gemini is not authenticated:",
          "gemini",
          "",
        ]
      : [];
    return [
      `# WTT ${adapter} agent binding`,
      "npm install -g wtt-connect",
      ...setup,
      `wtt-connect up ${adapter} ${aid} ${tok}`,
      "",
      "# verify",
      `wtt-connect status ${agentId}-${adapter}`,
      `wtt-connect logs ${agentId}-${adapter} --lines 100`,
    ].join("\n");
  };

  const buildAllWttConnectCommands = (agentId: string, agentToken: string) => [
    buildWttConnectCommand("codex", agentId, agentToken),
    "",
    buildWttConnectCommand("claude-code", agentId, agentToken),
    "",
    buildWttConnectCommand("gemini", agentId, agentToken),
  ].join("\n");

  const shellQuote = (value: string) => `'${String(value).replace(/'/g, `'\\''`)}'`;

  const wttConnectAdapters = [
    { id: "codex" as const, label: "Codex" },
    { id: "claude-code" as const, label: "Claude Code" },
    { id: "gemini" as const, label: "Gemini CLI" },
  ];

  const createMobileLoginQr = async () => {
    const token = session?.accessToken as string | undefined;
    if (!token) {
      setMobileLoginError(t("settings.sessionExpired"));
      return;
    }

    setMobileLoginLoading(true);
    setMobileLoginError("");
    setMobileLoginInfo("");
    try {
      const response = await fetch(
        `${CLIENT_WTT_API_BASE}/auth/mobile-login/session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMobileLoginError(
          (data as { detail?: string }).detail ?? t("settings.networkError"),
        );
        return;
      }
      setMobileLoginSession(data as MobileLoginSession);
      setMobileLoginInfo("二维码已生成，请在 WTT Android 中使用“扫码登录”。");
    } catch {
      setMobileLoginError(t("settings.networkError"));
    } finally {
      setMobileLoginLoading(false);
    }
  };

  const cancelMobileLoginQr = async () => {
    const token = session?.accessToken as string | undefined;
    if (!token || !mobileLoginSession?.session_id) {
      setMobileLoginSession(null);
      return;
    }
    try {
      await fetch(
        `${CLIENT_WTT_API_BASE}/auth/mobile-login/session/${encodeURIComponent(mobileLoginSession.session_id)}/cancel`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
    } catch {
      // noop
    } finally {
      setMobileLoginSession(null);
    }
  };

  useEffect(() => {
    if (!open || activePage !== "profile" || !mobileLoginSession?.session_id)
      return;
    const token = session?.accessToken as string | undefined;
    if (!token) return;

    const sid = mobileLoginSession.session_id;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(
          `${CLIENT_WTT_API_BASE}/auth/mobile-login/session/${encodeURIComponent(sid)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return;
        const status = (data as { status?: string }).status;
        if (!status) return;

        setMobileLoginSession((prev) =>
          prev
            ? { ...prev, status: status as MobileLoginSession["status"] }
            : prev,
        );

        if (status === "consumed") {
          setMobileLoginInfo("移动端已成功登录该账号。");
        } else if (status === "expired") {
          setMobileLoginError("二维码已过期，请重新生成。");
        } else if (status === "rejected") {
          setMobileLoginError("二维码登录已取消。");
        }
      } catch {
        // noop
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [open, activePage, mobileLoginSession?.session_id, session?.accessToken]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[86vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-50 md:block">
          <div className="border-b border-slate-200 px-4 py-5">
            <p className="text-sm font-semibold text-slate-800">
              {t("settings.center")}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {t("settings.structHint")}
            </p>
          </div>
          <nav className="p-2">
            {visiblePageItems.map((item) => {
              const Icon = item.icon;
              const active = activePage === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => onPageChange(item.key)}
                  className={`mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                    active
                      ? "bg-white text-indigo-600 shadow-sm"
                      : "text-slate-500 hover:bg-white/60 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t(item.labelKey)}
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-800">
                {t(
                  visiblePageItems.find((item) => item.key === activePage)
                    ?.labelKey || "settings.titleFallback",
                )}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {selectedAgent
                  ? t("settings.currentAgent", {
                      name: selectedAgent.display_name,
                      id: selectedAgentId || "n/a",
                    })
                  : t("settings.currentAgentNone")}
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-500 transition hover:text-slate-900"
              aria-label={t("common.close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-4 md:hidden">
            <select
              value={activePage}
              onChange={(e) => onPageChange(e.target.value as SettingsPage)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500"
            >
              {visiblePageItems.map((item) => (
                <option key={item.key} value={item.key}>
                  {t(item.labelKey)}
                </option>
              ))}
            </select>
          </div>

          {activePage === "profile" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-3 text-xs uppercase tracking-wide text-slate-400">
                  {t("settings.account")}
                </p>

                {/* Avatar section */}
                <div className="mb-4 flex items-center gap-4">
                  <div className="relative group">
                    <Avatar
                      name={profileDisplayName || session?.user?.name || session?.user?.email || "U"}
                      avatarUrl={profileAvatarUrl || session?.user?.image}
                      size="lg"
                    />
                    <button
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={profileUploading}
                      className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      {profileUploading ? (
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      ) : (
                        <Camera className="w-5 h-5 text-white" />
                      )}
                    </button>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleAvatarUpload(file);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-slate-800">
                      {profileDisplayName || session?.user?.name || session?.user?.email || ""}
                    </p>
                    {session?.user?.email && (
                      <p className="text-xs text-slate-400">
                        {session.user.email}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-1">
                      {t("settings.clickToUpload")}
                    </p>
                  </div>
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm text-slate-500">
                    {t("settings.displayName")}
                  </span>
                  <input
                    value={profileDisplayName}
                    onChange={(e) => setProfileDisplayName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                  />
                </label>
                <label className="mt-3 block">
                  <span className="mb-2 block text-sm text-slate-500">
                    {t("settings.email")}
                  </span>
                  <input
                    defaultValue={session?.user?.email || ""}
                    disabled
                    className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500 outline-none"
                  />
                </label>
                <label className="mt-3 block">
                  <span className="mb-2 block text-sm text-slate-500">
                    {t("settings.bio")}
                  </span>
                  <textarea
                    rows={3}
                    value={profileBio}
                    onChange={(e) => setProfileBio(e.target.value)}
                    placeholder={t("settings.bioPlaceholder")}
                    maxLength={500}
                    className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400">{profileBio.length}/500</span>
                </label>

                {/* Save button */}
                <button
                  onClick={handleProfileSave}
                  disabled={profileSaving}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-600 disabled:opacity-60"
                >
                  {profileSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : profileSaved ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {profileSaved ? t("settings.saved") : t("settings.saveProfile")}
                </button>
                {profileError && (
                  <p className="mt-2 text-xs text-red-500">{profileError}</p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">
                  {t("settings.linkedAgent")}
                </p>
                <p className="text-sm text-slate-600">
                  {selectedAgent
                    ? `${selectedAgent.display_name} (${selectedAgentId})`
                    : t("settings.noBoundAgent")}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {t("settings.mobileLogin")}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {t("settings.mobileLoginDesc")}
                    </p>
                  </div>
                  <Smartphone className="mt-0.5 h-4 w-4 text-indigo-500" />
                </div>

                {!mobileLoginSession ? (
                  <button
                    onClick={createMobileLoginQr}
                    disabled={mobileLoginLoading}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {mobileLoginLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Smartphone className="h-4 w-4" />
                    )}
                    {t("settings.generateQr")}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-3">
                      <QRCodeSVG
                        value={mobileLoginSession.login_uri}
                        size={160}
                        includeMargin
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      {t("settings.qrStatus")}{mobileLoginSession.status}
                    </p>
                    <p className="text-xs text-slate-500">
                      sid: {mobileLoginSession.session_id.slice(0, 8)}...
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={createMobileLoginQr}
                        disabled={mobileLoginLoading}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                      >
                        {t("settings.refreshQr")}
                      </button>
                      <button
                        onClick={cancelMobileLoginQr}
                        className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-600 hover:bg-rose-100"
                      >
                        {t("settings.cancelQr")}
                      </button>
                    </div>
                  </div>
                )}

                {mobileLoginInfo && (
                  <p className="mt-2 text-xs text-emerald-600">
                    {mobileLoginInfo}
                  </p>
                )}
                {mobileLoginError && (
                  <p className="mt-2 text-xs text-rose-600">
                    {mobileLoginError}
                  </p>
                )}
              </div>
            </div>
          )}

          {activePage === "membership" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">账户升级</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Pro 可申请云 Agent，并解锁技术面试、教育和高考板块。当前统一使用月度支付，支付成功后开通 1 个月。
                    </p>
                  </div>
                  <button
                    onClick={() => void loadBilling()}
                    disabled={billingLoading || !accessToken}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
                  >
                    {billingLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    刷新权益
                  </button>
                </div>

                <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-slate-400">当前计划</p>
                    <p className="mt-1 text-lg font-bold text-indigo-600">
                      {(billing?.entitlement?.plan || "free").toUpperCase()}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-slate-400">连续请求</p>
                    <p className="mt-1 font-semibold text-slate-800">
                      {billing?.cloud_agent_usage?.window_count || 0}/{billing?.entitlement?.limits?.window_limit || 0}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-slate-400">本月请求</p>
                    <p className="mt-1 font-semibold text-slate-800">
                      {billing?.cloud_agent_usage?.monthly_count || 0}/{billing?.entitlement?.limits?.monthly_limit || 0}
                    </p>
                  </div>
                </div>
              </div>

              {checkoutError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {checkoutError}
                </p>
              )}

              {hasCloudAgentRecord && !isPaidPlan && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  你已经创建过 Cloud Agent，但当前 Pro 会员已到期。请续费后继续使用云端 Agent、技术面试、教育和高考板块。
                </div>
              )}

              {checkoutSession && (
                <div className="rounded-xl border border-indigo-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900">迅虎支付</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {checkoutSession.plan?.toUpperCase()} · ¥{checkoutSession.amount_cny || "-"} · 状态：{checkoutStatus || "pending"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCheckoutSession(null)}
                      className="rounded-full border border-slate-200 p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                    {checkoutSession.qrcode_url ? (
                      <img src={checkoutSession.qrcode_url} alt="支付二维码" className="h-32 w-32 rounded-lg border border-slate-200 bg-white p-1" />
                    ) : checkoutSession.pay_url ? (
                      <div className="rounded-lg border border-slate-200 bg-white p-2">
                        <QRCodeSVG value={checkoutSession.pay_url} size={112} />
                      </div>
                    ) : null}
                    <div className="space-y-2 text-xs text-slate-500">
                      <p>支付成功后会自动刷新权益；请勿关闭当前账号登录状态。</p>
                      {checkoutSession.pay_url && (
                        <a
                          href={checkoutSession.pay_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-2 font-semibold text-white transition hover:bg-indigo-600"
                        >
                          打开支付页 <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {isPaidPlan && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                  当前账号已是 Pro 会员，有效期内无需重复支付。
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-1">
                {[
                  { plan: "pro" as const, name: "Pro", price: "¥30/月", window: "30 次连续请求", monthly: "500 次/月" },
                ].map((item) => (
                  <div key={item.plan} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-slate-900">{item.name}</p>
                        <p className="mt-1 text-sm font-semibold text-indigo-600">{item.price}</p>
                      </div>
                      {billing?.entitlement?.plan === item.plan && (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          当前
                        </span>
                      )}
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-slate-500">
                      <p>{item.window}</p>
                      <p>{item.monthly}</p>
                      <p>云 Agent + 技术面试 + 教育板块 + 高考板块</p>
                      <p>DeepSeek + Claude Code 请求额度：30 次连续请求，本月共 500 次</p>
                    </div>
                    {!isPaidPlan ? (
                      <div className="mt-4 grid gap-2">
                        <button
                          onClick={() => void handleCheckout(item.plan, "one_time")}
                          disabled={checkoutLoading !== null || !accessToken}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-60"
                        >
                          {checkoutLoading === `${item.plan}:one_time` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          立即支付，开通 1 个月
                        </button>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-700">
                        Pro 已开通
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <a
                href="/upgrade"
                className="block rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
              >
                打开完整升级页面
              </a>
            </div>
          )}

          {activePage === "llm-proxy" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">LLM Proxy Provider Plans</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      WTT Proxy 统一路由 DeepSeek、Claude、GPT 三类上游。当前真实可用的是 DeepSeek 套餐，只支持 Claude Code；GPT 套餐才用于 Codex。
                    </p>
                  </div>
                  <button
                    onClick={() => void loadLlmProxy()}
                    disabled={llmProxyLoading || !accessToken}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
                  >
                    {llmProxyLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    刷新
                  </button>
                </div>

                <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
                  {llmProxyProviderPlans.map((plan) => (
                    <div key={plan.id} className={`rounded-lg border p-3 ${plan.id === "deepseek" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-slate-800">{plan.name}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${plan.status === "available" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {plan.status === "available" ? "可用" : "待上游 key"}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-500">{plan.copy_target === "codex" ? "Codex" : "Claude Code"} · {plan.proxy_path}</p>
                      <p className="mt-1 text-slate-400">{plan.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {llmProxyError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {llmProxyError}
                </p>
              )}

              {llmProxyReveal?.secret && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-900">Token 只展示一次，请立即复制</p>
                  <pre className="mt-3 max-h-44 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-50">
                    {buildLlmProxyEnv(llmProxyReveal.secret, llmProxyReveal.provider_plan)}
                  </pre>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => void handleCopy(llmProxyReveal.secret || "", "Token 已复制")}
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white"
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" />
                      复制 Token
                    </button>
                    <button
                      onClick={() => void handleCopy(buildLlmProxyEnv(llmProxyReveal.secret || "", llmProxyReveal.provider_plan), "环境变量已复制")}
                      className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-700"
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" />
                      复制 Agent 配置
                    </button>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-800">创建外部 Agent Token</p>
                <div className="mt-3 grid gap-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    {llmProxyProviderPlans.map((plan) => (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => applyLlmProxyPlan(plan.id)}
                        className={`rounded-lg border px-3 py-2 text-left text-xs transition ${llmProxyProviderPlan === plan.id ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"}`}
                      >
                        <span className="block font-semibold">{plan.name}</span>
                        <span className="mt-1 block text-[11px] opacity-80">{plan.copy_target === "codex" ? "Codex" : "Claude Code"}</span>
                      </button>
                    ))}
                  </div>
                  <input
                    value={llmProxyTokenName}
                    onChange={(event) => setLlmProxyTokenName(event.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                    placeholder="Token 名称"
                  />
                  <textarea
                    value={llmProxyAllowedModels}
                    onChange={(event) => setLlmProxyAllowedModels(event.target.value)}
                    className="min-h-24 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500"
                    placeholder="允许模型，每行一个；留空表示后端默认模型集"
                  />
                  {llmProxyProviderPlan !== "gpt" && (
                    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                      当前套餐复制的是 Claude Code 配置，不会输出 Codex/OpenAI 环境变量。
                    </p>
                  )}
                  {llmProxyProviderPlan === "gpt" && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      GPT/Codex 套餐需要 Cloud Agent 服务器配置 OpenAI Responses-compatible 上游 key；DeepSeek key 不能用于 Codex。
                    </p>
                  )}
                  {!selectedLlmProxyPlanAvailable && (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                      该套餐还未配置上游 key，暂不能创建 token。
                    </p>
                  )}
                  <button
                    onClick={() => void handleCreateLlmProxyToken()}
                    disabled={llmProxyCreating || !accessToken || !selectedLlmProxyPlanAvailable}
                    className="inline-flex w-fit items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-60"
                  >
                    {llmProxyCreating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    创建 Token
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-800">Token 列表</p>
                <div className="mt-3 space-y-2">
                  {llmProxyTokens.length === 0 && (
                    <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                      暂无 LLM Proxy Token。
                    </p>
                  )}
                  {llmProxyTokens.map((token) => (
                    <div key={token.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {token.name}
                            {token.is_managed && <span className="ml-2 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] text-cyan-700">managed</span>}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {token.token_prefix}... · {token.scope} · {token.status} · {token.plan_id}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            本月 {(token.usage_month?.total_tokens || 0).toLocaleString()} / {(token.monthly_token_limit || 0).toLocaleString()} tokens，
                            请求 {(token.usage_month?.requests || 0).toLocaleString()} 次
                          </p>
                          {token.allowed_models && token.allowed_models.length > 0 && (
                            <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                              Models: {token.allowed_models.join(", ")}
                            </p>
                          )}
                        </div>
                        {!token.is_managed && (
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <button
                              onClick={() => void handleRotateLlmProxyToken(token.id)}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                            >
                              Rotate
                            </button>
                            {token.status === "active" && (
                              <button
                                onClick={() => void handleDisableLlmProxyToken(token.id)}
                                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                              >
                                Disable
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">模型价格参考</p>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-left text-xs text-slate-600">
                    <thead className="text-slate-400">
                      <tr>
                        <th className="whitespace-nowrap px-2 py-2">Provider</th>
                        <th className="whitespace-nowrap px-2 py-2">Model</th>
                        <th className="whitespace-nowrap px-2 py-2">Context</th>
                        <th className="whitespace-nowrap px-2 py-2">Input Cache Hit</th>
                        <th className="whitespace-nowrap px-2 py-2">Input Cache Miss</th>
                        <th className="whitespace-nowrap px-2 py-2">Output</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(llmProxyPlans?.model_price_reference || []).map((row) => (
                        <tr key={`${row.provider}:${row.model}`} className="border-t border-slate-200">
                          <td className="px-2 py-2">{row.provider}</td>
                          <td className="px-2 py-2 font-semibold text-slate-800">{row.model}</td>
                          <td className="px-2 py-2">{row.context}</td>
                          <td className="px-2 py-2">{row.input_cache_hit}</td>
                          <td className="px-2 py-2">{row.input_cache_miss}</td>
                          <td className="px-2 py-2">{row.output}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activePage === "metrics" && canViewMetrics && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      WTT Metrics
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      仅 saiph 和管理员可访问。页面展示后端资源、数据库连接、Topic、Message、Task 和 Agent 概况。
                    </p>
                  </div>
                </div>
                <a
                  href="/admin/metrics"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  打开 Metrics 页面
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          )}

          {activePage === "binding" && (
            <div className="space-y-3">
              <div className="relative rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      Cloud Agent
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      默认 DeepSeek + Claude Code；每小时额外 ¥0.5，Pro 额度为 30 次连续请求、本月共 500 次。每个账号只有一个 Cloud Sandbox，可通过 Clone Agent 在同一 Sandbox 中运行多个 Agent。
                    </p>
                  </div>
                  <a
                    href="/upgrade"
                    className="shrink-0 rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-100"
                  >
                    查看会员
                  </a>
                </div>
                {!hasCloudAgentRecord && (
                  <p className="mt-3 rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                    默认创建 DeepSeek + Claude Code。Gemini/Codex 可在 Feed 左侧 Cloud Agent 创建弹窗中选择，也可以创建后在 Terminal 中配置 API Key 或登录。
                  </p>
                )}
                {hasCloudAgentRecord && (
                  <div className="mt-3 grid gap-2 rounded-lg border border-cyan-200 bg-white p-3 text-xs text-slate-600 sm:grid-cols-2">
                    <div>
                      <p className="text-slate-400">Agent</p>
                      <p className="mt-1 truncate font-semibold text-slate-800">
                        {cloudAgentInfo?.agent_id || selectedAgent?.agent_id || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">运行时</p>
                      <p className="mt-1 font-semibold text-slate-800">
                        {(cloudAgentInfo?.agent_type || "claude-code") === "codex" ? "OpenAI Codex" : "Claude Code"} / {cloudAgentModelLabel}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">状态</p>
                      <p className="mt-1 font-semibold text-slate-800">
                        {cloudAgentInfoLoading ? "刷新中" : (cloudAgentInfo?.docker_status || cloudAgentInfo?.status || "-")}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">资源</p>
                      <p className="mt-1 font-semibold text-slate-800">
                        {(cloudAgentInfo?.resource_profile || billing?.entitlement?.plan || "-").toString().toUpperCase()}
                        {" "}
                        {formatBytes(cloudAgentInfo?.workspace_bytes)} / {formatBytes(cloudAgentInfo?.workspace_limit_bytes)}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-slate-400">模型用量</p>
                      <p className="mt-1 font-semibold text-slate-800">
                        {cloudAgentInfo?.usage_totals?.requests || 0} requests / {cloudAgentInfo?.usage_totals?.total_tokens || 0} tokens
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">连续请求额度</p>
                      <p className="mt-1 font-semibold text-slate-800">
                        {billing?.cloud_agent_usage?.window_count || 0}/{billing?.entitlement?.limits?.window_limit || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">本月请求额度</p>
                      <p className="mt-1 font-semibold text-slate-800">
                        {billing?.cloud_agent_usage?.monthly_count || 0}/{billing?.entitlement?.limits?.monthly_limit || 0}
                      </p>
                    </div>
                    {billing?.cloud_agent_usage?.blocked_until && (
                      <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                        <p className="font-semibold">请求暂时限流</p>
                        <p className="mt-1 text-[11px] leading-4">
                          恢复时间：{billing.cloud_agent_usage.blocked_until}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                <button
                  onClick={handleClaimCloudAgent}
                  disabled={cloudClaiming || hasCloudAgentRecord}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cloudClaiming && <Loader2 className="h-4 w-4 animate-spin" />}
                  {hasCloudAgentRecord ? "Cloud Agent 已创建" : "Cloud Agent"}
                </button>
                {cloudClaimError && (
                  <p className="mt-2 text-sm text-red-500">{cloudClaimError}</p>
                )}
                {cloudClaimSuccess && (
                  <p className="mt-2 text-sm text-emerald-600">{cloudClaimSuccess}</p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">
                  {t("settings.claimNew")}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {t("settings.claimNewDesc")}
                </p>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={provisionDisplayName}
                    onChange={(e) => setProvisionDisplayName(e.target.value)}
                    placeholder={t("settings.agentDisplayOptional")}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleProvisionAgent}
                    disabled={provisioning}
                    className="shrink-0 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {provisioning
                      ? t("settings.processing")
                      : t("settings.claimNewBtn")}
                  </button>
                </div>

                {provisionError && (
                  <p className="mt-2 text-sm text-red-500">{provisionError}</p>
                )}
                {provisionSuccess && (
                  <p className="mt-2 text-sm text-emerald-600">
                    {provisionSuccess}
                  </p>
                )}

                {provisioned && (
                  <div className="mt-3 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-xs font-semibold text-emerald-700">
                      {t("settings.saveCred")}
                    </p>
                    <div className="grid gap-2">
                      <div className="rounded border border-emerald-200 bg-white p-2">
                        <p className="text-[11px] text-slate-500">agent_id</p>
                        <code className="text-xs text-slate-800">
                          {provisioned.agent_id}
                        </code>
                      </div>
                      <div className="rounded border border-emerald-200 bg-white p-2">
                        <p className="text-[11px] text-slate-500">
                          agent_token
                        </p>
                        <code className="text-xs text-slate-800 break-all">
                          {provisioned.agent_token}
                        </code>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() =>
                          handleCopy(provisioned.agent_id, "agent_id copied")
                        }
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        {t("settings.copyAgentId")}
                      </button>
                      <button
                        onClick={() =>
                          handleCopy(
                            provisioned.agent_token,
                            "agent_token copied",
                          )
                        }
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        {t("settings.copyAgentToken")}
                      </button>
                      <button
                        onClick={() =>
                          handleCopy(
                            JSON.stringify(
                              {
                                channels: {
                                  wtt: {
                                    accounts: {
                                      default: {
                                        enabled: true,
                                        cloudUrl: CLIENT_WTT_API_BASE,
                                        agentId: provisioned.agent_id,
                                        token: provisioned.agent_token,
                                        slashCompat: true,
                                        slashCompatWttPrefixOnly: true,
                                        slashBypassMentionGate: true,
                                        taskExecutorScope: "pipeline_only",
                                      },
                                    },
                                  },
                                },
                              },
                              null,
                              2,
                            ),
                            "openclaw.json snippet copied",
                          )
                        }
                        className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-100"
                      >
                        {t("settings.copySnippet")}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">
                  {t("settings.claimExisting")}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {t("settings.claimExistingDesc")}
                </p>

                <div className="mt-3 space-y-2">
                  <input
                    value={existingAgentId}
                    onChange={(e) => setExistingAgentId(e.target.value)}
                    placeholder="agent_id"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                  />
                  <input
                    value={existingAgentToken}
                    onChange={(e) => setExistingAgentToken(e.target.value)}
                    placeholder="agent_token"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                  />
                  <input
                    value={existingDisplayName}
                    onChange={(e) => setExistingDisplayName(e.target.value)}
                    placeholder={t("settings.displayNameOptional")}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleClaimExisting}
                    disabled={
                      claimingExisting ||
                      !existingAgentId.trim() ||
                      !existingAgentToken.trim()
                    }
                    className="w-full rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {claimingExisting
                      ? t("settings.processing")
                      : t("settings.claimExistingBtn")}
                  </button>
                </div>

                {claimExistingError && (
                  <p className="mt-2 text-sm text-red-500">
                    {claimExistingError}
                  </p>
                )}
                {claimExistingSuccess && (
                  <p className="mt-2 text-sm text-emerald-600">
                    {claimExistingSuccess}
                  </p>
                )}
              </div>

              {pluginCommandCreds && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
                    <p className="text-sm font-semibold text-teal-900">
                      wtt-connect 一键绑定 Codex / Claude Code / Gemini
                    </p>
                    <p className="mt-1 text-xs leading-5 text-teal-700">
                      在 Agent 所在主机复制执行对应命令即可绑定。Codex、Claude Code、Gemini 默认以全权限模式启动，不再弹任务确认；Gemini 需要先在本机完成 Google OAuth 授权。
                    </p>
                    <div className="mt-3 grid gap-3 lg:grid-cols-3">
                      {wttConnectAdapters.map((adapter) => (
                        <div key={adapter.id} className="rounded-lg border border-teal-200 bg-white p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs font-black text-teal-900">{adapter.label}</p>
                            <button
                              onClick={() =>
                                handleCopy(
                                  buildWttConnectCommand(
                                    adapter.id,
                                    pluginCommandCreds.agent_id,
                                    pluginCommandCreds.agent_token,
                                  ),
                                  `${adapter.label} wtt-connect command copied`,
                                )
                              }
                              className="inline-flex items-center gap-1 rounded border border-teal-200 bg-teal-50 px-2 py-1 text-[11px] font-semibold text-teal-700 hover:bg-teal-100"
                            >
                              <ClipboardCopy className="h-3 w-3" />
                              复制
                            </button>
                          </div>
                          <pre className="max-h-52 overflow-auto rounded-md border border-slate-100 bg-slate-950 p-2 text-[10px] leading-4 text-teal-100">
                            {buildWttConnectCommand(
                              adapter.id,
                              pluginCommandCreds.agent_id,
                              pluginCommandCreds.agent_token,
                            )}
                          </pre>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() =>
                        handleCopy(
                          buildAllWttConnectCommands(
                            pluginCommandCreds.agent_id,
                            pluginCommandCreds.agent_token,
                          ),
                          "All wtt-connect commands copied",
                        )
                      }
                      className="mt-3 rounded border border-teal-200 bg-white px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100"
                    >
                      复制全部 wtt-connect 命令
                    </button>
                  </div>

                  <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                    <p className="text-sm font-semibold text-indigo-800">
                      {t("settings.pluginCmdTitle")}
                    </p>
                    <p className="mt-1 text-xs text-indigo-600">
                      {t("settings.pluginCmdDesc")}
                    </p>
                    <pre className="mt-3 max-h-56 overflow-auto rounded-lg border border-indigo-200 bg-white p-3 text-[11px] leading-5 text-slate-700">
                      {buildPluginCommand(
                        pluginCommandCreds.agent_id,
                        pluginCommandCreds.agent_token,
                      )}
                    </pre>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={() =>
                          handleCopy(
                            buildPluginCommand(
                              pluginCommandCreds.agent_id,
                              pluginCommandCreds.agent_token,
                            ),
                            t("settings.pluginCmdCopied"),
                          )
                        }
                        className="rounded border border-indigo-200 bg-white px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-100"
                      >
                        {t("settings.copyPluginCmd")}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">
                  {t("settings.boundAgents", { count: agents.length })}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {t("settings.boundAgentsDesc")}
                </p>

                <div className="mt-3 space-y-2">
                  {agents.map((agent) => (
                    <div
                      key={agent.agent_id}
                      className="rounded-lg border border-slate-200 bg-white p-3"
                    >
                      <p className="truncate text-sm font-medium text-slate-800">
                        {agent.display_name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">
                        {agent.agent_id}
                      </p>

                      {agentTokens[agent.agent_id] ? (
                        <div className="mt-2 flex items-center gap-2">
                          <code className="flex-1 truncate rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 font-mono border border-amber-200">
                            {agentTokens[agent.agent_id]}
                          </code>
                          <button
                            onClick={() =>
                              handleCopy(
                                agentTokens[agent.agent_id],
                                "Token copied",
                              )
                            }
                            className="shrink-0 rounded border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-amber-600"
                            title={t("settings.copyAgentToken")}
                          >
                            <ClipboardCopy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleResetToken(agent.agent_id)}
                          disabled={resettingToken === agent.agent_id}
                          className="mt-2 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                        >
                          {resettingToken === agent.agent_id
                            ? t("settings.resetting")
                            : t("settings.resetToken")}
                        </button>
                      )}
                    </div>
                  ))}
                  {agents.length === 0 && (
                    <p className="py-4 text-center text-sm text-slate-400">
                      {t("settings.noAgents")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activePage === "notifications" && (
            <div className="space-y-3">
              <ToggleRow
                label={t("settings.notifyMessage")}
                hint={t("settings.notifyMessageHint")}
                enabled={messageNotify}
                onToggle={setMessageNotify}
              />
              <ToggleRow
                label={t("settings.notifyAgent")}
                hint={t("settings.notifyAgentHint")}
                enabled={agentAlert}
                onToggle={setAgentAlert}
              />
              <ToggleRow
                label={t("settings.sound")}
                hint={t("settings.soundHint")}
                enabled={soundOn}
                onToggle={setSoundOn}
              />
            </div>
          )}

          {activePage === "privacy" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">
                  {t("settings.sessionToken")}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {t("settings.sessionTokenHint")}
                </p>
              </div>
              <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4">
                <p className="text-sm text-red-600">{t("settings.riskHint")}</p>
              </div>
            </div>
          )}

          {activePage === "appearance" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                t("settings.themeLight"),
                t("settings.themeWarm"),
                t("settings.themeCool"),
              ].map((theme, i) => (
                <button
                  key={theme}
                  className={`rounded-xl border px-3 py-8 text-sm transition ${i === 0 ? "border-indigo-300 bg-indigo-50 text-indigo-600 font-medium" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-300"}`}
                >
                  {theme}
                </button>
              ))}
            </div>
          )}

          {activePage === "about" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">
                  {t("settings.aboutTitle")}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {t("settings.aboutDesc")}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-400">
                {t("settings.aboutHelp")}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  enabled,
  onToggle,
}: {
  label: string;
  hint: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="mt-1 text-xs text-slate-400">{hint}</p>
      </div>
      <button
        onClick={() => onToggle(!enabled)}
        className={`relative h-6 w-11 rounded-full border transition ${enabled ? "border-indigo-300 bg-indigo-100" : "border-slate-200 bg-white"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full transition ${enabled ? "left-[22px] bg-indigo-500" : "left-0.5 bg-[#62768a]"}`}
        />
      </button>
    </div>
  );
}
