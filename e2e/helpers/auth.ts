import { expect, type Locator, type Page } from "@playwright/test";
import { BlockedRunError, type MailboxProvider, type SyntheticPersona } from "./types";

function firstMatchingUrl(text: string): string | null {
  const matches = text.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  return (
    matches.find((value) =>
      /privy|gridlock|login|verify|auth|magic|token|code/i.test(value)
    ) ??
    null
  );
}

function firstOtpCode(text: string): string | null {
  return text.match(/\b(\d{6})\b/)?.[1] ?? null;
}

async function firstVisibleLocator(page: Page, locators: Locator[]): Promise<Locator | null> {
  for (const locator of locators) {
    if (await locator.first().isVisible().catch(() => false)) {
      return locator.first();
    }
  }

  return null;
}

async function openEmailMethod(page: Page): Promise<void> {
  const emailMethod = await firstVisibleLocator(page, [
    page.getByRole("button", { name: /email/i }),
    page.getByRole("link", { name: /email/i }),
    page.locator("button").filter({ hasText: /email/i }),
  ]);

  if (emailMethod) {
    await emailMethod.click();
  }
}

async function fillEmailAndSubmit(page: Page, email: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  let emailInput: Locator | null = null;

  while (Date.now() < deadline && !emailInput) {
    emailInput = await firstVisibleLocator(page, [
      page.locator('input[type="email"]'),
      page.locator('input[autocomplete="email"]'),
      page.getByRole("textbox", { name: /email/i }),
      page.getByPlaceholder(/email/i),
    ]);

    if (emailInput) {
      break;
    }

    const genericError = page.getByText(/something went wrong|try again later/i).first();
    if (await genericError.isVisible().catch(() => false)) {
      throw new Error("Privy modal errored before email auth rendered.");
    }

    const nonEmailMethods = await firstVisibleLocator(page, [
      page.getByRole("button", { name: /google|wallet|passkey/i }),
      page.getByText(/continue with a wallet|i have a passkey/i).first(),
    ]);

    if (nonEmailMethods) {
      throw new BlockedRunError(
        "auth.config",
        "Privy email login is not enabled for this environment."
      );
    }

    await page.waitForTimeout(250);
  }

  if (!emailInput) {
    throw new Error("Privy email input did not render.");
  }

  await emailInput.fill(email);

  const passwordlessInitResponse = page
    .waitForResponse(
      (response) => response.url().includes("/api/v1/passwordless/init"),
      { timeout: 15_000 }
    )
    .catch(() => null);

  const submit = await firstVisibleLocator(page, [
    page.getByRole("button", { name: /continue|submit|send code|email me|next/i }),
    page.locator("button[type='submit']"),
  ]);

  if (!submit) {
    throw new Error("Privy email submit button did not render.");
  }

  await submit.click();

  const initResponse = await passwordlessInitResponse;
  if (initResponse && initResponse.status() >= 400) {
    const responseBody = await initResponse.text().catch(() => "");
    if (initResponse.status() === 403) {
      throw new BlockedRunError(
        "auth.config",
        "Privy passwordless auth rejected this origin or app client."
      );
    }

    throw new Error(
      `Privy passwordless auth failed (${initResponse.status()}): ${responseBody}`
    );
  }

  const genericError = page.getByText(/something went wrong|try again later/i).first();
  if (await genericError.isVisible().catch(() => false)) {
    throw new Error("Privy modal errored after email submission.");
  }
}

async function applyOtpCode(page: Page, code: string): Promise<void> {
  const otpInputs = page.locator(
    'input[autocomplete="one-time-code"], input[inputmode="numeric"], input[name*="code" i]'
  );
  const count = await otpInputs.count();

  if (count <= 0) {
    throw new Error("Privy OTP input did not render.");
  }

  if (count === 1) {
    await otpInputs.first().fill(code);
  } else {
    const chars = code.split("");
    for (let index = 0; index < Math.min(chars.length, count); index += 1) {
      await otpInputs.nth(index).fill(chars[index] ?? "");
    }
  }

  const confirm = await firstVisibleLocator(page, [
    page.getByRole("button", { name: /verify|continue|submit/i }),
    page.locator("button[type='submit']"),
  ]);

  if (confirm) {
    await confirm.click();
  }
}

async function waitForAuthenticatedDestination(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForFunction(() => {
    const pathname = window.location.pathname;
    return /^(\/dashboard|\/onboarding|\/predict\/|\/join\/|\/leagues(\/|$))/.test(
      pathname
    );
  }, undefined, { timeout: timeoutMs });
}

export async function authenticateWithPrivyEmail(options: {
  page: Page;
  baseUrl: string;
  mailbox: MailboxProvider;
  persona: SyntheticPersona;
  timeoutMs: number;
}): Promise<{ onboardingRequired: boolean }> {
  const { page, baseUrl, mailbox, persona, timeoutMs } = options;

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  if (
    /^(\/dashboard|\/onboarding|\/predict\/|\/join\/|\/leagues(\/|$))/.test(
      new URL(page.url()).pathname
    )
  ) {
    return { onboardingRequired: new URL(page.url()).pathname.includes("/onboarding") };
  }

  await expect(page.getByTestId("auth-enter-button")).toBeVisible({ timeout: timeoutMs });
  const emailRequestedAt = Date.now();

  await page.getByTestId("auth-enter-button").click();
  await openEmailMethod(page);
  await fillEmailAndSubmit(page, persona.email);

  const message = await mailbox.waitForPrivyEmail(persona.email, timeoutMs, {
    inboxId: persona.inboxId,
    sinceMs: emailRequestedAt,
  });

  const combinedBody = `${message.html}\n${message.text}`;
  const magicLink = firstMatchingUrl(combinedBody);
  const otpCode = firstOtpCode(combinedBody);

  if (otpCode) {
    await applyOtpCode(page, otpCode);
  } else if (magicLink) {
    await page.goto(magicLink, { waitUntil: "domcontentloaded" });
  } else {
    throw new Error("Could not find a Privy magic link or OTP code in the verification email.");
  }

  await waitForAuthenticatedDestination(page, timeoutMs);
  return { onboardingRequired: new URL(page.url()).pathname.includes("/onboarding") };
}

export async function completeOnboardingIfNeeded(
  page: Page,
  username: string
): Promise<void> {
  if (!page.url().includes("/onboarding")) {
    return;
  }

  await page.getByTestId("onboarding-username-input").fill(username);
  await page.getByTestId("onboarding-submit-button").click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}
