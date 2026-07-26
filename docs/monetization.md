# FAIN Coach — Monetization Analysis (v1, 2026-07-23)

Unit economics and pricing for a **hosted paid tier**: accounts + managed AI
key + cloud backup + multi-device sync, on Cloudflare + Dexie Cloud. The free
tier (fully local, bring-your-own OpenRouter key) stays as-is and is the funnel.

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

| Plan | Price | Effective /mo | Rationale |
|---|---|---|---|
| **Free** | $0 | — | Local-first, BYO OpenRouter key. The whole current app. Funnel + the "technical" audience (who can fork it anyway). |
| **Pro monthly** | **$4 / mo** | $4.00 | Middle of your $3–5 range. |
| **Pro annual** | **$40 / yr** | $3.33 | 2 months free; fixes the Stripe-fee problem; better retention. |

Consider a **7–14 day free trial** on Pro (Stripe supports it natively) to lift
conversion — the local free tier already de-risks the try-before-buy, so a trial
is optional, not essential.

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

- **Uncapped inference** — the only path to losing money. Mitigated by §3.2. Do
  not ship the proxy without the cap.
- **Dexie Cloud cost/lock-in** — the biggest cost uncertainty. If its pricing
  doesn't pencil out at scale, the fallback is building sync on Cloudflare D1 /
  Durable Objects (much more work) — design the sync layer so it *could* be
  swapped, as the `LlmClient` abstraction did for transport.
- **Privacy positioning** — sync + managed AI softens the "data never leaves
  your device" promise. Keep the free tier genuinely local and be explicit in
  the UI that Pro syncs through the cloud, scoped to the account.
- **Low absolute revenue at small scale** — see §5. Set expectations.
- **Churn** — annual billing and genuine coaching value are the defenses.

---

## 8. Numbers to confirm before pricing

1. Current OpenRouter rate for the managed models (Llama 3.3 70B et al.).
2. Current Dexie Cloud production pricing and any monthly minimum.
3. Israel/international tax obligations, and whether an MoR removes them.
4. Chosen usage cap (tokens/month) — the §3.2 knob.
5. Final price: $4/mo + $40/yr is the recommendation; your $3–5 instinct is
   sound and the margins work across that whole range.
