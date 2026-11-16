// Corrido Connect (local prototype): the full handoff workflow, role rules, brief shape, saving, the numbers, and the local server's safety rules.
// Run from the repo root: node tests/connect.test.js
const C = require("../connect/connect-core.js"), http = require("http");
let fails = 0; const ok = (n, c, x = "") => { console.log((c ? "ok   " : "FAIL ") + n + (x ? " " + x : "")); if (!c) fails++; };
const M = "marketing", S = "sales", MG = "manager", rep = C.REPS[0], T0 = Date.UTC(2026, 10, 1), H = 3600e3;

(async () => {
  // ---- the ten-step manual test, as code ----
  const s = C.seed(T0), before = C.metrics(s, T0);
  const camp = C.createCampaign(s, M, { name: "Test Campaign", audience: "Bars" }, T0);
  ok("marketing can create a campaign", camp.ok);
  ok("sales cannot create a campaign", !C.createCampaign(s, S, { name: "X", audience: "Y" }).ok);
  ok("duplicate campaign names are refused", !C.createCampaign(s, M, { name: "test campaign", audience: "Bars" }).ok);
  const good = { campaignId: camp.id, lead: { name: "Test Lead", company: "Test Bar", type: "bar", email: "t@example.com" }, marketing: { interest: "Blanco", intent: 4, confidence: 70, decision: "Decision maker", background: "Runs a 40-seat bar", painPoints: "Wants a cheaper house margarita", notes: "asked for a tasting" } };
  ["name", "company", "email"].forEach(k => { const d = JSON.parse(JSON.stringify(good)); d.lead[k] = k === "email" ? "nope" : ""; ok("handoff needs a valid " + k, !C.createHandoff(s, M, d).ok); });
  const bad = JSON.parse(JSON.stringify(good)); bad.marketing.notes = ""; ok("handoff needs notes", !C.createHandoff(s, M, bad).ok);
  const bad2 = JSON.parse(JSON.stringify(good)); bad2.marketing.intent = 9; ok("intent must be 1 to 5", !C.createHandoff(s, M, bad2).ok);
  ok("sales cannot create a handoff", !C.createHandoff(s, S, good).ok);
  const h = C.createHandoff(s, M, good, T0 + H); ok("marketing creates a handoff", h.ok && C.find(s, h.id).status === "Submitted");
  ok("handoff starts with no brief", C.find(s, h.id).brief === null);

  ok("manager cannot generate a brief", !C.generateMock(s, h.id, MG).ok);
  ok("marketing generates a mock brief", C.generateMock(s, h.id, M, T0 + 2 * H).ok);
  const b = C.find(s, h.id).brief; ok("brief is labeled mock, not AI", b.source === "mock" && /template/.test(b.model));
  ok("brief has every section and passes validation", C.validBrief(b.sections));
  ok("brief names the lead and the product", b.sections.headline.includes("Test Lead") && b.sections.headline.includes("Blanco"));
  ok("brief quotes only the public price", b.sections.talkingPoints.join(" ").includes("$44.99") && !/margin of|wholesale price is|discount of/i.test(JSON.stringify(b.sections)));
  ok("same input gives the same brief (deterministic)", JSON.stringify(C.mockBrief(C.find(s, h.id), s.campaigns.find(c => c.id === camp.id), s)) === JSON.stringify(C.mockBrief(C.find(s, h.id), s.campaigns.find(c => c.id === camp.id), s, T0 + 999 * H)));
  ok("a malformed AI brief is refused", !C.setBrief(s, h.id, M, "ai", { headline: "x" }, "m").ok);
  ok("a well-formed AI brief is stored and labeled AI", C.setBrief(s, h.id, M, "ai", b.sections, "gemini-test", T0 + 3 * H).ok && C.find(s, h.id).brief.source === "ai" && C.find(s, h.id).brief.model === "gemini-test");
  C.generateMock(s, h.id, M, T0 + 4 * H);

  ok("marketing cannot accept", !C.accept(s, h.id, M, rep).ok);
  ok("sales cannot change status before accepting", !C.setStatus(s, h.id, S, rep, "Contacted", "").ok);
  ok("manager assigns to a rep", C.assign(s, h.id, MG, C.REPS[1], T0 + 5 * H).ok);
  ok("a different rep cannot accept it", !C.accept(s, h.id, S, rep, T0 + 6 * H).ok);
  ok("the assigned rep accepts", C.accept(s, h.id, S, C.REPS[1], T0 + 7 * H).ok && C.find(s, h.id).status === "Accepted");
  const me = C.REPS[1];
  ok("can't skip to Won", !C.setStatus(s, h.id, S, me, "Won", "").ok);
  ok("Accepted to Contacted", C.setStatus(s, h.id, S, me, "Contacted", "", T0 + 8 * H).ok);
  ok("another rep can't edit status", !C.setStatus(s, h.id, S, rep, "Meeting set", "").ok);
  ok("Lost needs a reason", !C.setStatus(s, h.id, S, me, "Lost", " ").ok);

  ok("objection needs a category", !C.addFeedback(s, h.id, S, me, { type: "objection", text: "too pricey" }).ok);
  ok("feedback needs text", !C.addFeedback(s, h.id, S, me, { type: "objection", category: "Price", text: "" }).ok);
  ok("marketing cannot add sales feedback", !C.addFeedback(s, h.id, M, me, { type: "general", text: "x" }).ok);
  const fb = C.addFeedback(s, h.id, S, me, { type: "objection", category: "Competitor", text: "Pours a big brand", quote: "We're happy with what we have" }, T0 + 9 * H);
  ok("sales records an objection with a quote", fb.ok && s.feedback.find(f => f.id === fb.id).quote.length > 0);
  ok("the new objection shows in the practice draft", /Competitor/.test(C.practiceDraft(s, h.id).hidden) && C.practiceDraft(s, h.id).skillsToPractice.includes("Objections"));
  ok("sales cannot resolve feedback", !C.resolveFeedback(s, fb.id, S, { kind: "noted", note: "x" }).ok);
  ok("resolve needs a note", !C.resolveFeedback(s, fb.id, M, { kind: "noted", note: "" }).ok);
  ok("marketing resolves it", C.resolveFeedback(s, fb.id, M, { kind: "content", note: "Added a comparison card" }, T0 + 10 * H).ok && s.feedback.find(f => f.id === fb.id).status === "Resolved");
  ok("can't resolve twice", !C.resolveFeedback(s, fb.id, M, { kind: "noted", note: "again" }).ok);
  ok("Contacted to Meeting set to Won", C.setStatus(s, h.id, S, me, "Meeting set", "", T0 + 11 * H).ok && C.setStatus(s, h.id, S, me, "Won", "ordered", T0 + 12 * H).ok);
  ok("a Won handoff is final", !C.setStatus(s, h.id, S, me, "Lost", "x").ok && !C.assign(s, h.id, MG, rep).ok);
  ok("history records every step", C.find(s, h.id).history.length >= 8);

  // ---- marketing updates the lead profile ----
  const lp = C.createHandoff(s, M, good, T0 + 21 * H).id, ph = () => C.find(s, lp);
  ok("new handoff stores confidence, decision role, background and pain points", ph().marketing.confidence === 70 && ph().marketing.decision === "Decision maker" && /40-seat/.test(ph().marketing.background) && /margarita/.test(ph().marketing.painPoints));
  const badc = JSON.parse(JSON.stringify(good)); badc.marketing.confidence = 101; ok("confidence over 100 is refused", !C.createHandoff(s, M, badc).ok);
  badc.marketing.confidence = 55.5; ok("a fractional confidence is refused", !C.createHandoff(s, M, badc).ok);
  badc.marketing.confidence = 60; badc.marketing.decision = "Boss"; ok("an unknown decision role is refused", !C.createHandoff(s, M, badc).ok);
  ok("sales cannot update the lead profile", !C.updateLead(s, lp, S, { marketing: { confidence: 90 } }).ok);
  ok("manager cannot update the lead profile", !C.updateLead(s, lp, MG, { marketing: { confidence: 90 } }).ok);
  ok("an update with no changes is refused", !C.updateLead(s, lp, M, { marketing: { confidence: 70 } }).ok);
  ok("confidence update is validated", !C.updateLead(s, lp, M, { marketing: { confidence: 150 } }).ok && ph().marketing.confidence === 70);
  ok("email update is validated", !C.updateLead(s, lp, M, { lead: { email: "bad" } }).ok && ph().lead.email === "t@example.com");
  C.generateMock(s, lp, M, T0 + 22 * H);
  const u1 = C.updateLead(s, lp, M, { marketing: { confidence: 90, background: "Now opening a second bar" } }, T0 + 23 * H);
  ok("marketing updates confidence and background", u1.ok && ph().marketing.confidence === 90 && /second bar/.test(ph().marketing.background));
  ok("the history says what changed", /confidence 70% to 90%/.test(ph().history.slice(-1)[0].text) && /background/.test(ph().history.slice(-1)[0].text));
  ok("before sales accepts, no notice is raised", !ph().pendingUpdate);
  ok("the brief is flagged as out of date after a change", C.briefStale(ph()));
  C.generateMock(s, lp, M, T0 + 24 * H); ok("regenerating the brief clears the flag and uses the new background", !C.briefStale(ph()) && /second bar/.test(ph().brief.sections.snapshot.join(" ")) && /90%/.test(ph().brief.sections.snapshot.join(" ")));
  C.accept(s, lp, S, rep, T0 + 25 * H);
  ok("after accepting, an update raises a notice for sales", C.updateLead(s, lp, M, { marketing: { painPoints: "Also needs a mezcal-free menu" } }, T0 + 26 * H).ok && /pain points/.test(ph().pendingUpdate.summary));
  ok("pending updates are counted for marketing", C.metrics(s).updatesPending >= 1);
  ok("marketing cannot clear the notice", !C.ackUpdate(s, lp, M, rep).ok);
  ok("another rep cannot clear it", !C.ackUpdate(s, lp, S, C.REPS[1]).ok);
  ok("the assigned rep marks it seen", C.ackUpdate(s, lp, S, rep, T0 + 27 * H).ok && !ph().pendingUpdate);
  ok("nothing to see means nothing to acknowledge", !C.ackUpdate(s, lp, S, rep).ok);
  C.setStatus(s, lp, S, rep, "Lost", "went elsewhere", T0 + 28 * H);
  ok("a closed handoff's profile is locked", !C.updateLead(s, lp, M, { marketing: { confidence: 10 } }).ok);
  ok("average confidence and high-confidence counts are numbers", typeof C.metrics(s).avgConfidenceActive === "number" && C.metrics(s).highConfidenceWaiting >= 0);
  const old = C.seed(T0); old.handoffs.forEach(x => { delete x.marketing.confidence; delete x.marketing.decision; delete x.marketing.background; });
  const om = {}; C.save({ setItem: (k, v) => (om[k] = v) }, old);
  const mig = C.load({ getItem: k => om[k] || null }, T0);
  ok("data saved before this feature still loads with safe defaults", mig.handoffs.length === 7 && mig.handoffs[0].marketing.confidence === null && mig.handoffs[0].marketing.decision === "Unknown" && C.generateMock(mig, mig.handoffs[0].id, M).ok);

  // ---- sales keeps the deal profile and activity log ----
  const sd = C.createHandoff(s, M, good, T0 + 30 * H).id, dh = () => C.find(s, sd), drep = C.REPS[2];
  ok("a new handoff starts with an empty deal profile and no activity", dh().sales.probability === null && dh().activities.length === 0);
  ok("deal can't be updated before accepting", !C.updateDeal(s, sd, S, drep, { probability: 50 }).ok);
  ok("activity can't be logged before accepting", !C.addActivity(s, sd, S, drep, { type: "Call", note: "x" }).ok);
  C.accept(s, sd, S, drep, T0 + 31 * H);
  ok("marketing cannot update the deal", !C.updateDeal(s, sd, M, drep, { probability: 50 }).ok);
  ok("another rep cannot update the deal", !C.updateDeal(s, sd, S, rep, { probability: 50 }).ok);
  ok("win probability over 100 is refused", !C.updateDeal(s, sd, S, drep, { probability: 101 }).ok);
  ok("a fractional win probability is refused", !C.updateDeal(s, sd, S, drep, { probability: 40.5 }).ok);
  ok("a negative or non-numeric value is refused", !C.updateDeal(s, sd, S, drep, { dealValue: -5 }).ok && !C.updateDeal(s, sd, S, drep, { dealValue: "lots" }).ok);
  ok("a bad date is refused", !C.updateDeal(s, sd, S, drep, { nextStep: "Call", nextStepDate: "13/45/2026" }).ok);
  ok("a date needs a next step", !C.updateDeal(s, sd, S, drep, { nextStepDate: "2026-11-20" }).ok);
  ok("nothing changed is refused", !C.updateDeal(s, sd, S, drep, {}).ok);
  const du = C.updateDeal(s, sd, S, drep, { probability: "60", dealValue: "$1,200", nextStep: "Send samples", nextStepDate: "2026-11-05", competitor: "Brand X", timeline: "2 weeks", notes: "Likes the Blanco" }, T0 + 32 * H);
  ok("assigned rep updates the deal", du.ok && dh().sales.probability === 60 && dh().sales.dealValue === 1200 && dh().sales.nextStep === "Send samples");
  ok("history records the deal change", /win probability unset to 60%/.test(dh().history.slice(-1)[0].text));
  ok("marketing gets a notice naming the rep", dh().salesNotice && dh().salesNotice.by === drep && /deal value/.test(dh().salesNotice.summary));
  ok("sales cannot clear marketing's notice", !C.ackSalesUpdate(s, sd, S).ok);
  ok("marketing marks the sales update seen", C.ackSalesUpdate(s, sd, M, T0 + 33 * H).ok && dh().salesNotice === null);
  ok("an activity needs a type and a note", !C.addActivity(s, sd, S, drep, { type: "Fax", note: "x" }).ok && !C.addActivity(s, sd, S, drep, { type: "Call", note: " " }).ok);
  ok("marketing cannot log sales activity", !C.addActivity(s, sd, M, drep, { type: "Call", note: "x" }).ok);
  ok("the rep logs a call", C.addActivity(s, sd, S, drep, { type: "Call", note: "Spoke for 10 minutes" }, T0 + 34 * H).ok && dh().activities.length === 1 && dh().lastContactAt === T0 + 34 * H);
  const pm = C.metrics(s, T0 + 5 * 24 * H).pipeline;
  ok("pipeline counts open deals and sums their value", pm.count >= 1 && pm.value >= 1200);
  ok("weighted pipeline never exceeds the pipeline value", pm.weighted <= pm.value);
  ok("an overdue next step is detected by date", C.metrics(s, Date.parse("2026-11-06")).pipeline.overdue >= 1 && C.metrics(s, Date.parse("2026-11-02")).byRep.find(r => r.rep === drep).overdue === 0);
  ok("confidence gap compares the rep's number to marketing's", C.metrics(s).pipeline.confidenceGap !== null);
  C.setStatus(s, sd, S, drep, "Contacted", "", T0 + 35 * H); C.setStatus(s, sd, S, drep, "Meeting set", "", T0 + 36 * H); C.setStatus(s, sd, S, drep, "Won", "ordered", T0 + 37 * H);
  ok("a Won deal is locked but counts as won value", !C.updateDeal(s, sd, S, drep, { probability: 10 }).ok && C.metrics(s).pipeline.wonValue >= 1200);
  const seeded = C.metrics(C.seed(T0), T0).pipeline;
  ok("the demo data has sales numbers to look at", seeded.count === 2 && seeded.value === 3000 && seeded.weighted === 1890 && seeded.wonValue === 1800);
  const old2 = C.seed(T0); old2.handoffs.forEach(x => { delete x.sales; delete x.activities; delete x.salesNotice; delete x.lastContactAt; });
  const om2 = {}; C.save({ setItem: (k, v) => (om2[k] = v) }, old2);
  const mig2 = C.load({ getItem: k => om2[k] || null }, T0);
  ok("data saved before the sales features still loads", mig2.handoffs.every(x => x.sales && x.sales.probability === null && Array.isArray(x.activities)) && C.metrics(mig2, T0).pipeline.count === 2);

  // ---- assigning owners ----
  const ao = C.createHandoff(s, M, Object.assign({}, good, { assignedTo: C.REPS[1] }), T0 + 40 * H).id, aoh = () => C.find(s, ao);
  ok("marketing can set an owner when creating a handoff", aoh().assignedTo === C.REPS[1] && /assigned to/.test(aoh().history[0].text));
  ok("an unknown owner at creation is refused", !C.createHandoff(s, M, Object.assign({}, good, { assignedTo: "Nobody" })).ok);
  ok("sales cannot assign owners", !C.assign(s, ao, S, rep).ok);
  ok("marketing reassigns an owner", C.assign(s, ao, M, rep, T0 + 41 * H).ok && aoh().assignedTo === rep && /Reassigned from/.test(aoh().history.slice(-1)[0].text));
  ok("assigning the same owner again is refused", !C.assign(s, ao, M, rep).ok);
  ok("an unknown rep is refused", !C.assign(s, ao, MG, "Nobody").ok);
  ok("the manager can assign too", C.assign(s, ao, MG, C.REPS[2], T0 + 42 * H).ok && aoh().assignedTo === C.REPS[2]);
  ok("an unaccepted handoff can be unassigned", C.assign(s, ao, M, "", T0 + 43 * H).ok && aoh().assignedTo === null);
  ok("unassigning twice is refused", !C.assign(s, ao, M, "").ok);
  C.accept(s, ao, S, rep, T0 + 44 * H);
  ok("an accepted handoff can't be unassigned", !C.assign(s, ao, M, "").ok);
  ok("an accepted handoff can be moved to another rep", C.assign(s, ao, MG, C.REPS[1], T0 + 45 * H).ok && aoh().assignedTo === C.REPS[1] && aoh().status === "Accepted");
  ok("the new owner can work it and the old one can't", C.setStatus(s, ao, S, C.REPS[1], "Contacted", "", T0 + 46 * H).ok && !C.setStatus(s, ao, S, rep, "Meeting set", "").ok);

  // ---- return and resubmit loop ----
  const r2 = C.createHandoff(s, M, good, T0 + 13 * H).id;
  C.accept(s, r2, S, rep, T0 + 14 * H);
  ok("returning needs a reason", !C.setStatus(s, r2, S, rep, "Returned", "").ok);
  ok("sales returns a handoff", C.setStatus(s, r2, S, rep, "Returned", "No buying authority", T0 + 15 * H).ok);
  ok("a return creates open feedback for marketing", s.feedback.some(f => f.handoffId === r2 && f.status === "Open"));
  ok("can't resubmit with open feedback", !C.resubmit(s, r2, M).ok);
  C.resolveFeedback(s, s.feedback.find(f => f.handoffId === r2).id, M, { kind: "targeting", note: "Excluding non-buyers" }, T0 + 16 * H);
  ok("sales cannot resubmit", !C.resubmit(s, r2, S).ok);
  ok("marketing resubmits after resolving", C.resubmit(s, r2, M, T0 + 17 * H).ok && C.find(s, r2).status === "Submitted" && C.find(s, r2).assignedTo === null);

  // ---- numbers ----
  const after = C.metrics(s, T0 + 20 * H);
  ok("total handoffs went up by five", after.total === before.total + 5);
  ok("won count went up by two", after.byStatus.Won === before.byStatus.Won + 2);
  ok("Competitor objections counted", after.objections.Competitor === 1);
  ok("resolved feedback counted", after.feedbackResolved === before.feedbackResolved + 2);
  ok("status counts add up to the total", Object.values(after.byStatus).reduce((a, c) => a + c, 0) === after.total);
  ok("win rate is won over closed", after.winRate === after.byStatus.Won / (after.byStatus.Won + after.byStatus.Lost));
  ok("empty data gives n/a, not a crash", (m => m.winRate === null && m.acceptRate === null && m.avgHoursToResolve === null)(C.metrics({ campaigns: [], handoffs: [], feedback: [] })));

  // ---- saving across refreshes ----
  const mem = {}, fake = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } };
  ok("saves", C.save(fake, s));
  const back = C.load(fake, T0);
  ok("reloads the same handoffs, feedback and brief source", back.handoffs.length === s.handoffs.length && back.feedback.length === s.feedback.length && C.find(back, h.id).brief.source === "mock");
  fake.setItem(C.KEY, "{not json"); ok("corrupt storage falls back to fresh demo data", C.load(fake, T0).handoffs.length === 7);
  ok("no storage at all falls back too", C.load(null, T0).handoffs.length === 7);
  ok("the demo data is fictional", C.seed(T0).handoffs.every(x => /fictional/.test(x.lead.company) && /@example\.com$/.test(x.lead.email)));

  // ---- the local server ----
  const { server } = require("../tools/connect-server.js");
  await new Promise(r => server.listen(0, "127.0.0.1", r)); const port = server.address().port;
  const get = (p, opt = {}) => new Promise(res => { const rq = http.request({ host: "127.0.0.1", port, path: p, method: opt.method || "GET", headers: opt.headers || {} }, r => { let d = ""; r.on("data", c => (d += c)); r.on("end", () => res({ code: r.statusCode, body: d })); }); if (opt.body) rq.write(opt.body); rq.end(); });
  ok("serves the Connect page", (await get("/connect/")).code === 200);
  ok("still serves the original app", /Sales Academy/.test((await get("/")).body));
  ok("hides dotfiles like .env.local and .git", (await get("/.env.local")).code === 404 && (await get("/.git/config")).code === 404);
  ok("blocks path escapes", (await get("/..%2f..%2fetc/passwd")).code !== 200);
  ok("refuses other host names", (await get("/connect/", { headers: { Host: "evil.example.com" } })).code === 403);
  const st = JSON.parse((await get("/api/status")).body); ok("reports AI status", typeof st.ai === "boolean");
  if (!st.ai) ok("with no key, /api/brief says 503 so the page uses the mock", (await get("/api/brief", { method: "POST", body: "{}" })).code === 503);
  else console.log("skip a key is set locally; not calling the live AI from the test");
  server.close();
  console.log(fails ? `${fails} FAILED` : "OK"); process.exit(fails ? 1 : 0);
})();
