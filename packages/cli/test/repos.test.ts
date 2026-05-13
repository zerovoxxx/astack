/**
 * v0.12 — `astack repos register --scan-config-json <json>` CLI plumbing.
 *
 * Covers spec §1.15:
 *   T9  — happy path: parsed config is forwarded to client.registerRepo
 *   T10 — invalid JSON syntax throws VALIDATION_FAILED before the network call
 *   T11 — valid JSON but bad schema (e.g. roots is a string) throws
 *         VALIDATION_FAILED with details from Zod
 *
 * Tests do NOT spin up a real daemon: `runReposRegister` accepts an
 * injected `client` to bypass `ensureDaemonOnline`. T10/T11 throw
 * before the client is even constructed (validation runs first).
 */

import {
  AstackError,
  ErrorCode,
  ScanRootKind,
  type RegisterRepoRequest,
  type RegisterRepoResponse
} from "@astack/shared";
import { describe, expect, it, vi } from "vitest";

import { AstackClient } from "../src/client.js";
import {
  parseScanConfigJson,
  runReposRegister
} from "../src/commands/repos.js";

function buildResponse(): RegisterRepoResponse {
  return {
    repo: {
      id: 1,
      name: "claude-plugins-official",
      git_url: "https://example.test/claude-plugins-official.git",
      kind: "open-source",
      status: "ready",
      scan_config: null,
      local_path: null,
      head_hash: null,
      last_synced: null,
      last_auto_sync_at: null,
      last_auto_sync_status: null,
      last_auto_sync_reason: null,
      last_auto_sync_detail: null,
      created_at: "2026-05-13T00:00:00.000Z"
    },
    skills: [],
    command_count: 0,
    skill_count: 0,
    warnings: []
  } satisfies RegisterRepoResponse;
}

/**
 * Build an AstackClient whose `registerRepo` is replaced by a spy.
 * Spying on the prototype keeps the rest of the client surface intact
 * (so type narrowing still works) without standing up an HTTP fixture.
 */
function makeSpyClient(): {
  client: AstackClient;
  spy: ReturnType<typeof vi.fn>;
} {
  const spy = vi.fn(
    async (_: RegisterRepoRequest): Promise<RegisterRepoResponse> =>
      buildResponse()
  );
  const client = new AstackClient({ baseUrl: "http://test.invalid" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).registerRepo = spy;
  return { client, spy };
}

describe("parseScanConfigJson — pure parser", () => {
  it("T11a: invalid JSON syntax → AstackError(VALIDATION_FAILED)", () => {
    expect(() => parseScanConfigJson("not json {")).toThrow(AstackError);
    try {
      parseScanConfigJson("not json {");
    } catch (err) {
      expect(err).toBeInstanceOf(AstackError);
      const e = err as AstackError;
      expect(e.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(e.message).toContain("invalid JSON");
      expect(e.details?.detail).toBeDefined();
    }
  });

  it("T11b: schema mismatch (roots is a string) → AstackError with detail", () => {
    expect(() => parseScanConfigJson(JSON.stringify({ roots: "x" }))).toThrow(
      AstackError
    );
    try {
      parseScanConfigJson(JSON.stringify({ roots: "x" }));
    } catch (err) {
      const e = err as AstackError;
      expect(e.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(e.message).toContain("schema validation failed");
      expect(e.details?.detail).toContain("roots");
    }
  });

  it("T11c: schema mismatch (unknown kind) → AstackError", () => {
    expect(() =>
      parseScanConfigJson(
        JSON.stringify({ roots: [{ path: "x", kind: "not-a-real-kind" }] })
      )
    ).toThrow(AstackError);
  });

  it("T11d: empty roots array → AstackError (min(1) on roots)", () => {
    expect(() => parseScanConfigJson(JSON.stringify({ roots: [] }))).toThrow(
      AstackError
    );
  });

  it("happy: returns typed ScanConfig with the new plugin-marketplace kind", () => {
    const cfg = parseScanConfigJson(
      JSON.stringify({
        roots: [
          { path: "plugins", kind: "plugin-marketplace" },
          { path: "external_plugins", kind: "plugin-marketplace" }
        ]
      })
    );
    expect(cfg.roots).toHaveLength(2);
    expect(cfg.roots[0]!.kind).toBe(ScanRootKind.PluginMarketplace);
    expect(cfg.roots[0]!.path).toBe("plugins");
  });

  it("happy: accepts the three pre-v0.12 kinds unchanged", () => {
    const cfg = parseScanConfigJson(
      JSON.stringify({
        roots: [
          { path: "skills", kind: "skill-dirs" },
          { path: "commands", kind: "command-files" },
          { path: "agents", kind: "agent-files" }
        ]
      })
    );
    expect(cfg.roots.map((r) => r.kind)).toEqual([
      "skill-dirs",
      "command-files",
      "agent-files"
    ]);
  });
});

describe("runReposRegister — --scan-config-json wiring", () => {
  it("T9: parsed scan_config is forwarded verbatim to client.registerRepo", async () => {
    const { client, spy } = makeSpyClient();

    const json = JSON.stringify({
      roots: [{ path: "plugins", kind: "plugin-marketplace" }]
    });

    await runReposRegister(
      "git@github.com:anthropics/claude-plugins-official.git",
      {
        readonly: true,
        scanConfigJson: json,
        client
      }
    );

    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0]![0] as RegisterRepoRequest;
    expect(arg.git_url).toBe(
      "git@github.com:anthropics/claude-plugins-official.git"
    );
    expect(arg.kind).toBe("open-source");
    expect(arg.scan_config).toEqual({
      roots: [
        { path: "plugins", kind: ScanRootKind.PluginMarketplace }
      ]
    });
  });

  it("T9b: omitting --scan-config-json leaves scan_config undefined (server applies DEFAULT_SCAN_CONFIG)", async () => {
    const { client, spy } = makeSpyClient();

    await runReposRegister("https://example.test/some-repo.git", {
      client
    });

    const arg = spy.mock.calls[0]![0] as RegisterRepoRequest;
    expect(arg.scan_config).toBeUndefined();
  });

  it("T10: invalid JSON throws BEFORE client.registerRepo is called", async () => {
    const { client, spy } = makeSpyClient();

    await expect(
      runReposRegister("https://example.test/r.git", {
        scanConfigJson: "not-json {",
        client
      })
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
      message: expect.stringContaining("invalid JSON")
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it("T11: schema-invalid JSON throws BEFORE client.registerRepo is called", async () => {
    const { client, spy } = makeSpyClient();

    await expect(
      runReposRegister("https://example.test/r.git", {
        scanConfigJson: JSON.stringify({ roots: "x" }),
        client
      })
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
      message: expect.stringContaining("schema validation failed")
    });

    expect(spy).not.toHaveBeenCalled();
  });
});
