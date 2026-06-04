# FlowTube Design System

> Powerful automation for serious creators. Dark-first, data-dense, feels
> like a control room — not a landing page. The product runs while you sleep;
> the UI should make that visible.

---

## North star (read first)

**Memorable thing:** *"Finally an automation tool that doesn't look like every other AI SaaS."* If a creator screenshots one screen and posts it, the screenshot should read FlowTube before it reads any text on it.

**Posture rules:**
1. Information density over decoration. Every pixel earns its place by showing real status, real numbers, real time.
2. Color is meaning, not garnish. Amber = primary action / focus. Electric green = something is alive and running. Red = something is wrong. Everything else is neutral.
3. The UI is alive. Pulsing dots, ticking timestamps, mono numbers, status pills. Static screens are dead screens.
4. No gradients on UI chrome. The blue→purple text-gradient and the gradient CTA button are forbidden going forward — that look is the exact AI-SaaS template we're trying to escape.
5. Dark is the canonical mode. Light mode is supported but designed second.

---

## Color tokens

All colors live in CSS custom properties in `frontend/app/globals.css` as RGB channel triplets, so Tailwind's opacity utilities (`bg-accent/20`) keep working.

### Dark (canonical)

| Token | RGB | Hex | Use |
|---|---|---|---|
| `--c-bg` | `8 10 14` | `#080A0E` | App background. Near-black with a cool tint so it doesn't read pure-graphite. |
| `--c-bg-2` | `14 17 22` | `#0E1116` | Section background, secondary backdrop. |
| `--c-surface` | `20 24 32` | `#141820` | Cards, panels, dropdowns. |
| `--c-surface-2` | `28 33 42` | `#1C212A` | Hover, focus, active row in a table. |
| `--c-ink` | `235 240 245` | `#EBF0F5` | Primary text. Cool-white, not pure white. |
| `--c-muted` | `130 140 155` | `#828C9B` | Labels, captions, eyebrows. |
| `--c-accent` | `255 179 0` | `#FFB300` | **Bloomberg amber.** Primary CTA, focus rings, hot trends. Used sparingly. |
| `--c-accent-2` | `255 140 0` | `#FF8C00` | Amber-deep. Borders + glows when a panel goes "hot." Never as a gradient pair. |
| `--c-live` | `0 230 118` | `#00E676` | Electric green. ONLY for "this is currently running / live / healthy" signals (pulsing dots, real-time stats, scheduler ticks). |
| `--c-danger` | `255 59 48` | `#FF3B30` | Errors, failed renders, blocked auth. |
| `--c-border` | `255 255 255` | + 8% alpha | Hairline 1px borders. Sharp, not fuzzy. |

### Light (secondary)

Light is supported because creators check the app on a phone in daylight. It is NOT the canonical experience.

| Token | RGB | Hex |
|---|---|---|
| `--c-bg` | `250 250 252` | `#FAFAFC` |
| `--c-bg-2` | `244 245 248` | `#F4F5F8` |
| `--c-surface` | `255 255 255` | `#FFFFFF` |
| `--c-surface-2` | `248 249 252` | `#F8F9FC` |
| `--c-ink` | `8 12 20` | `#080C14` |
| `--c-muted` | `90 100 115` | `#5A6473` |
| `--c-accent` | `217 119 6` | `#D97706` | (amber-darker for contrast on light) |
| `--c-accent-2` | `180 83 9` | `#B45309` |
| `--c-live` | `5 150 105` | `#059669` |
| `--c-danger` | `220 38 38` | `#DC2626` |
| `--c-border` | `15 23 42` | + 10% alpha |

---

## Typography

| Role | Font | Weight | Tracking | Notes |
|---|---|---|---|---|
| Display / hero | Hanken Grotesk | 700–800 | `-0.025em` | Cap at 5XL. No gradient text. |
| Body | Hanken Grotesk | 400–500 | `0` | |
| UI labels | Hanken Grotesk | 600 | `0` | Buttons, nav items. |
| Eyebrow / overline | Hanken Grotesk | 500 | `+0.08em` uppercase | Small section labels above content. |
| **Data / metrics** | **JetBrains Mono** | 500 | `0` | Numbers in metric cards, IDs, timestamps, durations. Use `font-variant-numeric: tabular-nums`. |

**Why JetBrains Mono:** every metric in a control room is monospaced. Trading desks, broadcast studios, terminals — they all use mono for numbers so the digits don't dance when they tick. This is the single biggest visual upgrade we get for free.

**Loading:** Hanken Grotesk via Google Fonts (already in `globals.css`). JetBrains Mono added via the same `@import` block.

---

## Spacing & layout

- **Base unit:** 4px. Tailwind defaults are fine.
- **Density:** **dense** by default. Default vertical rhythm is `space-y-3` (12px) inside cards, `space-y-6` (24px) between sections. Reserve `space-y-8+` for marketing pages only.
- **Section gutters:** `px-5 sm:px-8 lg:px-10` inside `max-w-7xl`. Wider would feel like a landing page.
- **Card padding:** `p-4` standard, `p-5` for hero cards, `p-3` for tight metric tiles.

---

## Border radius (tighter than before)

| Token | Value | Use |
|---|---|---|
| `rounded-sm` | 3px | Pills, tags |
| `rounded` (default) | 6px | Buttons, inputs, small panels |
| `rounded-lg` | 8px | Cards, dialogs (was 12px — too friendly) |
| `rounded-xl` | 12px | Hero cards, marketing surfaces only |
| `rounded-full` | — | Avatars, pulsing dots |

---

## Components

### `.btn-primary`
Solid amber background. **Dark text** (`bg-2`), not white — keeps contrast accessible AND looks like a control button, not a marketing CTA.
```css
background: rgb(var(--c-accent));
color: rgb(var(--c-bg-2));
border-radius: 6px;
font-weight: 700;
letter-spacing: -0.01em;
box-shadow: 0 0 0 1px rgb(var(--c-accent) / 0.4);
/* hover: brightness 1.05, shadow expands to 0 0 0 2px + 0 8px 24px -8px amber/30 */
```
No gradient. No glow on idle. The hover state is where the energy goes.

### `.btn-ghost`
Transparent fill, 1px border at `surface-2`, text `ink/85`. Hover bumps border to `accent/50`. Used for secondary actions next to the primary amber.

### `.panel`
Replaces the old `.glass`. Solid `surface` background (NOT translucent), 1px `border`, 8px radius.
```css
background: rgb(var(--c-surface));
border: 1px solid rgb(var(--c-border));
border-radius: 8px;
```
Optional modifier `.panel-live` adds a 1px amber top-stripe + an animated pulse-dot in the corner. Used when the panel is showing data that updates in real time.

### `.metric`
Number display for data. Mono font, large size, tabular-nums.
```css
font-family: 'JetBrains Mono', monospace;
font-feature-settings: 'tnum' 1;
letter-spacing: -0.02em;
```
Use sizes `text-2xl` (24px) for tile metrics, `text-4xl` (36px) for hero stats.

### `.pulse-dot`
6px solid circle in `--c-live` with an outer ring that pulses every 2s. Sits next to "live" labels (e.g., "RENDER IN PROGRESS", "SCHEDULER TICKED 4s AGO"). One per screen max — too many and it stops meaning anything.

### `.eyebrow` (kept, restyled)
`uppercase`, `tracking-[0.08em]`, `text-xs`, `text-muted`. Section labels.

### `.tag` / `.pill` (kept, tightened)
`rounded-sm` instead of `rounded-md`. Border 1px.

### `.status-bar` (NEW)
Thin horizontal strip at the top of major panels showing live state — last update, render status, channel count, ticks. Like the title bar of a broadcast control surface.

---

## Motion

| Pattern | Use | Duration | Easing |
|---|---|---|---|
| `pulse-ring` | "Live" dot — kept | 2.4s loop | bouncy out |
| `fade-up` | New content entering | 280ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `shimmer` | Loading skeletons | 1.6s loop | linear |
| `tick` (NEW) | A number incrementing | 200ms flash on amber | linear |
| `aurora`, `float` | **REMOVED** | — | These are landing-page decoration. Kill on dashboard. |

Reduced-motion: respect `prefers-reduced-motion`, keep status dots but stop all loops.

---

## Don'ts

- ❌ Blue → purple gradients (`linear-gradient(135deg, #2563eb, #7c3aed)`) — generic AI SaaS signal.
- ❌ Text-gradient headings (`background-clip: text` on hero copy). Use amber inline on key words instead.
- ❌ Translucent `glass` cards with `backdrop-blur`. Replace with solid `panel`.
- ❌ Floating decorative blobs (`aurora-blob`) on app pages. Keep them only on the marketing homepage if at all.
- ❌ More than one pulsing live indicator per screen.
- ❌ Purple anywhere. Not in tokens, not in accents, not in pills.
- ❌ Cute illustrations. Status icons (Lucide outline) only.

---

## Decisions log

| Date | Decision | Rationale |
|---|---|---|
| 2026-06-04 | Adopt amber + electric-green direction | Generic AI SaaS positioning was costing us memorability. Bloomberg-amber + terminal-mono moves the product into the "serious automation tool" category, which is where serious creators are willing to pay for it. |
| 2026-06-04 | Kill blue→purple gradient | Single biggest slop signal in the existing UI. Used in CTA + hero. Replacement is solid amber. |
| 2026-06-04 | Add JetBrains Mono for data | Bloomberg/Reuters/broadcast convention. Numbers stop dancing when they tick. |
| 2026-06-04 | Dark-first canonical, light secondary | The product is for night-owl creators batching content. Dark is when they actually use it. |
