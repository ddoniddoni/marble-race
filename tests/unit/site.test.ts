import { describe, expect, it } from "vitest";
import { readSiteUrl } from "../../src/lib/site";

describe("deployment URL contract", () => {
  it("normalizes project and custom-domain URLs without losing the repository path", () => {
    expect(readSiteUrl("https://ddoniddoni.github.io/marble-race").href)
      .toBe("https://ddoniddoni.github.io/marble-race/");
    expect(readSiteUrl("https://example.com/").pathname).toBe("/");
  });
  it.each(["http://example.com/", "https://user:pass@example.com/", "https://example.com/?x=1",
    "https://example.com/#preview", "https://example.com/a%20b/", "https://example.com//repo/"])
  ("rejects a non-canonical deployment setting: %s", value => {
    expect(() => readSiteUrl(value)).toThrow();
  });
});
