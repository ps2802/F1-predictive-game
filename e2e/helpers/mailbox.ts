import { BlockedRunError, type MailboxProvider } from "./types";

type AgentMailInbox = {
  inbox_id?: string;
  email?: string;
};

type AgentMailMessageListItem = {
  message_id?: string;
  id?: string;
  subject?: string;
  created_at?: string;
  received_at?: string;
  from?: Array<{ email?: string }> | { email?: string } | string;
};

type AgentMailMessage = {
  subject?: string;
  text?: string;
  html?: string;
  created_at?: string;
  received_at?: string;
};

type MailTmDomain = {
  domain?: string;
  isActive?: boolean;
};

type MailTmAccount = {
  id?: string;
  address?: string;
};

type MailTmTokenResponse = {
  token?: string;
};

type MailTmMessageListItem = {
  id?: string;
  subject?: string;
  intro?: string;
  createdAt?: string;
  from?: { address?: string; name?: string };
};

type MailTmMessage = {
  subject?: string;
  intro?: string;
  text?: string;
  html?: string[] | string;
  createdAt?: string;
};

function getApiBase(): string {
  return process.env.GRIDLOCK_CANARY_MAIL_API_BASE ?? "https://api.agentmail.to";
}

function getApiKey(): string {
  const apiKey = process.env.GRIDLOCK_CANARY_MAIL_API_KEY;
  if (!apiKey) {
    throw new BlockedRunError(
      "mailbox.config",
      "Missing GRIDLOCK_CANARY_MAIL_API_KEY."
    );
  }
  return apiKey;
}

function normalizeItems<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.items)) {
      return record.items as T[];
    }
    if (Array.isArray(record.data)) {
      return record.data as T[];
    }
    if (Array.isArray(record.messages)) {
      return record.messages as T[];
    }
    if (Array.isArray(record.inboxes)) {
      return record.inboxes as T[];
    }
  }

  return [];
}

function parseEmailAddress(from: AgentMailMessageListItem["from"]): string {
  if (!from) {
    return "";
  }

  if (typeof from === "string") {
    return from;
  }

  if (Array.isArray(from)) {
    return from[0]?.email ?? "";
  }

  return from.email ?? "";
}

class AgentMailProvider implements MailboxProvider {
  private apiKey = getApiKey();
  private baseUrl = getApiBase();

  private async request<T>(pathname: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`AgentMail request failed (${response.status}): ${body}`);
    }

    return (await response.json()) as T;
  }

  private async listInboxes(): Promise<AgentMailInbox[]> {
    const response = await this.request<unknown>("/v0/inboxes");
    return normalizeItems<AgentMailInbox>(response);
  }

  async getOrCreateInbox(
    alias: string,
    preferredEmail?: string
  ): Promise<{ email: string; inboxId: string }> {
    const desiredEmail = preferredEmail?.trim().toLowerCase() || "";
    const inboxes = await this.listInboxes();
    const existing = desiredEmail
      ? inboxes.find((inbox) => (inbox.email ?? "").toLowerCase() === desiredEmail)
      : null;

    if (existing?.email) {
      return {
        email: existing.email,
        inboxId: existing.inbox_id ?? existing.email,
      };
    }

    const domain =
      desiredEmail.split("@")[1] ||
      process.env.GRIDLOCK_CANARY_MAIL_DOMAIN ||
      "agentmail.to";
    const username =
      desiredEmail.split("@")[0] ||
      alias.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    const created = await this.request<{
      email: string;
      inbox_id: string;
    }>("/v0/inboxes", {
      method: "POST",
      body: JSON.stringify({
        username,
        domain,
        display_name: `Gridlock Canary ${alias}`,
        client_id: `gridlock-canary-${alias}`,
      }),
    });

    return {
      email: created.email,
      inboxId: created.inbox_id ?? created.email,
    };
  }

  async waitForPrivyEmail(
    _email: string,
    timeoutMs: number,
    options?: { inboxId?: string; sinceMs?: number }
  ): Promise<{ subject: string; html: string; text: string; receivedAt: string }> {
    const inboxId = options?.inboxId;
    if (!inboxId) {
      throw new BlockedRunError(
        "mailbox.lookup",
        "Missing inbox id while waiting for email."
      );
    }

    const deadline = Date.now() + timeoutMs;
    const sinceMs = options?.sinceMs ?? Date.now() - 5_000;

    while (Date.now() < deadline) {
      const listResponse = await this.request<unknown>(
        `/v0/inboxes/${encodeURIComponent(inboxId)}/messages`
      );
      const messages = normalizeItems<AgentMailMessageListItem>(listResponse);
      const candidate = messages.find((message) => {
        const timestamp = new Date(
          message.received_at ?? message.created_at ?? 0
        ).getTime();
        const subject = message.subject ?? "";
        const from = parseEmailAddress(message.from);
        return (
          timestamp >= sinceMs &&
          (/gridlock|privy|magic link|sign in|login/i.test(subject) ||
            /privy|gridlock/i.test(from))
        );
      });

      if (candidate) {
        const messageId = candidate.message_id ?? candidate.id;
        if (!messageId) {
          break;
        }

        const detail = await this.request<AgentMailMessage>(
          `/v0/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}`
        );

        return {
          subject: detail.subject ?? candidate.subject ?? "",
          html: detail.html ?? "",
          text: detail.text ?? "",
          receivedAt:
            detail.received_at ??
            detail.created_at ??
            candidate.received_at ??
            candidate.created_at ??
            new Date().toISOString(),
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }

    throw new Error("Timed out waiting for Gridlock / Privy verification email.");
  }
}

class MailTmProvider implements MailboxProvider {
  private baseUrl = process.env.GRIDLOCK_CANARY_MAIL_API_BASE ?? "https://api.mail.tm";
  private sessions = new Map<string, { token: string; password: string; email: string }>();
  private domain: string | null = null;

  private async request<T>(
    pathname: string,
    init?: RequestInit,
    token?: string
  ): Promise<T> {
    let attempt = 0;
    let lastStatus = 0;
    let lastBody = "";

    while (attempt < 4) {
      const response = await fetch(`${this.baseUrl}${pathname}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init?.headers ?? {}),
        },
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      lastStatus = response.status;
      lastBody = await response.text().catch(() => "");

      if (response.status !== 429 && response.status < 500) {
        break;
      }

      attempt += 1;
      if (attempt >= 4) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 3_000));
    }

    throw new Error(`Mail.tm request failed (${lastStatus}): ${lastBody}`);
  }

  private async createToken(email: string, password: string): Promise<string> {
    const response = await this.request<MailTmTokenResponse>("/token", {
      method: "POST",
      body: JSON.stringify({
        address: email,
        password,
      }),
    });

    if (!response.token) {
      throw new Error(`Mail.tm did not return a token for ${email}.`);
    }

    return response.token;
  }

  private async pickDomain(): Promise<string> {
    if (this.domain) {
      return this.domain;
    }

    const response = await this.request<{
      "hydra:member"?: MailTmDomain[];
    }>("/domains");
    const domain =
      response["hydra:member"]?.find((item) => item.isActive)?.domain ??
      response["hydra:member"]?.[0]?.domain;

    if (!domain) {
      throw new Error("Mail.tm did not return an active domain.");
    }

    this.domain = domain;
    return domain;
  }

  async getOrCreateInbox(
    alias: string,
    preferredEmail?: string
  ): Promise<{ email: string; inboxId: string }> {
    if (preferredEmail) {
      throw new BlockedRunError(
        "mailbox.config",
        "mailtm does not support reusing stable personas; use AgentMail for preferred inboxes."
      );
    }

    const domain = await this.pickDomain();
    const username = alias
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24);
    const suffix = Math.random().toString(36).slice(2, 8);
    const email = `${username}-${suffix}@${domain}`;
    const password = `Gridlock!${Math.random().toString(36).slice(2, 12)}`;

    const created = await this.request<MailTmAccount>("/accounts", {
      method: "POST",
      body: JSON.stringify({
        address: email,
        password,
      }),
    });

    const token = await this.createToken(email, password);
    const inboxId = created.id ?? email;

    this.sessions.set(inboxId, { token, password, email });

    return {
      email,
      inboxId,
    };
  }

  async waitForPrivyEmail(
    _email: string,
    timeoutMs: number,
    options?: { inboxId?: string; sinceMs?: number }
  ): Promise<{ subject: string; html: string; text: string; receivedAt: string }> {
    const inboxId = options?.inboxId;
    if (!inboxId) {
      throw new BlockedRunError(
        "mailbox.lookup",
        "Missing inbox id while waiting for email."
      );
    }

    const session = this.sessions.get(inboxId);
    if (!session) {
      throw new BlockedRunError(
        "mailbox.lookup",
        `Mail.tm session missing for inbox ${inboxId}.`
      );
    }

    const deadline = Date.now() + timeoutMs;
    const sinceMs = options?.sinceMs ?? Date.now() - 5_000;

    while (Date.now() < deadline) {
      const listResponse = await this.request<{
        "hydra:member"?: MailTmMessageListItem[];
      }>("/messages", undefined, session.token);
      const messages = listResponse["hydra:member"] ?? [];
      const candidate = messages.find((message) => {
        const timestamp = new Date(message.createdAt ?? 0).getTime();
        const subject = message.subject ?? "";
        const from = message.from?.address ?? "";
        return (
          timestamp >= sinceMs &&
          (/gridlock|privy|magic link|sign in|login/i.test(subject) ||
            /privy|gridlock/i.test(from))
        );
      });

      if (candidate?.id) {
        const detail = await this.request<MailTmMessage>(
          `/messages/${encodeURIComponent(candidate.id)}`,
          undefined,
          session.token
        );

        return {
          subject: detail.subject ?? candidate.subject ?? "",
          html: Array.isArray(detail.html)
            ? detail.html.join("\n")
            : (detail.html ?? ""),
          text: detail.text ?? detail.intro ?? candidate.intro ?? "",
          receivedAt: detail.createdAt ?? candidate.createdAt ?? new Date().toISOString(),
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }

    throw new Error("Timed out waiting for Gridlock / Privy verification email.");
  }
}

export function createMailboxProvider(): MailboxProvider {
  const provider = process.env.GRIDLOCK_CANARY_MAIL_PROVIDER ?? "agentmail";
  if (provider === "agentmail") {
    return new AgentMailProvider();
  }

  if (provider === "mailtm") {
    return new MailTmProvider();
  }

  if (provider !== "agentmail") {
    throw new BlockedRunError(
      "mailbox.config",
      `Unsupported mailbox provider: ${provider}.`
    );
  }

  return new AgentMailProvider();
}
