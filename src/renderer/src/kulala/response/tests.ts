export type KulalaScriptConsoleLine = {
  level: string;
  message: string;
  kind?: string;
  testName?: string;
  status?: string;
};

export type ParsedAssert = {
  pass: boolean;
  message: string;
};

export type ParsedTestGroup = {
  pass: boolean;
  name: string;
  error?: string;
  asserts: ParsedAssert[];
};

export type ParsedAssertionTree = {
  tests: ParsedTestGroup[];
  standaloneAsserts: ParsedAssert[];
};

export type TestGroupView = {
  pass: boolean;
  name: string;
  asserts: Array<{ pass: boolean; message: string }>;
};

function finalizeOpenTest(openTest: ParsedTestGroup | null, tests: ParsedTestGroup[]): void {
  if (!openTest) return;
  if (!tests.includes(openTest)) {
    tests.push(openTest);
  }
}

function assertMessageAlreadyShown(message: string, tests: ParsedTestGroup[]): boolean {
  return tests.some(
    (test) => test.error === message || test.asserts.some((assert) => assert.message === message),
  );
}

export function parseAssertionTree(
  lines: KulalaScriptConsoleLine[] | undefined,
): ParsedAssertionTree {
  const tests: ParsedTestGroup[] = [];
  const standaloneAsserts: ParsedAssert[] = [];
  let openTest: ParsedTestGroup | null = null;
  const hasStructuredOutput = (lines ?? []).some(
    (line) => line.kind === "assert" || line.kind === "test",
  );

  for (const line of lines ?? []) {
    if (line.kind === "assert") {
      const assert: ParsedAssert = {
        pass: line.status === "pass",
        message: line.message,
      };

      if (line.testName) {
        if (!openTest || openTest.name !== line.testName) {
          finalizeOpenTest(openTest, tests);
          openTest = { name: line.testName, pass: true, asserts: [] };
        }
        openTest.asserts.push(assert);
        if (!assert.pass) {
          openTest.pass = false;
        }
      } else {
        finalizeOpenTest(openTest, tests);
        openTest = null;
        standaloneAsserts.push(assert);
      }
      continue;
    }

    if (line.kind === "test") {
      const parsed = {
        pass: line.status === "pass",
        name: line.testName ?? "",
        error: line.status === "fail" && line.level === "error" ? line.message : undefined,
      };

      if (openTest && openTest.name === parsed.name) {
        openTest.pass = parsed.pass;
        openTest.error = parsed.error;
        if (!parsed.pass && parsed.error && openTest.asserts.length === 0) {
          openTest.asserts.push({ pass: false, message: parsed.error });
        }
        finalizeOpenTest(openTest, tests);
        openTest = null;
        continue;
      }

      finalizeOpenTest(openTest, tests);
      openTest = null;

      if (!parsed.name) continue;

      const testGroup: ParsedTestGroup = {
        name: parsed.name,
        pass: parsed.pass,
        error: parsed.error,
        asserts: [],
      };
      if (!parsed.pass && parsed.error) {
        testGroup.asserts.push({ pass: false, message: parsed.error });
      }
      tests.push(testGroup);
      continue;
    }

    if (line.level === "error" && line.kind !== "log") {
      const message = line.message;
      if (hasStructuredOutput || assertMessageAlreadyShown(message, tests)) {
        continue;
      }

      finalizeOpenTest(openTest, tests);
      openTest = null;
      standaloneAsserts.push({ pass: false, message });
    }
  }

  finalizeOpenTest(openTest, tests);
  return { tests, standaloneAsserts };
}

export function testGroupViews(lines: KulalaScriptConsoleLine[] | undefined): TestGroupView[] {
  const tree = parseAssertionTree(lines);
  const groups: TestGroupView[] = tree.tests.map((t) => ({
    pass: t.pass,
    name: t.name,
    asserts: t.asserts,
  }));
  if (tree.standaloneAsserts.length) {
    groups.push({
      pass: tree.standaloneAsserts.every((a) => a.pass),
      name: "Assertions",
      asserts: tree.standaloneAsserts,
    });
  }
  return groups;
}

export function isStructuredScriptLine(line: KulalaScriptConsoleLine): boolean {
  return (
    (line.kind === "test" || line.kind === "assert") &&
    (line.status === "pass" || line.status === "fail")
  );
}

export function scriptLogLines(
  lines: KulalaScriptConsoleLine[] | undefined,
): KulalaScriptConsoleLine[] {
  const tree = parseAssertionTree(lines);
  const skipErrors = new Set<string>();
  for (const test of tree.tests) {
    if (test.error) skipErrors.add(test.error);
    for (const assert of test.asserts) {
      skipErrors.add(assert.message);
    }
  }
  for (const assert of tree.standaloneAsserts) {
    skipErrors.add(assert.message);
  }

  const hasStructured = (lines ?? []).some(
    (line) => line.kind === "assert" || line.kind === "test",
  );

  return (lines ?? []).filter((line) => {
    if (isStructuredScriptLine(line)) return false;
    if (line.level === "error" && line.message.startsWith("Error executing script: ")) {
      const message = line.message.replace(/^Error executing script: /, "");
      if (hasStructured || skipErrors.has(message)) return false;
    }
    return true;
  });
}
