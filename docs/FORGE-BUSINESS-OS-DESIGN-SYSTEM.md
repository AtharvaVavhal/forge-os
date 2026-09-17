# FORGE Business OS — Design System & Component Specification

**Type:** Implementation-ready design system specification. No code was written or modified to produce this document; no application, dashboard, CRM, finance, or project screens were built.
**Scope:** `app.forgebuilds.in` (Business OS, internal) and `portal.forgebuilds.in` (Client Portal, external) — design tokens and component contracts only.

**Source-of-truth hierarchy used throughout:**
1. The existing `forgebuilds.in` marketing codebase (ground truth for every token, pattern, and rule).
2. `docs/FORGE-BUSINESS-OS-UI-UX-DIRECTION.md` (the prior audit — referenced, not repeated).
3. Frozen Forge Business OS architecture/database documents — **searched for and not found in this repository.** No schema, entity, or field-level documentation exists beyond `supabase/schema.sql`, which defines only the marketing site's `contact_submissions` table and has no bearing on CRM/Finance/Projects entities. Anywhere this document would depend on a specific database field or entity relationship, it is marked **NOT CURRENTLY DEFINED** rather than invented.

Every color, font, radius, and motion value below traces back to `src/app/globals.css` and the component files audited in Document #1, or is explicitly flagged as new and computed against WCAG 2.1 using the same relative-luminance method that produced `ember-deep`/`ember-bright` in the source repo (verified: recomputing `ember-deep` on paper yields 5.43:1 and `ember-bright` on ink yields 6.53:1, matching the documented 5.4:1 / 6.5:1 in `globals.css` — confirms the method is correct before it's used to derive anything new).

---

## 1. Design System Principles

These are implementation rules, not aspirations. A screen that violates one of these without a documented, approved exception is not shippable.

### Visual hierarchy
1. Every screen has exactly one primary action, rendered as the one pill-shaped ember-deep button visible in that view. A screen with two competing ember buttons is a bug.
2. Hierarchy is built with type weight, size, and mono-vs-display role — not with color. Color (ember, semantic) is reserved for meaning (action, status), never used to create visual weight on its own.
3. A page always orients before it states: a mono kicker/breadcrumb precedes the page title; a page title precedes its content. No page opens directly into data with no label.

### Information density
4. Default density is **compact** (§12). Comfortable density is an opt-in per view, not the default, because this is a tool used by people who already know the data, many times a day.
5. Whitespace is functional, not decorative. The marketing site's `py-20`+ rhythm does not apply inside the app shell — see §5 for the app's actual spacing scale.
6. Never wrap a widget in a second layer of framing it doesn't need (a table inside a card inside a panel). One boundary per unit of content (§16).

### Restraint
7. One brand accent (ember) plus the minimum semantic set required for status communication (§3) — never a second decorative hue, never a gradient fill, never a third "just for this feature" color.
8. If a screen needs a design decision this document doesn't answer, that is a signal to extend this document, not to improvise inline. Undocumented one-off styling is treated as a defect.

### Ink/paper relationship
9. Ink and paper remain bivalent, as in the source system: either can be a text color or a full surface color, and the same component can invert between them (e.g., sidebar item default vs. hover) without introducing a third neutral.
10. Ink is reserved for the sidebar and for genuine emphasis surfaces (scrims, "danger zone" panels). It is not the default content-area background in the app — paper is (§9), because an all-day interior workspace needs the lower-contrast, literal "paper" surface, not the marketing site's hero-statement dark.

### Ember usage
11. Ember (in any of its four forms — base, soft, deep, bright) never fills a large surface (a section, a card, a sidebar, a table row) as a background. It is text, a small icon, a border/outline, a focus ring, a 1–2px accent bar, or a button fill on a button-sized element only.
12. No more than one ember element is the visually dominant accent in a single view at a time — consistent with the marketing site's own "1–2 ember elements visible at once" rule, tightened to effectively one in a dense app view where many small ember touches (an active nav item, a selected table row, an active tab) would otherwise compound.
13. Ember never represents a semantic status (success, danger, warning, positive/negative financial movement). See §3 and §17.

### Typography roles
14. Archivo = interface. Source Serif 4 = long-form prose only (notes, proposal body text, descriptions read at length). IBM Plex Mono = system/meta (IDs, timestamps, codes, numbers, table headers, spec labels). No exceptions, no "just this once" serif buttons or mono headings.
15. Source Serif 4 is not promoted to a general UI font in the Business OS. Where the source system has a gap — a regular-weight UI body font, since Archivo is only loaded at 600/700/800 in the current codebase — that gap is solved by extending Archivo's weight range (§4), not by reaching for the serif.

### Borders
16. Structure is drawn with 1px hairlines at low opacity, exactly as in the source system (§7). A border does the job a shadow or a background-color block would otherwise be asked to do.

### Radius
17. Only the four radii already present in the source system are used, mapped by function (§6). No fifth radius value, no per-component bespoke rounding.

### Elevation
18. Shadow means "this is temporarily above the surface" — a popover, a modal, a dragging card, a toast. It is never applied to a resting element as decoration (§7).

### Motion
19. The three existing durations and two easing curves are the entire motion vocabulary (§8). `--duration-emphasis` (620ms) is prohibited on anything that happens more than a handful of times per session.
20. Motion explains a state change (something entered, left, or reordered); it never performs enthusiasm. If removing an animation doesn't reduce clarity, remove it.

### Interaction feedback
21. Every interactive element has a visible hover, active/pressed, and focus-visible state, using the tokens in §7/§8 — no interactive element may rely on cursor shape alone to signal interactivity.
22. Destructive actions require a confirmation step (§11 Confirmation Dialog) except where the action is trivially reversible (e.g., removing a filter chip).

### Empty-state honesty
23. Absence of data is stated plainly, in the same tone the source system uses ("no retention percentages... to report here"), never disguised with a fabricated chart, placeholder logo, or invented number. This extends `CLAUDE.md`'s "never fabricate" rule from marketing copy into live application data — arguably a harder requirement here, since a fabricated-looking dashboard number in a CRM/finance tool is actively misleading, not just tonally off.
24. A placeholder is always visually marked as a placeholder (§19) — dashed border, explicit caption — matching `DeviceFramePlaceholder`'s existing pattern.

### Accessibility
25. WCAG AA is a shipping requirement, not a nice-to-have, for every text/background pairing and every non-text interactive boundary (§21).

### Consistency
26. A component is used from this specification or the shared library it produces — never re-implemented inline per-screen. The marketing site could afford ad hoc, per-section Tailwind strings because it has ~20 unique moments; the Business OS cannot, because it has dozens of screens that must all agree with each other (§23).

---

## 2. Color System

The eight tokens below are used exactly as defined in `src/app/globals.css`. This table is the authoritative "may/must-not" reference for the Business OS.

| Token | Hex | May be used for | Must NOT be used for |
|---|---|---|---|
| **ink** `#17140F` | | Sidebar background; scrims behind modals/drawers; text on paper/paper-elev; rare full-emphasis panels (e.g. a "danger zone" settings block) | Default content-area background (that's paper, §9); body text at low opacity where a lighter steel would do; decorative fills |
| **paper** `#F3EFE7` | | Default app content-area background; text on ink (sidebar labels, dark-surface text) | A "card" surface distinct from the page itself — that's `paper-elev` |
| **paper-elev** `#FFFFFF` | | Elevated surfaces sitting on paper: cards, table containers, modals, drawers, popovers, dropdowns, inputs | Full-page backgrounds (too close to paper for the distinction to register); sidebar background |
| **ember** `#B85A22` | | Small decorative accent dots inside illustration-only contexts (rare in-app; mostly a marketing-site device) | **Any text or small UI element at normal text size** — it fails AA (≈4.05:1 on paper, ≈3.96:1 on ink) per `globals.css`'s own documented measurement. Use `ember-deep`/`ember-bright` instead (below) |
| **ember-soft** `#E8DCC8` | | Subtle tinted background behind an active/selected ember-adjacent element (active nav-rail row wash, selected table row, active command-palette result) | A resting/default background for anything; any text color |
| **steel** `#6B6459` | | Secondary/tertiary text, borders, dividers, captions, disabled-state text, the reused **Neutral** semantic (§3) | Primary body text; primary interactive element color |
| **ember-deep** `#9A4A1C` | AA: 5.43:1 on paper, 6.23:1 on paper-elev | All ember **text** and small **fills** on light surfaces: primary button fill, active nav-rail bar, links, focus outline, error text, active tab underline | On ink/dark surfaces (contrast drops to ~2.95:1 — use `ember-bright` there instead) |
| **ember-bright** `#E0824A` | AA: 6.53:1 on ink | All ember **text** on dark/ink surfaces: sidebar active icon, footer-equivalent link hover, any accent needed inside the sidebar | On paper/paper-elev (contrast drops below AA — use `ember-deep` there instead) |

### Light-surface behavior (paper / paper-elev)
- Text: ink (primary), steel or ink/70–80 (secondary).
- Borders: `steel` at 15–30% opacity (§7).
- Focus: 2px solid `ember-deep` outline, 2px offset (§21 — the single unified focus treatment; resolves the two divergent focus styles found in the marketing codebase).
- Active state: `ember-deep` (text/icon/accent bar) + `ember-soft` wash where a background tint is warranted (selected row, active filter chip).
- Hover state: a quiet steel-tinted wash (`ink/[0.02]`–`[0.04]`) for rows/list items, matching the pricing page's existing `hover:bg-ink/[0.02]` precedent — **not** the marketing homepage's bold full ink/paper hover-invert, which is a rare-frequency marketing gesture wrong for a table scanned dozens of times a day.

### Dark-surface behavior (ink, sidebar only)
- Text: paper (primary), paper/50–80 (secondary/inactive).
- Borders: `paper` at 10–25% opacity.
- Focus: same 2px `ember-deep` outline rule does **not** apply here (fails AA on ink) — dark surfaces use a 2px `ember-bright` outline instead. This is the one contextual exception to the "single unified focus treatment" rule, and it exists for the same reason `ember-bright` exists at all.
- Active state: `ember-bright` icon/text + a 2px `ember-deep` left-edge bar (the bar itself is a small enough element that the deep variant's lower contrast against ink is acceptable — it is a locator, not text).
- Hover state: `paper/[0.04]` wash on inactive sidebar items.

---

## 3. Semantic Color System

The marketing codebase defines no status colors. The Business OS needs the minimum set that lets it communicate lead/deal/invoice/task state without competing with ember for attention. Every pair below was derived using the exact WCAG relative-luminance method `ember-deep`/`ember-bright` were derived with, computed against `paper` (#F3EFE7), `paper-elev` (#FFFFFF), and `ink` (#17140F).

**Design decision:** two of the six requested categories reuse existing tokens rather than introducing new hues, to keep the semantic system subordinate to the brand palette:
- **Neutral** = `steel` (already exists — no new token needed).
- **Pending** = `steel` text/border + a **dashed** border style (not a new hue) — "waiting" is communicated structurally, not chromatically, keeping the total hue count at four new colors instead of six.

### Success (moss)
| Token | Hex | Contrast | Usage |
|---|---|---|---|
| `success-deep` | `#3F6B37` | 5.43:1 on paper · 6.23:1 on paper-elev | Text/icon on light surfaces: "Paid", "Won", positive financial deltas |
| `success-bright` | `#7CAE6E` | 7.12:1 on ink | Text/icon on dark surfaces (sidebar, ink-background contexts) |
| `success-soft` | `#E3EBDC` | `success-deep` on `success-soft` = 5.10:1 | Subtle badge/row background fill |
- **Forbidden usage:** as a large section/page background; to mean "primary action" (that's still ember); for anything that isn't a genuine positive-outcome or completed/paid state.

### Danger (rust)
| Token | Hex | Contrast | Usage |
|---|---|---|---|
| `danger-deep` | `#8C2E22` | 7.24:1 on paper · 8.30:1 on paper-elev | Text/icon on light surfaces: "Overdue", "Lost", destructive-action confirmation text, negative financial deltas |
| `danger-bright` | `#E2745F` | 6.03:1 on ink | Text/icon on dark surfaces |
| `danger-soft` | `#F3DEDA` | `danger-deep` on `danger-soft` = 6.43:1 | Subtle badge/row background fill |
- **Forbidden usage:** as a page-level error banner fill at full saturation (use `danger-soft` + `danger-deep` text, never a saturated red block); to draw attention to something merely important-but-not-wrong (that's ember or a bold weight, not danger).

### Warning (ochre)
Deliberately shifted toward gold/yellow rather than orange, specifically to avoid visually colliding with ember's orange-amber hue — ember must remain unambiguous as *the* brand accent.
| Token | Hex | Contrast | Usage |
|---|---|---|---|
| `warning-deep` | `#7A5E1E` | 5.31:1 on paper · 6.09:1 on paper-elev | Text/icon on light surfaces: "Needs review", "Expiring soon", at-risk states |
| `warning-bright` | `#D9AE55` | 8.86:1 on ink | Text/icon on dark surfaces |
| `warning-soft` | `#F1E6C8` | `warning-deep` on `warning-soft` = 4.90:1 | Subtle badge/row background fill |
- **Forbidden usage:** anywhere close to ember in the same view without deliberate separation (different component, not adjacent badges) — if a screen needs both an ember CTA and a warning badge, keep them visually distant enough that they don't read as "two accent colors."

### Info (slate)
| Token | Hex | Contrast | Usage |
|---|---|---|---|
| `info-deep` | `#2E4A5C` | 8.14:1 on paper · 9.33:1 on paper-elev | Text/icon on light surfaces: informational badges, "In review", system messages |
| `info-bright` | `#7FA6C2` | 7.12:1 on ink | Text/icon on dark surfaces |
| `info-soft` | `#DEE6EC` | `info-deep` on `info-soft` = 7.39:1 | Subtle badge/row background fill |
- **Forbidden usage:** as a substitute for Neutral/steel — Info is for "here is a fact worth noting," not the default/no-status state.

### Neutral
`steel` (#6B6459), reused as-is. Text/icon on light surfaces 5.10:1, on paper-elev 5.85:1. **Forbidden usage:** none beyond the general steel rules in §2 — this is the default, safe, low-emphasis status color and should be the most common badge color in the system, not the rarest.

### Pending
`steel` text + a **1px dashed** border (vs. every other badge's solid border) on a `steel/[0.06]` background tint. No new hex value. **Forbidden usage:** solid border (that reads as a resolved/neutral state, not a waiting one) — the dash is the entire signal, so it must never be dropped for a pending badge specifically.

All six pairings above pass WCAG AA (≥4.5:1) for normal-size text in every documented context. None were guessed — all were computed. If a future addition to this system (a seventh status, a new financial state) needs a color WCAG hasn't validated here, it must be run through the same method before shipping; it is marked **NOT CURRENTLY DEFINED — REQUIRES CONTRAST VALIDATION** until then.

---

## 4. Typography System

Font roles are unchanged from the source system: **Archivo** (interface), **Source Serif 4** (long-form prose only), **IBM Plex Mono** (system/meta/numbers).

**Flagged gap:** the marketing codebase loads Archivo only at weights 600/700/800 (`src/app/layout.tsx`). None of those are a workable *regular-weight UI body* weight — 600 is too heavy for dense paragraph-style body text repeated hundreds of times on a screen. The Business OS needs Archivo 400 and 500 added to the font load. This is a build-time font-configuration change, not something this document implements, but it is a **required dependency** flagged for approval (see final report). Source Serif 4 is deliberately *not* used to fill this gap, per principle §15.

### Type scale

| Level | Family | Weight | Size | Line-height | Letter-spacing | Case |
|---|---|---|---|---|---|---|
| Page title (H1) | Archivo | 700 | 28px / 1.75rem | 1.2 | −0.01em | Sentence |
| Section title (H2) | Archivo | 700 | 20px / 1.25rem | 1.25 | normal | Sentence |
| Subsection (H3) | Archivo | 600 | 16px / 1rem | 1.3 | normal | Sentence |
| Body | Archivo | 400 † | 14px / 0.875rem | 1.5 | normal | Sentence |
| Body-small | Archivo | 400 † | 13px / 0.8125rem | 1.45 | normal | Sentence |
| Label | Archivo | 600 | 13px / 0.8125rem | 1.3 | normal | Sentence |
| Mono label (kicker/eyebrow) | IBM Plex Mono | 500 | 11px / 0.6875rem | 1.3 | 0.1em | Uppercase |
| Metadata (timestamps, IDs) | IBM Plex Mono | 400 | 12px / 0.75rem | 1.4 | 0.02em | As-is |
| Table header | IBM Plex Mono | 500 | 11px / 0.6875rem | 1.3 | 0.08em | Uppercase |
| KPI number | IBM Plex Mono | 500 | 28–32px / 1.75–2rem | 1.1 | normal | `tabular-nums` |
| Financial number (table cell) | IBM Plex Mono | 400 | 14px / 0.875rem | 1.3 | normal | `tabular-nums`, right-aligned |
| Financial number (summary/total) | IBM Plex Mono | 500 | 20–24px / 1.25–1.5rem | 1.2 | normal | `tabular-nums`, right-aligned |
| Button text | Archivo | 600 | 14px / 0.875rem | 1 | normal | Sentence |
| Input label | Archivo | 600 | 13px / 0.8125rem | 1.3 | normal | Sentence (= Label) |
| Helper text | Archivo | 400 † | 12px / 0.75rem | 1.4 | normal | Sentence |
| Error text | Archivo | 500 | 12px / 0.75rem | 1.4 | normal | Sentence, `ember-deep` color |

† Requires the Archivo 400 weight addition noted above. Until that ships, Body/Body-small/Helper text should fall back to Archivo 500 (already loaded) rather than reaching for Source Serif 4 or an unrelated system sans — a temporary weight substitution is a smaller deviation than breaking the font-role rule.

**Long-form prose exception:** anywhere the app renders genuinely long-form content meant to be *read*, not scanned — a note body, a proposal document view in the Client Portal (§18), an email preview — Source Serif 4 at 15–16px / line-height 1.6 applies, exactly as on the marketing site. This is the only context in the entire Business OS where the serif appears.

---

## 5. Spacing System

4px base unit, extending Tailwind's default scale (the marketing site already relies on this scale implicitly; the Business OS formalizes the subset it actually needs and adds semantic aliases the marketing site never required).

### Raw scale
`0` · `1 = 4px` · `2 = 8px` · `3 = 12px` · `4 = 16px` · `5 = 20px` · `6 = 24px` · `8 = 32px` · `10 = 40px` · `12 = 48px` · `16 = 64px` · `20 = 80px`

### Semantic aliases
| Alias | Value | Applied to |
|---|---|---|
| `space-page-x` | 24px desktop / 16px mobile | Content-area horizontal padding — intentionally matches the marketing site's `px-6` gutter value, kept consistent on purpose |
| `space-section-gap` | 32px | Gap between stacked sections/widgets within a page (vs. the marketing site's 80–112px `py-20`–`py-28` — the app is roughly a third of that) |
| `space-card-padding-compact` | 16px | Default card/panel internal padding |
| `space-card-padding-comfortable` | 20px | Comfortable-density card padding |
| `space-table-cell-x` | 12px | Table cell horizontal padding, both densities |
| `space-table-cell-y-compact` | 8px | Compact-density table cell vertical padding |
| `space-table-cell-y-comfortable` | 12px | Comfortable-density table cell vertical padding |
| `space-form-field-gap` | 16px | Vertical gap between form fields |
| `space-form-section-gap` | 32px | Gap between form sections |
| `space-sidebar-x` | 12px collapsed / 16px expanded | Sidebar horizontal padding |
| `space-sidebar-item-y` | 8px | Sidebar nav item vertical padding |
| `space-modal-padding` | 24px | Modal panel internal padding |
| `space-drawer-padding` | 24px | Drawer panel internal padding |
| `space-dashboard-gap` | 16–24px (16px ≤1024px, 24px above) | Gap between dashboard grid widgets |

---

## 6. Radius System

Only the four radii already present in the marketing codebase. No new value is introduced.

| Radius | Value | Used for |
|---|---|---|
| `rounded-full` | 9999px | All buttons, all badges/status pills/tags, avatars, switch track/thumb, circular icon dots, filter chips |
| `rounded-2xl` | 1rem / 16px | Modals, drawers, large dashboard/record cards, the record-detail masthead panel |
| `rounded-xl` | 0.75rem / 12px | Kanban cards, popovers, dropdown menus, comboboxes, toasts |
| `rounded-lg` | 0.5rem / 8px | Form inputs (text/select/textarea/date picker), small in-table buttons, tooltips |

No `rounded-md`, `rounded-sm`, or arbitrary radius value is used anywhere in the Business OS. If a component seems to need a fifth value, the correct fix is to reclassify it into one of the four above, not to add a fifth.

---

## 7. Border + Elevation System

### Border tokens
| Token | Light surface | Dark surface (sidebar) | Used for |
|---|---|---|---|
| `border-hairline` | `steel/15` | `paper/10` | Default row/list dividers, table row separators |
| `border-default` | `steel/20` | `paper/15` | Card edges, input resting border, panel edges |
| `border-strong` | `steel/30` | `paper/25` | Focus-adjacent emphasis, input on hover-before-focus |
| `border-emphasis` | `ink` solid, 2px | `paper` solid, 2px | Rare — a genuinely heavier section-start rule (mirrors the marketing site's `WhoWeBuildFor` `border-t-2 border-ink`), used at most once per screen |

### Surface tokens
| Token | Value | Used for |
|---|---|---|
| `surface-base` | `paper` | App content-area background |
| `surface-elevated` | `paper-elev` | Cards, inputs, modals, drawers, popovers |
| `surface-sunken` | `#EAE4D8` (a ~4% steel-toned recess of paper) — **new, not in source system, flagged** | Table header row background, code/ID blocks, any area that needs to read as *behind* the page rather than *above* it |
| `surface-inverse` | `ink` | Sidebar, scrims, emphasis panels |

### Elevation levels
Shadow is not a resting decoration in this system (Principle 18). The scale below is new — the marketing site has no named shadow scale, only bespoke per-instance values — but follows its existing convention of tinting shadows toward ink rather than using neutral gray.

| Level | Value | Used for | Resting use allowed? |
|---|---|---|---|
| `elevation-0` | none (hairline border only) | Tables, resting dashboard cards, resting kanban cards, resting form fields, sidebar | Yes — this is the default state for nearly everything |
| `elevation-1` | `0 2px 8px -4px rgba(23,20,15,0.12)` | Hover-lift on a draggable element just before drag begins; a card that's interactively "armed" | No — transient only |
| `elevation-2` | `0 8px 24px -8px rgba(23,20,15,0.18)` | Dropdowns, popovers, tooltips, the notifications panel, toasts | Yes, while open — these are floating-by-definition surfaces |
| `elevation-3` | `0 24px 48px -16px rgba(23,20,15,0.28)` | Modals, command palette | Yes, while open |
| `elevation-4` | `0 16px 32px -12px rgba(23,20,15,0.24)` + `scale(1.02)` | Actively-dragging kanban card | No — active-drag only |

**Drawer elevation** uses a directional variant of `elevation-3`, shadow only on the leading (hinge-opposite) edge: `-24px 0 48px -16px rgba(23,20,15,0.22)` for a right-anchored drawer.

**Shadows are allowed only on:** dropdowns/popovers/tooltips/menus, modals/drawers/command palette (blocking overlays), toasts (floating notifications), and the active-drag state of a draggable element. **Shadows are not allowed on:** resting table rows, resting dashboard/kanban cards, resting form fields, the sidebar, or any element whose only job is to sit on the page — those get `elevation-0` and a hairline border, full stop.

---

## 8. Motion System

The four base tokens are unchanged and inherited exactly:
```
--duration-fast: 180ms
--duration-standard: 320ms
--duration-emphasis: 620ms
--ease-out-forge: cubic-bezier(0.16, 1, 0.3, 1)
--ease-in-out-forge: cubic-bezier(0.65, 0, 0.35, 1)
```
One new value is added, because a continuous ambient loop doesn't fit the discrete state-transition model the other three describe:
```
--duration-shimmer: 1400ms   (linear, infinite — skeleton loading only)
```

### Application-specific motion

| Interaction | Duration | Easing | Notes |
|---|---|---|---|
| Hover (color/border/bg) | `fast` | `ease-out-forge` | |
| Button press (active) | `fast` | `ease-out-forge` | `scale(0.98)`, matching the marketing site's existing button pattern |
| Dropdown / popover open | `fast` | `ease-out-forge` | opacity + `translateY(-4px → 0)` |
| Drawer open | `standard` | `ease-out-forge` | `translateX` |
| Drawer close | `fast` | `ease-in-out-forge` | quicker dismissal than entrance |
| Modal open | `standard` | `ease-out-forge` | scrim fade + panel `scale(0.98→1)` + opacity |
| Modal close | `fast` | `ease-in-out-forge` | |
| Toast enter | `standard` | `ease-out-forge` | translateY + opacity |
| Toast exit | `fast` | `ease-in-out-forge` | opacity only |
| Tab change (underline sweep) | `fast` | `ease-out-forge` | Content panel swap: no animation for tables/dense content (avoids layout jank); optional `fast` fade for simple panels only |
| Table row hover | `fast` | `ease-out-forge` | Background tint only |
| Table row — new record inserted | `standard` | `ease-out-forge` | `subtle`-equivalent fade + slight translateY; only on genuine insertion, never on sort/filter/re-render |
| Command palette open/close | `fast` | `ease-out-forge` | Must feel instant — this is the app's single most latency-sensitive surface |
| Drag (in progress) | none | — | Tracks pointer 1:1, zero easing lag |
| Drag (drop/settle) | `fast` | `ease-out-forge` | Snap to final position |
| Skeleton shimmer | `shimmer` (1400ms) | linear | Continuous loop, not a state transition |
| Page transition (in-app route change) | `fast` | `ease-out-forge` | Opacity only, no `translateY` — deliberately lighter than the marketing site's 260ms translateY+opacity `PageTransition`, because app route changes happen far more often and heavier motion here reads as lag |

### Where `--duration-emphasis` (620ms) is prohibited
Any hover, button press, dropdown/popover, tab change, table-row interaction, routine modal/drawer for CRUD, toast, command-palette interaction, or page transition. It is reserved for moments that happen at most a handful of times per user, ever: first-load dashboard entrance (once per session at most), a genuine one-time celebratory confirmation (e.g., a "Deal won" moment), onboarding first-run sequences, and a workspace's first empty-to-populated transition. If it's unclear whether a given moment qualifies, it doesn't — default to `standard`.

### Reduced motion
The existing global `prefers-reduced-motion: reduce` blanket override (collapses all animation/transition durations to ~0) is inherited unchanged and its scope is extended to cover every token and component introduced in this document — shimmer becomes a static subtle fill (no loop), the command-palette scrim still fades but the panel does not scale, drag-lift's `scale`/`rotate` is suppressed. Nothing introduced here is exempt from that rule.

---

## 9. Application Shell

### Sidebar
- **Width:** 256px expanded, 64px collapsed (icon rail).
- **Background:** `ink`.
- **Logo zone:** 64px height. `LogoMark` only when collapsed; full `Logo` (rendered via `currentColor` = `paper`) when expanded — both components reused directly from the marketing codebase, unmodified.
- **Padding:** `space-sidebar-x` (12px collapsed / 16px expanded) horizontal; nav items use `space-sidebar-item-y` (8px) vertical padding — deliberately compact, since the sidebar holds five top-level sections plus their children.
- **Nav item typography:** Archivo 600, 14px (Label level, §4), tracking normal.
- **Group labels:** Mono label style (§4) — 11px, uppercase, `tracking-[0.1em]`, `paper/40` — a static (non-animated) descendant of the marketing site's `Eyebrow`.
- **Active state:** 2px `ember-deep` left-edge bar spanning the item's full height + label color `paper` (full) + icon color `ember-bright`.
- **Hover state (inactive item):** label `paper/80 → paper`, background wash `paper/[0.04]` — quiet, not the marketing header's underline-sweep (there's no room for a sweeping underline in a vertical list) and not a full color invert.
- **Collapsed state:** icon-only; hovering an item shows a `fast`-duration tooltip (elevation-2, `rounded-lg`) with the item's label.
- **Responsive:** persistent expanded ≥1280px; auto-collapses to icon rail at 1024–1279px (user can re-expand; the preference persists — exact persistence mechanism is an engineering decision, not a visual one); becomes a scrim-backed overlay drawer below 1024px.
- **Keyboard:** full tab order through visible nav items top-to-bottom; a collapse/expand toggle keybinding is a reasonable product addition but is **NOT CURRENTLY DEFINED** — flagged for a product decision rather than assumed.

### Top bar
- **Height:** 56px — shorter than the marketing header's 69px, because this is permanent chrome sitting above dense content, not a hero-adjacent nav bar.
- **Background:** `paper-elev`, solid (not translucent/blurred like the marketing header — an opaque bar keeps legibility as tables scroll beneath it).
- **Border:** `border-hairline` on the bottom edge.
- **Left:** breadcrumb (Metadata mono style, §4) — current segment in `ink` + medium weight, prior segments in `steel`, separator `/` in `steel/50`; truncates middle segments with `…` on narrow viewports.
- **Right:** global search trigger (a compact input-shaped button reading `Search… ⌘K` in mono), notification bell (icon button, §20 dimensions), account menu (avatar + name, name hidden <1024px, chevron).
- **Icon buttons:** 36×36px hit area, `rounded-lg`, hover background `ink/[0.04]`.

### Content area
- **Background:** `paper`.
- **Padding:** `space-page-x` — 24px desktop, 16px mobile/essentials view.
- **Width:** no max-width for tables/kanban/dashboards (use full available width); capped around 720–840px for narrow single-purpose panels (a settings form, a notes editor) — the same "narrower container for denser/more-focused content" principle the marketing site applies per-page, applied here per-panel.

### Breadcrumbs
Mono, 12px, `steel`; current page `ink` + medium weight; `/` separator at `steel/50`. Lives in the top bar; doubles as an implicit page-title context on detail pages rather than duplicating the record name twice.

### Global search
The top-bar trigger is a launcher only — it opens the Command Palette (below). No separate full-page search-results view is specified; if one is later needed, it is **NOT CURRENTLY DEFINED** here.

### Command palette
- **Trigger:** `⌘K` / `Ctrl+K` (a standard, widely-assumed convention — not confirmed against a Forge product spec, flagged as an assumed default pending confirmation).
- **Overlay:** `ink/50` scrim; panel centered, top-anchored ~15vh from viewport top, 560–640px wide, `paper-elev`, `rounded-2xl`, `elevation-3`.
- **Input:** full-width, top of panel, mono placeholder text, `border-hairline` beneath separating it from results — no visible box border around the input itself, the panel edge frames it.
- **Results:** grouped by record/command type using the mono group-label style; each row is Archivo 14px + optional trailing mono meta (ID, keyboard hint).
- **Selected row:** `steel/[0.08]` background + 2px `ember-deep` left bar — deliberately quieter than a full ember-soft wash, keeping ember rare even in the app's most action-dense surface.
- **Motion:** `fast` / `ease-out-forge`, both directions (§8) — must feel instant.
- **Keyboard:** ↑/↓ to navigate, `Enter` to select, `Esc` to close, full focus trap while open, focus returns to the trigger on close.

### Notifications
Two related, distinct surfaces:
1. **Panel** (bell icon → popover): ~360px wide, `rounded-xl`, `elevation-2`, grouped by day (mono date labels), each row = icon + Archivo 14px message + mono relative timestamp in `steel`; unread indicated by a small `ember-soft`-filled dot (not a row background fill).
2. **Toast** (transient, §11 Toast component): a separate, ephemeral surface for real-time events, not the persistent history above.

### Account menu
Avatar + name (hidden <1024px) + chevron → dropdown (`rounded-xl`, `elevation-2`), Archivo 14px items, `border-hairline` divider before a "Sign out" item.

**Explicit note on reference products:** the interaction *postures* above (fast, keyboard-first palette; compact, collapsible sidebar; opaque, always-legible top bar) are informed by how Linear/Raycast/Vercel/Notion/Stripe behave — never by copying their visual treatment. Every color, radius, type role, and spacing value above comes from §2–§7 of this document, not from any reference product's design system.

---

## 10. Navigation System

The frozen information architecture, implemented as the sidebar's nav tree:

```
Dashboard

CRM
 ├─ Leads
 ├─ Companies
 ├─ Contacts
 └─ Deals

Projects
 ├─ Projects
 ├─ Milestones
 ├─ Tasks
 └─ Proposals

Finance
 ├─ Invoices
 ├─ Payments
 ├─ Expenses
 └─ Forge Fund

Team
 ├─ Members
 ├─ Roles
 ├─ Payouts
 └─ Workload

Settings
 ├─ Roles & Permissions
 ├─ Integrations
 ├─ Templates
 └─ Audit Log
```

**Proposals placement:** the brief itself hedges this ("where appropriate in the project/sales workflow"). It is placed under **Projects** per the literal IA given, but a proposal is typically authored during a Deal (CRM) and converts into a Project — so the Proposal record-detail page (§15) must cross-link bidirectionally to both a Deal and a Project. The exact data-model relationship backing that cross-link belongs to the (currently absent) frozen architecture document and is **NOT CURRENTLY DEFINED** at the schema level; only its navigational position and detail-page linkage are specified here.

**Custom Fields:** the brief conditions this on "if permitted by the frozen architecture." No frozen architecture document exists in this repository, so **Custom Fields is omitted from Settings pending that confirmation** rather than silently included or excluded on assumption.

**Audit Log placement:** the brief lists Audit Log under "cross-cutting features" alongside Activities/Notes/Documents, which are inherently per-record. Audit Log is different in kind — it's a compliance/oversight surface, not a per-record annotation — so it is resolved as **both**: a per-record **Activity** tab (chronological, plain-language, includes audit-relevant entries) on every detail page (§15), *and* a dedicated **Settings → Audit Log** destination for a full cross-record, compliance-grade log. This satisfies the cross-cutting requirement without adding an unjustified new top-level rail item (Principle: "do not create unnecessary top-level navigation items").

### Cross-cutting features — placement
| Feature | Where it lives | Not a top-level nav item because |
|---|---|---|
| Search | Command palette (`⌘K`) + top-bar trigger | It's an action, not a destination |
| Notifications | Top-bar bell (panel) + toast system | Same as above |
| Activities | Per-record "Activity" tab (§15) | Only meaningful in the context of a record |
| Notes | Per-record "Notes" panel/tab (§15) | Same |
| Documents | Per-record "Documents" tab (§15) | Same |
| Audit Log | Settings → Audit Log (global) + contributes to each record's Activity tab | Global compliance view, correctly nested under Settings rather than its own rail item |

---

## 11. Core Component Library

Every component below is a **specification**, not an implementation. Format per component: anatomy · variants · sizes · states · typography · color · borders/radius · spacing · interaction · keyboard · accessibility · when to use / avoid.

### Button
- **Anatomy:** optional leading icon, label, optional trailing icon.
- **Variants:** `primary` (ember-deep fill, paper text — the one-per-screen action), `secondary` (border-default, ink text, transparent fill), `ghost` (no border, ink text, background appears on hover only), `destructive` (danger-deep border + text by default, danger-deep fill only inside a confirmation dialog's confirming action).
- **Sizes:** `sm` 32px height / `md` 36px / `lg` 44px (touch-friendly, Client Portal default).
- **States:** default, hover (`scale(1.02)` + shadow-none-to-`elevation-1` on primary only), active/pressed (`scale(0.98)`), focus-visible (unified outline, §21), disabled (`opacity-60`, `cursor-not-allowed`), loading (label replaced or preceded by `Spinner`, disabled interaction).
- **Typography:** Button text level (§4) — Archivo 600, 14px.
- **Color:** per variant, using §2/§3 tokens only.
- **Border/Radius:** `rounded-full` always; `secondary`/`destructive` use `border-default`/`danger-deep` respectively at 1px.
- **Spacing:** horizontal padding scales with size (`sm` 12px / `md` 16px / `lg` 24px); icon-to-label gap 8px.
- **Interaction:** `fast`/`ease-out-forge` for all transitions (§8).
- **Keyboard:** focusable, activates on `Enter`/`Space`.
- **Accessibility:** icon-only buttons require `aria-label`; loading state announces via `aria-busy`.
- **Use when:** any discrete, single action. **Avoid when:** two buttons of the same variant would compete for primary attention in one view — demote one to `secondary`/`ghost`.

### Input
- **Anatomy:** label, input box, optional leading/trailing icon, helper/error text.
- **Variants:** text, email, password, number (right-aligned + mono when representing currency/quantity), search (leading icon, `rounded-lg`).
- **Sizes:** `md` 36px height (default), `sm` 32px (dense inline table-edit contexts).
- **States:** default (`border-default`), hover (`border-strong`), focus (`border-strong` + unified focus outline), error (`danger-deep` border + error text below), disabled (`surface-sunken` fill, `steel` text), read-only (no box — plain text + bottom hairline only, per §14).
- **Typography:** value text = Body (§4); label = Label; helper/error = Helper/Error levels.
- **Color/Border/Radius:** `paper-elev` fill, `border-default` 1px, `rounded-lg`.
- **Spacing:** 12px horizontal / 8px vertical internal padding (`md`); label-to-input gap 4px; input-to-helper gap 4px.
- **Interaction:** border-color transition `fast`.
- **Keyboard:** standard text-field behavior.
- **Accessibility:** label always programmatically associated (`for`/`id`); error state sets `aria-invalid` + `aria-describedby`, directly extending `ContactForm.tsx`'s existing pattern.
- **Use when:** any single-line value. **Avoid when:** the value is genuinely multi-line (use Textarea) or is a constrained set of options (use Select/Combobox).

### Textarea
As Input, plus: resizable vertically only (never horizontally), minimum 3 visible rows, monospace variant available for code/ID-like free text (rare). Same states/focus/error treatment as Input.

### Select
As Input visually, plus a trailing chevron icon (rotates 180° on open, `fast`), and a `rounded-lg`, `elevation-2` option panel on open, options in Body-level Archivo, selected option marked with a leading check + `ember-deep` text. **Use when** options are few (<10) and all should be visible without typing. **Avoid when** the list is long or needs search — use Combobox.

### Combobox
Select's anatomy + a search input inside the open panel, `role="combobox"`/`listbox` ARIA pattern, arrow-key navigation, type-ahead filtering, "no results" empty state (§19) inside the panel itself. **Use when** options exceed ~10 or need fuzzy search (e.g. assigning a record owner from a team list).

### Date Picker
Input-styled trigger (formatted date + calendar icon) opening an `elevation-2`, `rounded-xl` calendar panel. Current day marked with a `border-default` ring; selected day filled `ember-deep`/paper text; range-selection (if needed) uses `ember-soft` fill between endpoints. Keyboard: arrow keys move by day, `PageUp`/`PageDown` by month, `Enter` selects, `Esc` closes.

### Checkbox
16×16px box, `rounded-lg`-derived small radius (visually ~3px given the tiny size — treated as the smallest expression of the `rounded-lg` family), `border-default` unchecked, `ember-deep` fill + white check icon when checked, indeterminate state = `ember-deep` fill + a dash. Focus ring per §21. Label always clickable (expands hit area).

### Radio
18×18px circle, same color logic as Checkbox, filled dot instead of check. Used only for genuinely mutually-exclusive, always-visible option sets (≤5) — otherwise prefer Select.

### Switch
`rounded-full` track (36×20px) + `rounded-full` thumb (16px), off = `steel/30` track, on = `ember-deep` track, thumb always paper/paper-elev with a subtle `elevation-1` while dragging. `fast`/`ease-out-forge` thumb slide. Used for immediate-effect binary settings only (not for something requiring a Save action — use Checkbox inside a form for that distinction).

### Badge
Generic, non-semantic pill: `rounded-full`, `border-default`, mono or Archivo text (context-dependent — tech/ID tags use mono per the marketing site's existing tech-tag pattern; category labels use Archivo), no fill, `steel` or `ink` text. Direct descendant of the marketing site's tech-stack tag component.

### Status Badge
Semantic-aware variant of Badge: `rounded-full`, filled with the relevant `-soft` background (§3), text in the matching `-deep` (light-surface contexts) color, no border except **Pending**, which additionally gets a 1px **dashed** border in `steel`. This is the component that actually renders "Won", "Overdue", "In Review", "Paid", etc. — it never uses ember.

### Avatar
Circular (`rounded-full`), sizes 24/32/40px. Image if available; otherwise initials on a deterministic muted background drawn from the semantic palette's `-soft` tones (never ember, to avoid implying "this person is the primary action"). A small status dot (online/away — if the product needs it) sits bottom-right, using semantic colors, `paper-elev` ring for contrast against whatever it sits on.

### Tooltip
`rounded-lg`, `elevation-2`, `ink` background + `paper` text (the one place outside the sidebar a small dark surface appears, chosen for maximum legibility at tiny size), mono or Body-small text, `fast` fade+`translateY(2px→0)`. Appears after a short hover delay (~400ms, a UX timing value, not one of the four motion durations), disappears immediately on mouse-leave.

### Dropdown
Trigger (button or icon button) + `rounded-xl`, `elevation-2` panel, Archivo 14px items, optional leading icon per item, `border-hairline` divider before a destructive item at the bottom. Opens/closes at `fast`.

### Popover
Generic positioned panel (the underlying primitive Dropdown, Tooltip, and Date Picker are all built from) — `rounded-xl`, `elevation-2`, arrow/pointer optional depending on anchor.

### Tabs
Horizontal row, Archivo 600 14px labels, `ember-deep` `2px` underline that sweeps between tabs at `fast`/`ease-out-forge` — the direct descendant of the marketing header's nav-link underline idiom, reused rather than reinvented. Inactive tab text `steel`, active tab text `ink`. Keyboard: arrow-key navigation between tabs, `Home`/`End` to jump to first/last.

### Table
See §12 in full — the largest new system in this document.

### Pagination
Cursor-style by default: `Previous`/`Next` buttons (`secondary` variant, `sm` size), disabled at either end of the result set, an optional mono "Showing 1–20" label to the left. Page-number pagination is not the default pattern (see §12 for the reasoning).

### Filter Bar
Row of `Badge`-style pill chips (steel border, inactive; `ember-deep` border + text, active) sitting above a Table or Kanban view, plus a trailing "+ Add filter" ghost button that opens a Popover/Combobox for building a new filter. A "Clear all" text link appears only when ≥1 filter is active.

### Search (inline, in-page)
Input variant with a leading search icon, used for scoping a specific list/table (distinct from the global Command Palette) — `rounded-lg`, `sm` height, debounced.

### Card
`paper-elev`, `border-default`, `rounded-2xl`, `space-card-padding-compact`/`comfortable` internal padding, `elevation-0` at rest. Used for a widget that is genuinely its own bounded unit (§16).

### Panel
A lighter-weight relative of Card — `border-hairline` only (no elevation, no distinct fill beyond `paper-elev` if needed), used to group related content without asserting full "card" visual weight (e.g. wrapping a Table that's already visually distinct enough via its own headers/borders).

### Modal
`ink/50` scrim + `paper-elev`, `rounded-2xl`, `elevation-3` panel, `space-modal-padding` internal padding, header (title + close button) / body / sticky footer (action buttons, right-aligned, primary rightmost). `role="dialog"`, `aria-modal="true"`, focus trapped, `Esc` closes, focus returns to trigger. Reserved for genuinely blocking, infrequent actions — the app should default to inline editing or a Drawer before reaching for a Modal (§1 Principle 22 and the marketing site's total absence of modals both point the same direction).

### Drawer
Slides in from the right, `paper-elev`, `rounded-2xl` on the leading edge only, directional `elevation-3` (§7), `space-drawer-padding`. Preferred over Modal for "view/edit a record without leaving context" — reuses the record-detail section anatomy (§15) at a narrower width.

### Toast
`paper-elev`, `border-default`, `rounded-xl`, `elevation-2`, bottom-right or top-right stack, optional `-deep`-colored leading accent bar (2px) matching the semantic type of the message (success/danger/warning/info), Body-small text, auto-dismiss timing is a product/UX decision (commonly 4–6s) — **NOT CURRENTLY DEFINED** as an exact value here. `aria-live="polite"` region (assertive only for a blocking error).

### Alert
Inline (non-toast) banner: `-soft` background + `-deep` text/icon/border per semantic type (§3), `rounded-lg`, used at the top of a page/section/table to communicate a persistent condition ("3 invoices overdue") rather than a one-off event (that's a Toast).

### Empty State
See §19. Dashed `border-default`, `surface-sunken` or `paper-elev` fill, centered mono caption + optional Body-small description + at most one primary action — direct descendant of `DeviceFramePlaceholder`'s honesty-first pattern.

### Skeleton
`surface-sunken` (or `steel/10`) fill blocks matching the shape of the content they stand in for, `shimmer` animation (§8), reduced-motion collapses to a static fill.

### Spinner
Small circular indicator, `ember-deep` on light surfaces / `ember-bright` on dark, used inline (button loading state, field-level async validation) — never as a full-page loading device (prefer Skeleton for anything page-shaped).

### Breadcrumb
See §9. Mono, `steel`/`ink`, `/` separators.

### Command Palette
See §9 in full.

### Timeline
Vertical `border-hairline` rail with small circular nodes (`ink`-bordered, `paper` fill; `ember-deep`-filled for the most recent/active entry) — direct descendant of `HowWeWork.tsx`'s process-step timeline. Each entry: mono timestamp, Archivo actor/action line, optional Body-small detail.

### File Upload
Dashed `border-default` drop zone (visually related to Empty State), mono instruction text, uploaded files list below as rows (icon + filename + size + remove action), progress bar (see Progress) during upload.

### Progress
Linear bar, `steel/15` track, `ember-deep` fill, `rounded-full`, animates width only (no shimmer) — represents a determinate, bounded process (upload, import), distinct from the indeterminate Skeleton/Spinner.

### KPI
Mono number (KPI level, §4) + Archivo label beneath + optional small delta indicator (▲/▼ glyph + `success-deep`/`danger-deep` text, never ember) — sits inside a Card at the top of a dashboard.

### Chart Container
`paper-elev` or `Panel`-level wrapper around a chart built per the `dataviz` skill's method with Forge's tokens substituted for its placeholder palette (ember-deep as the single categorical "hero" series accent, steel for gridlines/secondary series, mono axis labels/tooltips). Always includes a title (Section/Subsection title level) and, where relevant, a compact legend using the same mono label style as table headers.

### Confirmation Dialog
A small Modal variant: one sentence of body copy, one `secondary` action (Cancel) + one `primary` or `destructive` action (rightmost, matching the marketing site's two-button-variant vocabulary exactly — no third button style is introduced for this component).

---

## 12. Data Table System

The single largest net-new system in this document — the marketing site has no real tabular data anywhere.

- **Density — compact (default):** row height 36px, cell padding `space-table-cell-y-compact` (8px) / `space-table-cell-x` (12px), Body-small text.
- **Density — comfortable:** row height 48px, cell padding `space-table-cell-y-comfortable` (12px) / `space-table-cell-x` (12px), Body text. A per-view, user-toggleable option — never the default.
- **Column headers:** `surface-sunken` background, Table header type level (§4 — mono, uppercase, `tracking-[0.08em]`, `steel`), sticky on vertical scroll. Sort indicator: a chevron that appears on hover (steel) and turns `ember-deep` + stays visible when that column is the active sort.
- **Sorting:** single-column sort by default (multi-column sort, if needed, is a `Shift+click` power-user affordance — flagged, not assumed required).
- **Filtering:** via the Filter Bar component (§11) above the table, not inline per-column filter inputs (keeps the header row purely structural/mono).
- **Selection:** leading checkbox column; a selected row gets `ember-soft` background (the one deliberate, temporary exception to "no ember fills" — selection is an active interaction state, not a resting decoration, matching how the command palette's selected-row treatment reasons about ember); header checkbox reflects none/some(indeterminate)/all.
- **Bulk actions:** when ≥1 row is selected, the Filter Bar area is replaced by a contextual action bar (selection count + `secondary`/`ghost` action buttons, one `destructive` if applicable).
- **Pagination:** cursor-style (`Previous`/`Next`, §11 Pagination) is the default UI pattern, chosen because it degrades gracefully regardless of whether the backing query is cursor- or offset-based — the exact backend pagination strategy is a database/API decision and is **NOT CURRENTLY DEFINED** here.
- **Row actions:** a trailing `⋯` icon button opening a Dropdown (edit/duplicate/archive/delete), or 1–2 inline icon buttons for the most common actions plus an overflow menu for the rest — never more than 2 persistent inline icons before deferring to the overflow menu, to keep rows scannable at compact density.
- **Empty state:** the Empty State component, sized to fill the table's normal content area.
- **Loading state:** Skeleton rows matching the target row height/column widths, not a centered Spinner (a spinner disconnects from the eventual layout; skeleton rows don't).
- **Error state:** an Alert (danger variant) at the top of the table area with a "Try again" action; the table structure (headers) stays visible rather than the whole region collapsing.
- **Responsive:** horizontal scroll is the primary strategy below 1024px (direct precedent: `Workflow.tsx`'s existing horizontally-scrolling step rail), with a subtle edge fade indicating more columns exist, rather than a column-priority-collapse strategy.
- **Keyboard:** arrow keys move a focused cell/row indicator, `Enter` opens the row's detail page, `Space` toggles that row's selection checkbox, `Cmd/Ctrl+A` selects all rows (scope — visible page vs. entire filtered result set — is a product decision, **NOT CURRENTLY DEFINED**, flag before implementing).

**Explicitly ruled out:** zebra striping (would compete with the borders-do-the-work principle), wrapping every row in its own card (§1 Principle 6), and a bold full color-invert row hover (reserved for the marketing site's low-frequency contexts, wrong for a table scanned dozens of times a day — see §2's hover-state guidance).

---

## 13. Kanban System

- **Column anatomy:** fixed width 280–320px, `paper` background, sticky header (mono count badge + Archivo 600 label), independent vertical scroll per column.
- **Card anatomy:** `paper-elev`, `border-default`, `rounded-xl`, `space-card-padding-compact` (16px) padding, `elevation-0` at rest. Title = Body/Subsection-weight Archivo; meta row (ID, due date) = Metadata mono style in `steel`; status = a `Status Badge` (§11/§3) — **never** a colored card background or border, satisfying the requirement that status must not be communicated by giant colored cards; optional trailing `Avatar` for assignee.
- **Drag state:** `elevation-4` + `scale(1.02)`; a small `rotate(1–2deg)` is permitted as a human touch but is suppressed entirely under `prefers-reduced-motion`; the card's origin-position placeholder drops to ~40% opacity.
- **Drop state:** the target column gets a dashed `ember-soft`-toned inset outline while a card is dragged over it; on drop, the card snaps to its final position at `fast`/`ease-out-forge` (§8).
- **Keyboard alternative:** every card is focusable and exposes a "Move to…" action (via its row-action Dropdown or a dedicated keybinding) that opens a small menu listing destination columns — this is the accessible, non-drag equivalent required by §21, not an afterthought bolted on later.
- **Responsive:** horizontal scroll-snap per column below 1024px (~1.5–2 columns visible on tablet); the mobile "essentials" view (§7/§22) does not attempt full kanban — it offers a single-column, swipeable list instead.

---

## 14. Forms

Directly extends `ContactForm.tsx`'s existing visual language (`rounded-lg` inputs — the one deliberate exception to pill-everything — `border-default`, `ember-deep` error text, Archivo semibold labels) with what a dense operational app additionally needs.

- **Field:** Label (4px gap) → Input (4px gap) → Helper/Error text. Field-to-field gap: `space-form-field-gap` (16px). Section-to-section gap: `space-form-section-gap` (32px), each section introduced by a Subsection-level heading and, optionally, a mono helper kicker.
- **Required indicator:** an `ember-deep` asterisk immediately after the label text — always paired with the visible glyph, never color alone, so it doesn't depend on color perception.
- **Disabled:** `surface-sunken` fill, `steel` text, `cursor-not-allowed`, `border-hairline` (lighter than the active default, signaling reduced affordance).
- **Read-only:** no input box at all — rendered as plain Body text with a `border-hairline` beneath, distinct from Disabled (this is data, not a control that happens to be off).
- **Loading (field-level):** small `Spinner` at the input's trailing edge (e.g. async username/slug validation).
- **Success (field-level):** a thin `success-deep` border + small check icon, transient — fades after a few seconds or on blur, never a permanent green box.
- **Validation:** on-blur for the first pass; once an error has been shown for a field, subsequent validation on that field goes live (on-change), so the user gets immediate relief while fixing it.
- **Multi-column layouts:** 2-column grid (`sm:grid-cols-2`, matching `ContactForm.tsx`'s existing pattern) for short paired fields; single column for anything needing full reading width (textareas, long selects, currency+description pairs).
- **Form sections:** grouped under a Subsection heading, used for genuinely long forms (a full record-edit page) — short forms (a quick "add contact" drawer) don't need sectioning.
- **Sticky actions:** for any form long enough to scroll, the primary/secondary action bar sticks to the bottom of its container (viewport, modal, or drawer footer) with a top `border-hairline` + `paper-elev` background, so Save is always reachable.
- **Unsaved changes:** a small mono "Unsaved changes" indicator near the sticky action bar; Cancel triggers a lightweight Confirmation Dialog only when there are non-trivial unsaved edits, not on every dismiss.
- **Unified focus treatment:** every form control uses the single `:focus-visible` treatment from §21 — this explicitly resolves the marketing codebase's inconsistency (a global `ember-deep` outline vs. form inputs' separate `ring-2 ring-ink/20`). The Business OS ships one rule, everywhere, including inside Comboboxes, Date Pickers, and custom controls.

---

## 15. Record Detail Pages

A reusable architecture applied to: Company, Contact, Lead, Deal, Proposal, Project, Invoice, Payment, Maintenance Contract, Support Ticket. Visual ancestor: the case-study page's masthead → structured-sections pattern, the closest existing precedent in the source system for "one entity, many structured facts about it."

- **Masthead:** mono kicker (record type + Status Badge), Page-title-level Archivo H1 (record name), a key-facts `dl` row directly modeled on `FeaturedWork.tsx`'s Industry/Stack treatment — exact fields per entity are data-model-dependent and **NOT CURRENTLY DEFINED** beyond the pattern itself (e.g. a Deal's `dl` would show Stage/Value/Owner/Close-Date; the authoritative field list belongs to the frozen architecture document, which does not exist in this repo).
- **Primary action:** exactly one `primary` Button, top-right of the masthead (e.g. "Send Invoice," "Mark Won") — Principle 1 applied at the page level.
- **Secondary actions:** `secondary`/`ghost` buttons or an overflow Dropdown, grouped beside the primary action.
- **Tabs:** Overview / Activity / Documents / Related, plus entity-specific tabs where warranted (e.g. "Line Items" for Invoice, "Milestones" for Project) — using the Tabs component (§11).
- **Overview:** the default tab; two-column layout on wide screens (~65% main content / ~35% sidebar metadata), collapsing to a single column below 1024px with the sidebar info moving beneath the main content.
- **Timeline:** the Activity tab uses the Timeline component (§11), and is where Audit-Log-relevant entries surface in plain language (§10).
- **Related records:** a compact Table or card-list of linked entities (e.g. a Company's related Contacts/Deals), using §12's dense-table rules at a smaller scale within a Panel.
- **Documents:** File Upload (§11) + a list of existing files as rows.
- **Sidebar information:** a mono-labeled key/value stack (owner, created date, last activity, tags) — the vertical counterpart of the masthead's `dl`.
- **Responsive:** masthead stacks title above metadata below ~768px; tabs become a horizontally-scrollable row; the two-column Overview collapses to one column.

---

## 16. Dashboard System

**Explicit rule (per the brief):** not every widget is a Card. The type is chosen per widget:

| Widget | Type | Why |
|---|---|---|
| KPI tiles | **Card** | Each is a distinct "mini-app" needing a visible boundary; sits in a row of 3–4 at the top |
| Pipeline summary | **Card** wrapping a compact Chart | A summary visualization, not the full interactive Kanban (which lives at CRM → Deals) |
| Outstanding invoices | **Table** inside a `Panel` (hairline only, not a heavy Card) | Inherently tabular data; a second card boundary around an already-bordered table is redundant framing (Principle 6) |
| Active projects | **Table** | Scan-ability at a glance beats a row of project cards for this context |
| Tasks (personal, short list) | **Flat section** (checkbox rows, no card/table chrome) | Low row count, high interaction frequency (checking items off) — chrome would just get in the way |
| Recent activity | **Timeline** | Chronological, narrow-column data — the Timeline component, not a table |
| Notifications | Not typically a dashboard widget (lives in the top bar); if surfaced, a compact **Timeline**-style list | Avoids duplicating the notifications panel's job |
| Charts (revenue trend, etc.) | **Chart Container** | Used for trend/shape data; never replaces a Table where exact values matter more than the trend's shape |

**Grid:** `space-dashboard-gap` (16–24px) between widgets, KPI row 3–4 across on desktop dropping to 2 across at the laptop breakpoint and 1 across below 768px (§22); widget area below uses a 2-column or 2/3+1/3 asymmetric split depending on content weight, single column below 1024px.

**Rule against over-carding:** if a widget's own component (Table, Timeline, Chart Container) already implies a visible boundary, it does not additionally get wrapped in a generic Card — one boundary per widget (Principle 6, restated here because the dashboard is where this mistake is most tempting).

---

## 17. Finance UI

- **Currency display:** `₹` prefix, no space, IBM Plex Mono, Indian digit grouping (lakhs/crores — e.g. `₹1,24,500`), matching the marketing site's existing `₹5,000+` pricing convention.
- **Alignment:** every financial number is right-aligned within its column/context and set in `tabular-nums`, so digits align vertically across rows — non-negotiable wherever money appears (table cells, KPI tiles, summary totals).
- **Positive/negative values:** `success-deep` text for positive/credit/paid movements, `danger-deep` for negative/debit/overdue movements — **never ember**. An optional leading ▲/▼ mono glyph reinforces direction so the signal doesn't rely on color alone.
- **Totals/subtotals:** subtotal rows use the Financial-number (table-cell) level; the grand total row gets a `border-strong`/`border-emphasis`-weight top border (heavier than the hairlines used elsewhere in the ledger) and steps up to the Financial-number (summary) weight/size — a direct descendant of the pricing table's existing bordered-row-separator convention.
- **Tax/GST:** rendered as ordinary labeled line items within the same mono right-aligned stack — `steel` Body-small label to the left, mono value to the right. Structural, not status — no semantic color.
- **Outstanding:** `Status Badge`, **Neutral** (steel) — merely unpaid-but-not-yet-due isn't inherently a bad state.
- **Paid:** `Status Badge`, **Success**.
- **Overdue:** `Status Badge`, **Danger**.
- **Manual Forge Fund contribution/withdrawal:** rendered as typed rows in a ledger Table (mono label "Contribution"/"Withdrawal" rather than an icon-only cue), value color following the same positive/negative rule (contribution = `success-deep`, withdrawal = `danger-deep`) — no Forge-Fund-specific color is introduced.
- **Allocation** (e.g. splitting a payment across invoice line items, or allocating Forge Fund toward a purpose): represented with either a simple horizontal proportion bar (`steel`/`ember-soft` segments) or a small Table — no new visual metaphor is introduced beyond these two existing primitives.

---

## 18. Client Portal

`portal.forgebuilds.in` — visually related to the Business OS but deliberately closer in register to the marketing site: **paper throughout, no ink sidebar.**

- **Shell:** a simple top bar (Logo + minimal nav: Overview / Milestones / Invoices / Documents / Support) on `paper-elev` with a `border-hairline` bottom edge — no command palette, no dense sidebar.
- **Project overview:** the masthead pattern from §15 — Archivo H1 project name, mono status kicker, key-facts `dl`.
- **Milestones:** a `HowWeWork.tsx`-derived timeline (numbered circles + connecting line), each milestone carrying a `Status Badge` (not started / in progress / complete).
- **Proposals:** rendered as a read-focused document view — **this is the one place in the Business OS ecosystem where Source Serif 4 is the primary body font**, since it's long-form, client-facing prose meant to be read, not scanned (Principle 15's exception). A clear, sticky Accept / Request Changes primary+secondary action pair sits at the bottom.
- **Invoices/Payments:** a simplified version of §17's rules — fewer columns, larger touch targets, a single prominent `primary` "Pay Now" button per outstanding invoice.
- **Documents:** a simple file list (icon + name + date + download) — no upload/management chrome; the client only ever downloads here.
- **Handover:** a milestone/document bundle marking project completion, treated as a restrained celebratory moment — the one legitimate place `emphasis`-tier (620ms) motion may play once, per §8's exception list.
- **Support:** a contact/ticket form that should look near-identical to `ContactForm.tsx` on purpose — same `rounded-lg` inputs, same `ember-deep` submit button — because this is the same external-facing register as the marketing site's own contact form.

**Explicit differences from the internal OS:** no dense tables, no Kanban, no command palette (or at most a minimal one), larger spacing and touch targets throughout, and `Reveal`-style scroll-entrance motion is legitimately allowed on first view of each section — the Client Portal is visited infrequently enough that a little polish reads as care rather than friction, unlike the internal app where the same motion would read as drag.

---

## 19. Empty / Loading / Error / Success States

One consistent state language across the whole product:

- **Empty:** dashed `border-default`, `surface-sunken`/`paper-elev` fill, centered mono caption stating plainly what's missing ("No deals in this stage yet"), optional Body-small elaboration, at most one primary action. Direct descendant of `DeviceFramePlaceholder.tsx` — no decorative illustration, no mascot.
- **Loading:** skeleton-first (§11 Skeleton) for anything page- or list-shaped; a `Spinner` only for button-level or small inline async states. Never a centered full-page spinner for a view whose eventual layout is already known.
- **Error:** an `Alert` (danger variant) with a calm, specific message and a "Try again" action — never a red full-screen takeover, never a stack trace. Tone matches the marketing site's "state the honest current state" instinct (Outcome.tsx's "no retention percentages... to report here" is the model).
- **Success:** an inline confirmation with a concrete next step, directly modeled on `ContactForm.tsx`'s existing "submitted" readback pattern (a `dl`-style summary of what happened) rather than a bare checkmark or generic toast — a toast is appropriate for a minor action, but a significant one (invoice created, deal marked won) deserves the fuller readback treatment.

**Decorative illustrations are not used** anywhere in this state language unless a specific Forge-branded illustration is deliberately commissioned for a genuinely rare, high-value moment (the Client Portal's Handover state is the only candidate identified in this document) — the default for every empty/loading/error state is typographic and structural, not illustrative, consistent with the source system's demonstrated allergy to decorative fluff.

---

## 20. Iconography

- **Style:** line/stroke icons, not filled/solid — filled icon sets would visually compete with the hairline-border language that does most of the system's structural work.
- **Stroke weight:** 1.5px at 20px icon size.
- **Size scale:** 16px (inline with text-sm content), 20px (default — nav, buttons, table row actions), 24px (empty states, larger standalone contexts). No arbitrary in-between sizes.
- **Alignment:** optically centered against the adjacent text baseline; icons are never stretched or distorted from a square aspect ratio.
- **Icon button dimensions:** 32px (compact/table-row actions), 36px (default/top bar), 44px (touch-friendly — Client Portal, mobile essentials view) — square hit areas, icon centered with 8–10px internal padding.
- **Semantic usage:** an icon's color follows the exact same rules as adjacent text (§2/§3) and status is never conveyed by icon color alone — it is always paired with a text label or Status Badge, satisfying the accessibility requirement that color is never the only signal.
- **Icon library:** no icon set exists in the current codebase. This document specifies the *visual requirements* an icon set must satisfy (stroke-based, 1.5px weight, geometrically clean, no ornate/multi-color/cartoon styling that would clash with the restrained line-icon system) rather than naming a specific library — the exact choice (e.g. a Lucide/Feather-style open-source set) is an engineering decision and is **NOT CURRENTLY DEFINED** here. It does not need to echo the logo's angularity — the logo's faceted geometry is a singular brand mark, not a rule that every icon in the product must also be angular.

---

## 21. Accessibility

- **WCAG AA contrast:** every text/background pairing meets ≥4.5:1 (normal text) / ≥3:1 (large text, ≥24px or ≥19px bold) against its actual rendered background — validated per §2/§3's computed values, not assumed. Non-text UI (icon-only buttons, focus outlines, input borders) meets ≥3:1 against its adjacent surface.
- **Keyboard navigation:** every interactive element reachable via `Tab` in logical DOM order, no positive `tabindex`, a skip-to-main-content link in the app shell (extending the marketing site's existing skip-link pattern).
- **Focus:** one unified `:focus-visible` treatment — 2px solid `ember-deep` outline, 2px offset, on light surfaces; 2px solid `ember-bright`, 2px offset, on dark/sidebar surfaces (§2/§9). Never suppressed via `outline: none` without an equivalent replacement.
- **Screen readers:** semantic HTML first — real `<table>`, real `<button>`, real landmark regions (`<nav>`, `<main>`, `<aside>`) for the app shell. ARIA fills genuine gaps only: combobox pattern, dialog role for Modal/Drawer/Command Palette, live regions for Toast.
- **Tables:** a visually-hidden heading or `<caption>` naming the table's purpose, `<th scope="col">` for column headers, individually labeled selection checkboxes ("Select row: {record name}").
- **Dialogs (Modal/Drawer/Command Palette):** `role="dialog"` + `aria-modal="true"`, labelled by their own heading, focus moves in on open and returns to the trigger on close, full focus trap while open, `Esc` closes.
- **Comboboxes:** full `aria-expanded`/`aria-activedescendant`/`role="listbox"` pattern, arrow-key navigation, type-ahead.
- **Command palette:** the same dialog pattern plus combobox/listbox semantics for its results.
- **Notifications:** the Toast container is `aria-live="polite"` (assertive only for a genuinely blocking error); the persistent notifications panel is a normally-labeled region, not a live region, to avoid over-announcing.
- **Drag/drop alternatives:** Kanban's "Move to…" menu (§13) is the required non-drag equivalent; any future drag interaction must ship an equivalent control before launch, not after.
- **Reduced motion:** the existing global blanket rule is extended to every token/animation this document introduces (shimmer, drawer/modal transitions, drag lift, command palette) — verified per-component, not assumed inherited.
- **Touch targets:** minimum 44×44px throughout the Client Portal and the internal OS's mobile essentials view; the internal desktop-dense UI may use smaller *visual* targets (e.g. 32px table row-action icons) but the *clickable* area stays ≥32×32px even when the glyph is smaller, and the full table row remains the primary click target for opening a record (§12).

---

## 22. Responsive System

| Range | Internal OS (`app.forgebuilds.in`) | Client Portal (`portal.forgebuilds.in`) |
|---|---|---|
| **≥1280px** (desktop) | Sidebar expanded (256px) by default. Tables show all columns. Kanban shows 4+ columns. Dashboard: 3–4 KPI cards across + 2-column widget area. Forms multi-column. Detail pages 2-column (main + sidebar). | Full layout, generous spacing, single centered content column matching the marketing site's `max-w-4xl`-scale containers. |
| **1024–1279px** (laptop) | Sidebar auto-collapses to icon rail (64px), user-reversible. Tables begin horizontal-scrolling or drop lowest-priority columns. Kanban shows ~3 columns. Dashboard drops to 2 KPI cards across, widgets stack. Detail-page 2-column layout holds but narrows. | Same as ≥1280px, content column narrows proportionally. |
| **768–1023px** (tablet) | Sidebar becomes a scrim-backed overlay drawer (hidden by default, hamburger trigger in top bar). Tables horizontal-scroll. Kanban shows 1.5–2 columns with scroll-snap. Dashboard grid single column, widgets stack. Forms drop to single column. Detail pages drop to single column (sidebar info moves below main content). | Single-column, stacked sections — direct reuse of the marketing site's proven tablet behavior. |
| **<768px** (mobile) | **Reduced "essentials" view only** — notifications, quick-approve actions, record lookup/search. Full table/kanban/dashboard operation is explicitly not attempted here (desktop-first, per the brief). | **Full, near-parity experience** — stacked single-column sections, `space-page-x` (16px) gutter, full-width `primary` CTAs matching the marketing mobile-nav's full-width "Start a Project" treatment. Mobile-friendly is a hard requirement here, unlike the internal OS. |

---

## 23. Component Architecture

A four-tier structure, distinguishing components by how much domain knowledge they carry:

```
components/
  ui/               PRIMITIVES — Button, Input, Textarea, Select, Checkbox, Radio,
                     Switch, Badge, Avatar, Tooltip, Spinner, Skeleton, Progress
                     (no app-domain awareness; could ship as a standalone library)

  overlays/         COMPOSITES — Modal, Drawer, Popover, Dropdown, CommandPalette,
                     ConfirmationDialog, Toast/ToastProvider
                     (combine primitives + positioning/portal/focus-trap logic;
                     domain-agnostic)

  data-display/      COMPOSITES — Table, Pagination, FilterBar, Tabs, Timeline,
                     KPI, ChartContainer, Breadcrumb, EmptyState
                     (data-shape-aware, domain-agnostic)

  forms/             COMPOSITES — Field (label+input+helper+error wrapper),
                     Combobox, DatePicker, FileUpload, FormSection, StickyFormActions

  navigation/        Shell-specific composites — Sidebar, TopBar, AccountMenu,
                     NotificationsPanel, SearchTrigger

  feedback/          Alert, StatusBadge (semantic-aware wrapper around Badge),
                     inline success/error presentational components

  charts/            Thin, Forge-token-themed wrappers around the dataviz-skill
                     chart implementations

  crm/               DOMAIN — LeadCard, DealPipelineColumn, ContactMasthead,
                     CompanyMasthead, DealStageBadge (wraps StatusBadge with
                     CRM-specific stage vocabulary)

  projects/          DOMAIN — ProjectMasthead, MilestoneTimeline, TaskRow,
                     ProposalDocument, KanbanBoard (built from data-display
                     primitives + kanban drag logic)

  finance/           DOMAIN — InvoiceTable, InvoiceLineItems, PaymentStatusBadge,
                     LedgerRow, ForgeFundSummary, CurrencyValue (the mono /
                     tabular-nums / right-align wrapper used everywhere money appears)

  team/              DOMAIN — MemberCard, RoleBadge, PayoutTable, WorkloadChart

  shared/            Cross-domain glue — RecordDetailLayout (the reusable
                     masthead+tabs+sidebar architecture from §15, parameterized
                     per entity), ActivityFeed, DocumentsList, NotesPanel,
                     AuditLogTable

  brand/             Reused as-is from the marketing codebase, unmodified —
                     Logo, LogoMark, HoverArrow
```

**PAGE COMPONENTS** live at the routing layer (`app/(dashboard)/...`, `app/(crm)/deals/[id]/...`, etc.) — they compose `crm`/`projects`/`finance`/`shared`/`data-display` components plus data fetching, and introduce **zero** new visual/styling decisions of their own. If a page component needs a style decision this document hasn't made, that's a signal to extend this document (Principle 8), not to style inline.

**Tier definitions, restated:**
- **Primitives** — no knowledge of app domain, single-purpose, highly reusable.
- **Composites** — combine primitives + interaction/positioning logic, still domain-agnostic.
- **Domain components** — know CRM/Finance/Projects/Team vocabulary (stages, invoice statuses, deal values) and compose primitives/composites with that vocabulary baked in.
- **Page components** — route-level composition + data fetching only.

---

## 24. Design Tokens File (proposed inventory)

This is an inventory for a future `globals.css` (or equivalent centralized token file) — **not the file itself.**

### Colors (21)
`ink` · `paper` · `paper-elev` · `ember` · `ember-soft` · `steel` · `ember-deep` · `ember-bright` *(8, existing — unchanged)*
`success-deep` · `success-bright` · `success-soft` *(3, new)*
`danger-deep` · `danger-bright` · `danger-soft` *(3, new)*
`warning-deep` · `warning-bright` · `warning-soft` *(3, new)*
`info-deep` · `info-bright` · `info-soft` *(3, new)*
`surface-sunken` *(1, new)*
*(Neutral and Pending reuse `steel` — no new token)*

### Typography (33)
Families: `font-display` (Archivo) · `font-body` (Source Serif 4) · `font-mono` (IBM Plex Mono) *(3, existing)*
Weights: `400*` · `500` · `600` · `700` · `800` *(5 — `400` flagged as requiring a new font-load addition)*
Raw sizes: `11px` · `12px` · `13px` · `14px` · `15px` · `16px` · `20px` · `24px` · `28px` · `32px` *(10)*
Semantic scale levels (§4 table): page-title, section-title, subsection, body, body-small, label, mono-label, metadata, table-header, kpi-number, financial-number-cell, financial-number-summary, button-text, helper-text, error-text *(15)*

### Spacing (26)
Raw scale: `0,1,2,3,4,5,6,8,10,12,16,20` *(12 steps)*
Semantic aliases: `page-x` · `section-gap` · `card-padding-compact` · `card-padding-comfortable` · `table-cell-x` · `table-cell-y-compact` · `table-cell-y-comfortable` · `form-field-gap` · `form-section-gap` · `sidebar-x` · `sidebar-item-y` · `modal-padding` · `drawer-padding` · `dashboard-gap` *(14)*

### Radius (4)
`rounded-full` · `rounded-2xl` · `rounded-xl` · `rounded-lg` *(all existing, reused — no new values)*

### Borders (7)
Light: `border-hairline` · `border-default` · `border-strong` · `border-emphasis` *(4)*
Dark: `border-hairline` · `border-default` · `border-strong` *(3 — dark surfaces have no `emphasis` equivalent defined; would default to `border-emphasis`'s `paper`-solid form if ever needed)*

### Elevation (6)
`elevation-0` · `elevation-1` · `elevation-2` · `elevation-3` · `elevation-4` *(5)* + drawer directional shadow variant *(1)*

### Motion (6)
`duration-fast` · `duration-standard` · `duration-emphasis` *(3, existing)* + `duration-shimmer` *(1, new)* + `ease-out-forge` · `ease-in-out-forge` *(2, existing)*

### Breakpoints (4)
`sm 640px` · `md 768px` · `lg 1024px` · `xl 1280px` *(Tailwind defaults, confirmed unchanged — no new breakpoint values; the "laptop" range is a named alias of `lg`–`xl`, not a new value)*

### Z-index (9) — **new; NOT CURRENTLY DEFINED in the source system**, which only has ad hoc values (`z-40` mobile nav, `z-50` sticky header, `z-100` skip-link) with no formal scale. Proposed:
```
z-base: 0
z-sticky: 10        (sticky table headers, sticky form actions)
z-sidebar: 20
z-topbar: 30
z-dropdown: 40       (dropdown / popover / tooltip)
z-drawer: 50
z-modal-scrim: 60
z-modal: 61
z-command-palette: 70
z-toast: 80
```

**Total: 116 tokens** (21 color + 33 typography + 26 spacing + 4 radius + 7 border + 6 elevation + 6 motion + 4 breakpoint + 9 z-index).

---

## 25. Design QA Checklist

For Claude Code (or any reviewer) to run against every Business OS screen before it ships.

**Typography & color**
- [ ] Archivo used for all UI chrome; Source Serif 4 used only for genuine long-form prose (never a table cell, button, or label)
- [ ] IBM Plex Mono used for all IDs, timestamps, financial/KPI numbers, table headers, and kicker labels
- [ ] Only tokens from §2/§3 are used — no arbitrary hex values, no ad hoc `rgba()` invented inline
- [ ] Ember appears in at most 1–2 places in the current view, and never as a status/semantic color
- [ ] Semantic status colors (§3) used correctly — Success/Danger/Warning/Info/Neutral/Pending match their defined `forbidden usage` is respected
- [ ] Financial numbers are mono, `tabular-nums`, right-aligned

**Density & layout**
- [ ] Table density defaults to compact (36px rows) unless the user has opted into comfortable
- [ ] No zebra striping on tables
- [ ] No unnecessary card wrapping — a Table/Timeline/Chart Container is not re-wrapped in a redundant Card (§16)
- [ ] Spacing uses only the §5 scale — no arbitrary padding/margin values
- [ ] Radius uses only the four values in §6 — no fifth radius introduced

**Borders & elevation**
- [ ] Hairline borders, not shadows, do the structural separation work by default
- [ ] Shadows appear only on the allowed surfaces (§7): dropdown/popover/tooltip, modal/drawer/command-palette, toast, active-drag — never on a resting card/row/field
- [ ] No random/unscaled shadow values — only the five `elevation-*` levels

**Motion**
- [ ] Only the documented durations/easings (§8) are used
- [ ] `duration-emphasis` (620ms) is not used on any routine/high-frequency interaction
- [ ] No marketing-only animation (`Reveal`, `TextReveal`, `CornerMarks`, scroll-triggered reveals) appears in the internal OS interior — reserved only for the Client Portal's explicitly-noted exceptions
- [ ] `prefers-reduced-motion` is respected for every animation/transition introduced on the screen, including shimmer

**Components & consistency**
- [ ] Every UI element is drawn from the §11 component library, not a one-off inline implementation
- [ ] Exactly one `primary` button is visible per screen/view
- [ ] Status is communicated via `Status Badge`, never via a giant colored card/row background
- [ ] The single unified focus treatment (§21) is applied to every interactive element on the screen — no divergent focus styles

**Accessibility**
- [ ] All text/background pairs meet WCAG AA (≥4.5:1 normal, ≥3:1 large) using only validated tokens from §2/§3
- [ ] Fully keyboard operable: logical tab order, visible focus, no keyboard traps
- [ ] Interactive target sizes meet the §21 minimums (44px Client Portal/mobile, ≥32px clickable area on dense desktop UI)
- [ ] Tables use real semantic markup (`<table>`, `<th scope>`) with a named purpose
- [ ] Dialogs (modal/drawer/command palette) trap focus, are labelled, and return focus on close
- [ ] Any drag interaction ships a non-drag keyboard alternative

**Data integrity**
- [ ] No fabricated data, placeholder statistics, or invented figures presented as real (§1 Principle 23) — if data doesn't exist yet, the screen shows an honest Empty State, not a fake number
- [ ] Any placeholder content is visibly marked as a placeholder (dashed border + caption), never styled to look like real content

**States**
- [ ] Empty, Loading, Error, and Success states are all implemented for any view that can be in any of those states — not just the happy path
- [ ] Loading uses Skeleton (shape-matched) rather than a disconnected full-page spinner where the eventual layout is already known

**Responsive**
- [ ] Behavior is defined and correct at all four §22 breakpoints for the surface being reviewed (Internal OS vs. Client Portal have different rules — confirm the right one was applied)
- [ ] The internal OS does not attempt full table/kanban/dashboard operation below 768px; the Client Portal does provide a full, usable experience at that width

**Brand fit**
- [ ] No gradients used as fills (decorative-accent-only gradients, if any, match the marketing site's restrained precedent)
- [ ] No glassmorphism beyond the top bar's specifically-justified use, if any
- [ ] No generic "AI dashboard" neon/dark-glow aesthetic
- [ ] Screen does not read as a generic, unthemed admin-template starter kit — apply the "could a competitor's SaaS have shipped this exact screen unmodified" test

---

*This document specifies but does not implement the Forge Business OS design system. No files in the existing marketing codebase were modified. No packages were installed. No commits were made. No dashboard, CRM, finance, or project screens were built.*
