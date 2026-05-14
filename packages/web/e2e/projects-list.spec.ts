/**
 * Projects list page E2E.
 *
 * Verifies the v0.12 layout change: Projects page now renders the same
 * dashboard-style table (Skills / Conflicts / Behind / Pending / Synced /
 * Status / Last synced) plus a per-row Actions column with Config / Remove
 * buttons that don't trigger row navigation.
 */

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { registerProject, resetServerState } from "./fixtures/helpers.js";

test.describe("projects list — dashboard-style table + actions", () => {
  const projectDirs: string[] = [];

  test.beforeEach(async ({ request }) => {
    await resetServerState(request);
  });

  test.afterEach(() => {
    while (projectDirs.length > 0) {
      const d = projectDirs.pop();
      if (d) rmSync(d, { recursive: true, force: true });
    }
  });

  function makeProjectDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "astack-e2e-projlist-"));
    mkdirSync(path.join(dir, ".claude", "skills"), { recursive: true });
    mkdirSync(path.join(dir, ".claude", "commands"), { recursive: true });
    projectDirs.push(dir);
    return dir;
  }

  test("renders dashboard column headers and one row per project", async ({
    page,
    request
  }) => {
    const a = await registerProject(request, makeProjectDir());
    const b = await registerProject(request, makeProjectDir());

    await page.goto("/projects");

    // All Dashboard-parity column headers are present, plus Actions.
    for (const header of [
      "Project",
      "Skills",
      "Conflicts",
      "Behind",
      "Pending",
      "Synced",
      "Status",
      "Last synced",
      "Actions"
    ]) {
      await expect(
        page.getByRole("columnheader", { name: header, exact: true })
      ).toBeVisible();
    }

    // One row per project, with the project name visible.
    await expect(page.getByText(a.name, { exact: true })).toBeVisible();
    await expect(page.getByText(b.name, { exact: true })).toBeVisible();

    // Each row has a Config link + Remove button.
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      const row = rows.nth(i);
      await expect(row.getByRole("link", { name: "Config" })).toBeVisible();
      await expect(row.getByRole("button", { name: "Remove" })).toBeVisible();
    }
  });

  test("clicking a row navigates to the project detail page", async ({
    page,
    request
  }) => {
    const project = await registerProject(request, makeProjectDir());
    await page.goto("/projects");

    // Click on the project name (row body, not the action buttons).
    await page.getByText(project.name, { exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}(\\?|$)`));
  });

  test("Config button opens the project without triggering Remove", async ({
    page,
    request
  }) => {
    const project = await registerProject(request, makeProjectDir());
    await page.goto("/projects");

    const row = page
      .locator("tbody tr")
      .filter({ hasText: project.name });

    // Make sure no confirm() ever fires on this path — if Remove leaks
    // through stopPropagation, the dialog handler below would catch it
    // and the test would fail loudly.
    let confirmFired = false;
    page.on("dialog", async (d) => {
      confirmFired = true;
      await d.dismiss();
    });

    await row.getByRole("link", { name: "Config" }).click();

    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}(\\?|$)`));
    expect(confirmFired).toBe(false);
  });

  test("Remove button confirms and unregisters the project", async ({
    page,
    request
  }) => {
    const project = await registerProject(request, makeProjectDir());
    await page.goto("/projects");

    // Auto-accept the native confirm() dialog.
    page.once("dialog", (d) => {
      expect(d.message()).toContain(project.name);
      void d.accept();
    });

    const row = page
      .locator("tbody tr")
      .filter({ hasText: project.name });
    await row.getByRole("button", { name: "Remove" }).click();

    // Row goes away; with no other projects registered we land back in
    // the empty state.
    await expect(page.getByText("No projects registered")).toBeVisible();
    await expect(page.getByText(project.name, { exact: true })).toHaveCount(0);
  });
});
