import type * as React from "react";
/**
 * Projects page — list projects and register new ones.
 */

import type { Project, SubscriptionWithState } from "@astack/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  Button,
  Card,
  EmptyState,
  Skeleton,
  StatusDot
} from "../components/ui/index.js";
import { PathAutocomplete } from "../components/PathAutocomplete.js";
import { api, AstackError } from "../lib/api.js";
import { relativeTime } from "../lib/format.js";
import { useEventListener } from "../lib/sse.js";
import { useToast } from "../lib/toast.js";

interface ProjectSummary {
  project: Project;
  subscriptions: SubscriptionWithState[];
  lastSynced: string | null;
}

function worstState(subs: SubscriptionWithState[]): SubscriptionWithState["state"] | null {
  if (subs.length === 0) return null;
  const priority: Record<SubscriptionWithState["state"], number> = {
    conflict: 0,
    behind: 1,
    "local-ahead": 2,
    pending: 3,
    synced: 4
  };
  return subs.reduce<SubscriptionWithState>(
    (best, s) => (priority[s.state] < priority[best.state] ? s : best),
    subs[0]
  ).state;
}

const STATE_CONFIG: Record<
  SubscriptionWithState["state"],
  { tone: "error" | "warn" | "accent" | "muted"; label: string }
> = {
  conflict:      { tone: "error",  label: "Conflict"     },
  behind:        { tone: "warn",   label: "Behind"       },
  "local-ahead": { tone: "warn",   label: "Local Ahead"  },
  pending:       { tone: "muted",  label: "Pending"      },
  synced:        { tone: "accent", label: "Synced"       }
};

export function ProjectsPage(): React.JSX.Element {
  const [summaries, setSummaries] = useState<ProjectSummary[] | null>(null);
  const [params, setParams] = useSearchParams();
  const showDialog = params.get("action") === "new";
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const { projects } = await api.listProjects({ limit: 500 });
      const results = await Promise.all(
        projects.map(async (project) => {
          try {
            const status = await api.projectStatus(project.id);
            return {
              project,
              subscriptions: status.subscriptions,
              lastSynced: status.last_synced
            } satisfies ProjectSummary;
          } catch {
            return {
              project,
              subscriptions: [],
              lastSynced: null
            } satisfies ProjectSummary;
          }
        })
      );

      const priority: Record<SubscriptionWithState["state"], number> = {
        conflict: 0,
        behind: 1,
        "local-ahead": 2,
        pending: 3,
        synced: 4
      };
      const nullPriority = 5;
      results.sort((a, b) => {
        const wa = worstState(a.subscriptions);
        const wb = worstState(b.subscriptions);
        const pa = wa !== null ? priority[wa] : nullPriority;
        const pb = wb !== null ? priority[wb] : nullPriority;
        if (pa !== pb) return pa - pb;
        return a.project.name.localeCompare(b.project.name);
      });

      setSummaries(results);
    } catch (err) {
      toast.error(
        "Could not load projects",
        err instanceof AstackError ? err.message : String(err)
      );
      setSummaries([]);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEventListener("project.registered", () => void load());
  useEventListener("project.removed", () => void load());
  useEventListener("skill.updated", () => void load());
  useEventListener("conflict.detected", () => void load());
  useEventListener("sync.completed", () => void load());

  useEffect(() => {
    const handler = (): void => void load();
    window.addEventListener("astack:refresh", handler);
    return () => window.removeEventListener("astack:refresh", handler);
  }, [load]);

  async function handleDelete(project: Project): Promise<void> {
    if (!confirm(`Unregister project "${project.name}"?`)) return;
    try {
      await api.deleteProject(project.id);
      toast.ok(`Unregistered '${project.name}'`);
      await load();
    } catch (err) {
      toast.error(
        "Unregister failed",
        err instanceof AstackError ? err.message : String(err)
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <Button
          variant="primary"
          onClick={() => setParams({ action: "new" })}
        >
          Register project
        </Button>
      </div>

      {summaries === null ? (
        <div className="space-y-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : summaries.length === 0 ? (
        <EmptyState
          title="No projects registered"
          hint="Run 'astack init' in your project root, or use the button on the right."
        >
          <Button
            variant="primary"
            onClick={() => setParams({ action: "new" })}
          >
            Register your first project
          </Button>
        </EmptyState>
      ) : (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs border-b border-border">
                <th className="font-medium px-4 py-3 text-text-secondary">Project</th>
                <th className="font-medium px-4 py-3 text-text-secondary text-right">Skills</th>
                <th className="font-medium px-4 py-3 text-text-secondary text-right">Conflicts</th>
                <th className="font-medium px-4 py-3 text-text-secondary text-right">Behind</th>
                <th className="font-medium px-4 py-3 text-text-secondary text-right">Pending</th>
                <th className="font-medium px-4 py-3 text-text-secondary text-right">Synced</th>
                <th className="font-medium px-4 py-3 text-text-secondary">Status</th>
                <th className="font-medium px-4 py-3 text-text-secondary">Last synced</th>
                <th className="font-medium px-4 py-3 text-text-secondary text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <ProjectRow
                  key={s.project.id}
                  summary={s}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {showDialog ? (
        <RegisterProjectDialog
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

function ProjectRow({
  summary,
  onDelete
}: {
  summary: ProjectSummary;
  onDelete: (project: Project) => Promise<void>;
}): React.JSX.Element {
  const navigate = useNavigate();
  const { project, subscriptions, lastSynced } = summary;

  const counts = useMemo(() => {
    const c = { conflict: 0, behind: 0, "local-ahead": 0, pending: 0, synced: 0 };
    for (const s of subscriptions) c[s.state]++;
    return c;
  }, [subscriptions]);

  const worst = worstState(subscriptions);
  const statusConfig = worst !== null ? STATE_CONFIG[worst] : null;
  const needsAttention =
    worst !== null && worst !== "synced" && subscriptions.length > 0;

  const openProject = (): void => {
    void navigate(`/projects/${project.id}`);
  };

  return (
    <tr
      className="border-t border-border hover:bg-elevated transition-colors cursor-pointer"
      onClick={openProject}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openProject();
        }
      }}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {needsAttention ? (
            <span className="w-1.5 h-1.5 rounded-full bg-warn shrink-0" aria-hidden />
          ) : null}
          <span className="font-medium text-fg-primary">{project.name}</span>
          <span className="text-xs text-text-muted font-mono truncate max-w-[160px]">
            {project.path}
          </span>
        </div>
      </td>

      <td className="px-4 py-3 text-right tabular text-text-secondary">
        {subscriptions.length}
      </td>
      <td className="px-4 py-3 text-right tabular">
        {counts.conflict > 0 ? (
          <span className="text-error font-medium">{counts.conflict}</span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular">
        {counts.behind > 0 ? (
          <span className="text-warn font-medium">{counts.behind}</span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular">
        {counts.pending > 0 ? (
          <span className="text-text-secondary">{counts.pending}</span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular">
        {counts.synced > 0 ? (
          <span className="text-accent">{counts.synced}</span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {statusConfig !== null ? (
          <span className="inline-flex items-center gap-1.5">
            <StatusDot tone={statusConfig.tone} />
            <span className="text-xs text-text-secondary">{statusConfig.label}</span>
          </span>
        ) : (
          <span className="text-xs text-text-muted">No skills</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-text-muted">
        {relativeTime(lastSynced)}
      </td>
      <td
        className="px-4 py-3 text-right"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 justify-end">
          <Link to={`/projects/${project.id}`}>
            <Button size="sm">Config</Button>
          </Link>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(project)}
            className="text-error hover:text-error"
          >
            Remove
          </Button>
        </div>
      </td>
    </tr>
  );
}

function RegisterProjectDialog({
  onClose,
  onRegistered
}: {
  onClose: () => void;
  onRegistered: () => void;
}): React.JSX.Element {
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit(): Promise<void> {
    if (!path.trim()) return;
    setBusy(true);
    try {
      await api.registerProject({ path: path.trim() });
      toast.ok("Project registered");
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
      className="fixed inset-0 z-30 bg-base/60 flex items-center justify-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-[480px] max-w-[90vw] bg-overlay border border-border rounded p-4 space-y-3">
        <div className="text-lg font-semibold">Register project</div>
        <div className="text-sm text-text-secondary">
          Or, from your project root:{" "}
          <span className="font-mono">astack init</span>
        </div>
        <label className="block text-sm">
          <div className="text-text-secondary mb-1">Absolute path</div>
          <PathAutocomplete
            value={path}
            onChange={setPath}
            onSubmit={() => void submit()}
            disabled={busy}
            autoFocus
          />
          <div className="text-xs text-text-muted mt-1.5">
            Type a path, or press ↓ to browse. Tab / Enter to complete.
          </div>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy || !path}>
            {busy ? "Registering…" : "Register"}
          </Button>
        </div>
      </div>
    </div>
  );
}
