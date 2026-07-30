# FAIN Coach — Monetization Analysis (v2.1, 2026-07-30)

Unit economics and pricing for **hosted paid tiers**: accounts + cloud backup
+ multi-device sync (Sprint 11), managed AI (Sprint 12), and the billing that
makes it chargeable (Sprint 12b), on Cloudflare + Dexie Cloud. The free tier
(fully local, bring-your-own OpenRouter key) stays as-is and is the funnel.

**v2.1 change**: dev-plan split the old "Sprint 12" into **12** (managed AI
proxy — buildable) and **12b** (pricing + billing — blocked on an undecided
payment provider). §8's checklist is now tagged by which of the two each item
actually gates, because only two items block the proxy and the rest were
stalling it for no reason.

**v2 change**: split the original single "Pro" bundle into two purchasable
tiers — **Sync** (accounts + multi-device sync + cloud backup, still BYO key)
and **Pro** (Sync + a managed AI key) — because they map cleanly onto Sprints
11 and 12 respectively. Sync is a real, separately billable product the
moment Sprint 11 ships; it does not need Sprint 12's proxy or 12b's billing to
exist. Also adds a speculative fourth tier, **Pro+** (premium commercial
models through the managed key), which is not fully priced yet — see §4.4.

> **Numbers marked (verify) are planning estimates**, not quoted vendor prices —
> OpenRouter per-model rates, Dexie Cloud tiers, and tax rules change. Confirm
> current figures before committing to a price. The *conclusions*, however, are
> robust to being off by 2–3× (see "Why").

---

## 1. Headline finding

**For an app powered by open-weights models, LLM inference is not the cost that
matters — billing overhead and sync infrastructure are.** At $3–5/month the
inference for a typical user is *pennies*; the Stripe fixed fee and Dexie Cloud
are the real costs. This flips the usual SaaS intuition and drives three
decisions: **push annual billing, cap usage server-side, and restrict the
managed tier to cheap models.**

---

## 2. Cost per paying user per month

Grounded in the app's **measured** usage (from live testing):
- A coach message sends ~170–490 tokens and replies with ≤ ~250 words (~350
  tokens) → **≈ 1k tokens per exchange**.
- A plan generation sends ~4k tokens and returns a ~2–4k-token JSON →
  **≈ 7k tokens per plan** (instruct model; no reasoning tokens).

A **typical active user** (≈16 runs/month, each coached, plus ad-hoc chat and
1–2 plans) lands around **~100k tokens/month**. A heavy user, ~500k.

| Line item | Typical user | Heavy user | Notes |
|---|---|---|---|
| **OpenRouter inference** | ~$0.04 | ~$0.20 | Llama 3.3 70B blended ≈ $0.30/M tokens *(verify)*. 100k / 500k tokens. |
| **Stripe fee (monthly billing)** | ~$0.42 | ~$0.42 | 2.9% + **$0.30 fixed**, on a $4 sub. The fixed 30¢ dominates at this price. |
| **Dexie Cloud** | ~$0.30 | ~$0.30 | *(verify — largest uncertainty)* per-user sync/auth. |
| **Cloudflare (Pages + Workers)** | ~$0 | ~$0 | Free tier: 100k Worker req/day, unlimited static. |
| **Total cost** | **~$0.76** | **~$0.92** | |
| **Net on a $4/mo sub** | **~$3.24** | **~$3.08** | ~80% gross margin. |

### Why the conclusion holds even if the estimates are wrong

Inference is ~100k tokens/user/month. Even at a pessimistic **$1/M** (3× my
planning rate), that's **$0.10/user**. There is no realistic open-weights rate
at which inference threatens a $4 price. The margin risk is entirely
**abuse/uncapped usage** and **fixed per-transaction/per-user overhead**, not
normal inference.

---

## 3. The three decisions this forces

### 3.1 Push annual billing
Stripe's **$0.30 fixed fee per charge** is ~7.5% of a $4 monthly sub — paid 12×
a year. Billed annually at **$40/yr**, that fixed fee is paid once: total Stripe
cost ~$1.46 on $40 = **~3.6%** vs **~10.5%** monthly. Offer annual at a discount
(e.g. "2 months free") — it improves margin *and* retention.

### 3.2 Cap usage server-side (non-negotiable)
Because you resell inference, an abuser or a runaway script is the only way to
lose money. The proxy Worker must enforce a **per-user cap** (e.g. tokens/month
or requests/day) checked on every call. Set it far above real use — a typical
user is ~100k tokens; a cap of **~1M tokens/month** (≈ $0.30 worst-case cost) is
10× normal and still trivial, while stopping an unbounded bill. Show remaining
quota in the UI so it never surprises a legitimate user.

### 3.3 Restrict the managed tier to cheap models
The managed key must **not** expose expensive commercial models (Claude, GPT) or
costly reasoning models through your billing — a user picking those turns a $4
sub into a loss. Managed tier = a curated set of cheap open-weights models
(Llama 3.3 70B, Qwen 2.5, DeepSeek V3). Power users who want premium models use
the **free BYO-key tier** and pay their own inference. Clean split, protects
margin, and reuses the existing model catalog with a "managed" flag.

---

## 4. Recommended pricing

### 4.1 Three tiers, not one bundle

The original plan bundled sync and managed AI into a single $4 "Pro" tier.
Splitting them is better product strategy, not just extra SKUs: a runner who
wants their data to follow them across devices but is happy bringing their
own OpenRouter key is a real, distinct segment from one who wants zero setup.
Charging them the same price as someone consuming managed inference
overcharges the first group and undersells the second. It also lets **Sync**
ship and start earning as soon as Sprint 11 is done, without waiting on
Sprint 12's proxy Worker or 12b's billing integration.

| Plan | Price | Effective /mo | What it adds over the tier below |
|---|---|---|---|
| **Free** | $0 | — | Local-first, BYO OpenRouter key. The whole current app. Funnel + the "technical" audience (who can fork it anyway). |
| **Sync** | $2/mo or **$20/yr** | $1.67 (annual) | Accounts, multi-device sync, cloud backup. Still BYO key — no inference resold, so no usage-cap risk. |
| **Pro** | $4/mo or **$40/yr** | $3.33 (annual) | Everything in Sync, **plus** a managed AI key (curated cheap models, capped usage) — zero setup. |
| **Pro+** *(speculative — see §4.4)* | not yet priced | — | Everything in Pro, but the managed key also covers premium commercial models (Claude, GPT). |

Both paid tiers should offer **annual billing at ~2 months free** (Sync:
$24/yr → $20; Pro: $48/yr → $40) — the Stripe fixed fee is a much bigger bite
out of a small monthly charge than an annual one (§3.1). Consider a **7–14
day free trial** on either paid tier (Stripe supports it natively) — the
local free tier already de-risks try-before-buy, so a trial is optional, not
essential.

### 4.2 Sync tier economics

No inference is resold, so the cost floor is just billing overhead and Dexie
Cloud — there's no usage-cap risk the way there is for Pro.

| Line item | Monthly ($2/mo) | Annual ($20/yr, per year) |
|---|---|---|
| **Stripe fee** | ~$0.36 (2.9% + $0.30, charged monthly) | ~$0.88 (one annual charge) |
| **Dexie Cloud** | ~$0.30/mo *(verify)* | ~$3.60/yr (12 × $0.30) |
| **Total cost** | ~$0.66/mo | ~$4.48/yr |
| **Net** | ~$1.34/mo (**67% margin**) | ~$15.52/yr, ~$1.29/mo effective (**78% margin**) |

The Stripe fixed fee is proportionally harsher here than on Pro (§2) because
the price is lower — **don't price Sync below ~$2/mo on monthly billing**, or
the fixed fee eats too much of the margin. At $1/mo the Stripe fee alone is
~33% of revenue before Dexie Cloud is even counted.

### 4.3 Pro (unchanged from v1)

See §2 above for the full breakdown — ~80% gross margin at $4/mo, driven by
inference being pennies and Dexie Cloud/Stripe being the real costs.

### 4.4 Pro+ — premium models, priced later

A plausible fourth tier for users who want zero-setup access to commercial
models (Claude, GPT) rather than BYO-key. **Not ready to price** — two things
have to be confirmed first that don't apply to Pro's cheap-model set:

- **Current OpenRouter rates for the specific premium models offered.**
  Commercial/reasoning models commonly run **10–30× the per-token cost** of
  the open-weights set in §3.3 (Llama 3.3 70B, Qwen 2.5, DeepSeek V3). At that
  multiplier, a typical user's ~100k tokens/month could cost **$3–15** in
  inference alone — a flat token-budget cap like Pro's (§3.2) would need to be
  10–30× tighter, or reworked entirely.
- **A different cap shape.** An open token budget is the wrong mechanism here
  — a heavy user could turn a $12–15/mo sub into a loss on premium-model
  inference alone. A **fixed number of premium-model exchanges/month**, with
  overflow either blocked or silently falling back to the cheap-model set, is
  the safer design. Decide this before setting a price, not after.

Until both are confirmed, treat Pro+ as a roadmap idea, not a committed SKU.

---

## 5. Fixed costs & break-even

- **Cloudflare**: $0 until you exceed the free tier (then Workers Paid is a flat
  $5/mo with 10M requests included — effectively never at small scale).
- **Dexie Cloud**: the one likely fixed/semi-fixed cost *(verify current tier
  pricing and any monthly minimum)*. This sets break-even. At ~$3+ net per user,
  even a small monthly minimum is covered by a handful of subscribers.
- **Realistic framing:** at $4/mo this is a **side-income model, not a
  windfall** — 100 paying users ≈ $325/mo net; 1,000 ≈ $3.2k/mo net. It scales
  linearly and cheaply, but the ceiling is set by how many runners you can
  reach.
- **Sync as a lower-friction entry point:** at $2/mo, Sync is a smaller ask
  than Pro's $4 — someone unsure about a managed AI key but sold on
  multi-device sync can convert there first. Whether that actually grows
  total paying users (a cheaper on-ramp) or just splits Pro's revenue into a
  lower-margin tier (cannibalization) is unknown without real conversion
  data — worth watching once both tiers exist, not something to resolve on
  paper.

---

## 6. Payment processor: Stripe vs Merchant-of-Record

Selling software globally as a solo operator means **VAT/sales-tax** obligations
in many jurisdictions. Two paths:

| | **Stripe (direct)** | **Merchant of Record** (Paddle, Lemon Squeezy) |
|---|---|---|
| Fee | 2.9% + $0.30 (+ Stripe Tax add-on ~0.5%) | ~5% + $0.50, all-in |
| Tax/VAT | **You** register and remit (or add Stripe Tax) | **They** are the seller of record — handle all of it |
| Fit | Lower fee, more admin | Higher fee, near-zero tax admin |

For a **solo dev selling internationally**, a Merchant of Record often wins
despite the higher cut — it removes cross-border VAT registration and filing
entirely. The extra ~2% on a $4 sub is ~$0.08; the tax admin it removes is worth
far more than that. **Recommend Lemon Squeezy / Paddle over raw Stripe unless
you already have tax infrastructure.** (Israel-based sellers: confirm local
requirements and whether an MoR simplifies your position.)

---

## 7. Risks

- **Uncapped inference** — the only path to losing money on Pro (and, more
  severely, on Pro+ — see §4.4). Mitigated by §3.2. Do not ship the proxy
  without the cap.
- **Dexie Cloud cost/lock-in** — the biggest cost uncertainty, and it now
  affects two tiers (Sync and Pro) instead of one. If its pricing doesn't
  pencil out at scale, the fallback is building sync on Cloudflare D1 /
  Durable Objects (much more work) — design the sync layer so it *could* be
  swapped, as the `LlmClient` abstraction did for transport.
- **Privacy positioning** — sync (Sync and Pro both) softens the "data never
  leaves your device" promise; managed AI (Pro and Pro+) softens it further.
  Keep the free tier genuinely local and be explicit in the UI about what
  each paid tier actually does with your data — "Sync stores your data in
  the cloud, scoped to your account" is a different claim from "Pro's coach
  runs through our server," and both are different from Free.
- **Tier-selection friction** — a runner who just wants to log a run
  shouldn't have to parse four options to figure out which one they need.
  If Pro+ ships, the upgrade page needs to make the Free → Sync → Pro → Pro+
  progression legible at a glance (what you gain at each step), not read
  like a spreadsheet. Worth a design pass before Pro+ ships, not after.
- **Low absolute revenue at small scale** — see §5. Set expectations.
- **Churn** — annual billing and genuine coaching value are the defenses.

---

## 8. Numbers to confirm before pricing

**Tagged by which sprint each actually gates** (dev-plan §12.3 / §12.4). Only
two of these block building the AI proxy; the rest are money questions that
block *charging*, and must not be allowed to stall the proxy sprint.

**Gate Sprint 12 — the managed AI proxy (dev-plan §12.3):**

1. Current OpenRouter rate for the managed models (Llama 3.3 70B et al.).
   Needed to size the cap sensibly, not to set a price.
4. Chosen usage cap (tokens/month) — the §3.2 knob. The proxy enforces it, so
   it needs a number. ~1M tokens/month is the standing recommendation: ~10×
   a typical user, ~$0.30 worst-case cost.

**Gate Sprint 12b — pricing + billing (dev-plan §12.4):**

2. Current Dexie Cloud production pricing and any monthly minimum — needed
   for both Sync and Pro, since both carry it as a cost line.
3. Israel/international tax obligations, and whether an MoR removes them.
   **Payment provider is still undecided** as of 2026-07-30; §6 recommends a
   Merchant of Record. Whatever is chosen, the entitlement check must sit
   behind one narrow swappable interface (dev-plan §12.4).
5. Pro price: $4/mo + $40/yr is the recommendation; your $3–5 instinct is
   sound and the margins work across that whole range.
6. Sync price: $2/mo + $20/yr is the recommendation (§4.2) — don't go below
   ~$2/mo on monthly billing, the Stripe fixed fee dominates too hard below
   that.
7. **Before pricing Pro+**: current OpenRouter rates for the specific
   premium models under consideration, and a decided cap mechanism
   (exchanges/month, not raw tokens) — see §4.4. Do not ship Pro+ without
   both.
