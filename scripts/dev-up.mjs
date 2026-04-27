#!/usr/bin/env node
/**
 * Astack 一键本地启动脚本（前后端一体）。
 *
 * 做的事情（严格按顺序、幂等）：
 *   1. 杀掉当前仓库构建出的 astack daemon（如果在跑）
 *   2. 杀掉占用 7432 / 5173 端口的残留进程（防御旧 vite / 旧 daemon）
 *   3. pnpm install（--frozen-lockfile 可通过 --clean 关闭）
 *   4. pnpm -r run build（包含 @astack/web 的 vite build，产物会被 daemon 静态托管）
 *   5. 后台启动 daemon（node packages/cli/dist/bin.js server start），日志落到 /tmp/astack-dev.log
 *   6. 健康检查 http://127.0.0.1:7432/health（最多轮询 15s）
 *
 * 用法：
 *   node scripts/dev-up.mjs              # 默认模式：daemon 托管 web（打开 http://127.0.0.1:7432）
 *   node scripts/dev-up.mjs --with-vite  # 额外起 vite dev server（打开 http://127.0.0.1:5173）
 *   node scripts/dev-up.mjs --clean      # 跑前先清 dist / node_modules 缓存（重度排障用）
 *   node scripts/dev-up.mjs --skip-install  # 跳过 pnpm install
 *   node scripts/dev-up.mjs --skip-build    # 跳过 pnpm build（只重启 daemon）
 *
 * 访问地址：
 *   后端 API + Web Dashboard：http://127.0.0.1:7432
 *   健康检查：                http://127.0.0.1:7432/health
 *   Vite HMR（仅 --with-vite）：http://127.0.0.1:5173
 *
 * 停止：
 *   node packages/cli/dist/bin.js server stop
 *   或再跑一次本脚本（会先杀再起）
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------- 常量 ----------

const DAEMON_HOST = "127.0.0.1";
const DAEMON_PORT = 7432;
const VITE_PORT = 5173;
const HEALTH_URL = `http://${DAEMON_HOST}:${DAEMON_PORT}/health`;
const HEALTH_TIMEOUT_MS = 15_000;
const HEALTH_POLL_MS = 300;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI_BIN = path.join(REPO_ROOT, "packages/cli/dist/bin.js");
const DAEMON_LOG = "/tmp/astack-dev.log";
const VITE_LOG = "/tmp/astack-vite-dev.log";

// ---------- 参数 ----------

const argv = new Set(process.argv.slice(2));
const WITH_VITE = argv.has("--with-vite");
const CLEAN = argv.has("--clean");
const SKIP_INSTALL = argv.has("--skip-install");
const SKIP_BUILD = argv.has("--skip-build");

// ---------- 小工具 ----------

function log(msg) {
  process.stdout.write(`[dev-up] ${msg}\n`);
}

function warn(msg) {
  process.stdout.write(`[dev-up] ⚠ ${msg}\n`);
}

function die(msg, code = 1) {
  process.stderr.write(`[dev-up] ✗ ${msg}\n`);
  process.exit(code);
}

/** 同步执行命令，失败默认 die；返回 stdout trim。 */
function run(cmd, args, { cwd = REPO_ROOT, allowFail = false, quiet = false } = {}) {
  if (!quiet) log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
    env: process.env
  });
  if (r.status !== 0 && !allowFail) {
    die(`command failed: ${cmd} ${args.join(" ")} (exit ${r.status})`);
  }
  return r.stdout ? r.stdout.toString().trim() : "";
}

/** 返回监听指定 TCP 端口的 pid 数组。 */
function pidsOnPort(port) {
  const r = spawnSync("lsof", ["-nP", "-iTCP:" + port, "-sTCP:LISTEN", "-t"], {
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (r.status !== 0) return [];
  return r.stdout
    .toString()
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n));
}

/** 检查 pid 是否还活着。 */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** 优雅杀：先 SIGTERM，不死再 SIGKILL。 */
async function killPid(pid, label) {
  if (!alive(pid)) return;
  log(`killing ${label} pid=${pid} (SIGTERM)`);
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* already gone */
  }
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!alive(pid)) return;
    await sleep(100);
  }
  warn(`pid=${pid} still alive after 5s, SIGKILL`);
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* ignore */
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHealthy() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        return body;
      }
    } catch {
      /* daemon 还没起 */
    }
    await sleep(HEALTH_POLL_MS);
  }
  return null;
}

// ---------- Step 1: 杀旧进程 ----------

async function stopExisting() {
  log("step 1/6 · stop existing astack processes");

  // 1a. 用 CLI 的正规 stop 路径（会清理 pidfile / lockfile）
  if (fs.existsSync(CLI_BIN)) {
    run("node", [CLI_BIN, "server", "stop"], { allowFail: true, quiet: true });
  }

  // 1b. 兜底：扫描端口。即使 pidfile 丢了、或端口被别的 node 进程占着，也一起杀掉。
  const daemonPids = pidsOnPort(DAEMON_PORT);
  for (const pid of daemonPids) {
    await killPid(pid, `daemon :${DAEMON_PORT}`);
  }

  if (WITH_VITE) {
    const vitePids = pidsOnPort(VITE_PORT);
    for (const pid of vitePids) {
      await killPid(pid, `vite :${VITE_PORT}`);
    }
  }

  // 1c. 最后确认端口空了
  const leftover = pidsOnPort(DAEMON_PORT);
  if (leftover.length > 0) {
    die(`port ${DAEMON_PORT} still held by pids=${leftover.join(",")}`);
  }
}

// ---------- Step 2: （可选）清理 ----------

function cleanBuild() {
  if (!CLEAN) return;
  log("step · clean (dist + tsbuildinfo)");
  run("pnpm", ["-r", "run", "clean"], { allowFail: true });
}

// ---------- Step 3: 安装依赖 ----------

function install() {
  if (SKIP_INSTALL) {
    log("step 2/6 · skip pnpm install (--skip-install)");
    return;
  }
  log("step 2/6 · pnpm install");
  run("pnpm", ["install"]);
}

// ---------- Step 4: 构建全部 ----------

function buildAll() {
  if (SKIP_BUILD) {
    log("step 3/6 · skip pnpm -r run build (--skip-build)");
    return;
  }
  log("step 3/6 · pnpm -r run build");
  run("pnpm", ["-r", "run", "build"]);

  if (!fs.existsSync(CLI_BIN)) {
    die(`CLI bin missing after build: ${CLI_BIN}`);
  }
  const webIndex = path.join(REPO_ROOT, "packages/web/dist/index.html");
  if (!fs.existsSync(webIndex)) {
    warn(`web dist missing: ${webIndex} — daemon will run API-only`);
  }
}

// ---------- Step 5: 启动 daemon ----------

function startDaemon() {
  log(`step 4/6 · start daemon (log → ${DAEMON_LOG})`);
  const out = fs.openSync(DAEMON_LOG, "a");
  const err = fs.openSync(DAEMON_LOG, "a");
  const child = spawn("node", [CLI_BIN, "server", "start"], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ["ignore", out, err],
    env: process.env
  });
  child.unref();
  return child.pid;
}

// ---------- Step 6: （可选）启动 vite ----------

function startVite() {
  if (!WITH_VITE) return null;
  log(`step 5/6 · start vite dev server (log → ${VITE_LOG})`);
  const out = fs.openSync(VITE_LOG, "a");
  const err = fs.openSync(VITE_LOG, "a");
  const child = spawn("pnpm", ["-C", "packages/web", "dev"], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ["ignore", out, err],
    env: process.env
  });
  child.unref();
  return child.pid;
}

// ---------- main ----------

async function main() {
  log(`repo: ${REPO_ROOT}`);

  await stopExisting();
  cleanBuild();
  install();
  buildAll();

  const daemonPid = startDaemon();
  log(`daemon spawned pid=${daemonPid}`);

  log("step 6/6 · health check");
  const health = await waitHealthy();
  if (!health) {
    warn(`health check timeout after ${HEALTH_TIMEOUT_MS}ms`);
    warn(`last 40 lines of daemon log (${DAEMON_LOG}):`);
    try {
      const lines = fs.readFileSync(DAEMON_LOG, "utf8").split("\n").slice(-40);
      process.stdout.write(lines.join("\n") + "\n");
    } catch {
      /* ignore */
    }
    die("daemon did not become healthy");
  }

  const vitePid = startVite();

  // ---------- 汇总 ----------
  log("");
  log("✓ astack is up");
  log(`  daemon:  http://${DAEMON_HOST}:${DAEMON_PORT}   (pid=${daemonPid}, version=${health.version}, uptime_ms=${health.uptime_ms})`);
  log(`  logs:    tail -f ${DAEMON_LOG}`);
  log(`  stop:    node ${path.relative(REPO_ROOT, CLI_BIN)} server stop`);
  if (WITH_VITE) {
    log(`  vite:    http://${DAEMON_HOST}:${VITE_PORT}   (pid=${vitePid})`);
    log(`  vite log:tail -f ${VITE_LOG}`);
  }
}

main().catch((e) => {
  die(e?.stack ?? String(e));
});
