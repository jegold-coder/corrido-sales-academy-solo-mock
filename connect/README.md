# Corrido Connect (local prototype)

Marketing-to-sales handoff module for Tequila Corrido. **Local only. Fictional data only.** Not deployed, not wired into the Sales Academy, not approved by Tequila Corrido.

## Run it

```bash
node tools/connect-server.js
```

Then open <http://localhost:5173/connect/>. The original Sales Academy is at <http://localhost:5173/> (and the "← Sales Academy" link in the header). No install step: Node only. Set `PORT=xxxx` to change the port.

## Live AI briefs (optional)

Without a key, "Generate mock brief" uses a deterministic template and is labeled **Mock-generated**. To try a live AI brief:

1. Copy `.env.example` to `.env.local` (Git-ignored) and fill in `GEMINI_API_KEY`. Change `CONNECT_AI_MODEL` if your account cannot use the default.
2. Restart the server. A "Generate with AI" button appears; its output is labeled **AI-generated · model name**.

The key stays in the server process. The browser never sees it. If the AI call fails the page falls back to the mock brief and says so.

## Test it (the 11 steps)

1. Demo role **Marketing** → **Campaigns** → add one (or use a seeded one).
2. **New handoff** → fill the form → submit.
3. On the handoff page → **Generate mock brief**. (Marketing's dashboard also shows average confidence and any updates sales hasn't seen.)
   - **Update the lead later:** as Marketing, open a handoff → **Update lead profile** (confidence rate, decision role, background, pain points, volume, contact preference). If sales already accepted it, the rep sees an "updated" notice and taps **Got it**. The brief is flagged out of date until regenerated. Closed (Won/Lost) handoffs are locked.
4. Role **Sales** (pick a rep) → open the handoff → **Accept**. (If the manager assigned it to another rep, switch rep.)
5. Mark **Contacted**, then **Meeting set**.
6. In "Record what you learned", save an objection with a category and the customer's words.
7. Role **Marketing** → **Feedback** → resolve it with a note.
8. Role **Manager** → **Analytics** (now also shows pipeline value, weighted pipeline, overdue next steps and sales-vs-marketing confidence).

**Sales deal tracking:** as Sales, the dashboard shows your open deals, pipeline value and overdue next steps. On an accepted handoff use **Update deal profile** (win probability, first-order value, next step and date, competitor, timeline, notes) and **Log activity** (call, email, meeting, tasting). Marketing sees the deal info and a notice with **Got it**. Closed deals are locked.

**Quick edits from the table:** Marketing and Manager get an **Owner** dropdown on every open row (assign, reassign, or unassign before acceptance); Marketing can also pick an owner on the New handoff form. Sales gets a **Status** dropdown (only valid next steps; Lost and Returned ask for a reason), editable **Win prob.** and **Next step** boxes on deals they own, and every row has a **Generate** (brief) button or a **View** link. Rules are the same as on the detail page.

Refresh at any point: data and role are kept in this browser's `localStorage`. **Reset demo data** restores the seed.

## Files

| File | What it does |
|---|---|
| `connect/index.html`, `connect.css` | the page and styles |
| `connect/connect-core.js` | all rules: roles, statuses, brief, feedback, metrics, seed data, saving (runs in Node too) |
| `connect/connect-ui.js` | screens and clicks |
| `tools/connect-server.js` | local static server + optional `/api/brief` (127.0.0.1 only, hides dotfiles) |
| `tests/connect.test.js` | `node tests/connect.test.js` |
| `.env.example`, `.gitignore` | key template; ignores `.env*` |

## Sales Academy / Coach

Read-only exploration: each handoff has a "practice idea" that turns its logged objections into a draft scenario (customer, hidden objection, skills to practice). It is only text to copy. `scenarios.js`, `coach.js` and every other existing file are unchanged.

## Known limits

- One browser = one database. Marketing, Sales and Manager are views of the same local data, not separate users. Role rules are enforced in the logic but this is not security.
- Live AI path is untested without a key.
- No Academy link-in (no header button added), no CRM, no email, no real auth, no multi-user sync.
