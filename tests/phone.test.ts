import assert from "node:assert/strict";
import { normalizePhone } from "../src/utils/phone";

const cases: Array<{ input: string; expected: string }> = [
  { input: "+905325630299", expected: "5325630299" },
  { input: "05325630299", expected: "5325630299" },
  { input: "5325630299", expected: "5325630299" },
  { input: "532-563 02 99", expected: "5325630299" },
  { input: "90532 563 029901", expected: "2563029901" },
  { input: "12345", expected: "0000012345" },
  { input: "", expected: "0000000000" },
];

for (const { input, expected } of cases) {
  const actual = normalizePhone(input);
  assert.strictEqual(
    actual,
    expected,
    `normalizePhone(${JSON.stringify(input)}) expected ${expected} but received ${actual}`
  );
}

console.log("✅ All normalizePhone tests passed");
