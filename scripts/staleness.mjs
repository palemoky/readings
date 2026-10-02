#!/usr/bin/env node
/**
 * 过时内容校验。
 *
 * 设计原则是**分层**，越贵的检查覆盖面越小：
 *
 *   L1 死链         零成本、零误报。链接 404 就是 404，没有判断空间
 *   L2 时效性措辞   零成本、有误报。「目前」「最新」「截至 2021」这类写法
 *                   本身没问题，但**写在一篇两年没动过的文件里**就是风险
 *   L3 模型复核     只跑在 L2 命中上，且限量。判断「这段是不是真的过时了」
 *
 * L1+L2 完全免费（公开仓库的 GitHub Actions 分钟数不限），
 * L3 用 Workers AI 的每日免费 neurons，条数上限由 --review 控制。
 *
 * ⚠️ L1/L2 在真实语料上跑过（37 篇 / 80 个外链，查出 5 条真死链）；
 * **L3 还没实跑过**——它需要 Cloudflare API token，而本地开发用的是
 * wrangler 的 OAuth 凭据。首次开启时请用 --review 3 小范围确认。
 *
 * 刻意**不做**的事：
 *   - 不去比对上游文档的最新内容。那需要抓取整个互联网，成本和误报都失控。
 *   - 不自动改内容。判断「该怎么改」是作者的事，工具只负责指出「这里该看一眼」。
 *
 *   node scripts/staleness.mjs --repo ~/src/readings --out STALENESS.md
 *   node scripts/staleness.mjs --repo . --review 15   # 加模型复核
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith("--")) args.set(a.slice(2), process.argv[i + 1]?.startsWith("--") ? "1" : process.argv[++i]);
}
const repo = args.get("repo") ?? ".";
const docsDir = args.get("docs") ?? "docs";
const outArg = args.get("out") ?? "STALENESS.md";
const outPath = isAbsolute(outArg) ? outArg : join(repo, outArg);
const staleMonths = Number(args.get("stale-months") ?? 12);
const reviewLimit = Number(args.get("review") ?? 0);
const linkConcurrency = Number(args.get("link-concurrency") ?? 8);

const NOW = new Date();
const THIS_YEAR = NOW.getFullYear();

// ── 语料 ────────────────────────────────────────────────────
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".md")) out.push(p);
  }
  return out;
}

const root = join(repo, docsDir);
const files = walk(root).sort();

/** 文件最后一次真实修改的时间。用 git 而不是 mtime——clone 出来的 mtime 全是检出时间。 */
function lastModified(file) {
  try {
    const iso = execFileSync("git", ["log", "-1", "--format=%aI", "--", relative(repo, file)], {
      cwd: repo, encoding: "utf8",
    }).trim();
    return iso ? new Date(iso) : null;
  } catch {
    return null;
  }
}

const monthsAgo = (d) => (d ? (NOW - d) / (1000 * 60 * 60 * 24 * 30.44) : Infinity);

// 剥掉代码块再做文本检查：代码里的年份和「最新」是变量名的一部分，不是论断
const stripCode = (s) => s.replace(/```[\s\S]*?```/g, "\n").replace(/`[^`\n]*`/g, " ");

// ── L1 死链 ─────────────────────────────────────────────────
const LINK = /\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;

/**
 * 示例域名和本机地址不是链接，是**正文内容**。
 *
 * 实测在真语料里，`http://localhost`（TCP/IP 笔记）和
 * `https://www.example.com/path?query=1`（正则笔记）都被报成死链。
 * 误报会让整份报告被忽略——一个「7 条死链里 2 条是假的」的清单，
 * 读的人第二次就不会认真看了。RFC 2606 保留域名一律跳过。
 */
const NOT_A_LINK =
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[^/]*\.(?:test|example|invalid|localhost|local)(?::\d+)?(?:\/|$)|(?:www\.)?example\.(?:com|org|net)(?::\d+)?(?:\/|$))/i;

function collectLinks() {
  const byUrl = new Map();
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(LINK)) {
      const url = m[1].replace(/[.,;)]+$/, "");
      if (NOT_A_LINK.test(url)) continue;
      if (!byUrl.has(url)) byUrl.set(url, new Set());
      byUrl.get(url).add(relative(repo, f));
    }
  }
  return byUrl;
}

async function checkLink(url) {
  const attempt = async (method) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(url, {
        method,
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "user-agent": "Mozilla/5.0 (compatible; bookling-linkcheck)" },
      });
      return res.status;
    } finally {
      clearTimeout(t);
    }
  };
  try {
    // 先 HEAD（省流量），不少站点不支持 HEAD 会返回 4xx/5xx，再用 GET 复核一次，
    // 避免把「不支持 HEAD」误报成死链
    let status = await attempt("HEAD");
    if (status >= 400) status = await attempt("GET");
    return status;
  } catch (e) {
    return e.name === "AbortError" ? 0 : -1; // 0 = 超时，-1 = 连不上
  }
}

/** 这些状态码更可能是反爬，不是链接失效。 */
const ANTI_BOT = new Set([403, 405, 412, 429, 451]);

async function deadLinks(byUrl) {
  const urls = [...byUrl.keys()];
  const bad = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(linkConcurrency, urls.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= urls.length) return;
        const url = urls[i];
        const status = await checkLink(url);
        // 反爬响应不是死链。403/429 是常见的两个，412 也是——
        // 实测 b23.tv（B 站短链）对非浏览器 UA 就返回 412。
        // 超时同样不报：网络抖动的误报率太高，报了没人信。
        if (status >= 400 && !ANTI_BOT.has(status)) {
          bad.push({ url, status, files: [...byUrl.get(url)] });
        } else if (status === -1) {
          bad.push({ url, status: "连不上", files: [...byUrl.get(url)] });
        }
        if ((i + 1) % 25 === 0) process.stderr.write(`\r  链接 ${i + 1}/${urls.length}   `);
      }
    }),
  );
  process.stderr.write("\r");
  return bad.sort((a, b) => (a.url < b.url ? -1 : 1));
}

// ── L2 时效性措辞 ───────────────────────────────────────────
// 这些词本身没问题。它们只有和「文件很久没动过」叠加时才构成风险信号。
const TIME_WORDS = /(目前|现在|当前|最新|截至|近年来|未来[会将]|尚未支持|还不支持|即将|正在开发|最近)/g;
const YEAR = /(?:^|[^\d])(20[0-2]\d)\s*年/g;
const VERSION = /\b([A-Z][A-Za-z+.#]{1,20})\s+v?(\d+(?:\.\d+){1,2})\b/g;

function stalenessSignals() {
  const out = [];
  for (const f of files) {
    const rel = relative(repo, f);
    const modified = lastModified(f);
    const age = monthsAgo(modified);
    if (age < staleMonths) continue; // 最近改过的不报——作者刚看过

    const text = stripCode(readFileSync(f, "utf8"));
    const hits = [];

    const words = [...new Set([...text.matchAll(TIME_WORDS)].map((m) => m[1]))];
    if (words.length) hits.push({ kind: "时效措辞", detail: words.slice(0, 6).join("、") });

    const years = [...new Set([...text.matchAll(YEAR)].map((m) => Number(m[1])))]
      .filter((y) => y <= THIS_YEAR - 2)
      .sort();
    if (years.length) hits.push({ kind: "年份", detail: years.join("、") });

    const versions = [...new Set([...text.matchAll(VERSION)].map((m) => `${m[1]} ${m[2]}`))];
    if (versions.length) hits.push({ kind: "版本号", detail: versions.slice(0, 6).join("、") });

    if (hits.length) {
      out.push({ file: rel, months: Math.round(age), modified, hits, text });
    }
  }
  // 越旧、信号越多的排前面
  return out.sort((a, b) => b.hits.length * 100 + b.months - (a.hits.length * 100 + a.months));
}

// ── L3 模型复核（可选，限量）────────────────────────────────
async function review(candidates, limit) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) {
    console.error("  跳过模型复核：缺 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID");
    return new Map();
  }
  const model = process.env.STALENESS_MODEL ?? "@cf/deepseek-ai/deepseek-v4-flash-0731";
  const verdicts = new Map();

  for (const c of candidates.slice(0, limit)) {
    const excerpt = c.text.slice(0, 6000);
    const prompt =
      `下面是一篇技术读书笔记的节选，最后一次修改是 ${c.months} 个月前。\n` +
      `请只判断一件事：里面有没有**因为时间推移而很可能已经不成立**的陈述？\n` +
      `比如写死的版本号已经落后好几个大版本、「目前尚不支持」的特性早已支持、` +
      `「最新」指的是几年前的东西。\n\n` +
      `不要评价文章质量、结构或深度。没有这类问题就回答「无」。\n` +
      `有的话，逐条给出：原文片段 → 为什么可能过时。最多 3 条。\n\n---\n${excerpt}`;
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "user", content: prompt }], max_tokens: 600 }),
        },
      );
      const data = await res.json();
      const text = (data?.result?.response ?? "").trim();
      if (text && !/^无[。.]?$/.test(text)) verdicts.set(c.file, text);
    } catch (e) {
      console.error(`  复核失败 ${c.file}: ${e.message}`);
    }
  }
  return verdicts;
}

// ── 报告 ────────────────────────────────────────────────────
const byUrl = collectLinks();
console.error(`扫描 ${files.length} 篇文档，${byUrl.size} 个外链`);
const bad = await deadLinks(byUrl);
const candidates = stalenessSignals();
const verdicts = reviewLimit > 0 ? await review(candidates, reviewLimit) : new Map();

const lines = [];
lines.push("# 内容体检报告");
lines.push("");
lines.push(`生成时间：${NOW.toISOString().slice(0, 10)}　·　扫描 ${files.length} 篇文档 / ${byUrl.size} 个外链`);
lines.push("");
lines.push("> 这份报告是**线索**不是结论。死链是硬信号；时效措辞和版本号只说明「这里值得看一眼」，");
lines.push("> 误报是预期内的。改不改由你定，改完这份文件会在下次检查时自动更新。");
lines.push("");

lines.push(`## 死链 ${bad.length ? `（${bad.length}）` : "：无 ✅"}`);
lines.push("");
if (bad.length) {
  lines.push("| 状态 | 链接 | 出现在 |");
  lines.push("|---|---|---|");
  for (const b of bad) {
    lines.push(`| ${b.status} | ${b.url} | ${b.files.map((f) => `\`${f}\``).join("<br>")} |`);
  }
  lines.push("");
  lines.push("*403 / 405 / 412 / 429 / 451 和超时不计入——那多半是反爬或网络抖动，不是链接失效。*");
  lines.push("");
}

lines.push(`## 可能过时 ${candidates.length ? `（${candidates.length} 篇超过 ${staleMonths} 个月未修改且带时效性表述）` : "：无 ✅"}`);
lines.push("");
for (const c of candidates) {
  lines.push(`### \`${c.file}\``);
  lines.push("");
  lines.push(`最后修改：${c.modified ? c.modified.toISOString().slice(0, 10) : "未知"}（${c.months} 个月前）`);
  lines.push("");
  for (const h of c.hits) lines.push(`- **${h.kind}**：${h.detail}`);
  const v = verdicts.get(c.file);
  if (v) {
    lines.push("");
    lines.push("<details><summary>模型复核意见</summary>");
    lines.push("");
    lines.push(v);
    lines.push("");
    lines.push("</details>");
  }
  lines.push("");
}

if (!bad.length && !candidates.length) {
  lines.push("本轮没有发现任何线索。");
  lines.push("");
}

writeFileSync(outPath, lines.join("\n"));
console.error(`\n死链 ${bad.length} 条，可能过时 ${candidates.length} 篇，模型复核 ${verdicts.size} 篇`);
console.error(`报告写入 ${outPath}`);

// 给 workflow 判断要不要开 PR
if (process.env.GITHUB_OUTPUT) {
  const findings = bad.length + candidates.length;
  writeFileSync(process.env.GITHUB_OUTPUT, `findings=${findings}\ndead=${bad.length}\nstale=${candidates.length}\n`, { flag: "a" });
}
