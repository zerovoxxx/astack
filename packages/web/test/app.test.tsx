/**
 * Routing smoke: render App and verify default route lands on Dashboard.
 *
 * We don't stub the SSE provider's EventSource beyond the global noop set
 * up in test/setup.ts, nor do we try to hit the real daemon. fetch is
 * mocked to return an empty project list.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App.js";

describe("App routing", () => {
  let origFetch: typeof fetch;

  beforeEach(() => {
    origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const empty = new Response(
        JSON.stringify(
          url.includes("/api/repos")
            ? { repos: [], total: 0 }
            : url.includes("/api/projects")
              ? { projects: [], total: 0 }
              : { status: "ok", version: "1.0.3", uptime_ms: 1 }
        ),
        { status: 200 }
      );
      return empty;
    }) as typeof fetch;
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("renders the Dashboard page on the root route", async () => {
    render(<App />);
    // Sidebar label says "Dashboard"; the Dashboard page now hosts the
    // Matrix grid, so its heading reads "Matrix".
    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: /Dashboard/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 1, name: /Matrix/i })
      ).toBeInTheDocument();
    });
  });

  it("renders the 'Nothing to show yet' empty state when the daemon has nothing", async () => {
    render(<App />);
    // With no projects + no skills, the Matrix grid (now living on the
    // Dashboard) shows its empty state instead of a per-project list.
    await waitFor(() => {
      expect(screen.getByText(/Nothing to show yet/i)).toBeInTheDocument();
    });
  });

  it("navigates to /repos when the Repos sidebar link is clicked", async () => {
    render(<App />);
    // Wait until sidebar mounted.
    const link = await screen.findByRole("link", { name: /Repos/i });
    link.click();
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: /Repos/i })
      ).toBeInTheDocument();
    });
  });

  it("shows 404 for an unknown route", async () => {
    window.history.pushState({}, "", "/nope");
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Page not found/i)).toBeInTheDocument();
    });
  });
});
