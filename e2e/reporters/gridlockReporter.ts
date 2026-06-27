import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from "@playwright/test/reporter";

class GridlockReporter implements Reporter {
  onBegin(_config: FullConfig, suite: Suite): void {
    console.log(`Starting Gridlock canary run with ${suite.allTests().length} test(s).`);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    console.log(`[gridlock-canary] ${test.title}: ${result.status}`);
  }

  onEnd(result: FullResult): void {
    console.log(`[gridlock-canary] overall status: ${result.status}`);
  }
}

export default GridlockReporter;
