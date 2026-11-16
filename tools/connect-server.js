"use strict";
// Local-only dev server for the Corrido Connect prototype:  node tools/connect-server.js   (then open http://localhost:5173/connect/)
// It serves this folder exactly as it is, plus one optional endpoint, POST /api/brief, that asks Gemini for a sales brief.
// The endpoint only works if GEMINI_API_KEY is set in your shell or in a Git-ignored .env.local file at the repo root. With no key the screens use the built-in mock brief.
// It listens on 127.0.0.1 only, never logs the key, and touches no database, login service or CRM. No installs needed.
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".pdf": "application/pdf", ".txt": "text/plain" };

function readEnvFile() {   // tiny KEY=VALUE reader; the values stay in this process
  try { return Object.fromEntries(fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n").map(l => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^["']|["']$/g, "")])); } catch { return {}; }
}
const env = { ...readEnvFile(), ...process.env };
const KEY = env.GEMINI_API_KEY || "", MODEL = env.CONNECT_AI_MODEL || "gemini-2.5-flash";
const PORT = Number(env.PORT) || 5173;

const PROMPT = d => `You write short sales briefs for a tequila brand's sales reps. Everything below is FICTIONAL demo data.
Rules: use only these public brand facts: additive-free, only three ingredients, no fake flavors, celebrity-free, named after the corrido (a traditional Mexican ballad), guests 21+, shelf prices Blanco $44.99, Reposado $54.99, Overproof $56.99, Añejo $89.99.
Never invent margins, wholesale prices, discounts, sales results or health claims. Plain words, no hype.
Return ONLY JSON with exactly these keys: headline (string), snapshot (array of 4-6 strings), whyNow (string), talkingPoints (array of 3-5 strings), likelyObjections (array of up to 3 objects {category, response}; category one of Price, Competitor, Compliance, Timing, Product fit, Authority), openingQuestions (array of 2-3 strings), nextStep (string), guardrails (array of 3-4 strings), dataUsed (array of strings).
Handoff data:
${JSON.stringify(d)}`;

async function aiBrief(d) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT(d) }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.4 } }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error("The AI service answered " + res.status);
  const j = await res.json(), text = j.candidates && j.candidates[0] && j.candidates[0].content.parts.map(p => p.text).join("");
  return JSON.parse(text);
}

const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || "")) return send(res, 403, { error: "local only" });
  if (url.pathname === "/api/status") return send(res, 200, { ai: !!KEY, model: KEY ? MODEL : null });
  if (url.pathname === "/api/brief" && req.method === "POST") {
    if (!KEY) return send(res, 503, { error: "No AI key set. Using the mock brief instead." });
    let body = ""; req.on("data", c => { body += c; if (body.length > 20000) req.destroy(); });
    return req.on("end", async () => {
      try { send(res, 200, { sections: await aiBrief(JSON.parse(body)), model: MODEL }); }
      catch (e) { send(res, 502, { error: String(e.message || e).slice(0, 200) }); }
    });
  }
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  let rel; try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  if (rel.endsWith("/")) rel += "index.html";
  if (rel.split("/").some(seg => seg.startsWith("."))) { res.writeHead(404); return res.end("not found"); }   // never serve .env.local, .git and the like
  const f = path.join(root, rel);
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" }); fs.createReadStream(f).pipe(res);
});
if (require.main === module) server.listen(PORT, "127.0.0.1", () => console.log(`Corrido Connect (local): http://localhost:${PORT}/connect/   |   original app: http://localhost:${PORT}/\nAI briefs: ${KEY ? "ON (" + MODEL + ")" : "off, using the mock brief (set GEMINI_API_KEY in .env.local to turn on)"}`));
module.exports = { server };
