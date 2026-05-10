import type * as React from "react";
/**
 * Repos page — Graphite UI v0.3 (actions inlined in v0.9, force pull in v0.10).
 *
 * Card anatomy:
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  anthropic-skills  [BUILT-IN] [OPEN SOURCE]                    │
 *   │                              [Refresh] [Force pull] [Remove]   │
 *   │  ○ read-only  ·  17 skills                                     │
 *   │                                                                │
 *   │  github.com/anthropics/skills                                  │
 *   │  2c7ec5e · synced 2h ago                                       │
 *   └────────────────────────────────────────────────────────────────┘
 *
 *  - Two orthogonal tags: provenance (Built-in) + ownership (Custom /
 *    Open source). Seeded repos show both.
 *  - Entire card is the expand affordance (click anywhere).
 *  - Actions inlined as small ghost/danger buttons. The pre-v0.9 `⋯`
 *    menu was removed: with only two options, a popover cost the user
 *    an extra click without saving any screen density.
 *    See docs/version/Iteration8_RepoActionsInline.md.
 *  - `Force pull` only renders for `kind === "open-source"`. It resets
 *    the local mirror to `origin/HEAD` and pulls — destructive; gated
 *    behind `window.confirm(...)` that spells out the full
 *    `~/.astack/repos/<name>/` path so users can recall any hand-edits.
 *    See docs/version/Iteration9_ForceRefresh.md.
 *  - Status shown as dot + inline text, not pills.
 */

import type { RepoKind, Skill, SkillRepo } from "@astack/shared";
import { isBuiltinSeedUrl } from "@astack/shared";
import {
  useCallback,
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent
} from "react";
import { useSearchParams } from "react-router-dom";

import {
  Button,
  Card,
  EmptyState,
  InlineTag,
  Skeleton,
  StatusDot
} from "../components/ui/index.js";
import { api, AstackError } from "../lib/api.js";
import { relativeTime, shortHash } from "../lib/format.js";
import { useEventListener } from "../lib/sse.js";
import { useToast } from "../lib/toast.js";

interface RepoSkillsState {
  loading: boolean;
  skills: Skill[];
  error?: string;
}

export function ReposPage(): React.JSX.Element {
  const [repos, setRepos] = useState<SkillRepo[] | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [skillsByRepo, setSkillsByRepo] = useState<
    Map<number, RepoSkillsState>
  >(new Map());
  const [params, setParams] = useSearchParams();
  const showDialog = params.get("action") === "new";
  const toast = useToast();

  const load = useCallback(
    async (opts: { retry?: boolean } = {}): Promise<void> => {
      try {
        const { repos: list } = await api.listRepos({ limit: 200 });
        setRepos(list);
      } catch (err) {
        // During first-boot seed the daemon can momentarily block the
        // event loop (see v0.6+ seed refactor); rather than latch the
        // page into the empty state the first time a fetch times out,
        // keep the skeleton visible and schedule a retry. The next
        // SSE `seed.completed` / `repo.registered` event will also
        // trigger a reload through the listeners below, so this is
        // belt-and-suspenders.
        if (opts.retry !== false) {
          // Three retries with exponential backoff: 400ms, 1.2s, 3.6s.
          // By ~5s total the first seed's scanAndUpsert has always
          // finished; if the daemon is genuinely offline past that, we
          // surface the empty-state toast and stop retrying.
          let attempt = 0;
          const max = 3;
          const retry = async (): Promise<void> => {
            attempt++;
            try {
              const { repos: list } = await api.listRepos({ limit: 200 });
              setRepos(list);
            } catch (err2) {
              if (attempt < max) {
                const delay = 400 * Math.pow(3, attempt - 1);
                setTimeout(() => void retry(), delay);
                return;
              }
              toast.error(
                "Could not load repos",
                err2 instanceof AstackError ? err2.message : String(err2)
              );
              setRepos([]);
            }
          };
          setTimeout(() => void retry(), 400);
          return;
        }
        toast.error(
          "Could not load repos",
          err instanceof AstackError ? err.message : String(err)
        );
        setRepos([]);
      }
    },
    [toast]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Eagerly fetch skill lists so counts are ready on first render.
  useEffect(() => {
    if (!repos) return;
    for (const r of repos) {
      if (skillsByRepo.has(r.id)) continue;
      void fetchSkills(r.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos]);

  const fetchSkills = useCallback(
    async (repoId: number): Promise<void> => {
      setSkillsByRepo((prev) => {
        const next = new Map(prev);
        next.set(repoId, { loading: true, skills: [] });
        return next;
      });
      try {
        const { skills } = await api.listRepoSkills(repoId);
        setSkillsByRepo((prev) => {
          const next = new Map(prev);
          next.set(repoId, { loading: false, skills });
          return next;
        });
      } catch (err) {
        setSkillsByRepo((prev) => {
          const next = new Map(prev);
          next.set(repoId, {
            loading: false,
            skills: [],
            error: err instanceof AstackError ? err.message : String(err)
          });
          return next;
        });
      }
    },
    []
  );

  useEventListener("repo.registered", () => void load());
  useEventListener("seed.completed", () => {
    // Seed is the one moment where the daemon's startup scan has just
    // finished synchronously flushing writes; reload unconditionally so
    // the Repos page never sits in skeleton state past this point.
    void load({ retry: false });
  });
  useEventListener("repo.refreshed", (e) => {
    void load();
    void fetchSkills(e.payload.repo.id);
  });
  useEventListener("repo.removed", (e) => {
    void load();
    setSkillsByRepo((prev) => {
      const next = new Map(prev);
      next.delete(e.payload.repo_id);
      return next;
    });
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(e.payload.repo_id);
      return next;
    });
  });

  async function handleRefresh(
    id: number,
    opts: { force?: boolean } = {}
  ): Promise<void> {
    const force = opts.force ?? false;
    try {
      const res = await api.refreshRepo(id, { force });
      // v0.10 toast branching — four outcomes derived from (force,
      // response.skipped_reason, response.reset_performed):
      //   1. skipped_reason          → warn + actionable hint (Force pull)
      //   2. reset_performed         → ok + explicit "reset + pulled"
      //   3. force=true but clean    → ok + "Force pull completed" so the
      //      user gets explicit acknowledgement that the button did
      //      something (isClean check ran + pull ran) even when no reset
      //      was needed. Without this branch the toast would read
      //      "Repo up to date" for both Refresh and Force pull on a
      //      clean mirror, making the Force button feel unresponsive.
      //   4. default (force=false)   → pre-v0.10 copy, unchanged
      if (res.skipped_reason === "dirty_working_tree") {
        toast.warn(
          "Refresh skipped",
          "Mirror has uncommitted changes in ~/.astack/repos/. Click Force pull to reset it to origin/HEAD and retry."
        );
      } else if (res.reset_performed) {
        toast.ok(
          "Mirror reset + pulled",
          res.changed ? "HEAD moved" : "no upstream change"
        );
      } else if (force) {
        toast.ok(
          "Force pull completed",
          res.changed
            ? "Mirror was clean; HEAD moved"
            : "Mirror was already clean and up to date"
        );
      } else {
        toast.ok(
          res.changed ? "Repo refreshed — HEAD moved" : "Repo up to date"
        );
      }
      await load();
      void fetchSkills(id);
    } catch (err) {
      toast.error(
        force ? "Force pull failed" : "Refresh failed",
        err instanceof AstackError ? err.message : String(err)
      );
    }
  }

  // §A3: the destructive confirm lives in `RepoCard::handleForceClick`
  // so it gates BEFORE any button state flips. Doing `setForcing(true)`
  // first would cause React to flush the "Pulling…" label to the DOM
  // before `window.confirm` blocks (async function synchronous prefix
  // runs to completion before confirm's blocking UI appears), producing
  // a visible state flash even if the user clicks Cancel. This thin
  // wrapper assumes the caller already got user consent and simply
  // delegates to handleRefresh with force=true.
  async function handleForceRefresh(repo: SkillRepo): Promise<void> {
    await handleRefresh(repo.id, { force: true });
  }

  async function handleDelete(repo: SkillRepo): Promise<void> {
    if (!confirm(`Remove repo "${repo.name}"?`)) return;
    try {
      await api.deleteRepo(repo.id);
      toast.ok(`Removed ${repo.name}`);
      await load();
    } catch (err) {
      toast.error(
        "Delete failed",
        err instanceof AstackError ? err.message : String(err)
      );
    }
  }

  function toggle(id: number): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-7">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg-primary">
            Repos
          </h1>
          <p className="mt-1 text-sm text-fg-secondary">
            Git repositories scanned for commands, skills, and agents.
          </p>
        </div>
        <Button onClick={() => setParams({ action: "new" })}>
          Register repo
        </Button>
      </header>

      {repos === null ? (
        <div className="space-y-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : repos.length === 0 ? (
        <EmptyState
          title="No repos yet"
          hint="Register a git repository that contains skills/, commands/, or agents/ directories. Astack clones and scans it."
        >
          <Button
            variant="primary"
            onClick={() => setParams({ action: "new" })}
          >
            Register your first repo
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {repos.map((r) => (
            <RepoCard
              key={r.id}
              repo={r}
              skillsState={skillsByRepo.get(r.id)}
              expanded={expanded.has(r.id)}
              onToggle={() => toggle(r.id)}
              onRefresh={() => handleRefresh(r.id)}
              onForceRefresh={
                r.kind === "open-source"
                  ? () => handleForceRefresh(r)
                  : undefined
              }
              onDelete={() => handleDelete(r)}
            />
          ))}
        </div>
      )}

      {showDialog ? (
        <RegisterRepoDialog
          onClose={() => setParams({})}
          onRegistered={() => {
            setParams({});
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

// ---------- RepoCard ----------

interface RepoCardProps {
  repo: SkillRepo;
  skillsState: RepoSkillsState | undefined;
  expanded: boolean;
  onToggle: () => void;
  /**
   * Returns a Promise so the card can render a local loading state
   * (button disabled + "Refreshing…" label) until the refresh settles.
   */
  onRefresh: () => Promise<void>;
  /**
   * Force pull handler — only wired for open-source repos (v0.10).
   * `undefined` means the button is not rendered. The card itself runs
   * the destructive `window.confirm` BEFORE calling this (§A3), so by
   * the time this fires the user has agreed; the parent's only job is
   * to issue the API call and surface toast/reload side-effects.
   */
  onForceRefresh?: () => Promise<void>;
  onDelete: () => void;
}

function RepoCard({
  repo,
  skillsState,
  expanded,
  onToggle,
  onRefresh,
  onForceRefresh,
  onDelete
}: RepoCardProps): React.JSX.Element {
  const counts = countByType(skillsState?.skills ?? []);
  const hasSkills =
    skillsState && !skillsState.loading && skillsState.skills.length > 0;

  // v0.9: local-only loading flag. Not hoisted to parent (§A1 of spec):
  // only the button itself needs to know, and the card is rebuilt from
  // fresh props after `load()` completes anyway.
  const [refreshing, setRefreshing] = useState(false);
  // v0.10: independent loading flag for force pull. We keep it separate
  // from `refreshing` so (a) the confirm-canceled case never touches
  // button state and (b) the two button copies can change in parallel
  // without wiring a shared "which action is running" enum.
  const [forcing, setForcing] = useState(false);
  const busy = refreshing || forcing;

  async function handleRefreshClick(): Promise<void> {
    if (busy) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleForceClick(): Promise<void> {
    if (busy || !onForceRefresh) return;
    // §A3: gate on the destructive confirm BEFORE touching any button
    // state. Flipping `forcing` first would make React flush the
    // "Pulling…" label to the DOM during the async function's
    // synchronous prefix (which completes before `window.confirm`
    // blocks), so a user clicking Cancel still sees the button
    // momentarily change. Confirming first means Cancel is a true
    // no-op — no React commit, no visual flash.
    //
    // Copy mandates showing the literal `~/.astack/repos/<name>/`
    // path so the user can recall whether they actually made edits
    // there. Vague "mirror will be reset" copy hides the consequence
    // from users who are unfamiliar with Astack's internal layout.
    const ok = window.confirm(
      `Force pull will reset ~/.astack/repos/${repo.name}/ to origin/HEAD ` +
        `and DISCARD any local edits in that directory. Continue?`
    );
    if (!ok) return;
    setForcing(true);
    try {
      await onForceRefresh();
    } finally {
      setForcing(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="relative">
        {/* Clickable area: entire header. Uses a full-size invisible button
            underneath so keyboard users get a proper focus target. */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${repo.name}`}
          className="absolute inset-0 w-full rounded-lg focus-visible:ring-2 focus-visible:ring-accent/60"
        />

        <div className="relative pointer-events-none flex items-start justify-between gap-4 px-5 py-4">
          {/* Title + metadata column */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <Chevron open={expanded} />
              <span className="text-lg font-semibold text-fg-primary truncate min-w-0">
                {repo.name}
              </span>
              <RepoSourceTag repo={repo} />
            </div>

            <div className="mt-1 ml-[22px] flex items-center gap-3 text-xs text-fg-tertiary">
              {repo.kind === "open-source" ? (
                <InlineTag tone="hollow">read-only</InlineTag>
              ) : (
                <InlineTag tone="accent">two-way sync</InlineTag>
              )}
              <span className="text-fg-quaternary">·</span>
              <SkillCounts counts={counts} loading={skillsState?.loading} />
            </div>

            <div className="mt-3 ml-[22px] text-xs font-mono text-fg-tertiary truncate">
              {stripGitHubPrefix(repo.git_url)}
            </div>
            <div className="mt-0.5 ml-[22px] text-xs text-fg-tertiary tabular flex items-center gap-2">
              <span className="font-mono text-fg-secondary">
                {shortHash(repo.head_hash) || "—"}
              </span>
              <span className="text-fg-quaternary">·</span>
              <span>synced {relativeTime(repo.last_synced)}</span>
            </div>
          </div>

          {/* Actions — pointer-events-auto so they remain clickable over
              the invisible expand button. stopPropagation so clicking a
              button doesn't also toggle the card. */}
          <div
            className="pointer-events-auto shrink-0 flex items-center gap-1.5"
            onClick={(e: ReactMouseEvent) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleRefreshClick()}
              disabled={busy}
              aria-label={`Refresh ${repo.name}`}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
            {onForceRefresh ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => void handleForceClick()}
                disabled={busy}
                aria-label={`Force pull ${repo.name}`}
                title="Reset ~/.astack/repos/<name>/ to origin/HEAD and pull. Discards any local edits in that directory."
              >
                {forcing ? "Pulling…" : "Force pull"}
              </Button>
            ) : null}
            <Button
              variant="danger"
              size="sm"
              onClick={onDelete}
              disabled={busy}
              aria-label={`Remove ${repo.name}`}
            >
              Remove
            </Button>
          </div>
        </div>
      </div>

      {expanded ? (
        <div className="bg-surface-1 hairline px-5 py-5">
          {skillsState?.loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-60" />
              <Skeleton className="h-4 w-48" />
            </div>
          ) : skillsState?.error ? (
            <div className="text-sm text-error">
              Could not load skills: {skillsState.error}
            </div>
          ) : hasSkills ? (
            <SkillList skills={skillsState!.skills} />
          ) : (
            <div className="text-sm text-fg-secondary">
              No skills scanned from this repo.
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function Chevron({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 14 14"
      className={`text-fg-tertiary transition-transform duration-fast ${
        open ? "rotate-90" : ""
      }`}
    >
      <path
        d="M5 3.5L8.5 7L5 10.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Source-of-origin tags next to the repo title.
 *
 * Two orthogonal dimensions, each rendered as its own tag:
 *
 *   Distribution — is this repo shipped by us, or registered by the user?
 *     - BUILT-IN  (accent/green)  the URL matches a seed
 *     - (no tag)                   user-registered
 *
 *   Ownership — does the user own it (push allowed) or not?
 *     - CUSTOM       (info/blue)   kind=custom, two-way sync
 *     - OPEN SOURCE  (warn/amber)  kind=open-source, pull-only
 *
 * The two axes compose: the three seeded repos are Built-in AND Open
 * source, so they show both tags. A user-registered third-party repo
 * shows only "Open source". A user's own repo shows only "Custom".
 *
 * This is deliberate — Built-in is a provenance claim (someone trusted
 * enough to ship by default), Open source is a capability claim (you
 * can't push to it). Collapsing the two into one tag hid the fact that
 * the seeded repos are also read-only.
 */
function RepoSourceTag({ repo }: { repo: SkillRepo }): React.JSX.Element {
  const isBuiltin = isBuiltinSeedUrl(repo.git_url);
  const isOpenSource = repo.kind === "open-source";

  return (
    <span className="inline-flex items-center gap-1.5">
      {isBuiltin ? <SourceTag label="Built-in" tone="accent" /> : null}
      {isOpenSource ? (
        <SourceTag label="Open source" tone="warn" />
      ) : (
        <SourceTag label="Custom" tone="info" />
      )}
    </span>
  );
}

/**
 * The visual shape shared by all three origin tags. Kept as a single
 * component so "they look the same" is enforced structurally, not by
 * copy-pasting className strings.
 */
function SourceTag({
  label,
  tone
}: {
  label: string;
  tone: "accent" | "warn" | "info";
}): React.JSX.Element {
  // Pre-composed so Tailwind's JIT sees the full class names (it can't
  // follow runtime string concatenation of color utilities).
  const toneCss =
    tone === "accent"
      ? "text-accent bg-accent/10 border-accent/20"
      : tone === "warn"
        ? "text-warn bg-warn/10 border-warn/25"
        : // info
          "text-info bg-info/10 border-info/25";
  return (
    <span
      className={
        "inline-flex items-center h-5 px-1.5 rounded-xs " +
        "text-[11px] font-medium tracking-wide uppercase " +
        "border " +
        toneCss
      }
    >
      {label}
    </span>
  );
}

function stripGitHubPrefix(url: string): string {
  // Visual cleanup: users don't need to read the https:// or .git on
  // every row. Keep the full url on hover via the title attr upstream.
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^git@/, "")
    .replace(/\.git$/, "");
}

// ---------- Skill counts + list ----------

interface TypeCounts {
  skill: number;
  command: number;
  agent: number;
  total: number;
}

function countByType(skills: readonly Skill[]): TypeCounts {
  const c: TypeCounts = {
    skill: 0,
    command: 0,
    agent: 0,
    total: skills.length
  };
  for (const s of skills) {
    if (s.type === "skill") c.skill++;
    else if (s.type === "command") c.command++;
    else if (s.type === "agent") c.agent++;
  }
  return c;
}

function SkillCounts({
  counts,
  loading
}: {
  counts: TypeCounts;
  loading: boolean | undefined;
}): React.JSX.Element {
  if (loading) {
    return <span className="text-fg-tertiary tabular">loading…</span>;
  }
  if (counts.total === 0) {
    return <span className="text-fg-tertiary">empty</span>;
  }
  const parts: string[] = [];
  if (counts.skill > 0)
    parts.push(`${counts.skill} skill${counts.skill === 1 ? "" : "s"}`);
  if (counts.command > 0)
    parts.push(`${counts.command} command${counts.command === 1 ? "" : "s"}`);
  if (counts.agent > 0)
    parts.push(`${counts.agent} agent${counts.agent === 1 ? "" : "s"}`);
  return (
    <span className="text-fg-secondary tabular">{parts.join(" · ")}</span>
  );
}

function SkillList({
  skills
}: {
  skills: readonly Skill[];
}): React.JSX.Element {
  const groups: Record<"skill" | "command" | "agent", Skill[]> = {
    skill: [],
    command: [],
    agent: []
  };
  for (const s of skills) {
    groups[s.type as keyof typeof groups]?.push(s);
  }
  for (const key of Object.keys(groups) as (keyof typeof groups)[]) {
    groups[key].sort((a, b) => a.name.localeCompare(b.name));
  }

  // Each section tracks its own collapse state independently. All start
  // open so existing behavior is preserved; clicking the header toggles.
  return (
    <div className="space-y-5">
      {(["skill", "command", "agent"] as const).map((t) =>
        groups[t].length > 0 ? (
          <SkillGroup key={t} type={t} items={groups[t]} />
        ) : null
      )}
    </div>
  );
}

function SkillGroup({
  type,
  items
}: {
  type: "skill" | "command" | "agent";
  items: readonly Skill[];
}): React.JSX.Element {
  const [open, setOpen] = useState(true);
  const label =
    type === "skill" ? "Skills" : type === "command" ? "Commands" : "Agents";
  const headingId = `skill-group-${type}`;

  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${headingId}-panel`}
        id={headingId}
        onClick={() => setOpen((v) => !v)}
        className="group mb-3 flex items-center gap-2 text-left select-none"
      >
        <Chevron open={open} />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary group-hover:text-fg-secondary transition-colors">
          {label}
        </h3>
        <span className="text-xs tabular text-fg-quaternary">
          {items.length}
        </span>
      </button>
      {open ? (
        // Single column, definition-list shape: name on the left, full
        // description on the right. The old 2-col grid had to line-clamp
        // descriptions (the ones in the screenshot showed "platform..."
        // cut off), which killed the "compare two skills" task.
        //
        // This is what Linear / Stripe / Apple docs all do for the same
        // job. Information density is lower per row, but row count is
        // bounded by the section collapse so the page stays scannable.
        <dl
          id={`${headingId}-panel`}
          role="region"
          aria-labelledby={headingId}
          className="divide-y divide-line-subtle"
        >
          {items.map((s) => (
            <SkillRow key={s.id} skill={s} />
          ))}
        </dl>
      ) : null}
    </section>
  );
}

/**
 * A single (name, description) row inside a SkillGroup.
 *
 * Layout: name pinned to a fixed-width left column so all names line up
 * vertically for scanning; description wraps freely in the right column
 * so it's never truncated.
 *
 *   accessibility        Design, implement, and audit inclusive digital
 *                        products using WCAG 2.2 Level AA standards...
 *   agent-eval           Head-to-head comparison of coding agents
 *                        (Claude Code, Aider, Codex, etc.)...
 *
 * On narrow viewports (< md) the two columns stack vertically so the
 * description still gets its full width.
 */
function SkillRow({ skill }: { skill: Skill }): React.JSX.Element {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]
        gap-x-6 gap-y-1 py-3"
    >
      <dt className="font-mono text-sm text-fg-primary break-words">
        {skill.name}
      </dt>
      {skill.description ? (
        // fg-secondary (not tertiary) — tertiary only hit ~3.4:1 contrast,
        // which fails WCAG AA for body text. Secondary is ~6.2:1.
        <dd className="text-sm text-fg-secondary leading-relaxed max-w-[68ch]">
          {skill.description}
        </dd>
      ) : (
        <dd className="text-sm text-fg-quaternary italic">
          No description.
        </dd>
      )}
    </div>
  );
}

// ---------- Register dialog (refined) ----------

function RegisterRepoDialog({
  onClose,
  onRegistered
}: {
  onClose: () => void;
  onRegistered: () => void;
}): React.JSX.Element {
  const [gitUrl, setGitUrl] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<RepoKind>("custom");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit(): Promise<void> {
    if (!gitUrl.trim()) return;
    setBusy(true);
    try {
      const res = await api.registerRepo({
        git_url: gitUrl.trim(),
        name: name.trim() || undefined,
        kind
      });
      toast.ok(
        `Registered ${res.repo.name}`,
        `${res.command_count} command(s), ${res.skill_count} skill(s)`
      );
      onRegistered();
    } catch (err) {
      toast.error(
        "Registration failed",
        err instanceof AstackError ? err.message : String(err)
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm flex items-center justify-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-[520px] max-w-[92vw] rounded-xl border border-line
          bg-overlay shadow-2xl shadow-black/40 p-6 space-y-5"
      >
        <div>
          <div className="text-lg font-semibold text-fg-primary">
            Register skill repo
          </div>
          <div className="mt-1 text-sm text-fg-secondary">
            Astack will clone the repo and scan it for commands, skills, and
            agents.
          </div>
        </div>

        <FieldLabel label="Git URL">
          <input
            className="w-full h-9 px-3 bg-surface-1 border border-line-subtle rounded-md
              text-sm font-mono text-fg-primary placeholder-fg-tertiary
              focus:outline-none focus:border-accent/60 focus:bg-surface-2
              transition-colors"
            placeholder="git@github.com:me/skills.git"
            value={gitUrl}
            onChange={(e) => setGitUrl(e.target.value)}
            disabled={busy}
            autoFocus
          />
        </FieldLabel>

        <FieldLabel label="Repo type">
          <div className="grid grid-cols-2 gap-2">
            <KindOption
              selected={kind === "custom"}
              onClick={() => !busy && setKind("custom")}
              title="Custom"
              subtitle="Two-way sync"
              description="Your own repo. Pull and push edits."
              tone="accent"
            />
            <KindOption
              selected={kind === "open-source"}
              onClick={() => !busy && setKind("open-source")}
              title="Open source"
              subtitle="Read-only"
              description="Third-party. Pull only."
              tone="hollow"
            />
          </div>
        </FieldLabel>

        <FieldLabel
          label="Name"
          hint="Defaults to the last segment of the URL."
        >
          <input
            className="w-full h-9 px-3 bg-surface-1 border border-line-subtle rounded-md
              text-sm text-fg-primary placeholder-fg-tertiary
              focus:outline-none focus:border-accent/60 focus:bg-surface-2
              transition-colors"
            placeholder="Auto-derived"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </FieldLabel>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy || !gitUrl}>
            {busy ? "Cloning…" : "Register"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-fg-secondary">
        {label}
        {hint ? (
          <span className="ml-2 font-normal text-fg-tertiary">{hint}</span>
        ) : null}
      </div>
      {children}
    </label>
  );
}

function KindOption({
  selected,
  onClick,
  title,
  subtitle,
  description,
  tone
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  description: string;
  tone: "accent" | "hollow";
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        "text-left p-3 rounded-lg border transition-colors duration-fast",
        selected
          ? "border-accent/60 bg-accent-muted"
          : "border-line-subtle bg-surface-1 hover:bg-surface-2 hover:border-line"
      ].join(" ")}
    >
      <div className="flex items-center gap-1.5 text-sm font-medium text-fg-primary">
        <StatusDot tone={tone} />
        {title}
      </div>
      <div className="mt-0.5 text-xs text-fg-tertiary">{subtitle}</div>
      <div className="mt-2 text-xs text-fg-secondary leading-snug">
        {description}
      </div>
    </button>
  );
}
