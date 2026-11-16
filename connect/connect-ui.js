"use strict";
// Corrido Connect screens. Logic lives in connect-core.js; this file only draws and wires clicks. Every piece of typed text goes through esc().
(function () {
  const C = window.Connect, $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SKEY = "csa-connect-session";
  let store = null; try { store = window.localStorage; store.getItem("x"); } catch (e) { store = null; }
  let state = C.load(store);
  let session = { role: "marketing", rep: C.REPS[0] };
  try { const s = JSON.parse(store.getItem(SKEY)); if (s && C.ROLES.includes(s.role)) session = { role: s.role, rep: C.REPS.includes(s.rep) ? s.rep : C.REPS[0] }; } catch (e) { /* defaults */ }
  let ai = { ai: false, model: null }, busy = false, filter = "All";
  const persist = () => { if (store) { C.save(store, state); try { store.setItem(SKEY, JSON.stringify(session)); } catch (e) { /* ignore */ } } };
  if (!store) $("#banner").textContent += " Your browser blocks storage, so data will be lost on refresh.";
  fetch("/api/status").then(r => r.json()).then(j => { ai = j; render(); }).catch(() => {});   // only exists on the local server; a plain file server just means "no AI"

  const toast = (msg, bad) => { const t = $("#toast"); t.textContent = msg; t.className = "show" + (bad ? " bad" : ""); clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ""), 4000); };
  const result = (r, okMsg) => { if (!r.ok) toast(r.error, true); else { persist(); if (okMsg) toast(okMsg); } render(); return r; };
  const pill = s => `<span class="pill s-${s.split(" ")[0]}">${esc(s)}</span>`;
  const when = t => { const h = (Date.now() - t) / 3600e3; return h < 1 ? "just now" : h < 48 ? Math.round(h) + " h ago" : Math.round(h / 24) + " days ago"; };
  const camp = id => state.campaigns.find(c => c.id === id) || { name: "(deleted)", channel: "" };
  const route = () => { const p = location.hash.replace(/^#\/?/, "").split("/"); return { page: p[0] || "handoffs", id: p[1] }; };
  const opts = (list, sel) => list.map(o => `<option${o === sel ? " selected" : ""}>${esc(o)}</option>`).join("");
  const kv = list => `<ul class="plain">${list.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
  const srcTag = b => b.source === "ai" ? `<span class="src ai">AI-generated · ${esc(b.model)}</span>` : `<span class="src mock">Mock-generated · built-in template, not AI</span>`;

  // ---------- chrome ----------
  function chrome() {
    document.querySelectorAll("[data-role]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.role === session.role)));
    $("#repWrap").style.display = session.role === "sales" ? "" : "none";
    $("#repSel").innerHTML = opts(C.REPS, session.rep);
    const r = route().page, open = state.feedback.filter(f => f.status === "Open").length;
    const tabs = [["handoffs", "Handoffs"], ...(session.role === "marketing" ? [["new", "New handoff"], ["campaigns", "Campaigns"]] : []), ["feedback", `Feedback (${open} open)`], ...(session.role === "manager" ? [["analytics", "Analytics"]] : [])];
    $("#nav").innerHTML = tabs.map(([p, l]) => `<a href="#/${p}"${p === r || (r === "handoff" && p === "handoffs") ? ' aria-current="page"' : ""}>${esc(l)}</a>`).join("");
  }

  const conf = v => (v == null ? "n/a" : v + "%");
  const meter = v => `<span class="meter" role="img" aria-label="Confidence ${conf(v)}"><i style="width:${v == null ? 0 : v}%"></i></span> <b>${conf(v)}</b>`;
  // the "what sales needs" fields, used by both the new-handoff form and the edit form (p = existing values, k = id prefix)
  const profileFields = (p, k) => `<div class="two">
    <div><label for="${k}src">Lead source</label><input id="${k}src" name="source" value="${esc(p.source)}" placeholder="Instagram ad, trade show, webinar"></div>
    <div><label for="${k}int">Product asked about</label><select id="${k}int" name="interest">${opts(C.PRODUCTS, p.interest)}</select></div>
    <div><label for="${k}score">Interest level (1 low to 5 high)</label><select id="${k}score" name="intent">${opts(["1", "2", "3", "4", "5"], String(p.intent))}</select></div>
    <div><label for="${k}conf">Confidence rate: chance they buy (0 to 100%)</label><input id="${k}conf" name="confidence" type="number" min="0" max="100" step="1" value="${p.confidence == null ? 50 : p.confidence}"></div>
    <div><label for="${k}dec">Role in the buying decision</label><select id="${k}dec" name="decision">${opts(C.DECISION, p.decision)}</select></div>
    <div><label for="${k}cm">Best way to reach them</label><select id="${k}cm" name="contactMethod">${opts(C.CONTACT, p.contactMethod)}</select></div>
    <div><label for="${k}best">Best time to reach them</label><input id="${k}best" name="bestTime" value="${esc(p.bestTime)}"></div>
    <div><label for="${k}vol">Expected volume / size</label><input id="${k}vol" name="volume" value="${esc(p.volume)}" placeholder="e.g. 2 cases a month, 150 guests"></div></div>
    <label for="${k}bg">Background on the lead and their business</label><textarea id="${k}bg" name="background">${esc(p.background)}</textarea>
    <label for="${k}pp">Pain points and what they want</label><textarea id="${k}pp" name="painPoints">${esc(p.painPoints)}</textarea>
    <label for="${k}eng">What they did (opens, clicks, visits)</label><input id="${k}eng" name="engagement" value="${esc(p.engagement)}">
    <label for="${k}notes">Notes for sales (what they said or asked)</label><textarea id="${k}notes" name="notes">${esc(p.notes)}</textarea>`;
  const BLANK = { source: "", interest: "Blanco", intent: 3, confidence: 50, decision: "Unknown", contactMethod: "Email", background: "", painPoints: "", volume: "", engagement: "", notes: "", bestTime: "" };

  const money = v => (v == null ? "n/a" : "$" + Math.round(v).toLocaleString("en-US"));
  const today = () => new Date().toISOString().slice(0, 10);
  const isOverdue = h => !!(h.sales.nextStepDate && h.sales.nextStepDate < today() && ["Accepted", "Contacted", "Meeting set"].includes(h.status));
  const dealOf = d => ({ probability: d.probability, dealValue: d.dealValue, nextStep: d.nextStep, nextStepDate: d.nextStepDate, competitor: d.competitor, timeline: d.timeline, notes: d.salesNotes });
  const dealFields = (p, k) => `<div class="two">
    <div><label for="${k}prob">Win probability (0 to 100%)</label><input id="${k}prob" name="probability" type="number" min="0" max="100" step="1" value="${p.probability == null ? "" : p.probability}"></div>
    <div><label for="${k}val">Estimated first-order value ($)</label><input id="${k}val" name="dealValue" type="number" min="0" step="50" value="${p.dealValue == null ? "" : p.dealValue}"></div>
    <div><label for="${k}ns">Next step</label><input id="${k}ns" name="nextStep" value="${esc(p.nextStep)}" placeholder="e.g. Send pricing example"></div>
    <div><label for="${k}nd">Next step date</label><input id="${k}nd" name="nextStepDate" type="date" value="${esc(p.nextStepDate)}"></div>
    <div><label for="${k}comp">Competitor they use now</label><input id="${k}comp" name="competitor" value="${esc(p.competitor)}"></div>
    <div><label for="${k}tl">Decision timeline</label><input id="${k}tl" name="timeline" value="${esc(p.timeline)}"></div></div>
    <label for="${k}sn">Sales notes</label><textarea id="${k}sn" name="salesNotes">${esc(p.notes)}</textarea>`;

  // ---------- pages ----------
  function handoffs() {
    const mine = session.role === "sales";
    let list = state.handoffs.filter(h => filter === "All" || h.status === filter);
    if (mine) list = list.filter(h => h.assignedTo === session.rep || (h.status === "Submitted" && !h.assignedTo));
    const m = C.metrics(state), mkt = session.role === "marketing";
    const sum = mkt ? `<div class="grid g4" style="margin-bottom:1rem">${[["Leads handed off", m.total], ["Avg confidence (active)", m.avgConfidenceActive == null ? "n/a" : Math.round(m.avgConfidenceActive) + "%"], ["High confidence, not yet accepted", m.highConfidenceWaiting], ["Profile updates sales hasn't seen", m.updatesPending]].map(([l, v]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("")}</div><p><a class="btn" href="#/new">+ Add a lead</a> <span class="muted">Open any lead to update its profile (confidence, background, pain points) and sales is notified.</span></p>` : "";
    const my = state.handoffs.filter(h => h.assignedTo === session.rep && ["Accepted", "Contacted", "Meeting set"].includes(h.status));
    const ssum = mine ? `<div class="grid g4" style="margin-bottom:1rem">${[["Waiting for you to accept", state.handoffs.filter(h => h.status === "Submitted" && (!h.assignedTo || h.assignedTo === session.rep)).length], ["Your open deals", my.length], ["Pipeline value", money(my.reduce((a, h) => a + (h.sales.dealValue || 0), 0))], ["Next steps overdue", my.filter(isOverdue).length], ["Marketing updates to review", state.handoffs.filter(h => h.assignedTo === session.rep && h.pendingUpdate).length]].map(([l, v]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("")}</div>` : "";
    const role = session.role, rep = session.rep;
    const row = h => {
      const open = !C.TERMINAL.includes(h.status) && h.status !== "Returned", working = ["Accepted", "Contacted", "Meeting set"].includes(h.status);
      const owner = (role === "marketing" || role === "manager")
        ? `<select class="inl" data-inline="owner" data-id="${h.id}" aria-label="Owner for ${esc(h.lead.name)}"${open ? "" : ` disabled title="${esc(h.status)}: this handoff is closed, so the owner can't change."`}><option value=""${h.assignedTo ? "" : " selected"}${h.status === "Submitted" && open ? "" : " disabled"}>${h.status === "Submitted" || !open ? "Unassigned" : "Unassigned (only before accepted)"}</option>${C.REPS.map(r => `<option${r === h.assignedTo ? " selected" : ""}>${esc(r)}</option>`).join("")}</select>`
        : esc(h.assignedTo || "Unassigned");
      const targets = h.status === "Submitted" && !h.assignedTo ? ["Accepted"] : C.NEXT[h.status];
      const canStatus = role === "sales" && targets.length && (h.assignedTo === rep || (h.status === "Submitted" && !h.assignedTo));
      const status = canStatus ? `<select class="inl" data-inline="status" data-id="${h.id}" aria-label="Status for ${esc(h.lead.name)}"><option selected>${esc(h.status)}</option>${targets.map(t => `<option>${esc(t)}</option>`).join("")}</select>` : pill(h.status);
      const editable = role === "sales" && h.assignedTo === rep && working;
      const win = editable ? `<input class="inl" type="number" min="0" max="100" data-inline="prob" data-id="${h.id}" value="${h.sales.probability == null ? "" : h.sales.probability}" aria-label="Win probability % for ${esc(h.lead.name)}" placeholder="%">` : conf(h.sales.probability);
      const next = editable ? `<input class="inl wide" data-inline="next" data-id="${h.id}" value="${esc(h.sales.nextStep)}" aria-label="Next step for ${esc(h.lead.name)}" placeholder="Next step">` : esc(h.sales.nextStep || "—");
      const brief = h.brief ? `<a href="#/handoff/${h.id}">View</a> <span class="muted">(${h.brief.source === "ai" ? "AI" : "Mock"}${C.briefStale(h) ? ", out of date" : ""})</span>` : role !== "manager" ? `<button class="sec sm" data-act="mock" data-id="${h.id}">Generate</button>` : "None";
      return `<tr><td><a href="#/handoff/${h.id}"><b>${esc(h.lead.name)}</b></a><br><span class="muted">${esc(h.lead.company)}</span></td><td>${esc(camp(h.campaignId).name)}</td><td>${status}</td><td>${owner}</td>${mine ? `<td>${win}<br><span class="muted">${money(h.sales.dealValue)}</span></td><td>${next}${h.sales.nextStepDate ? `<br><span class="${isOverdue(h) ? "err" : "muted"}">${esc(h.sales.nextStepDate)}${isOverdue(h) ? " (overdue)" : ""}</span>` : ""}</td>` : `<td>${meter(h.marketing.confidence)}<br><span class="muted">${esc(h.marketing.decision)}</span></td><td class="muted">${esc((h.marketing.background || "—").slice(0, 70))}${(h.marketing.background || "").length > 70 ? "…" : ""}</td>`}<td>${h.salesNotice && !mine ? '<span class="pill s-Accepted">Sales update</span> ' : ""}${h.pendingUpdate ? '<span class="pill s-Returned">Updated</span> ' : ""}${brief}</td><td>${when(h.updatedAt)}</td></tr>`;
    };
    return `<h2>${mine ? "Sales dashboard, " + esc(session.rep) : mkt ? "Marketing dashboard" : "Shared handoff tracker"}</h2>${sum}${ssum}
    <p class="muted">${mine ? "Change status, win probability and next step right in the table. Shows what is assigned to you plus new unassigned handoffs you can accept." : role === "manager" ? "Use the Owner dropdown to assign or reassign a lead." : "Everyone sees the same list. Use the Owner dropdown to assign a lead."}</p>
    <div class="row" role="group" aria-label="Filter by status">${["All", ...C.STATUSES].map(s => `<button class="${s === filter ? "" : "sec"}" data-filter="${esc(s)}" aria-pressed="${s === filter}">${esc(s)}${s === "All" ? "" : " (" + state.handoffs.filter(h => h.status === s).length + ")"}</button>`).join("")}</div>
    <div class="tblwrap" style="margin-top:.8rem"><table><thead><tr><th>Lead</th><th>Campaign</th><th>Status</th><th>Owner</th>${mine ? "<th>Win prob.</th><th>Next step</th>" : "<th>Confidence</th><th>Background</th>"}<th>Brief</th><th>Updated</th></tr></thead><tbody>
    ${list.map(row).join("") || `<tr><td colspan="8">Nothing here for this filter.</td></tr>`}
    </tbody></table></div>`;
  }

  function newHandoff() {
    if (session.role !== "marketing") return `<h2>New handoff</h2><p class="err">Only Marketing creates handoffs. Switch the demo role to Marketing.</p>`;
    const today = state.campaigns;
    return `<h2>New handoff</h2><p class="muted">One standard form so sales gets the same information every time. Use fictional data.</p>
    <form data-form="newHandoff" class="card" novalidate>
      <h3>Campaign</h3><label for="f-camp">Campaign</label><select id="f-camp" name="campaignId">${today.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select>
      <p class="muted">Need a new one? <a href="#/campaigns">Create a campaign</a>.</p>
      <label for="f-own">Assign owner (optional)</label><select id="f-own" name="assignedTo"><option value="">Leave unassigned (any rep can accept)</option>${C.REPS.map(r => `<option>${esc(r)}</option>`).join("")}</select>
      <h3>Lead</h3><div class="two">
        <div><label for="f-name">Name</label><input id="f-name" name="name" autocomplete="off"></div><div><label for="f-title">Title</label><input id="f-title" name="title"></div>
        <div><label for="f-co">Company</label><input id="f-co" name="company"></div><div><label for="f-type">Kind of business</label><select id="f-type" name="type">${Object.entries(C.VENUES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></div>
        <div><label for="f-city">City</label><input id="f-city" name="city"></div><div><label for="f-email">Email (fictional, @example.com)</label><input id="f-email" name="email" type="email"></div></div>
      <h3>What sales needs to know</h3>${profileFields(BLANK, "f-")}
      <p id="formErr" class="err" role="alert"></p>
      <button type="submit">Submit handoff to sales</button> <span class="muted">You can generate the sales brief on the next screen.</span>
    </form>`;
  }

  function campaigns() {
    const m = C.metrics(state);
    return `<h2>Campaigns</h2>
    ${session.role === "marketing" ? `<form data-form="newCampaign" class="card"><h3>Add a campaign</h3><div class="two">
      <div><label for="c-name">Name</label><input id="c-name" name="name"></div><div><label for="c-ch">Channel</label><input id="c-ch" name="channel" placeholder="Email, event, social"></div>
      <div><label for="c-aud">Audience</label><input id="c-aud" name="audience"></div><div><label for="c-off">Offer</label><input id="c-off" name="offer"></div></div>
      <button type="submit" style="margin-top:.7rem">Add campaign</button></form>` : `<p class="muted">Only Marketing adds campaigns.</p>`}
    <div class="tblwrap"><table><thead><tr><th>Campaign</th><th>Channel</th><th>Audience</th><th>Offer</th><th>Handoffs</th><th>Won</th></tr></thead><tbody>
    ${state.campaigns.map(c => { const r = m.byCampaign.find(x => x.id === c.id); return `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.channel)}</td><td>${esc(c.audience)}</td><td>${esc(c.offer)}</td><td>${r.handoffs}</td><td>${r.won}</td></tr>`; }).join("")}</tbody></table></div>`;
  }

  function briefHtml(b) {
    const s = b.sections;
    return `<div class="card"><div class="row" style="justify-content:space-between"><h3>Sales brief</h3>${srcTag(b)}</div>
      <p class="muted">Generated ${when(b.generatedAt)}. ${b.source === "ai" ? "Written by an AI model from the fictional handoff data. Review before using." : "Filled in from a fixed template using this handoff's fields. No AI was used."}</p>
      <p><b>${esc(s.headline)}</b></p><h3>Snapshot</h3>${kv(s.snapshot)}<h3>Why now</h3><p>${esc(s.whyNow)}</p>
      <h3>Talking points</h3>${kv(s.talkingPoints)}<h3>Likely objections</h3><ul class="plain">${s.likelyObjections.map(o => `<li><b>${esc(o.category)}</b>${o.heardInCampaign ? ` <span class="muted">(heard ${o.heardInCampaign}× in this campaign)</span>` : ""}: ${esc(o.response)}</li>`).join("")}</ul>
      <h3>Good opening questions</h3>${kv(s.openingQuestions)}<h3>Next step</h3><p>${esc(s.nextStep)}</p><h3>Guardrails</h3>${kv(s.guardrails)}
      ${s.dataUsed ? `<details><summary>Data used</summary>${kv(s.dataUsed)}</details>` : ""}</div>`;
  }

  function feedbackHtml(f, withLink) {
    const h = C.find(state, f.handoffId), done = f.status === "Resolved";
    return `<div class="fb${done ? " done" : ""}"><div class="row"><b>${esc(C.FEEDBACK_TYPES[f.type])}${f.category ? " · " + esc(f.category) : ""}</b> ${pill(f.status)} <span class="muted">from ${esc(f.by)}, ${when(f.createdAt)}</span>${withLink && h ? ` <a href="#/handoff/${h.id}">${esc(h.lead.company)}</a>` : ""}</div>
      <p>${esc(f.text)}</p>${f.quote ? `<p><q>${esc(f.quote)}</q></p>` : ""}
      ${done ? `<p><b>Marketing response (${esc(C.RESOLUTIONS[f.resolution.kind])}):</b> ${esc(f.resolution.note)}</p>`
        : session.role === "marketing" ? `<form data-form="resolve" data-id="${f.id}"><div class="two"><div><label for="r-k-${f.id}">What did marketing do?</label><select id="r-k-${f.id}" name="kind">${Object.entries(C.RESOLUTIONS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></div><div><label for="r-n-${f.id}">Details</label><input id="r-n-${f.id}" name="note"></div></div><button type="submit" style="margin-top:.5rem">Resolve</button></form>`
        : `<p class="muted">Waiting for Marketing to respond.</p>`}</div>`;
  }

  function detail(id) {
    const h = C.find(state, id); if (!h) return `<h2>Not found</h2><p><a href="#/handoffs">Back to handoffs</a></p>`;
    const role = session.role, rep = session.rep, mine = h.assignedTo === rep, fbs = state.feedback.filter(f => f.handoffId === id);
    const actions = [];
    if (role === "sales" && h.status === "Submitted") actions.push(`<button data-act="accept" data-id="${id}">Accept handoff as ${esc(rep)}</button>`);
    if (role === "sales" && mine) C.NEXT[h.status].forEach(to => actions.push(`<button class="${to === "Lost" || to === "Returned" ? "sec" : ""}" data-act="status" data-id="${id}" data-to="${to}">${to === "Returned" ? "Return to marketing" : "Mark " + esc(to)}</button>`));
    if (role === "marketing" && h.status === "Returned") actions.push(`<button data-act="resubmit" data-id="${id}">Resubmit to sales</button>`);
    return `<p><a href="#/handoffs">← All handoffs</a></p><h2>${esc(h.lead.name)} · ${esc(h.lead.company)} ${pill(h.status)}</h2>
    ${h.pendingUpdate ? `<div class="card" style="border-color:var(--gold)" role="status"><b>Marketing updated this lead ${when(h.pendingUpdate.at)}:</b> ${esc(h.pendingUpdate.summary)}. ${role === "sales" && mine ? `<button data-act="ack" data-id="${id}">Got it</button>` : `<span class="muted">Waiting for ${esc(h.assignedTo || "the assigned rep")} to see it.</span>`}</div>` : ""}
    ${h.salesNotice ? `<div class="card" style="border-color:var(--gold)" role="status"><b>${esc(h.salesNotice.by)} updated the deal ${when(h.salesNotice.at)}:</b> ${esc(h.salesNotice.summary)}. ${role === "marketing" ? `<button data-act="ackSales" data-id="${id}">Got it</button>` : ""}</div>` : ""}
    ${C.briefStale(h) ? `<div class="card" style="border-color:var(--gold)" role="status">The lead profile changed after this brief was generated. ${role !== "manager" ? "Regenerate the brief so it matches." : ""}</div>` : ""}
    <div class="grid g2"><div class="card"><h3>Lead and marketing information</h3>
      <p>Confidence they will buy: ${meter(h.marketing.confidence)}</p>
      ${kv([`${h.lead.title || "No title"}, ${C.VENUES[h.lead.type]}${h.lead.city ? ", " + h.lead.city : ""}`, h.lead.email, `Role in the decision: ${h.marketing.decision}`, `Campaign: ${camp(h.campaignId).name}`, `Source: ${h.marketing.source || "not recorded"}`, `Product asked about: ${h.marketing.interest}`, `Interest level: ${h.marketing.intent}/5`, `Expected volume: ${h.marketing.volume || "not recorded"}`, `Activity: ${h.marketing.engagement || "not recorded"}`, `Reach them by ${h.marketing.contactMethod}${h.marketing.bestTime ? ", " + h.marketing.bestTime : ""}`])}
      <p><b>Background:</b> ${esc(h.marketing.background || "not recorded")}</p><p><b>Pain points:</b> ${esc(h.marketing.painPoints || "not recorded")}</p>
      <p><b>Notes from marketing:</b> ${esc(h.marketing.notes)}</p></div>
    <div class="card"><h3>Owner and next action</h3><p>Owner: <b>${esc(h.assignedTo || "Unassigned")}</b></p>
      ${(role === "manager" || role === "marketing") && !C.TERMINAL.includes(h.status) && h.status !== "Returned" ? `<label for="asg">Assign owner</label><div class="row"><select id="asg" style="width:auto"><option value="">Unassigned</option>${C.REPS.map(r => `<option${r === h.assignedTo ? " selected" : ""}>${esc(r)}</option>`).join("")}</select><button data-act="assign" data-id="${id}">Save owner</button></div>` : ""}
      <div class="row" style="margin-top:.5rem">${actions.join("") || `<span class="muted">${role === "sales" && !mine && h.status !== "Submitted" ? "This one belongs to another rep." : role === "manager" ? "Managers assign owners and review; reps work the lead." : "No action for your role right now."}</span>`}</div>
      ${role === "sales" && mine && (h.status === "Contacted" || h.status === "Accepted" || h.status === "Meeting set") ? `<label for="stnote">Note for Lost or Returned (required for those)</label><input id="stnote">` : ""}
      ${role === "sales" && h.status === "Submitted" && h.assignedTo && h.assignedTo !== rep ? `<p class="err">Assigned to ${esc(h.assignedTo)}. Switch rep to accept.</p>` : ""}</div></div>
    <div class="card"><h3>Deal profile (from sales)</h3>${["Submitted", "Returned"].includes(h.status) && !h.sales.nextStep ? `<p class="muted">Sales fills this in after accepting the handoff.</p>` : `${kv([`Win probability: ${conf(h.sales.probability)} (marketing's confidence: ${conf(h.marketing.confidence)})`, `Estimated first-order value: ${money(h.sales.dealValue)}`, `Next step: ${h.sales.nextStep || "none set"}${h.sales.nextStepDate ? " on " + h.sales.nextStepDate + (isOverdue(h) ? " (OVERDUE)" : "") : ""}`, `Competitor now: ${h.sales.competitor || "not recorded"}`, `Decision timeline: ${h.sales.timeline || "not recorded"}`, `Sales notes: ${h.sales.notes || "none"}`])}`}
      ${role === "sales" && mine && !C.TERMINAL.includes(h.status) && h.status !== "Submitted" ? `<details><summary>Update deal profile</summary><form data-form="updateDeal" data-id="${id}" novalidate>${dealFields(h.sales, "d-")}<p class="err" id="dealErr" role="alert"></p><button type="submit">Save deal update</button> <span class="muted">Marketing sees a notice.</span></form></details>` : ""}</div>
    <div class="card"><h3>Activity log</h3>${h.activities.slice().reverse().map(a => `<p><b>${esc(a.type)}</b> · ${esc(a.by)} · ${when(a.at)}<br>${esc(a.note)}</p>`).join("") || `<p class="muted">No calls, emails, meetings or tastings logged yet.</p>`}
      ${role === "sales" && mine && h.status !== "Submitted" && h.status !== "Returned" ? `<form data-form="activity" data-id="${id}"><div class="two"><div><label for="a-t">Type</label><select id="a-t" name="type">${opts(C.ACTIVITY)}</select></div><div><label for="a-n">What happened</label><input id="a-n" name="note"></div></div><button type="submit" style="margin-top:.5rem">Log activity</button></form>` : ""}</div>
    ${role === "marketing" && !C.TERMINAL.includes(h.status) ? `<details class="card"><summary>Update lead profile (marketing)</summary><form data-form="updateLead" data-id="${id}" novalidate>
      <div class="two"><div><label for="u-name">Name</label><input id="u-name" name="name" value="${esc(h.lead.name)}"></div><div><label for="u-title">Title</label><input id="u-title" name="title" value="${esc(h.lead.title)}"></div>
      <div><label for="u-co">Company</label><input id="u-co" name="company" value="${esc(h.lead.company)}"></div><div><label for="u-type">Kind of business</label><select id="u-type" name="type">${Object.entries(C.VENUES).map(([k, v]) => `<option value="${k}"${k === h.lead.type ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></div>
      <div><label for="u-city">City</label><input id="u-city" name="city" value="${esc(h.lead.city)}"></div><div><label for="u-email">Email</label><input id="u-email" name="email" type="email" value="${esc(h.lead.email)}"></div></div>
      ${profileFields(h.marketing, "u-")}<p class="err" id="updErr" role="alert"></p><button type="submit">Save profile update</button> <span class="muted">${h.status === "Submitted" ? "Sales hasn't accepted it yet, so this just updates the handoff." : "Sales will see a notice on this lead."}</span></form></details>` : ""}
    <div class="card"><h3>Sales brief</h3>${h.brief ? "" : `<p class="muted">No brief yet.</p>`}
      <div class="row">${role !== "manager" ? `<button data-act="mock" data-id="${id}" class="${h.brief ? "sec" : ""}">${h.brief ? "Regenerate mock brief" : "Generate mock brief"}</button>${ai.ai ? `<button data-act="ai" data-id="${id}" ${busy ? "disabled" : ""}>${busy ? "Asking AI…" : "Generate with AI (" + esc(ai.model) + ")"}</button>` : `<span class="muted">Live AI is off (no key set), so the mock brief is used. See connect/README.md.</span>`}` : `<span class="muted">Managers view briefs; marketing and sales generate them.</span>`}</div></div>
    ${h.brief ? briefHtml(h.brief) : ""}
    <div class="card"><h3>Feedback and objections</h3>${fbs.map(f => feedbackHtml(f)).join("") || `<p class="muted">None yet.</p>`}
      ${role === "sales" && mine ? `<form data-form="feedback" data-id="${id}"><h3>Record what you learned</h3><div class="two"><div><label for="fb-t">Type</label><select id="fb-t" name="type">${Object.entries(C.FEEDBACK_TYPES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></div>
        <div><label for="fb-c">Objection category (for objections)</label><select id="fb-c" name="category">${opts(C.CATEGORIES)}</select></div></div>
        <label for="fb-x">What happened</label><textarea id="fb-x" name="text"></textarea><label for="fb-q">Customer's own words (optional)</label><input id="fb-q" name="quote"><button type="submit" style="margin-top:.6rem">Save feedback</button></form>` : ""}</div>
    <div class="card"><h3>Sales Academy practice idea <span class="pill">read-only draft</span></h3><p class="muted">Explores how a real objection could feed the AI Sales Coach. It is only text to copy. It is not added to the Academy, and the Coach is unchanged.</p>
      <details><summary>Show draft practice scenario</summary><pre style="white-space:pre-wrap">${esc(JSON.stringify(C.practiceDraft(state, id), null, 2))}</pre></details> <a href="../index.html">Open the Sales Academy</a></div>
    <details class="card"><summary>History</summary><ul class="plain hist">${h.history.slice().reverse().map(e => `<li>${new Date(e.at).toLocaleString()} · ${esc(e.by)}: ${esc(e.text)}</li>`).join("")}</ul></details>`;
  }

  function feedbackPage() {
    const open = state.feedback.filter(f => f.status === "Open"), done = state.feedback.filter(f => f.status === "Resolved");
    return `<h2>Sales-to-marketing feedback</h2><p class="muted">${session.role === "marketing" ? "Resolve each item and say what you did. Sales sees your answer." : "Objections and notes sales has logged. Marketing resolves them."}</p>
    <h3>Open (${open.length})</h3>${open.map(f => feedbackHtml(f, true)).join("") || `<p class="muted">Nothing open.</p>`}<h3>Resolved (${done.length})</h3>${done.map(f => feedbackHtml(f, true)).join("") || `<p class="muted">Nothing resolved yet.</p>`}`;
  }

  function analytics() {
    if (session.role !== "manager") return `<h2>Analytics</h2><p class="err">Analytics is the Manager view. Switch the demo role to Manager.</p>`;
    const m = C.metrics(state), pct = x => x == null ? "n/a" : Math.round(x * 100) + "%", hrs = x => x == null ? "n/a" : (x < 48 ? x.toFixed(1) + " h" : (x / 24).toFixed(1) + " days");
    const max = Math.max(1, ...Object.values(m.objections), ...C.STATUSES.map(s => m.byStatus[s]));
    const bars = obj => Object.entries(obj).map(([k, v]) => `<div class="bar"><span>${esc(k)}</span><i style="width:${v / max * 220}px"></i><b>${v}</b></div>`).join("");
    return `<h2>Manager analytics</h2><div class="grid g4">
      ${[["Total handoffs", m.total], ["Active", m.active], ["Win rate (won ÷ closed)", pct(m.winRate)], ["Accepted by sales", pct(m.acceptRate)], ["Avg time to accept", hrs(m.avgHoursToAccept)], ["Waiting over 48 h", m.waitingOver48h], ["Returned to marketing", m.returned], ["Feedback resolved", `${m.feedbackResolved} of ${m.feedbackResolved + m.feedbackOpen} (${pct(m.feedbackResolveRate)})`], ["Avg time to resolve", hrs(m.avgHoursToResolve)]].map(([l, v]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("")}</div>
    <h3 style="margin-top:1rem">Sales pipeline</h3><div class="grid g4">${[["Open deals", m.pipeline.count], ["Pipeline value", money(m.pipeline.value)], ["Weighted by win probability", money(m.pipeline.weighted)], ["Won value", money(m.pipeline.wonValue)], ["Next steps overdue", m.pipeline.overdue], ["Open deals with no next step", m.pipeline.noNextStep], ["No activity in 5+ days", m.pipeline.quiet], ["Sales vs marketing confidence", m.pipeline.confidenceGap == null ? "n/a" : (m.pipeline.confidenceGap > 0 ? "+" : "") + Math.round(m.pipeline.confidenceGap) + " pts"]].map(([l, v]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("")}</div>
    <p class="muted">Confidence gap: average of the rep's win probability minus marketing's confidence on open deals. Negative means sales is less optimistic than marketing.</p>
    <div class="grid g2" style="margin-top:1rem"><div class="card"><h3>Handoffs by status</h3>${bars(m.byStatus)}</div><div class="card"><h3>Objections by category</h3>${bars(m.objections)}</div></div>
    <div class="grid g2"><div class="card"><h3>By campaign</h3><table><thead><tr><th>Campaign</th><th>Handoffs</th><th>Won</th><th>Lost</th><th>Open feedback</th></tr></thead><tbody>${m.byCampaign.map(c => `<tr><td>${esc(c.name)}</td><td>${c.handoffs}</td><td>${c.won}</td><td>${c.lost}</td><td>${c.openFeedback}</td></tr>`).join("")}</tbody></table></div>
    <div class="card"><h3>By rep</h3><table><thead><tr><th>Rep</th><th>Active</th><th>Won</th><th>Pipeline</th><th>Overdue</th></tr></thead><tbody>${m.byRep.map(r => `<tr><td>${esc(r.rep)}</td><td>${r.active}</td><td>${r.won}</td><td>${money(r.pipeline)}</td><td>${r.overdue}</td></tr>`).join("")}</tbody></table>
    <h3 style="margin-top:1rem">Briefs</h3><p>Mock-generated: ${m.briefs.mock} · AI-generated: ${m.briefs.ai} · none yet: ${m.briefs.none}</p></div></div>
    <p class="muted">All numbers are computed from this browser's demo data right now.</p>`;
  }

  const marketingOf = d => ({ source: d.source, interest: d.interest, intent: d.intent, confidence: d.confidence, decision: d.decision, contactMethod: d.contactMethod, background: d.background, painPoints: d.painPoints, volume: d.volume, engagement: d.engagement, notes: d.notes, bestTime: d.bestTime });

  // ---------- draw and wire ----------
  function render() {
    chrome(); const r = route(); let h;
    if (r.page === "new") h = newHandoff(); else if (r.page === "campaigns") h = campaigns(); else if (r.page === "feedback") h = feedbackPage();
    else if (r.page === "analytics") h = analytics(); else if (r.page === "handoff") h = detail(r.id); else h = handoffs();
    const keep = document.activeElement && document.activeElement.id;
    $("#app").innerHTML = h; if (keep && $("#" + keep)) $("#" + keep).focus();
  }
  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
  document.addEventListener("click", async e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.role) { session.role = b.dataset.role; persist(); if (route().page === "analytics" && session.role !== "manager") location.hash = "#/handoffs"; if (route().page === "new" && session.role !== "marketing") location.hash = "#/handoffs"; return render(); }
    if (b.id === "resetBtn") { if (confirm("Delete this browser's Corrido Connect demo data and start over?")) { state = C.seed(); persist(); location.hash = "#/handoffs"; render(); toast("Demo data reset."); } return; }
    if (b.dataset.filter) { filter = b.dataset.filter; return render(); }
    const id = b.dataset.id, a = b.dataset.act; if (!a) return;
    if (a === "accept") result(C.accept(state, id, session.role, session.rep), "Accepted. It's yours now.");
    else if (a === "status") { const note = ($("#stnote") || {}).value; const to = b.dataset.to; result(C.setStatus(state, id, session.role, session.rep, to, note), `Status is now ${to}.`); }
    else if (a === "ackSales") result(C.ackSalesUpdate(state, id, session.role), "Marked as seen.");
    else if (a === "ack") result(C.ackUpdate(state, id, session.role, session.rep), "Marked as seen.");
    else if (a === "resubmit") result(C.resubmit(state, id, session.role), "Resubmitted to sales.");
    else if (a === "assign") result(C.assign(state, id, session.role, $("#asg").value), "Assigned.");
    else if (a === "mock") result(C.generateMock(state, id, session.role), "Mock brief created (not AI).");
    else if (a === "ai") {
      busy = true; render();
      try {
        const h = C.find(state, id), r = await fetch("/api/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead: h.lead, marketing: h.marketing, campaign: camp(h.campaignId), priorObjections: state.feedback.filter(f => f.type === "objection").map(f => ({ category: f.category, text: f.text })) }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error || "AI request failed");
        const out = C.setBrief(state, id, session.role, "ai", j.sections, j.model); busy = false; result(out, "AI brief created.");
      } catch (err) { busy = false; toast("AI brief failed (" + err.message + "). Using the mock brief instead.", true); C.generateMock(state, id, session.role); persist(); render(); }
    }
  });
  document.addEventListener("change", e => {   // quick edits straight from the table
    const el = e.target.closest("[data-inline]"); if (!el) return;
    const id = el.dataset.id, k = el.dataset.inline, role = session.role, rep = session.rep;
    if (k === "owner") return void result(C.assign(state, id, role, el.value), el.value ? "Assigned to " + el.value + "." : "Unassigned.");
    if (k === "status") {
      const to = el.value; if (to === "Accepted") return void result(C.accept(state, id, role, rep), "Accepted. It's yours now.");
      let note = ""; if (to === "Lost" || to === "Returned") { note = prompt(to === "Returned" ? "Why are you returning it? Marketing will see this." : "Why was it lost?") || ""; if (!note.trim()) { render(); return toast("A reason is needed to mark it " + to + ".", true); } }
      return void result(C.setStatus(state, id, role, rep, to, note), "Status is now " + to + ".");
    }
    if (k === "prob") return void result(C.updateDeal(state, id, role, rep, { probability: el.value }), "Win probability saved.");
    if (k === "next") return void result(C.updateDeal(state, id, role, rep, { nextStep: el.value }), "Next step saved.");
  });
  $("#repSel").addEventListener("change", e => { session.rep = e.target.value; persist(); render(); });
  document.addEventListener("submit", e => {
    e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f)), kind = f.dataset.form;
    if (kind === "updateDeal") {
      const r = C.updateDeal(state, f.dataset.id, session.role, session.rep, dealOf(d));
      if (!r.ok) { $("#dealErr").textContent = r.error; return; }
      persist(); render(); toast("Deal updated: " + r.changes.join(", ")); return;
    }
    if (kind === "activity") return void result(C.addActivity(state, f.dataset.id, session.role, session.rep, d), "Activity logged.");
    if (kind === "updateLead") {
      const r = C.updateLead(state, f.dataset.id, session.role, { lead: { name: d.name, title: d.title, company: d.company, type: d.type, city: d.city, email: d.email }, marketing: marketingOf(d) });
      if (!r.ok) { $("#updErr").textContent = r.error; return; }
      persist(); render(); toast("Lead profile updated: " + r.changes.join(", ")); return;
    }
    if (kind === "newHandoff") {
      const r = C.createHandoff(state, session.role, { campaignId: d.campaignId, assignedTo: d.assignedTo, lead: { name: d.name, title: d.title, company: d.company, type: d.type, city: d.city, email: d.email }, marketing: marketingOf(d) });
      if (!r.ok) { $("#formErr").textContent = r.error; return; }
      persist(); location.hash = "#/handoff/" + r.id; toast("Handoff submitted. Now generate the sales brief.");
    } else if (kind === "newCampaign") result(C.createCampaign(state, session.role, d), "Campaign added.");
    else if (kind === "feedback") result(C.addFeedback(state, f.dataset.id, session.role, session.rep, d), "Feedback saved. Marketing can see it.");
    else if (kind === "resolve") result(C.resolveFeedback(state, f.dataset.id, session.role, d), "Feedback resolved.");
  });
  render();
})();
