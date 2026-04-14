import path from "node:path";
import { test, expect } from "@playwright/test";
import { loadEnvironmentConfig, loadScenario } from "./config/environments";
import { captureScreenshot, createRunReport, ensureDir, recordStep, writeRunReport, attachPageDiagnostics } from "./helpers/artifacts";
import { authenticateWithPrivyEmail, completeOnboardingIfNeeded } from "./helpers/auth";
import { createMailboxProvider } from "./helpers/mailbox";
import { resolveFullFlowPersonas, resolveSmokePersona } from "./helpers/personas";
import { BlockedRunError, type SyntheticPersona } from "./helpers/types";

async function readWalletBalance(page: import("@playwright/test").Page): Promise<number> {
  await page.goto("/wallet", { waitUntil: "domcontentloaded" });
  const balanceText = await page.getByTestId("wallet-balance").textContent();
  return Number((balanceText ?? "").replace(/[^0-9.-]/g, ""));
}

async function openNextRace(page: import("@playwright/test").Page): Promise<string> {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  const button = page.getByTestId("dashboard-open-predict-button");
  await expect(button).toBeVisible({ timeout: 20_000 });
  const href = await button.getAttribute("href");
  if (!href) {
    throw new Error("Could not determine next race link.");
  }
  await button.click();
  await page.waitForURL(/\/predict\//, { timeout: 20_000 });
  return href.split("/").pop() ?? "";
}

async function fillVisiblePredictionQuestions(page: import("@playwright/test").Page): Promise<void> {
  const questions = page.locator(".predict-question");
  const count = await questions.count();

  for (let index = 0; index < count; index += 1) {
    const question = questions.nth(index);
    const selected = question.locator(".predict-option.is-selected");
    const selectedCount = await selected.count();
    const metaText = (await question.locator(".predict-q-meta").textContent()) ?? "";
    const required = Number(metaText.match(/pick\s+(\d+)/i)?.[1] ?? "1");
    if (selectedCount >= required) {
      continue;
    }

    const options = question.locator(".predict-option:not(.is-selected):not(.is-disabled)");
    const optionCount = await options.count();
    for (let optionIndex = 0; optionIndex < Math.min(required - selectedCount, optionCount); optionIndex += 1) {
      await options.nth(optionIndex).click();
    }
  }
}

async function submitPrediction(page: import("@playwright/test").Page): Promise<string> {
  await fillVisiblePredictionQuestions(page);
  await page.getByTestId("prediction-next-button").click();
  await fillVisiblePredictionQuestions(page);
  await page.getByTestId("prediction-next-button").click();
  await fillVisiblePredictionQuestions(page);
  await page.getByTestId("prediction-next-button").click();
  await page.getByTestId("prediction-submit-button").click();
  await expect(page.getByTestId("prediction-success-panel")).toBeVisible({ timeout: 20_000 });
  return (await page.getByTestId("prediction-status-badge").textContent()) ?? "";
}

async function createLeague(
  page: import("@playwright/test").Page,
  raceId: string,
  prefix: string,
  runId: string
): Promise<{ leagueName: string; inviteCode: string }> {
  const leagueName = `${prefix} ${runId}`;

  await page.goto(`/leagues/create?raceId=${raceId}`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("league-create-name-input").fill(leagueName);
  await page.getByTestId("league-create-type-private").click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByTestId("league-create-stake-input").fill("5");
  await page.getByTestId("league-create-race-select").selectOption(raceId);
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByTestId("league-create-submit-button").click();

  await page.waitForURL(/\/leagues\/[a-f0-9-]+/i, { timeout: 20_000 });
  await expect(page.getByTestId("league-invite-code")).toBeVisible({ timeout: 20_000 });

  return {
    leagueName,
    inviteCode: ((await page.getByTestId("league-invite-code").textContent()) ?? "").trim(),
  };
}

async function joinLeague(
  page: import("@playwright/test").Page,
  inviteCode: string
): Promise<void> {
  await page.goto(`/join/${inviteCode}`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("league-join-stake-input").fill("5");
  await page.getByTestId("league-join-submit-button").click();
  await expect(page.getByTestId("league-join-success")).toBeVisible({ timeout: 20_000 });
  await page.waitForURL(/\/leagues\/[a-f0-9-]+/i, { timeout: 20_000 });
}

async function assertLeagueState(
  page: import("@playwright/test").Page,
  expectedRaceId: string,
  expectedLeagueName: string,
  expectedMembers: number
): Promise<void> {
  await expect(page.getByTestId("league-prize-pool")).toBeVisible();
  await expect(page.getByTestId("league-member-count")).toHaveText(String(expectedMembers));
  await expect(page.locator("h1.gla-page-title")).toContainText(expectedLeagueName);
  await expect(page.getByTestId("league-race-name")).toContainText(
    new RegExp(expectedRaceId.split("-")[0] ?? "", "i")
  );
}

async function ensurePersonaReady(
  page: import("@playwright/test").Page,
  persona: SyntheticPersona,
  baseUrl: string,
  mailbox: import("./helpers/types").MailboxProvider,
  timeoutMs: number
): Promise<boolean> {
  const authResult = await authenticateWithPrivyEmail({
    page,
    baseUrl,
    mailbox,
    persona,
    timeoutMs,
  });
  await completeOnboardingIfNeeded(page, persona.username);
  return authResult.onboardingRequired;
}

test.describe.configure({ mode: "serial" });

test("gridlock synthetic canary", async ({ browser }, testInfo) => {
  const config = loadEnvironmentConfig();
  const scenario = loadScenario();
  const runId = process.env.GRIDLOCK_CANARY_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(config.outputDir, scenario, runId);
  const report = createRunReport({ runId, env: config.name, scenario });

  await ensureDir(outputDir);

  let contextA: import("@playwright/test").BrowserContext | null = null;
  let contextB: import("@playwright/test").BrowserContext | null = null;

  try {
    const mailbox = recordStep(report, "mailbox.init", async () => createMailboxProvider());
    const resolvedMailbox = await mailbox;

    if (scenario === "fresh-signup-smoke") {
      const persona = await recordStep(report, "persona.signup_smoke", async () =>
        resolveSmokePersona(config, resolvedMailbox, runId)
      );

      contextA = await browser.newContext({ baseURL: config.baseUrl });
      const page = await contextA.newPage();
      attachPageDiagnostics(page, report, "smoke");

      await recordStep(report, "auth.signup_smoke", async () => {
        const onboardingRequired = await ensurePersonaReady(
          page,
          persona,
          config.baseUrl,
          resolvedMailbox,
          config.timeoutMs
        );
        if (!onboardingRequired) {
          throw new Error("Fresh signup smoke landed on an existing user instead of onboarding.");
        }
      });

      await recordStep(report, "dashboard.signup_smoke", async () => {
        await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("dashboard-next-race-card")).toBeVisible();
      });

      report.status = "passed";
      return;
    }

    const [personaA, personaB] = await recordStep(report, "persona.full_flow", async () =>
      resolveFullFlowPersonas(config, resolvedMailbox, runId)
    );

    contextA = await browser.newContext({ baseURL: config.baseUrl });
    contextB = await browser.newContext({ baseURL: config.baseUrl });

    await contextA.tracing.start({ screenshots: true, snapshots: true });
    await contextB.tracing.start({ screenshots: true, snapshots: true });

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    attachPageDiagnostics(pageA, report, "user-a");
    attachPageDiagnostics(pageB, report, "user-b");

    const userANew = await recordStep(report, "auth.user_a", async () =>
      ensurePersonaReady(pageA, personaA, config.baseUrl, resolvedMailbox, config.timeoutMs)
    );
    const userABalance = await recordStep(report, "wallet.user_a.bootstrap", async () =>
      readWalletBalance(pageA)
    );
    if (userANew && userABalance < 100) {
      throw new Error(`User A bootstrap balance is ${userABalance}, expected at least 100.`);
    }
    if (userABalance < 5) {
      throw new Error(`User A balance ${userABalance} is below minimum league stake.`);
    }

    const raceId = await recordStep(report, "prediction.user_a.open_race", async () =>
      openNextRace(pageA)
    );
    const userAStatus = await recordStep(report, "prediction.user_a.submit", async () =>
      submitPrediction(pageA)
    );
    if (!/draft/i.test(userAStatus)) {
      throw new Error(`User A prediction expected draft status, got: ${userAStatus}`);
    }

    const userBNew = await recordStep(report, "auth.user_b", async () =>
      ensurePersonaReady(pageB, personaB, config.baseUrl, resolvedMailbox, config.timeoutMs)
    );
    const userBBalance = await recordStep(report, "wallet.user_b.bootstrap", async () =>
      readWalletBalance(pageB)
    );
    if (userBNew && userBBalance < 100) {
      throw new Error(`User B bootstrap balance is ${userBBalance}, expected at least 100.`);
    }
    if (userBBalance < 5) {
      throw new Error(`User B balance ${userBBalance} is below minimum league stake.`);
    }

    await recordStep(report, "prediction.user_b.open_race", async () => {
      await pageB.goto("/dashboard", { waitUntil: "domcontentloaded" });
      const button = pageB.getByTestId("dashboard-open-predict-button");
      await expect(button).toBeVisible();
      await button.click();
      await pageB.waitForURL(new RegExp(`/predict/${raceId}$`), { timeout: 20_000 });
    });

    const userBStatus = await recordStep(report, "prediction.user_b.submit", async () =>
      submitPrediction(pageB)
    );
    if (!/draft/i.test(userBStatus)) {
      throw new Error(`User B prediction expected draft status, got: ${userBStatus}`);
    }

    const createdLeague = await recordStep(report, "league.create", async () =>
      createLeague(pageA, raceId, config.privateLeaguePrefix, runId)
    );
    await recordStep(report, "league.user_a.assert_active", async () => {
      await expect(pageA.getByTestId("prediction-status-badge")).toContainText(/active/i);
    });

    await recordStep(report, "league.join", async () => {
      await joinLeague(pageB, createdLeague.inviteCode);
    });
    await recordStep(report, "league.user_b.assert_active", async () => {
      await expect(pageB.getByTestId("prediction-status-badge")).toContainText(/active/i);
    });

    await recordStep(report, "league.assert.user_a", async () => {
      await assertLeagueState(pageA, raceId, createdLeague.leagueName, 2);
    });
    await recordStep(report, "league.assert.user_b", async () => {
      await assertLeagueState(pageB, raceId, createdLeague.leagueName, 2);
    });

    await recordStep(report, "wallet.assert_post_join", async () => {
      const balanceA = await readWalletBalance(pageA);
      const balanceB = await readWalletBalance(pageB);
      if (balanceA > userABalance - 4.99 || balanceB > userBBalance - 4.99) {
        throw new Error(
          `Expected league stake deduction. Balances: userA ${balanceA}, userB ${balanceB}.`
        );
      }
    });

    report.status = "passed";
  } catch (error) {
    if (error instanceof BlockedRunError) {
      report.status = "blocked";
      report.failedStep = error.step;
      report.failureMessage = error.message;
      await writeRunReport(report, outputDir);
      test.skip(true, error.message);
      return;
    }

    report.status = "failed";
    report.failedStep = report.steps.at(-1)?.step;
    report.failureMessage =
      error instanceof Error ? error.message : "Unknown canary failure.";

    if (contextA) {
      const page = contextA.pages()[0];
      if (page) {
        await captureScreenshot(page, report, outputDir, "failure-user-a");
      }
    }
    if (contextB) {
      const page = contextB.pages()[0];
      if (page) {
        await captureScreenshot(page, report, outputDir, "failure-user-b");
      }
    }

    throw error;
  } finally {
    if (contextA) {
      const tracePath = path.join(outputDir, "trace-user-a.zip");
      await contextA.tracing.stop({ path: tracePath }).catch(() => undefined);
      report.artifacts.trace = tracePath;
      await contextA.close().catch(() => undefined);
    }
    if (contextB) {
      const tracePath = path.join(outputDir, "trace-user-b.zip");
      await contextB.tracing.stop({ path: tracePath }).catch(() => undefined);
      report.artifacts.video = tracePath;
      await contextB.close().catch(() => undefined);
    }

    const reportPath = await writeRunReport(report, outputDir);
    await testInfo.attach("gridlock-canary-report", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });
    console.log(`Gridlock canary report written to ${reportPath}`);
  }
});
