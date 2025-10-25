import express, { Request, Response } from "express";
import { Server } from "http";
import {
  Client,
  Guild,
  GuildMember,
  PermissionFlagsBits,
  APIEmbed,
} from "discord.js";

/**
 * Dashboard server for ShiggyBot
 *
 * - Defaults to dark mode UI
 * - Uses DEV_GUILD_ID from environment as the single managed guild (required)
 * - Moderation actions (ban / kick / mute) accept a `target` string which will
 *   be resolved against guild members by:
 *     - exact match on "username#discriminator"
 *     - exact match on displayName
 *   If multiple matches are found the request will be rejected as ambiguous.
 *
 * Usage:
 *   Call startDashboard(port?, client) from your bot after the `client` is ready.
 *   If you omit `client` the dashboard will run in read-only mode and return
 *   helpful errors for moderation endpoints.
 *
 * Security:
 *   This file intentionally does NOT provide auth. Add an auth/reverse-proxy
 *   if you expose the dashboard beyond a trusted environment.
 */

type LogEntry = {
  ts: number;
  level: "info" | "warn" | "error" | "debug";
  msg: string;
};

export function startDashboard(port?: number, client?: Client): Server {
  const app = express();
  app.use(express.json({ limit: "100kb" }));

  const resolvedPort =
    port ?? (process.env.PORT ? parseInt(process.env.PORT, 10) : 14150);
  const DEV_GUILD_ID = process.env.DEV_GUILD_ID ?? "";
  const serverStart = Date.now();

  // In-memory logs circular buffer
  const LOG_CAP = 1000;
  const logs: LogEntry[] = [];
  function pushLog(level: LogEntry["level"], msg: string) {
    const entry = { ts: Date.now(), level, msg };
    logs.push(entry);
    if (logs.length > LOG_CAP) logs.splice(0, logs.length - LOG_CAP);
    // no SSE broadcast here (SSE handled separately)
  }

  // Wrap console methods so runtime logs are captured in dashboard
  const origConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: (console as any).debug
      ? (console as any).debug.bind(console)
      : console.log.bind(console),
  };
  console.log = (...a: any[]) => {
    origConsole.log(...a);
    try {
      pushLog("info", a.map(String).join(" "));
    } catch {}
  };
  console.info = (...a: any[]) => {
    origConsole.info(...a);
    try {
      pushLog("info", a.map(String).join(" "));
    } catch {}
  };
  console.warn = (...a: any[]) => {
    origConsole.warn(...a);
    try {
      pushLog("warn", a.map(String).join(" "));
    } catch {}
  };
  console.error = (...a: any[]) => {
    origConsole.error(...a);
    try {
      pushLog("error", a.map(String).join(" "));
    } catch {}
  };
  (console as any).debug = (...a: any[]) => {
    origConsole.debug(...a);
    try {
      pushLog("debug", a.map(String).join(" "));
    } catch {}
  };

  // SSE clients for pushing logs/actions in real-time
  const sseClients: Response[] = [];
  function broadcastSSE(event: string, data: any) {
    const payload = JSON.stringify(data);
    for (const res of sseClients.slice()) {
      try {
        res.write(`event: ${event}\n`);
        res.write(`data: ${payload}\n\n`);
      } catch {
        // ignore write errors; connection cleanup occurs on close
      }
    }
  }

  // Helpers to safely get the DEV guild and a member
  async function getDevGuild(): Promise<Guild | null> {
    if (!DEV_GUILD_ID) return null;
    if (!client) return null;
    try {
      const g = await client.guilds.fetch(DEV_GUILD_ID);
      return g;
    } catch (err) {
      return null;
    }
  }

  async function findMemberByName(
    guild: Guild,
    target: string
  ): Promise<GuildMember | { ambiguous: true; matches: GuildMember[] } | null> {
    // Normalize target
    const t = target?.trim();
    if (!t) return null;

    // Ensure up-to-date members cache (requires GuildMembers intent)
    try {
      await guild.members.fetch({ limit: 1000 }).catch(() => {});
    } catch {}

    // Try exact username#discriminator match first
    const cache = guild.members.cache;
    const byTag = cache.find(
      (m) =>
        `${m.user.username}#${m.user.discriminator}`.toLowerCase() ===
        t.toLowerCase()
    );
    if (byTag) return byTag;

    // Then try exact displayName
    const byDisplay = cache.filter(
      (m) => m.displayName.toLowerCase() === t.toLowerCase()
    );
    if (byDisplay.size === 1) return byDisplay.first() ?? null;
    if (byDisplay.size > 1)
      return { ambiguous: true, matches: Array.from(byDisplay.values()) };

    // Finally, try substring match on username/displayName (prefer unique results)
    const substring = cache.filter(
      (m) =>
        m.user.username.toLowerCase().includes(t.toLowerCase()) ||
        m.displayName.toLowerCase().includes(t.toLowerCase())
    );
    if (substring.size === 1) return substring.first() ?? null;
    if (substring.size > 1)
      return { ambiguous: true, matches: Array.from(substring.values()) };

    return null;
  }

  function msToTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    parts.push(`${minutes}m`);
    return parts.join(" ");
  }

  // SSE endpoint
  app.get("/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    // send last logs as handshake
    res.write(`event: connected\n`);
    res.write(
      `data: ${JSON.stringify({
        time: Date.now(),
        logs: logs.slice(-100),
      })}\n\n`
    );

    sseClients.push(res);
    req.on("close", () => {
      const idx = sseClients.indexOf(res);
      if (idx >= 0) sseClients.splice(idx, 1);
    });
  });

  // Health
  app.get("/health", (_req, res) => res.status(200).send("OK"));

  // Logs endpoint
  app.get("/api/logs", (_req, res) => {
    res.json(logs.slice().reverse());
  });

  // Stats endpoint - prefers bot/client uptime when available
  app.get("/api/stats", async (_req, res) => {
    // Determine uptime in milliseconds. Prefer the Discord client's ready time / uptime
    let uptimeMs = Date.now() - serverStart;
    try {
      if (client) {
        // discord.js exposes readyTimestamp (timestamp when client became ready) in many versions
        const readyTs = (client as any).readyTimestamp;
        const clientUptime = (client as any).uptime;
        if (typeof readyTs === "number" && readyTs > 0) {
          uptimeMs = Date.now() - readyTs;
        } else if (typeof clientUptime === "number" && clientUptime > 0) {
          // client.uptime is milliseconds since ready
          uptimeMs = clientUptime;
        }
      }
    } catch (e) {
      // fall back to server start if anything goes wrong
      pushLog("warn", `Failed to read client uptime: ${String(e)}`);
    }
    const uptime = msToTime(uptimeMs);

    let guildName = null;
    let memberCount = null;
    let status = client ? "online" : "offline";
    if (client) {
      try {
        const g = await getDevGuild();
        if (g) {
          guildName = g.name;
          memberCount = g.memberCount ?? null;
        }
      } catch (err) {
        pushLog("warn", `Failed to fetch guild in /api/stats: ${String(err)}`);
      }
    }
    res.json({ uptime, guildName, memberCount, status, serverStart });
  });

  // Members list (from DEV_GUILD_ID)
  app.get("/api/members", async (_req, res) => {
    if (!DEV_GUILD_ID)
      return res.status(400).json({ error: "DEV_GUILD_ID not configured" });
    if (!client)
      return res
        .status(500)
        .json({ error: "Dashboard not attached to Discord client" });

    const guild = await getDevGuild();
    if (!guild)
      return res
        .status(404)
        .json({ error: "Configured guild not found or bot not in it" });

    try {
      // fetch members into cache (may be limited by intents)
      await guild.members.fetch({ limit: 1000 }).catch(() => {});
      const members = guild.members.cache.map((m) => ({
        id: m.id,
        tag: `${m.user.username}#${m.user.discriminator}`,
        displayName: m.displayName,
        joinedAt: m.joinedTimestamp ?? null,
      }));
      res.json(members);
    } catch (err: any) {
      pushLog("error", `Failed to fetch members: ${String(err)}`);
      res.status(500).json({ error: String(err) });
    }
  });

  // Moderation endpoints - resolve by name (username#discriminator or displayName)
  // POST /api/ban { target: string, reason?: string }
  app.post("/api/ban", async (req, res) => {
    const { target, reason } = req.body ?? {};
    if (!target)
      return res.status(400).json({
        error: "target required (username#discriminator or displayName)",
      });
    if (!DEV_GUILD_ID)
      return res.status(400).json({ error: "DEV_GUILD_ID not configured" });
    if (!client)
      return res
        .status(500)
        .json({ error: "Dashboard not attached to Discord client" });

    const guild = await getDevGuild();
    if (!guild)
      return res.status(404).json({ error: "Configured guild not found" });

    try {
      const found = await findMemberByName(guild, String(target));
      if (!found)
        return res.status(404).json({ error: "No matching member found" });
      if ((found as any).ambiguous) {
        const matches = (found as any).matches.map((m: GuildMember) => ({
          id: m.id,
          displayName: m.displayName,
          tag: `${m.user.username}#${m.user.discriminator}`,
        }));
        return res.status(409).json({ error: "Ambiguous target", matches });
      }
      const member = found as GuildMember;

      // attempt to ban
      await member.ban({ reason: reason ?? "Banned via dashboard" });
      const msg = `Banned ${member.user.tag} (${member.id}) in guild ${guild.name}`;
      pushLog("info", msg);
      broadcastSSE("action", {
        action: "ban",
        target: member.user.tag,
        id: member.id,
        reason,
      });
      return res.json({ ok: true });
    } catch (err: any) {
      pushLog("error", `Ban failed: ${String(err)}`);
      return res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/kick { target: string, reason?: string }
  app.post("/api/kick", async (req, res) => {
    const { target, reason } = req.body ?? {};
    if (!target) return res.status(400).json({ error: "target required" });
    if (!DEV_GUILD_ID)
      return res.status(400).json({ error: "DEV_GUILD_ID not configured" });
    if (!client)
      return res
        .status(500)
        .json({ error: "Dashboard not attached to Discord client" });

    const guild = await getDevGuild();
    if (!guild)
      return res.status(404).json({ error: "Configured guild not found" });

    try {
      const found = await findMemberByName(guild, String(target));
      if (!found)
        return res.status(404).json({ error: "No matching member found" });
      if ((found as any).ambiguous) {
        const matches = (found as any).matches.map((m: GuildMember) => ({
          id: m.id,
          displayName: m.displayName,
          tag: `${m.user.username}#${m.user.discriminator}`,
        }));
        return res.status(409).json({ error: "Ambiguous target", matches });
      }
      const member = found as GuildMember;

      await member.kick(reason ?? "Kicked via dashboard");
      const msg = `Kicked ${member.user.tag} (${member.id}) in guild ${guild.name}`;
      pushLog("info", msg);
      broadcastSSE("action", {
        action: "kick",
        target: member.user.tag,
        id: member.id,
        reason,
      });
      return res.json({ ok: true });
    } catch (err: any) {
      pushLog("error", `Kick failed: ${String(err)}`);
      return res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/mute { target: string, durationMinutes: number, reason?: string }
  app.post("/api/mute", async (req, res) => {
    const { target, durationMinutes, reason } = req.body ?? {};
    if (!target) return res.status(400).json({ error: "target required" });
    if (!durationMinutes)
      return res.status(400).json({ error: "durationMinutes required" });
    if (!DEV_GUILD_ID)
      return res.status(400).json({ error: "DEV_GUILD_ID not configured" });
    if (!client)
      return res
        .status(500)
        .json({ error: "Dashboard not attached to Discord client" });

    const guild = await getDevGuild();
    if (!guild)
      return res.status(404).json({ error: "Configured guild not found" });

    try {
      const found = await findMemberByName(guild, String(target));
      if (!found)
        return res.status(404).json({ error: "No matching member found" });
      if ((found as any).ambiguous) {
        const matches = (found as any).matches.map((m: GuildMember) => ({
          id: m.id,
          displayName: m.displayName,
          tag: `${m.user.username}#${m.user.discriminator}`,
        }));
        return res.status(409).json({ error: "Ambiguous target", matches });
      }
      const member = found as GuildMember;
      const durationMs = Math.max(1, Number(durationMinutes)) * 60 * 1000;

      // Verify bot membership, permissions, and role hierarchy before muting to avoid Missing Permissions
      const meMember = client
        ? await guild.members.fetch((client as any).user?.id).catch(() => null)
        : null;
      if (!meMember) {
        return res.status(500).json({ error: "Bot member not available" });
      }

      // Ensure bot has the Moderate Members permission
      if (!meMember.permissions?.has?.(PermissionFlagsBits.ModerateMembers)) {
        return res
          .status(403)
          .json({ error: "Bot lacks Moderate Members permission" });
      }

      // Ensure bot's highest role is higher than the target's highest role
      const botHighestPos = meMember.roles?.highest?.position ?? 0;
      const targetHighestPos = (member as any).roles?.highest?.position ?? 0;
      if (botHighestPos <= targetHighestPos) {
        return res
          .status(403)
          .json({
            error: "Bot role must be higher than target's highest role",
          });
      }

      // Try the standard timeout API (discord.js v14)
      try {
        if (typeof (member as any).timeout === "function") {
          await (member as any).timeout(
            durationMs,
            reason ?? "Muted via dashboard"
          );
        } else {
          if (typeof (member as any).disableCommunicationUntil === "function") {
            await (member as any).disableCommunicationUntil(
              new Date(Date.now() + durationMs)
            );
          } else {
            return res.status(501).json({
              error: "Timeout/mute not supported by this discord.js version",
            });
          }
        }
        const msg = `Muted ${member.user.tag} (${member.id}) for ${durationMinutes}m in guild ${guild.name}`;
        pushLog("info", msg);
        broadcastSSE("action", {
          action: "mute",
          target: member.user.tag,
          id: member.id,
          durationMinutes,
          reason,
        });
        return res.json({ ok: true });
      } catch (err: any) {
        pushLog("error", `Mute operation failed: ${String(err)}`);
        return res.status(500).json({ error: String(err) });
      }
    } catch (err: any) {
      pushLog("error", `Mute failed: ${String(err)}`);
      return res.status(500).json({ error: String(err) });
    }
  });

  // Serve minimal single-page UI (dark-first theme)
  app.get("/", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>ShiggyBot — Dashboard</title>
<style>
  :root {
    --primary: #ddb169;
    --on-primary: #2b1f12;
    --bg: #0b0d0f;
    --surface: #0f1113;
    --muted: #9aa4b2;
    --accent: var(--primary);
    --rounded: 12px;
  }
  html,body{height:100%;margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial;background:linear-gradient(180deg,#050506 0%,#0b0d0f 100%);color:#e6eef6;}
  .app{min-height:100vh;display:flex;flex-direction:column;}
  header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));backdrop-filter:blur(6px);border-bottom:1px solid rgba(255,255,255,0.02)}
  .brand{display:flex;gap:12px;align-items:center}
  .logo{width:44px;height:44px;border-radius:10px;background:linear-gradient(135deg,var(--primary),#c79c4f);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--on-primary)}
  h1{margin:0;font-size:18px}
  main{flex:1;padding:18px;max-width:1200px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
  .row-4{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
  @media(min-width:900px){.row-4{grid-template-columns:repeat(4,1fr)}}
  .surface{background:var(--surface);border-radius:var(--rounded);padding:14px;border:1px solid rgba(255,255,255,0.03);box-shadow:0 6px 20px rgba(0,0,0,0.6)}
  .stat{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:88px}
  .label{font-size:12px;color:var(--muted);font-weight:700}
  .value{font-size:20px;font-weight:800}
  .accent{background:linear-gradient(135deg,rgba(221,177,105,0.08),rgba(221,177,105,0.04));border:1px solid rgba(221,177,105,0.12)}
  .controls{display:flex;gap:8px;align-items:center}
  .btn{background:var(--primary);color:var(--on-primary);padding:8px 12px;border-radius:10px;border:none;cursor:pointer;font-weight:800}
  .btn.secondary{background:transparent;border:1px solid rgba(255,255,255,0.04);color:var(--muted);font-weight:700}
  table{width:100%;border-collapse:collapse}
  th,td{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.02);font-size:13px}
  .muted{color:var(--muted);font-size:13px}
  .console{height:260px;overflow:auto;background:linear-gradient(180deg,#071223,#061220);border-radius:10px;padding:10px;font-family:monospace;font-size:13px;color:#cfe9ff}
  .log-info{color:#cfe9ff}
  .log-warn{color:#ffdca7}
  .log-error{color:#ffb4b4}
  footer{padding:12px;text-align:center;color:var(--muted);font-size:13px}
  input,select{background:transparent;border:1px solid rgba(255,255,255,0.04);padding:8px;border-radius:8px;color:inherit}
</style>
</head>
<body>
  <div class="app">
    <header>
      <div class="brand">
        <div class="logo">SB</div>
        <div>
          <h1>ShiggyBot</h1>
          <div id="header-sub" style="font-size:12px;color:var(--muted)"></div>
        </div>
      </div>
      <div class="controls">
        <button class="btn" id="refresh">Refresh</button>
      </div>
    </header>

    <main>
      <section class="row-4">
        <div class="surface stat accent"><div class="label">Guild</div><div id="stat-guild" class="value">—</div></div>
        <div class="surface stat"><div class="label">Members (cached)</div><div id="stat-members" class="value">—</div></div>
        <div class="surface stat"><div class="label">Bot status</div><div id="stat-status" class="value">—</div></div>
        <div class="surface stat"><div class="label">Uptime</div><div id="stat-uptime" class="value">—</div></div>
      </section>

      <section class="surface">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div>
            <div style="font-weight:800">Members</div>
            <div class="muted"></div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn secondary" id="reload-members">Reload members</button>
          </div>
        </div>

        <div style="display:flex;gap:14px">
          <div style="flex:1;max-height:420px;overflow:auto">
            <table>
              <thead><tr><th>User</th><th>Labels</th><th></th></tr></thead>
              <tbody id="members-body"><tr><td colspan="3" class="muted">Loading...</td></tr></tbody>
            </table>
          </div>

          <div style="width:380px;display:flex;flex-direction:column;gap:10px">
            <div>
              <div style="font-weight:800">Moderation</div>
              <div class="muted"></div>
            </div>

            <input id="mod-target" placeholder="username#1234 or displayName" />
            <input id="mod-reason" placeholder="Reason (optional)" />
            <div style="display:flex;gap:8px;align-items:center">
              <button class="btn" id="ban-btn">Ban</button>
              <button class="btn secondary" id="kick-btn">Kick</button>
              <input id="mute-minutes" type="number" min="1" value="15" style="width:90px" />
              <button class="btn" id="mute-btn" style="background:#f59e0b">Mute</button>
            </div>

            <div>
              <div style="font-weight:800;margin-top:6px">Console</div>
              <div id="console" class="console"></div>
              <div style="display:flex;gap:8px;margin-top:8px">
                <button class="btn small" id="clear-console">Clear</button>
                <button class="btn secondary" id="download-logs">Download Logs</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="surface">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-weight:800">Activity Spark</div>
          <button class="btn secondary" id="clear-activity">Clear</button>
        </div>
        <div style="height:120px;display:flex;align-items:center;justify-content:center">
          <canvas id="spark" width="900" height="120" style="max-width:100%;height:120px"></canvas>
        </div>
      </section>
    </main>

    <footer>&copy; ${new Date().getFullYear()} ShiggyBot</footer>
  </div>

<script>
(() => {
  // Utilities
  const $ = id => document.getElementById(id);
  const consoleEl = $('console');
  const membersBody = $('members-body');
  const statGuild = $('stat-guild');
  const statMembers = $('stat-members');
  const statStatus = $('stat-status');
  const statUptime = $('stat-uptime');
  const spark = document.getElementById('spark');
  const ctx = spark.getContext ? spark.getContext('2d') : null;
  let activities = [];

  function appendLog(entry) {
    const d = new Date(entry.ts).toLocaleTimeString();
    const el = document.createElement('div');
    el.className = entry.level === 'error' ? 'log-error' : (entry.level === 'warn' ? 'log-warn' : 'log-info');
    el.textContent = '[' + d + '] ' + entry.msg;
    consoleEl.appendChild(el);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  function fetchJSON(url, opts) {
    return fetch(url, opts).then(r => {
      if (!r.ok) throw new Error('Network error ' + r.status);
      return r.json();
    });
  }

  async function loadMembers() {
    membersBody.innerHTML = '<tr><td colspan="3" class="muted">Loading...</td></tr>';
    try {
      const list = await fetchJSON('/api/members');
      if (!Array.isArray(list) || list.length === 0) {
        membersBody.innerHTML = '<tr><td colspan="3" class="muted">No members or failed to fetch</td></tr>';
        statMembers.textContent = '0';
        return;
      }
      statMembers.textContent = String(list.length);
      membersBody.innerHTML = '';
      for (const m of list) {
        const tr = document.createElement('tr');
        const userTd = document.createElement('td');
        userTd.textContent = m.displayName + ' (' + m.tag + ')';
        const labelsTd = document.createElement('td');
        labelsTd.textContent = '';
        const actionsTd = document.createElement('td');
        const selBtn = document.createElement('button');
        selBtn.className = 'btn small';
        selBtn.style.padding = '6px 8px';
        selBtn.textContent = 'Select';
        selBtn.onclick = () => {
          $('mod-target').value = m.tag;
          $('mod-target').focus();
        };
        const profileBtn = document.createElement('button');
        profileBtn.className = 'btn secondary small';
        profileBtn.style.marginLeft = '6px';
        profileBtn.textContent = 'Profile';
        profileBtn.onclick = () => window.open('https://discord.com/users/' + m.id, '_blank');
        actionsTd.appendChild(selBtn);
        actionsTd.appendChild(profileBtn);
        tr.appendChild(userTd);
        tr.appendChild(labelsTd);
        tr.appendChild(actionsTd);
        membersBody.appendChild(tr);
      }
      statGuild.textContent = list.length ? (location.hostname || 'DEV_GUILD') : '—';
    } catch (err) {
      membersBody.innerHTML = '<tr><td colspan="3" class="muted">Failed to load: ' + err.message + '</td></tr>';
      appendLog({ ts: Date.now(), level: 'error', msg: 'Failed to load members: ' + err.message });
    }
  }

  async function doAction(path, body) {
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) {
        appendLog({ ts: Date.now(), level: 'error', msg: JSON.stringify(j) });
        alert('Error: ' + (j.error || JSON.stringify(j)));
        return;
      }
      appendLog({ ts: Date.now(), level: 'info', msg: 'Action success: ' + JSON.stringify(j) });
      setTimeout(() => loadMembers(), 800);
    } catch (err) {
      appendLog({ ts: Date.now(), level: 'error', msg: 'Network error: ' + err.message });
      alert('Network error: ' + err.message);
    }
  }

  // Wire buttons
  $('reload-members').onclick = loadMembers;
  $('refresh').onclick = () => { loadMembers(); fetchJSON('/api/logs').then(js => { for (const e of js.slice(0,200).reverse()) appendLog(e); }).catch(()=>{}); };
  $('clear-console').onclick = () => { consoleEl.innerHTML = ''; };
  $('download-logs').onclick = async () => {
    try {
      const ls = await fetchJSON('/api/logs');
      const blob = new Blob([JSON.stringify(ls, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'logs.json'; a.click(); URL.revokeObjectURL(url);
    } catch (err) { appendLog({ ts: Date.now(), level: 'error', msg: 'Download failed: ' + err.message }); }
  };

  $('ban-btn').onclick = () => {
    const target = $('mod-target').value.trim();
    const reason = $('mod-reason').value.trim();
    if (!target) { alert('Provide a target'); return; }
    doAction('/api/ban', { target, reason });
  };
  $('kick-btn').onclick = () => {
    const target = $('mod-target').value.trim();
    const reason = $('mod-reason').value.trim();
    if (!target) { alert('Provide a target'); return; }
    doAction('/api/kick', { target, reason });
  };
  $('mute-btn').onclick = () => {
    const target = $('mod-target').value.trim();
    const reason = $('mod-reason').value.trim();
    const duration = Number($('mute-minutes').value) || 15;
    if (!target) { alert('Provide a target'); return; }
    doAction('/api/mute', { target, durationMinutes: duration, reason });
  };

  // SSE connection to receive logs / actions
  const es = new EventSource('/events');
  es.addEventListener('connected', ev => {
    const data = JSON.parse(ev.data || '{}');
    if (data.logs && Array.isArray(data.logs)) {
      for (const e of data.logs) appendLog(e);
    }
  });
  es.addEventListener('log', ev => {
    try { const d = JSON.parse(ev.data); appendLog(d); } catch {}
  });
  es.addEventListener('action', ev => {
    try { const d = JSON.parse(ev.data); appendLog({ ts: Date.now(), level: 'info', msg: 'Action: ' + JSON.stringify(d) }); activities.unshift({ ts: Date.now(), msg: JSON.stringify(d) }); if (activities.length>300) activities.pop(); renderSpark(); } catch {}
  });

  // Sparkline renderer
  function renderSpark() {
    if (!ctx) return;
    const W = spark.width, H = spark.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = 'rgba(13,148,136,0.04)';
    ctx.fillRect(0,0,W,H);
    const buckets = new Array(30).fill(0);
    const now = Date.now();
    for (const a of activities) {
      const age = now - (a.ts || 0);
      const idx = Math.min(29, Math.floor((age / (1000*60*60*24)) * 30));
      buckets[29 - idx]++;
    }
    const max = Math.max(1, ...buckets);
    ctx.beginPath();
    for (let i=0;i<buckets.length;i++){
      const x = Math.round((i/(buckets.length-1))*(W-20))+10;
      const y = H - Math.round((buckets[i]/max)*(H-30)) - 10;
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.lineTo(W-10,H-10);
    ctx.lineTo(10,H-10);
    ctx.closePath();
    ctx.fillStyle = 'rgba(221,177,105,0.12)';
    ctx.fill();
    ctx.beginPath();
    for (let i=0;i<buckets.length;i++){
      const x = Math.round((i/(buckets.length-1))*(W-20))+10;
      const y = H - Math.round((buckets[i]/max)*(H-30)) - 10;
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.strokeStyle = 'rgba(221,177,105,0.92)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Initial load
  loadMembers();
  // load logs then stats; update stats periodically
  fetchJSON('/api/logs').then(js => { for (const e of js.slice(0,200).reverse()) appendLog(e); }).catch(()=>{});
  async function updateStats() {
    try {
      const s = await fetchJSON('/api/stats');
      if (s.guildName) $('header-sub').textContent = s.guildName;
      if (s.guildName) $('stat-guild').textContent = s.guildName;
      if (s.memberCount != null) $('stat-members').textContent = String(s.memberCount);
      if (s.status) $('stat-status').textContent = s.status;
      if (s.uptime) $('stat-uptime').textContent = s.uptime;
    } catch (e) {
      appendLog({ ts: Date.now(), level: 'warn', msg: 'Failed to fetch stats: ' + (e && e.message ? e.message : e) });
    }
  }
  updateStats();
  setInterval(() => { renderSpark(); updateStats(); }, 5000);
})();
</script>
</body>
</html>`);
  });

  const server = app.listen(resolvedPort, () => {
    const msg = `Dashboard running at http://localhost:${resolvedPort}/`;
    origConsole.log(msg);
    pushLog("info", msg);
  });

  return server;
}
