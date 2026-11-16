"use strict";
// Corrido Connect: the logic for the marketing-to-sales handoff prototype. No screen code lives here, so tests/connect.test.js can run it in Node.
// Everything is fictional demo data. Nothing here talks to a server, a CRM or a database; the screens keep the state in this browser (localStorage).
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.Connect = factory(); })(this, function () {
  const HOUR = 3600e3, DAY = 24 * HOUR;
  const BLANK_DEAL = () => ({ probability: null, dealValue: null, nextStep: "", nextStepDate: "", competitor: "", timeline: "", notes: "" });
  const STATUSES = ["Submitted", "Accepted", "Contacted", "Meeting set", "Won", "Lost", "Returned"];
  const TERMINAL = ["Won", "Lost"];
  // who can move a handoff where. Returned goes back to Submitted when marketing resubmits it.
  const NEXT = { Submitted: ["Accepted", "Returned"], Accepted: ["Contacted", "Returned", "Lost"], Contacted: ["Meeting set", "Lost"], "Meeting set": ["Won", "Lost"], Returned: [], Won: [], Lost: [] };
  const ROLES = ["marketing", "sales", "manager"];
  const REPS = ["Sam Ortega", "Priya Raman", "Dev Whitfield"];
  const MARKETER = "Maya Chen";
  const MANAGER = "Jordan Ellis";
  const VENUES = { bar: "Bar / cocktail bar", restaurant: "Restaurant", retail: "Liquor / specialty store", distributor: "Distributor", event: "Events / catering" };
  const PRODUCTS = ["Blanco", "Reposado", "Overproof", "Añejo", "Not sure yet"];
  // Public facts only (the same ones the Sales Academy uses). Wholesale terms and margins are not public, so no brief may invent them.
  const PRICES = { Blanco: "$44.99", Reposado: "$54.99", Overproof: "$56.99", "Añejo": "$89.99" };
  const DECISION = ["Decision maker", "Influencer", "Gatekeeper", "Unknown"];
  const CONTACT = ["Email", "Phone", "In person", "Text"];
  const ACTIVITY = ["Call", "Email", "Meeting", "Tasting"];
  const CATEGORIES = ["Price", "Competitor", "Compliance", "Timing", "Product fit", "Authority"];
  const FEEDBACK_TYPES = { objection: "Customer objection", quality: "Lead quality", content: "Missing content / material", general: "General note" };
  const RESOLUTIONS = { content: "Updated content or materials", targeting: "Adjusted targeting", disputed: "Disagree, explained why", noted: "Noted, no change needed" };
  const can = {
    createCampaign: r => r === "marketing", createHandoff: r => r === "marketing", generateBrief: r => r === "marketing" || r === "sales",
    accept: r => r === "sales", setStatus: r => r === "sales", assign: r => r === "manager" || r === "marketing", addFeedback: r => r === "sales",
    resolveFeedback: r => r === "marketing", resubmit: r => r === "marketing", updateLead: r => r === "marketing", ackUpdate: r => r === "sales", updateDeal: r => r === "sales", addActivity: r => r === "sales", ackSalesUpdate: r => r === "marketing",
  };
  const FORBIDDEN = "Your current demo role can't do that. Switch roles in the header.";

  const fail = error => ({ ok: false, error });
  const ok = (extra = {}) => ({ ok: true, ...extra });
  const log = (state, h, by, text, now) => { h.history.push({ at: now, by, text }); h.updatedAt = now; };
  const find = (state, id) => state.handoffs.find(h => h.id === id);

  // ---------- creating things ----------
  function createCampaign(state, role, d, now = Date.now()) {
    if (!can.createCampaign(role)) return fail(FORBIDDEN);
    const name = (d.name || "").trim(), audience = (d.audience || "").trim();
    if (!name) return fail("Give the campaign a name.");
    if (!audience) return fail("Say who the campaign is aimed at.");
    if (state.campaigns.some(c => c.name.toLowerCase() === name.toLowerCase())) return fail("A campaign with that name already exists.");
    const c = { id: "C" + state.nextCampaign++, name, channel: (d.channel || "Email").trim(), audience, offer: (d.offer || "").trim(), createdAt: now };
    state.campaigns.push(c); return ok({ id: c.id });
  }

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // The marketing half of a handoff: what sales needs to know about the lead. Used when creating a handoff and when marketing updates it.
  function cleanMarketing(m) {
    const intent = Number(m.intent), confidence = Number(m.confidence);
    if (!(intent >= 1 && intent <= 5)) return { error: "Rate the lead's interest from 1 to 5." };
    if (!(Number.isInteger(confidence) && confidence >= 0 && confidence <= 100)) return { error: "Set the confidence rate as a whole number from 0 to 100." };
    if (!(m.interest || "").trim()) return { error: "Pick the product the lead asked about." };
    if (!(m.notes || "").trim()) return { error: "Add what marketing knows: what the lead did and said. Sales reads this first." };
    const decision = m.decision || "Unknown", contact = m.contactMethod || "Email";
    if (!DECISION.includes(decision)) return { error: "Pick the lead's role in the buying decision." };
    if (!CONTACT.includes(contact)) return { error: "Pick the best way to reach them." };
    const t = k => String(m[k] || "").trim();
    return { value: { source: t("source"), interest: t("interest"), intent, confidence, decision, contactMethod: contact, background: t("background"), painPoints: t("painPoints"), volume: t("volume"), engagement: t("engagement"), notes: t("notes"), bestTime: t("bestTime") } };
  }
  function createHandoff(state, role, d, now = Date.now()) {
    if (!can.createHandoff(role)) return fail(FORBIDDEN);
    const lead = d.lead || {}, m = d.marketing || {};
    if (!state.campaigns.some(c => c.id === d.campaignId)) return fail("Pick a campaign for this handoff.");
    if (!(lead.name || "").trim()) return fail("Add the lead's name.");
    if (!(lead.company || "").trim()) return fail("Add the lead's company.");
    if (!VENUES[lead.type]) return fail("Pick the kind of business.");
    if (!EMAIL.test((lead.email || "").trim())) return fail("Add a valid email (use a fictional @example.com address in this prototype).");
    const cm = cleanMarketing(m); if (cm.error) return fail(cm.error);
    if (d.assignedTo && !REPS.includes(d.assignedTo)) return fail("Pick one of the demo reps, or leave the owner empty.");
    const h = {
      id: "H" + state.nextHandoff++, campaignId: d.campaignId, status: "Submitted", assignedTo: d.assignedTo || null,
      lead: { name: lead.name.trim(), title: (lead.title || "").trim(), company: lead.company.trim(), type: lead.type, city: (lead.city || "").trim(), email: lead.email.trim() },
      marketing: cm.value,
      brief: null, sales: BLANK_DEAL(), activities: [], lastContactAt: null, salesNotice: null, createdBy: MARKETER, createdAt: now, updatedAt: now, acceptedAt: null, history: [],
    };
    log(state, h, MARKETER, "Handoff submitted to sales" + (h.assignedTo ? ` and assigned to ${h.assignedTo}` : ""), now); h.updatedAt = now;
    state.handoffs.unshift(h); return ok({ id: h.id });
  }

  // ---------- marketing keeps the lead profile current ----------
  const LABELS = { source: "lead source", interest: "product", intent: "interest", confidence: "confidence", decision: "decision role", contactMethod: "contact method", background: "background", painPoints: "pain points", volume: "volume", engagement: "activity", notes: "notes", bestTime: "best time" };
  const LEADLABELS = { name: "name", title: "title", company: "company", type: "business type", city: "city", email: "email" };
  function updateLead(state, id, role, patch, now = Date.now()) {
    if (!can.updateLead(role)) return fail(FORBIDDEN);
    const h = find(state, id); if (!h) return fail("That handoff doesn't exist.");
    if (TERMINAL.includes(h.status)) return fail("This handoff is closed, so its profile is locked.");
    const lp = Object.assign({}, h.lead, patch.lead || {});
    if (!lp.name.trim() || !lp.company.trim()) return fail("Name and company can't be empty.");
    if (!VENUES[lp.type]) return fail("Pick the kind of business.");
    if (!EMAIL.test(lp.email.trim())) return fail("Add a valid email (use a fictional @example.com address in this prototype).");
    const cm = cleanMarketing(Object.assign({}, h.marketing, patch.marketing || {})); if (cm.error) return fail(cm.error);
    const changes = [];
    Object.keys(LEADLABELS).forEach(k => { const v = String(lp[k] || "").trim(); if (v !== h.lead[k]) changes.push(LEADLABELS[k]); lp[k] = v; });
    Object.keys(cm.value).forEach(k => { if (cm.value[k] !== h.marketing[k]) changes.push(k === "confidence" ? `confidence ${h.marketing.confidence == null ? "unset" : h.marketing.confidence + "%"} to ${cm.value.confidence}%` : LABELS[k]); });
    if (!changes.length) return fail("Nothing changed.");
    h.lead = lp; h.marketing = cm.value;
    const summary = changes.join(", ");
    log(state, h, MARKETER, `Updated lead profile: ${summary}`, now);
    h.profileUpdatedAt = now;
    if (h.status !== "Submitted") h.pendingUpdate = { at: now, summary };   // sales has already picked this up, so tell them it changed
    return ok({ changes });
  }
  function ackUpdate(state, id, role, rep, now = Date.now()) {
    if (!can.ackUpdate(role)) return fail(FORBIDDEN);
    const h = find(state, id); if (!h) return fail("That handoff doesn't exist.");
    if (h.assignedTo !== rep) return fail("Only the assigned rep can mark updates as seen.");
    if (!h.pendingUpdate) return fail("There is no update to mark as seen.");
    h.pendingUpdate = null; log(state, h, rep, "Saw marketing's profile update", now); return ok();
  }
  const briefStale = h => !!(h.brief && h.profileUpdatedAt && h.profileUpdatedAt > h.brief.generatedAt);

  // ---------- sales keeps the deal profile and activity log ----------
  const dayStr = t => new Date(t).toISOString().slice(0, 10);
  function cleanDeal(d) {
    const t = k => String(d[k] == null ? "" : d[k]).trim();
    let probability = null; if (t("probability") !== "") { probability = Number(t("probability")); if (!(Number.isInteger(probability) && probability >= 0 && probability <= 100)) return { error: "Win probability must be a whole number from 0 to 100." }; }
    let dealValue = null; if (t("dealValue") !== "") { dealValue = Number(t("dealValue").replace(/[$,]/g, "")); if (!(Number.isFinite(dealValue) && dealValue >= 0 && dealValue <= 1e7)) return { error: "Deal value must be a dollar amount, 0 or more." }; }
    const date = t("nextStepDate"); if (date && !(/^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date)))) return { error: "Next step date must be a real date." };
    if (date && !t("nextStep")) return { error: "Say what the next step is, or clear the date." };
    return { value: { probability, dealValue, nextStep: t("nextStep"), nextStepDate: date, competitor: t("competitor"), timeline: t("timeline"), notes: t("notes") } };
  }
  const DEALLABELS = { probability: "win probability", dealValue: "deal value", nextStep: "next step", nextStepDate: "next step date", competitor: "competitor", timeline: "timeline", notes: "sales notes" };
  function updateDeal(state, id, role, rep, patch, now = Date.now()) {
    if (!can.updateDeal(role)) return fail(FORBIDDEN);
    const h = find(state, id); if (!h) return fail("That handoff doesn't exist.");
    if (h.assignedTo !== rep) return fail("Only the assigned rep can update the deal. Accept the handoff first.");
    if (h.status === "Submitted" || h.status === "Returned") return fail("Accept the handoff before updating the deal.");
    if (TERMINAL.includes(h.status)) return fail("This handoff is closed, so the deal is locked.");
    const c = cleanDeal(Object.assign({}, h.sales, patch)); if (c.error) return fail(c.error);
    const changes = Object.keys(c.value).filter(k => c.value[k] !== h.sales[k]).map(k => k === "probability" ? `win probability ${h.sales.probability == null ? "unset" : h.sales.probability + "%"} to ${c.value.probability == null ? "unset" : c.value.probability + "%"}` : DEALLABELS[k]);
    if (!changes.length) return fail("Nothing changed.");
    h.sales = c.value; const summary = changes.join(", ");
    log(state, h, rep, `Updated deal: ${summary}`, now); h.salesNotice = { at: now, summary, by: rep };
    return ok({ changes });
  }
  function addActivity(state, id, role, rep, d, now = Date.now()) {
    if (!can.addActivity(role)) return fail(FORBIDDEN);
    const h = find(state, id); if (!h) return fail("That handoff doesn't exist.");
    if (h.assignedTo !== rep) return fail("Only the assigned rep can log activity. Accept the handoff first.");
    if (h.status === "Submitted" || h.status === "Returned") return fail("Accept the handoff before logging activity.");
    if (!ACTIVITY.includes(d.type)) return fail("Pick the kind of activity.");
    const note = String(d.note || "").trim(); if (!note) return fail("Say what happened.");
    h.activities.push({ at: now, by: rep, type: d.type, note }); h.lastContactAt = now; log(state, h, rep, `Logged a ${d.type.toLowerCase()}`, now); return ok();
  }
  function ackSalesUpdate(state, id, role, now = Date.now()) {
    if (!can.ackSalesUpdate(role)) return fail(FORBIDDEN);
    const h = find(state, id); if (!h) return fail("That handoff doesn't exist.");
    if (!h.salesNotice) return fail("There is no sales update to mark as seen.");
    h.salesNotice = null; log(state, h, MARKETER, "Saw sales' deal update", now); return ok();
  }

  // ---------- sales brief ----------
  const TYPE_BANK = {
    bar: { angle: "a bar lives or dies on what guests will pay per pour, so lead with the cocktail upgrade and keep price talk to the public shelf price", objections: ["Price", "Competitor"], asks: ["What do your guests order most on a Friday, and what do they expect to pay?", "Which tequila do you pour in your house margarita today?"] },
    restaurant: { angle: "a restaurant cares about the menu fit and the server story, so ask about the margarita and sipping list before the pitch", objections: ["Product fit", "Price"], asks: ["How do tequila drinks sell on your menu now?", "Who decides what goes on the beverage list?"] },
    retail: { angle: "a store cares about shelf movement and what customers ask for, so find out what is selling and what is gathering dust", objections: ["Competitor", "Timing"], asks: ["Which tequilas move fastest on your shelf?", "What do shoppers ask for that you don't carry?"] },
    distributor: { angle: "a distributor cares about fit with their book of business and how fast the brand moves, so listen before you pitch", objections: ["Authority", "Timing"], asks: ["What does your portfolio already cover in tequila?", "What would a new brand need to show you to take it on?"] },
    event: { angle: "an events buyer cares about the story guests can repeat and a simple serve, so start with what the event needs", objections: ["Timing", "Product fit"], asks: ["What kind of events, and how many guests, are coming up?", "Is there a signature drink you want built around one bottle?"] },
  };
  const RESPONSE_BANK = {
    Price: "Acknowledge it, then ask what guests are paying now. Share only public shelf prices. Never quote a discount, margin or wholesale term: those are not approved.",
    Competitor: "Don't attack the brand they pour. Ask what they like about it, then offer a side-by-side tasting with the team.",
    Compliance: "Be calm and exact: guests must be 21+, no health claims, and no promises about sales results. Offer to check anything you're unsure about with the manager.",
    Timing: "Respect it. Ask for a smaller next step (a tasting or a short call) and agree a specific day to follow up.",
    "Product fit": "Go back to what their guests order. Match one bottle to one drink and say why, using only what the brand says publicly.",
    Authority: "Ask who decides and how, and offer something the contact can pass along. Don't go around them.",
  };

  function mockBrief(h, campaign, state, now = Date.now()) {
    const t = TYPE_BANK[h.lead.type], prod = h.marketing.interest, price = PRICES[prod];
    const heard = {};
    state.feedback.filter(f => f.type === "objection" && f.category).forEach(f => { const o = find(state, f.handoffId); if (o && o.campaignId === h.campaignId && o.id !== h.id) heard[f.category] = (heard[f.category] || 0) + 1; });
    const cats = [...new Set([...Object.keys(heard).sort((a, b) => heard[b] - heard[a]), ...t.objections])].slice(0, 3);
    const hot = h.marketing.intent >= 4 ? "high" : h.marketing.intent === 3 ? "medium" : "low";
    return {
      headline: `${h.lead.name}${h.lead.title ? ", " + h.lead.title : ""} at ${h.lead.company}: ${hot} intent, asked about ${prod}`,
      snapshot: [
        `Business: ${VENUES[h.lead.type]}${h.lead.city ? " in " + h.lead.city : ""}`,
        `Campaign: ${campaign ? campaign.name : "unknown"} (${campaign ? campaign.channel : ""})`,
        `Lead source: ${h.marketing.source || "not recorded"}. Intent: ${h.marketing.intent} of 5 (${hot}).`,
        `What they did: ${h.marketing.engagement || "not recorded"}`,
        `Confidence they will buy: ${h.marketing.confidence == null ? "not rated" : h.marketing.confidence + "%"}. Role in the decision: ${h.marketing.decision || "Unknown"}.`,
        `Background: ${h.marketing.background || "not recorded"}`,
        `Pain points: ${h.marketing.painPoints || "not recorded"}${h.marketing.volume ? ". Expected volume: " + h.marketing.volume : ""}`,
        `Marketing's note: ${h.marketing.notes}`,
        `Best way and time to reach them: ${h.marketing.contactMethod || "Email"}${h.marketing.bestTime ? ", " + h.marketing.bestTime : ""}`,
      ],
      whyNow: `This lead raised a hand through "${campaign ? campaign.name : "a campaign"}". ${hot === "high" ? "Contact within one business day while the interest is fresh." : "Follow up this week and confirm the interest is real before investing time."}`,
      talkingPoints: [
        `For ${VENUES[h.lead.type].toLowerCase()} buyers: ${t.angle}.`,
        `Brand promise: additive-free, only three ingredients, no fake flavors, celebrity-free.`,
        `The name comes from the corrido, a traditional Mexican ballad.`,
        price ? `${prod} is $${price.slice(1)} on the public shop (public price only, not a wholesale price).` : "Product not chosen yet: ask which bottle fits their menu or shelf before you pitch one.",
      ],
      likelyObjections: cats.map(c => ({ category: c, response: RESPONSE_BANK[c], heardInCampaign: heard[c] || 0 })),
      openingQuestions: t.asks,
      nextStep: hot === "high" ? "Call or email today and propose a tasting with the team." : "Send a short email, then try one phone call before the end of the week.",
      guardrails: ["21+ only.", "Don't invent margins, wholesale prices, discounts or sales results: none are approved.", "No health claims.", "Use only the facts above; check anything else with a manager."],
      dataUsed: ["Handoff form fields", "Campaign details", `Objections already logged on other handoffs in this campaign (${Object.values(heard).reduce((a, b) => a + b, 0)})`, "Public brand facts (same ones as the Sales Academy)"],
    };
  }

  // source is "mock" or "ai". For "ai", sections come from the local server's /api/brief (validated below), model is its name.
  function setBrief(state, id, role, source, sections, model, now = Date.now()) {
    if (!can.generateBrief(role)) return fail(FORBIDDEN);
    const h = find(state, id); if (!h) return fail("That handoff doesn't exist.");
    if (source !== "mock" && source !== "ai") return fail("Unknown brief source.");
    if (!validBrief(sections)) return fail("The brief came back in the wrong shape.");
    h.brief = { source, model: source === "ai" ? String(model || "unknown model") : "deterministic template", generatedAt: now, sections };
    log(state, h, role === "marketing" ? MARKETER : "Sales", `${source === "ai" ? "AI-generated" : "Mock-generated"} sales brief created`, now);
    return ok();
  }
  function generateMock(state, id, role, now = Date.now()) {
    const h = find(state, id); if (!h) return fail("That handoff doesn't exist.");
    return setBrief(state, id, role, "mock", mockBrief(h, state.campaigns.find(c => c.id === h.campaignId), state, now), null, now);
  }
  const arr = (x, n) => Array.isArray(x) && x.length >= 1 && x.length <= n && x.every(s => typeof s === "string" && s.length < 600);
  function validBrief(b) {
    return !!b && typeof b.headline === "string" && typeof b.whyNow === "string" && typeof b.nextStep === "string" && arr(b.snapshot, 14) && arr(b.talkingPoints, 10) && arr(b.openingQuestions, 8) && arr(b.guardrails, 10) &&
      Array.isArray(b.likelyObjections) && b.likelyObjections.length <= 8 && b.likelyObjections.every(o => o && typeof o.category === "string" && typeof o.response === "string");
  }

  // ---------- sales side ----------
  function assign(state, id, role, rep, now = Date.now()) {
    if (!can.assign(role)) return fail(FORBIDDEN);
    const h = find(state, id); if (!h) return fail("That handoff doesn't exist.");
    if (TERMINAL.includes(h.status) || h.status === "Returned") return fail("This handoff is closed or returned; it can't be reassigned.");
    const by = role === "manager" ? MANAGER : MARKETER;
    if (!rep) {   // unassign: only before anyone has accepted it
      if (h.status !== "Submitted") return fail("Only a handoff nobody has accepted yet can be unassigned. Pick another rep instead.");
      if (!h.assignedTo) return fail("It is already unassigned.");
      const was = h.assignedTo; h.assignedTo = null; log(state, h, by, `Unassigned (was ${was})`, now); return ok();
    }
    if (!REPS.includes(rep)) return fail("Pick one of the demo reps.");
    if (h.assignedTo === rep) return fail(`Already assigned to ${rep}.`);
    const was = h.assignedTo; h.assignedTo = rep; log(state, h, by, was ? `Reassigned from ${was} to ${rep}` : `Assigned to ${rep}`, now); return ok();
  }
  function accept(state, id, role, rep, now = Date.now()) {
    if (!can.accept(role)) return fail(FORBIDDEN);
    const h = find(state, id); if (!h) return fail("That handoff doesn't exist.");
    if (h.status !== "Submitted") return fail("Only a newly submitted handoff can be accepted.");
    if (h.assignedTo && h.assignedTo !== rep) return fail(`This handoff is assigned to ${h.assignedTo}. Switch to that rep, or ask the manager to reassign it.`);
    h.assignedTo = rep; h.status = "Accepted"; h.acceptedAt = now; log(state, h, rep, "Accepted the handoff", now); return ok();
  }
  function setStatus(state, id, role, rep, to, note, now = Date.now()) {
    if (!can.setStatus(role)) return fail(FORBIDDEN);
    const h = find(state, id); if (!h) return fail("That handoff doesn't exist.");
    if (h.assignedTo !== rep) return fail("Accept this handoff first, or switch to the rep it is assigned to.");
    if (!NEXT[h.status].includes(to) || to === "Accepted") return fail(`A handoff that is ${h.status} can't move to ${to}.`);
    if ((to === "Returned" || to === "Lost") && !(note || "").trim()) return fail(to === "Returned" ? "Say why you're returning it so marketing can learn from it." : "Say why it was lost.");
    h.status = to; log(state, h, rep, `Status changed to ${to}${(note || "").trim() ? ": " + note.trim() : ""}`, now);
    if (to === "Returned") state.feedback.push(mkFeedback(state, h, "quality", null, `Returned to marketing: ${note.trim()}`, "", rep, now));
    return ok();
  }
  function mkFeedback(state, h, type, category, text, quote, by, now) {
    return { id: "F" + state.nextFeedback++, handoffId: h.id, type, category, text, quote, by, createdAt: now, status: "Open", resolution: null };
  }
  function addFeedback(state, id, role, rep, d, now = Date.now()) {
    if (!can.addFeedback(role)) return fail(FORBIDDEN);
    const h = find(state, id); if (!h) return fail("That handoff doesn't exist.");
    if (h.assignedTo !== rep) return fail("Only the assigned rep can add feedback. Accept the handoff first.");
    if (!FEEDBACK_TYPES[d.type]) return fail("Pick a feedback type.");
    if (d.type === "objection" && !CATEGORIES.includes(d.category)) return fail("Pick the objection category.");
    const text = (d.text || "").trim(); if (!text) return fail("Say what you learned, in a sentence or two.");
    const f = mkFeedback(state, h, d.type, d.type === "objection" ? d.category : null, text, (d.quote || "").trim(), rep, now);
    state.feedback.push(f); log(state, h, rep, `Recorded ${d.type === "objection" ? d.category + " objection" : FEEDBACK_TYPES[d.type].toLowerCase()}`, now);
    return ok({ id: f.id });
  }

  // ---------- marketing side ----------
  function resolveFeedback(state, fid, role, d, now = Date.now()) {
    if (!can.resolveFeedback(role)) return fail(FORBIDDEN);
    const f = state.feedback.find(x => x.id === fid); if (!f) return fail("That feedback doesn't exist.");
    if (f.status === "Resolved") return fail("Already resolved.");
    if (!RESOLUTIONS[d.kind]) return fail("Pick what marketing did about it.");
    const note = (d.note || "").trim(); if (!note) return fail("Describe what you did or decided, so sales can see it.");
    f.status = "Resolved"; f.resolution = { kind: d.kind, note, by: MARKETER, at: now };
    const h = find(state, f.handoffId); if (h) log(state, h, MARKETER, `Resolved feedback ${f.id}: ${RESOLUTIONS[d.kind]}`, now);
    return ok();
  }
  function resubmit(state, id, role, now = Date.now()) {
    if (!can.resubmit(role)) return fail(FORBIDDEN);
    const h = find(state, id); if (!h) return fail("That handoff doesn't exist.");
    if (h.status !== "Returned") return fail("Only a returned handoff can be resubmitted.");
    if (state.feedback.some(f => f.handoffId === id && f.status === "Open")) return fail("Resolve the open feedback on this handoff first.");
    h.status = "Submitted"; h.assignedTo = null; h.acceptedAt = null; log(state, h, MARKETER, "Resubmitted to sales", now); return ok();
  }

  // ---------- manager numbers ----------
  const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  function metrics(state, now = Date.now()) {
    const hs = state.handoffs, fb = state.feedback, by = {};
    STATUSES.forEach(s => (by[s] = hs.filter(h => h.status === s).length));
    const won = by.Won, lost = by.Lost, resolved = fb.filter(f => f.status === "Resolved");
    const cat = {}; CATEGORIES.forEach(c => (cat[c] = 0)); fb.filter(f => f.type === "objection").forEach(f => cat[f.category]++);
    const accepted = hs.filter(h => h.acceptedAt);
    return {
      total: hs.length, byStatus: by, active: hs.filter(h => !TERMINAL.includes(h.status) && h.status !== "Returned").length,
      winRate: won + lost ? won / (won + lost) : null,
      acceptRate: hs.length ? accepted.length / hs.length : null,
      avgHoursToAccept: avg(accepted.map(h => (h.acceptedAt - h.createdAt) / HOUR)),
      waitingOver48h: hs.filter(h => h.status === "Submitted" && now - h.createdAt > 48 * HOUR).length,
      avgConfidenceActive: avg(hs.filter(h => !TERMINAL.includes(h.status) && h.status !== "Returned" && h.marketing.confidence != null).map(h => h.marketing.confidence)),
      highConfidenceWaiting: hs.filter(h => h.status === "Submitted" && h.marketing.confidence >= 70).length,
      updatesPending: hs.filter(h => h.pendingUpdate).length,
      pipeline: (() => {
        const p = hs.filter(h => ["Accepted", "Contacted", "Meeting set"].includes(h.status)), today = dayStr(now), both = p.filter(h => h.sales.probability != null && h.marketing.confidence != null);
        return { count: p.length, value: p.reduce((a, h) => a + (h.sales.dealValue || 0), 0), weighted: p.reduce((a, h) => a + (h.sales.dealValue || 0) * (h.sales.probability || 0) / 100, 0),
          overdue: p.filter(h => h.sales.nextStepDate && h.sales.nextStepDate < today).length, noNextStep: p.filter(h => !h.sales.nextStep).length, quiet: p.filter(h => now - (h.lastContactAt || h.acceptedAt || h.createdAt) > 5 * DAY).length,
          confidenceGap: avg(both.map(h => h.sales.probability - h.marketing.confidence)), wonValue: hs.filter(h => h.status === "Won").reduce((a, h) => a + (h.sales.dealValue || 0), 0) };
      })(),
      returned: by.Returned, feedbackOpen: fb.filter(f => f.status === "Open").length, feedbackResolved: resolved.length,
      feedbackResolveRate: fb.length ? resolved.length / fb.length : null,
      avgHoursToResolve: avg(resolved.map(f => (f.resolution.at - f.createdAt) / HOUR)),
      objections: cat,
      briefs: { mock: hs.filter(h => h.brief && h.brief.source === "mock").length, ai: hs.filter(h => h.brief && h.brief.source === "ai").length, none: hs.filter(h => !h.brief).length },
      byCampaign: state.campaigns.map(c => { const m = hs.filter(h => h.campaignId === c.id); return { id: c.id, name: c.name, handoffs: m.length, won: m.filter(h => h.status === "Won").length, lost: m.filter(h => h.status === "Lost").length, openFeedback: fb.filter(f => f.status === "Open" && m.some(h => h.id === f.handoffId)).length }; }),
      byRep: REPS.map(r => ({ rep: r, pipeline: hs.filter(h => h.assignedTo === r && ["Accepted", "Contacted", "Meeting set"].includes(h.status)).reduce((a, h) => a + (h.sales.dealValue || 0), 0), overdue: hs.filter(h => h.assignedTo === r && ["Accepted", "Contacted", "Meeting set"].includes(h.status) && h.sales.nextStepDate && h.sales.nextStepDate < dayStr(now)).length, active: hs.filter(h => h.assignedTo === r && !TERMINAL.includes(h.status) && h.status !== "Returned").length, won: hs.filter(h => h.assignedTo === r && h.status === "Won").length })),
    };
  }

  // ---------- Sales Academy exploration (read-only) ----------
  // Turns a real handoff into a practice-scenario DRAFT in the same spirit as the Academy's missions. It is only text to copy: it never edits scenarios.js or the Coach.
  function practiceDraft(state, id) {
    const h = find(state, id); if (!h) return null;
    const obj = state.feedback.filter(f => f.handoffId === id && f.type === "objection");
    return {
      note: "DRAFT for the team to review. Not added to the Sales Academy. Fictional lead.",
      customer: { name: h.lead.name, role: h.lead.title || "Buyer", business: `${h.lead.company} (${VENUES[h.lead.type]})` },
      hidden: obj.length ? obj.map(o => `${o.category}: ${o.text}`).join(" ") : "No objection recorded yet.",
      openingLine: h.marketing.notes,
      skillsToPractice: [...new Set(obj.map(o => ({ Price: "Price & margin", Competitor: "Objections", Compliance: "Compliance & calm", Timing: "Closing", "Product fit": "Product & story", Authority: "Discovery" })[o.category]))],
    };
  }

  // ---------- storage ----------
  const KEY = "csa-connect-v1";
  function load(storage, now = Date.now()) {
    try { const raw = storage && storage.getItem(KEY); if (raw) { const s = JSON.parse(raw); if (s && s.version === 1 && Array.isArray(s.handoffs) && Array.isArray(s.campaigns) && Array.isArray(s.feedback)) { s.handoffs.forEach(h => { h.sales = Object.assign(BLANK_DEAL(), h.sales); h.activities = h.activities || []; if (h.lastContactAt === undefined) h.lastContactAt = null; if (h.salesNotice === undefined) h.salesNotice = null; const m = h.marketing; if (m.confidence === undefined) m.confidence = null; m.decision = m.decision || "Unknown"; m.contactMethod = m.contactMethod || "Email"; ["background", "painPoints", "volume"].forEach(k => (m[k] = m[k] || "")); }); return s; } } } catch (e) { /* fall through to fresh demo data */ }
    return seed(now);
  }
  function save(storage, state) { try { storage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; } }

  // ---------- demo data: all invented ----------
  function seed(now = Date.now()) {
    const s = { version: 1, campaigns: [], handoffs: [], feedback: [], nextCampaign: 1, nextHandoff: 1, nextFeedback: 1 };
    const M = "marketing", S = "sales", ago = h => now - h * HOUR;
    const c1 = createCampaign(s, M, { name: "Fall Margarita Menu Push", channel: "Email + Instagram", audience: "Bars and restaurants adding fall cocktail menus", offer: "Free tasting with the team" }, ago(400)).id;
    const c2 = createCampaign(s, M, { name: "Retail Shelf Spotlight", channel: "Trade show", audience: "Independent liquor and specialty stores", offer: "Shelf talker and tasting kit" }, ago(300)).id;
    const c3 = createCampaign(s, M, { name: "Holiday Events Outreach", channel: "Webinar", audience: "Event planners and caterers", offer: "Signature cocktail recipe card" }, ago(120)).id;
    const mk = (c, lead, m, hrs) => createHandoff(s, M, { campaignId: c, lead, marketing: m }, ago(hrs)).id;
    const a = mk(c1, { name: "Alex Rivera", title: "Owner", company: "The Copper Agave (fictional)", type: "bar", city: "Tempe", email: "alex@example.com" }, { source: "Instagram ad", interest: "Blanco", intent: 5, confidence: 92, decision: "Decision maker", contactMethod: "Phone", background: "Runs a 40-seat neighborhood bar for 6 years; known for fall cocktails.", painPoints: "Wants a premium house margarita without raising prices much.", volume: "About 2 cases a month", engagement: "Opened 3 emails, clicked the tasting offer twice", notes: "Replied to the email asking for a tasting before the October menu locks.", bestTime: "Weekdays 2 to 4pm" }, 200);
    const b = mk(c1, { name: "Dana Whitaker", title: "Bar manager", company: "Mesquite & Moon (fictional)", type: "restaurant", city: "Phoenix", email: "dana@example.com" }, { source: "Email", interest: "Reposado", intent: 3, confidence: 55, decision: "Influencer", contactMethod: "Email", background: "Bar manager; the owner signs off on menu changes.", painPoints: "Needs a seasonal drink that sells at $11.", volume: "Unknown", engagement: "Clicked the menu-ideas link", notes: "Wants cocktail ideas for a fall list; no timeline given.", bestTime: "Mornings" }, 150);
    const c = mk(c2, { name: "Marisol Vega", title: "Buyer", company: "Desert Rose Spirits (fictional)", type: "retail", city: "Mesa", email: "marisol@example.com" }, { source: "Trade show booth", interest: "Añejo", intent: 4, confidence: 78, decision: "Decision maker", contactMethod: "In person", background: "Buyer for a 3-store specialty chain; likes small-batch brands.", painPoints: "Shoppers ask for sipping tequilas; wants shelf talkers.", volume: "6 bottles per store to start", engagement: "Tasted at the booth, left a business card", notes: "Liked the Añejo; asked if shelf talkers are included.", bestTime: "Tue/Thu" }, 120);
    const d = mk(c2, { name: "Tom Brandt", title: "Owner", company: "Brandt's Bottle Shop (fictional)", type: "retail", city: "Scottsdale", email: "tom@example.com" }, { source: "Trade show booth", interest: "Overproof", intent: 2, confidence: 20, decision: "Unknown", contactMethod: "Email", background: "Corner store owner, mostly beer and wine.", painPoints: "No clear need yet.", volume: "Unknown", engagement: "Stopped by, took a flyer", notes: "Casual interest only.", bestTime: "" }, 100);
    const e = mk(c3, { name: "Priscilla Nguyen", title: "Event planner", company: "Saguaro Social Events (fictional)", type: "event", city: "Chandler", email: "priscilla@example.com" }, { source: "Webinar", interest: "Blanco", intent: 4, confidence: 80, decision: "Decision maker", contactMethod: "Email", background: "Plans 20 corporate events a year.", painPoints: "Wants a signature cocktail that is easy to batch.", volume: "150 guests in December", engagement: "Attended the full webinar, asked two questions", notes: "Planning a 150-guest corporate holiday party in December.", bestTime: "Afternoons" }, 50);
    const f = mk(c3, { name: "Gus Palmer", title: "Catering lead", company: "Palmer & Sons Catering (fictional)", type: "event", city: "Gilbert", email: "gus@example.com" }, { source: "Webinar", interest: "Not sure yet", intent: 3, confidence: 45, decision: "Influencer", contactMethod: "Phone", background: "Caterer who subcontracts bars at weddings.", painPoints: "Clients ask about non-alcoholic options.", volume: "Unknown", engagement: "Registered, watched half", notes: "Asked whether there is a non-alcoholic option.", bestTime: "Any" }, 30);
    const g = mk(c1, { name: "Luz Herrera", title: "Owner", company: "La Luz Cantina (fictional)", type: "bar", city: "Tucson", email: "luz@example.com" }, { source: "Email", interest: "Overproof", intent: 4, confidence: 68, decision: "Decision maker", contactMethod: "Text", background: "Owns a cantina with a spicy-margarita following.", painPoints: "Wants a bolder tequila that holds up to heat.", volume: "1 case to test", engagement: "Replied to the email", notes: "Asks about Overproof for a spicy margarita.", bestTime: "Evenings before open" }, 6);
    [a, b, c, d, e, f, g].forEach((id, i) => generateMock(s, id, i % 2 ? M : S, find(s, id).createdAt + HOUR));
    // sales has worked some of them
    assign(s, a, "manager", REPS[0], ago(198)); accept(s, a, S, REPS[0], ago(190)); setStatus(s, a, S, REPS[0], "Contacted", "", ago(180)); updateDeal(s, a, S, REPS[0], { probability: 80, dealValue: 1800, nextStep: "Deliver first order", nextStepDate: dayStr(now - 1 * DAY), competitor: "Big-name well tequila", timeline: "Before the October menu locks", notes: "Ordered after the tasting." }, ago(175)); setStatus(s, a, S, REPS[0], "Meeting set", "", ago(150)); setStatus(s, a, S, REPS[0], "Won", "First order placed after the tasting", ago(60));
    accept(s, b, S, REPS[1], ago(140)); setStatus(s, b, S, REPS[1], "Contacted", "", ago(130));
    addFeedback(s, b, S, REPS[1], { type: "objection", category: "Price", text: "Worried guests won't pay a premium for a fall cocktail.", quote: "My guests stop at $12 a drink." }, ago(120));
    accept(s, c, S, REPS[2], ago(110)); setStatus(s, c, S, REPS[2], "Contacted", "", ago(100)); setStatus(s, c, S, REPS[2], "Meeting set", "", ago(70));
    addFeedback(s, c, S, REPS[2], { type: "content", text: "Buyers keep asking for a one-page shelf-talker. We don't have one.", quote: "Do you have something I can put on the shelf?" }, ago(66));
    accept(s, d, S, REPS[2], ago(90)); setStatus(s, d, S, REPS[2], "Returned", "Browsing only, no buying role and no timeline.", ago(80));
    assign(s, e, "manager", REPS[0], ago(45)); // assigned by the manager, still waiting to be accepted
    const fb = s.feedback.find(x => x.handoffId === b); resolveFeedback(s, fb.id, M, { kind: "content", note: "Added a 'cocktail at $11' pricing example to the email follow-up." }, ago(100));
    const dd = n => dayStr(now + n * DAY);
    addActivity(s, a, S, REPS[0], { type: "Tasting", note: "Tasting with the bar team; they loved the Blanco in a margarita." }, ago(150)); s.handoffs.find(x => x.id === a).salesNotice = null;
    updateDeal(s, b, S, REPS[1], { probability: 35, dealValue: 600, nextStep: "Send $11 margarita pricing example", nextStepDate: dd(-3), competitor: "House brand", timeline: "Before the fall menu locks", notes: "Owner signs off; Dana is the influencer." }, ago(118));
    addActivity(s, b, S, REPS[1], { type: "Email", note: "Sent cocktail ideas; Dana asked about pricing." }, ago(125));
    updateDeal(s, c, S, REPS[2], { probability: 70, dealValue: 2400, nextStep: "Bring shelf talkers and a tasting kit", nextStepDate: dd(2), competitor: "Two other small-batch brands", timeline: "Reorder cycle in 3 weeks", notes: "Buyer likes the Añejo." }, ago(65));
    addActivity(s, c, S, REPS[2], { type: "Call", note: "Confirmed the meeting; asked what the shelf talker looks like." }, ago(72));
    s.handoffs.forEach(x => { x.salesNotice = null; });
    s.handoffs.forEach(h => { h.updatedAt = Math.max(h.updatedAt, h.history.length ? h.history[h.history.length - 1].at : h.createdAt); });
    return s;
  }

  return { STATUSES, TERMINAL, NEXT, ROLES, REPS, MARKETER, MANAGER, VENUES, PRODUCTS, PRICES, CATEGORIES, FEEDBACK_TYPES, RESOLUTIONS, FORBIDDEN, can, KEY,
    createCampaign, createHandoff, updateDeal, addActivity, ackSalesUpdate, ACTIVITY, updateLead, ackUpdate, briefStale, DECISION, CONTACT, mockBrief, setBrief, generateMock, validBrief, assign, accept, setStatus, addFeedback, resolveFeedback, resubmit, metrics, practiceDraft, load, save, seed, find };
});
