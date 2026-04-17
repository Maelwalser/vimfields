import { describe, it, expect } from "vitest";
import {
  normalizeSitePattern,
  matchesSite,
  isHostDisabled,
} from "../../src/dom/site-matcher.js";

describe("normalizeSitePattern", () => {
  it("lowercases and trims", () => {
    expect(normalizeSitePattern("  Example.COM  ")).toBe("example.com");
  });

  it("extracts hostname from a full URL", () => {
    expect(normalizeSitePattern("https://mail.google.com/inbox")).toBe(
      "mail.google.com",
    );
  });

  it("strips a port", () => {
    expect(normalizeSitePattern("localhost:3000")).toBe("localhost");
  });

  it("strips leading www. on bare domains", () => {
    expect(normalizeSitePattern("www.example.com")).toBe("example.com");
  });

  it("preserves leading wildcard", () => {
    expect(normalizeSitePattern("*.example.com")).toBe("*.example.com");
  });

  it("strips www. inside a wildcard", () => {
    expect(normalizeSitePattern("*.www.example.com")).toBe("*.example.com");
  });

  it("returns empty for garbage inputs", () => {
    expect(normalizeSitePattern("")).toBe("");
    expect(normalizeSitePattern("   ")).toBe("");
    expect(normalizeSitePattern("*")).toBe("");
    expect(normalizeSitePattern("*.")).toBe("");
  });
});

describe("matchesSite", () => {
  it("matches exact hostname", () => {
    expect(matchesSite("example.com", "example.com")).toBe(true);
  });

  it("bare domain also matches subdomains", () => {
    expect(matchesSite("mail.example.com", "example.com")).toBe(true);
    expect(matchesSite("a.b.example.com", "example.com")).toBe(true);
  });

  it("does not match unrelated hosts", () => {
    expect(matchesSite("exampleXcom", "example.com")).toBe(false);
    expect(matchesSite("notexample.com", "example.com")).toBe(false);
    expect(matchesSite("example.org", "example.com")).toBe(false);
  });

  it("wildcard excludes apex", () => {
    expect(matchesSite("example.com", "*.example.com")).toBe(false);
    expect(matchesSite("mail.example.com", "*.example.com")).toBe(true);
  });

  it("more specific pattern still matches deeper subdomains", () => {
    expect(matchesSite("team.mail.google.com", "mail.google.com")).toBe(true);
    expect(matchesSite("google.com", "mail.google.com")).toBe(false);
  });

  it("accepts www. prefixed host", () => {
    expect(matchesSite("www.example.com", "example.com")).toBe(true);
  });

  it("returns false when either input is empty", () => {
    expect(matchesSite("", "example.com")).toBe(false);
    expect(matchesSite("example.com", "")).toBe(false);
  });
});

describe("isHostDisabled", () => {
  it("returns false on empty list", () => {
    expect(isHostDisabled("example.com", [])).toBe(false);
  });

  it("returns true when any pattern matches", () => {
    expect(
      isHostDisabled("mail.google.com", ["github.com", "google.com"]),
    ).toBe(true);
  });

  it("ignores invalid patterns", () => {
    expect(isHostDisabled("example.com", ["", "   ", "*"])).toBe(false);
  });
});
