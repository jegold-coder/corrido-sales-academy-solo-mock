"use strict";
// The 60-second review a rep reads before a sale: the promise, the four bottles at their public prices, do and never, what to say to the usual objections,
// and a per-pour cost calculator that works from the rep's OWN numbers. It never quotes a margin or a wholesale price: those aren't public.
// It is the body of the "Who is Tequila Corrido?" page. Uses globals from the other scripts ($, esc, IMG, LINEUP...) at call time.

const CallCard = (() => {
  const OZ = 29.5735;   // millilitres in a fluid ounce
  // The bar's own maths from the numbers typed in: pours in a bottle, cost per pour and, with a menu price, pour cost and what a bottle brings in.
  function pourMath({ cost, ml, oz, menu }) {
    cost = Number(cost); ml = Number(ml); oz = Number(oz); menu = Number(menu);
    if (!(cost > 0) || !(ml > 0) || !(oz > 0)) return null;
    const pours = Math.floor(ml / (oz * OZ));
    if (pours < 1) return null;
    const out = { pours, perPour: cost / pours };
    if (menu > 0) { out.pct = out.perPour / menu * 100; out.revenue = pours * menu; out.kept = out.revenue - cost; }
    return out;
  }
  const money = n => "$" + n.toFixed(2);
  const SHOP_URL = "https://ilovetequilacorrido.com/products/";   // each bottle in LINEUP carries its shop handle, so a tap opens that bottle's page

  // ---------- the 60-second review ----------
  const DO = ["Ask about their guests and what they pour first.", "Offer 60 seconds, or a quieter time.", "Use the brand's own words and offer a taste.", "Ask for one small, dated next step."];
  const NEVER = ["Serve or encourage anyone under 21.", "Make health claims.", "Invent prices, margins or sales numbers. Confirm in writing.", "Run down the brand they already pour.", "Leave alcohol behind unless the manager is there.", "Promise shipping you haven't confirmed."];
  const IFTHEY = [
    ["“It's too expensive.”", "Do the per-pour maths (below). Offer to confirm terms in writing."],
    ["“We already pour another brand.”", "Don't run it down. Name one real difference and invite a taste."],
    ["“I'm busy right now.”", "Offer 60 seconds, or a day and hour that works."],
    ["“I'm not the one who decides.”", "Ask the best day and time to meet the decision-maker. Leave no bottle."],
    ["“Is it good for you?”", "No health claims. Additive-free, three ingredients, no fake flavors."],
    ["“We don't want it.”", "Don't argue. Ask who their shoppers are and suggest a tiny test."],
  ];
  // More replies from the sales guide. The manager can't reword these (facts.js edits the first six), so they stay fixed.
  const MORE = [
    ["“Never heard of Corrido.”", "That's why you're here first. Offer a tasting for them and their staff."],
    ["“Nobody's asking for it.”", "New brands get found at the shelf. Offer a staff tasting to start the talk."],
    ["“I have no shelf space.”", "Offer a small, dated test. Don't ask for a big order."],
    ["“Tequila's too crowded.”", "Agree. Corrido is additive-free with a story. Offer a side-by-side taste."],
  ];
  // The five buyer types from the sales guide: [who, what they care about, how to win them].
  const BUYERS = [
    ["Numbers", "owners, managers", "margin, speed, repeat sales", "Talk real numbers. Never invent any."],
    ["Experience", "bartenders, GMs", "flavor, cocktails", "Pour a taste."],
    ["Skeptic", "has seen 100 brands", "consistency, support", "Be real, don't oversell, come back."],
    ["Trendsetter", "cocktail bars, boutiques", "story, look", "Lead with the music and rebellion."],
    ["Indifferent", "slammed, distracted", "their time", "One reason, then offer to return."],
  ];
  // A manager can reword the promise, Do, Never and the replies (manager mode > Brand facts), so these are only the starting wording (facts.js keeps the edits).
  Facts.setReview({ promise: "Additive-free. Only three ingredients and no fake flavors.", doList: DO, neverList: NEVER, replies: IFTHEY.map(x => x[1]) });
  // The first sentence of the promise in bold, the rest as it is.
  const promiseLine = t => { const m = String(t).match(/^(.+?[.!?])(\s+[\s\S]*)?$/); return m ? `<b>${esc(m[1])}</b>${esc(m[2] || "")}` : esc(t); };
  // The quick reminders, as the body of the "Who is Tequila Corrido?" page (that page is the review a rep reads before a sale).
  function review() {
    const R = Facts.review(), F = Facts.get();
    return `<div class="card"><h3>Say it in one line</h3><p>${promiseLine(R.promise)}</p>
        <ul class="xlist"><li><b>The name:</b> a corrido is a Mexican ballad. The brand borrows its music-and-rebellion spirit.</li><li><b>The maker:</b> stamped by one of the first female master distillers.</li><li><b>No famous fans:</b> the tequila does the talking, so never claim any.</li></ul></div>
      <div class="card"><h3>Who am I talking to?</h3><ul class="xlist">${BUYERS.map(([n, who, cares, win]) => `<li><b>${n}</b> <small>(${who})</small>: cares about ${cares}. ${win}</li>`).join("")}</ul></div>
      <div class="card"><h3>The four bottles</h3><div class="xlineup">${LINEUP.map(([n, pr, notes, handle, img]) => `<a class="xbottle" href="${SHOP_URL}${handle}" target="_blank" rel="noopener noreferrer"><img src="${IMG}${img}" alt="A bottle of Tequila Corrido ${n}" loading="lazy"><div class="xtext"><b>${n}</b><span class="xprice">${pr}</span><small>${notes}</small><em>Shop page ↗</em></div><span class="sr"> (opens in a new tab)</span></a>`).join("")}</div>
        <p class="note2">These are the public shop prices. Wholesale terms aren't public, so say you'll confirm them in writing.${F.checked ? ` Prices last checked ${Facts.dateLabel(F.checked)}.` : ""}</p></div>
      <div class="card"><h3>How it's made</h3><p><b>Harvest → cook → extract → ferment → distill → age → blend.</b></p>
        <ul class="xlist"><li>100% Blue Weber agave, hand-picked in the Jalisco highlands.</li><li>Slow-cooked in low-pressure autoclaves, natural yeast, double distilled in pot stills.</li><li>Blanco rests 30 days. Reposado is 8 months in mixed oaks. Añejo is 18 months and finishes in merlot barrels.</li></ul></div>
      <div class="ccrow"><div class="card"><h3>Do</h3><ul class="xlist">${R.doList.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div><div class="card"><h3>Never</h3><ul class="xlist nev">${R.neverList.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div></div>
      <div class="card"><h3>If they say…</h3><dl class="ifthey">${IFTHEY.map(([a], i) => `<dt>${a}</dt><dd>${esc(R.replies[i] || IFTHEY[i][1])}</dd>`).join("")}${MORE.map(([a, r]) => `<dt>${a}</dt><dd>${esc(r)}</dd>`).join("")}</dl></div>
      <div class="card"><h3>Sales mindset</h3><ul class="xlist"><li><b>Listen 80%, talk 20%.</b> Ask, don't pitch.</li><li>Find the need they didn't know they had.</li><li>Tell it in four beats: the problem, the dream, the plan, the payoff.</li><li><b>Us vs. them (for you, not for their ears):</b> no additives, a master maestro and quality over price, against fake flavors, mass production and hype.</li></ul></div>
      <details class="card xmerch"><summary><h3>Tequila 101</h3><small>4 quick facts</small></summary>
        <ul class="xlist"><li>Only five Mexican states can make it, Jalisco first. It must be blue agave, certified by the CRT. The NOM number on the label names the distillery.</li><li>"100% blue agave" is the real thing. A mixto is only 51% agave.</li><li>Highlands agave is sweeter and floral. Lowlands is earthier and peppery.</li><li>Blanco is unaged. Reposado rests 2 to 12 months, Añejo 1 to 3 years, Extra Añejo 3 or more.</li></ul></details>
      <details class="card xmerch" id="calc"><summary><h3>Per-pour cost calculator</h3><small>optional</small></summary>
        <p class="note2">Per-pour maths beats arguing about the bottle price. Type in the bar's numbers. This uses only what you enter, and it never quotes a margin.</p>
        <div class="calcgrid">
          <label>Bottle
            <select id="cbottle">${LINEUP.map(([n, pr]) => `<option value="${pr.replace("$", "")}">${esc(n)} (${esc(pr)} shop price)</option>`).join("")}<option value="">Other</option></select></label>
          <label>Cost per bottle to the bar ($)<input id="ccost" type="number" min="0" step="0.01" inputmode="decimal" value="${LINEUP[0][1].replace("$", "")}"></label>
          <label>Bottle size (ml)<input id="cml" type="number" min="1" step="1" inputmode="numeric" value="750"></label>
          <label>Pour size (oz)<select id="coz"><option>1</option><option>1.25</option><option selected>1.5</option><option>2</option></select></label>
          <label>Menu price per drink ($)<input id="cmenu" type="number" min="0" step="0.01" inputmode="decimal" placeholder="for example 12"></label></div>
        <div class="calcout" id="cout" role="status" aria-live="polite"></div>
        <p class="note2">The shop price is only a starting point: use the confirmed wholesale price once you have it in writing, and check the bottle size on the label.</p></details>
      <p class="note2 wstatus">Wording and prices: ${esc(Facts.status().toLowerCase())}.</p>`;
  }
  // Brings the calculator to life once the page is on screen.
  function wire() {
    const val = id => $(id).value, show = () => {
      const m = pourMath({ cost: val("#ccost"), ml: val("#cml"), oz: val("#coz"), menu: val("#cmenu") });
      $("#cout").innerHTML = !m ? "<p>Enter a bottle cost, a size and a pour size.</p>"
        : `<div><b>${m.pours}</b><span>pours in a bottle</span></div><div><b>${money(m.perPour)}</b><span>cost per pour</span></div>`
          + (m.pct != null ? `<div><b>${m.pct.toFixed(0)}%</b><span>pour cost</span></div><div><b>${money(m.revenue)}</b><span>a bottle brings in</span></div><div><b>${money(m.kept)}</b><span>left after the bottle cost</span></div>` : "<p class=\"note2\">Add a menu price to see the pour cost.</p>");
    };
    $("#cbottle").onchange = () => { if (val("#cbottle")) $("#ccost").value = val("#cbottle"); show(); };
    ["#ccost", "#cml", "#coz", "#cmenu"].forEach(id => { $(id).oninput = show; $(id).onchange = show; });
    show();
  }

  return { pourMath, review, wire, DO, NEVER, IFTHEY, MORE };
})();
