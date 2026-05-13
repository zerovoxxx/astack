/**
 * `astack repos <register|list|remove|refresh>` — bonus commands for
 * managing skill repos from the CLI. Dashboard does the same via Web.
 */

import {
  AstackError,
  ErrorCode,
  ScanConfigSchema,
  type RepoKind,
  type ScanConfig
} from "@astack/shared";
import kleur from "kleur";

import { AstackClient } from "../client.js";
import { DEFAULT_DAEMON_URL } from "../context.js";
import { ensureDaemonOnline } from "../daemon-check.js";
import { printInfo, printOk, printTable, printWarn } from "../output.js";

/**
 * v0.12 — parse + validate `--scan-config-json <json>` into a typed
 * `ScanConfig`. Two failure modes are surfaced as `AstackError` with
 * `ErrorCode.VALIDATION_FAILED` so the bin.ts wrap() handler renders
 * them with the same styling as daemon-side validation errors:
 *
 *   1. JSON.parse failure              → details.detail = parse error msg
 *   2. ZodError (shape doesn't match)  → details.detail = formatted issues
 *
 * Exported for direct unit testing (the network path is not exercised
 * — see test/repos.test.ts T9–T11).
 */
export function parseScanConfigJson(raw: string): ScanConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new AstackError(
      ErrorCode.VALIDATION_FAILED,
      "--scan-config-json: invalid JSON",
      { detail: err instanceof Error ? err.message : String(err) }
    );
  }
  const result = ScanConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new AstackError(
      ErrorCode.VALIDATION_FAILED,
      "--scan-config-json: schema validation failed",
      {
        detail: result.error.issues
          .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
          .join("; ")
      }
    );
  }
  return result.data;
}

export async function runReposRegister(
  gitUrl: string,
  opts: {
    name?: string;
    /** True → register as open-source (pull-only). Default custom. */
    readonly?: boolean;
    daemonUrl?: string;
    /**
     * v0.12 — raw JSON from `--scan-config-json` flag. Parsed +
     * validated BEFORE the daemon health check so users get fast
     * feedback on a malformed config without waiting on the network.
     */
    scanConfigJson?: string;
    /**
     * Test seam: dependency-injected client. When omitted, a real
     * `AstackClient` is constructed and `ensureDaemonOnline` is called.
     * Tests inject a mock to exercise CLI plumbing without spinning up
     * the daemon.
     */
    client?: AstackClient;
  } = {}
): Promise<void> {
  // Validate scan-config FIRST so a bad JSON shape doesn't first burn
  // a network round-trip on the health check.
  let scanConfig: ScanConfig | undefined;
  if (opts.scanConfigJson !== undefined) {
    scanConfig = parseScanConfigJson(opts.scanConfigJson);
  }

  const client =
    opts.client ??
    new AstackClient({
      baseUrl: opts.daemonUrl ?? DEFAULT_DAEMON_URL
    });
  if (!opts.client) {
    await ensureDaemonOnline(client);
  }

  const kind: RepoKind = opts.readonly ? "open-source" : "custom";
  const { repo, command_count, skill_count } = await client.registerRepo({
    git_url: gitUrl,
    name: opts.name,
    kind,
    scan_config: scanConfig
  });
  const kindLabel =
    repo.kind === "open-source" ? kleur.yellow("[open-source, pull-only]") : "";
  printOk(
    `registered repo '${repo.name}' ${kindLabel} (${command_count} command(s), ${skill_count} skill(s))`.trim()
  );
}

export async function runReposList(
  opts: { daemonUrl?: string } = {}
): Promise<void> {
  const client = new AstackClient({
    baseUrl: opts.daemonUrl ?? DEFAULT_DAEMON_URL
  });
  await ensureDaemonOnline(client);

  const { repos, total } = await client.listRepos();
  if (total === 0) {
    printWarn("no repos registered");
    return;
  }
  printInfo(`${total} repo(s) registered`);
  const rows: string[][] = [
    [
      kleur.bold("id"),
      kleur.bold("name"),
      kleur.bold("kind"),
      kleur.bold("head"),
      kleur.bold("url")
    ]
  ];
  for (const r of repos) {
    const kindCell =
      r.kind === "open-source" ? kleur.yellow("read-only") : kleur.gray("custom");
    rows.push([
      String(r.id),
      r.name,
      kindCell,
      kleur.gray(r.head_hash?.slice(0, 7) ?? "—"),
      kleur.gray(r.git_url)
    ]);
  }
  printTable(rows);
}

export async function runReposRemove(
  id: number,
  opts: { daemonUrl?: string } = {}
): Promise<void> {
  const client = new AstackClient({
    baseUrl: opts.daemonUrl ?? DEFAULT_DAEMON_URL
  });
  await ensureDaemonOnline(client);

  await client.deleteRepo(id);
  printOk(`removed repo id=${id}`);
}

export async function runReposRefresh(
  id: number,
  opts: { daemonUrl?: string; force?: boolean } = {}
): Promise<void> {
  const client = new AstackClient({
    baseUrl: opts.daemonUrl ?? DEFAULT_DAEMON_URL
  });
  await ensureDaemonOnline(client);

  const force = opts.force ?? false;
  const { changed, skills, skipped_reason, reset_performed } =
    await client.refreshRepo(id, { force });

  // v0.10 branch copy:
  //   - skipped_reason → warn the user to retry with --force
  //   - reset_performed → explicit "reset + pulled" acknowledgement
  //   - otherwise → pre-v0.10 copy, unchanged for existing CLI users
  if (skipped_reason === "dirty_working_tree") {
    printWarn(
      `skipped: repo id=${id} mirror has uncommitted changes in ~/.astack/repos/<name>/ — ` +
        `rerun with --force to discard them and pull (open-source repos only)`
    );
    return;
  }
  if (reset_performed) {
    printOk(
      `reset + pulled repo id=${id} (${changed ? "HEAD moved" : "no changes"}; ${skills.length} skill(s))`
    );
    return;
  }
  printOk(
    `refreshed repo id=${id} (${changed ? "HEAD moved" : "no changes"}; ${skills.length} skill(s))`
  );
}
