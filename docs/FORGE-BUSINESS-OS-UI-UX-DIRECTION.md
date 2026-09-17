# FORGE Business OS — UI/UX Direction

**Type:** Research / design audit. No code was written or modified to produce this document.
**Source inspected:** the full `forgebuilds.in` Next.js codebase at `/Users/atharva/Forge` (App Router, TypeScript, Tailwind CSS v4, CSS-first config — no `tailwind.config.*` file exists; all tokens live in `src/app/globals.css`).
**Purpose:** extract the existing visual language as ground truth, then define how it should translate into `app.forgebuilds.in`, the Forge Business OS / CRM — a professional, internal, daily-use software product.

> **Flag before anything else:** the brief for this audit named the brand statement "ENGINEER. BUILD. DEPLOY." That string does not exist anywhere in this codebase — not in copy, metadata, or components. The locked, verbatim strategy actually in the repo (`CLAUDE.md`, `src/lib/seo.ts`) is the primary tagline **"Websites and software your business actually runs on"** and the UVP **"We build websites and software that businesses actually run on — not just launch and forget."** This document treats the codebase as source of truth and does not use "ENGINEER. BUILD. DEPLOY." anywhere below. If that statement is real and meant to apply to the Business OS specifically, it needs to be confirmed with the user before it's built on top of — per this repo's own rule: *"If any build decision conflicts with what's below, stop and ask."*

---

## 1. Design Language

### Overall visual identity
Forge reads as **editorial engineering** — a print-magazine sense of typographic hierarchy and negative space, laid over a technical/blueprint visual vocabulary (grid lines, coordinate labels, mono spec tags, numbered ledgers). It is not a SaaS product today; it's a two-color (ink/paper) marketing site that borrows credibility signals from engineering documentation — schematic grids, corner registration marks, monospace "spec labels" — without actually being a technical tool. That borrowed vocabulary is exactly what makes it translate well to a real SaaS app.

### Editorial vs SaaS characteristics
| Editorial (present, strong) | SaaS (absent today) |
|---|---|
| Large serif body copy, generous line-height | Data tables, dense grids |
| Numbered section ledger (01→11) on every page | Persistent app chrome (sidebar, top bar) |
| Full-bleed ink/paper color bands per section | Multi-state components (loading/error/empty) |
| Word-by-word headline reveals, scroll reveals | Command palette, keyboard-first navigation |
| One flagship narrative page (the case study) | Real-time/live data, notifications, badges with semantic color |

The Business OS has to keep the editorial *discipline* (hierarchy, restraint, one accent color, confident negative space) while adding the SaaS *vocabulary* the marketing site never needed.

### Typography hierarchy
Three-font system, strictly role-separated, loaded via `next/font/google` in `src/app/layout.tsx`:
- **Archivo** (`--font-archivo`, weights 600/700/800) → `--font-display`. All headings (`h1`–`h6` are globally set to `font-display` in `globals.css`), nav labels, buttons, form labels, badges/tags, section numerals when bold.
- **Source Serif 4** (`--font-source-serif`, weight 400 only) → `--font-body`, the default `body` font. Used exclusively for paragraph copy and case-study narrative — never for UI chrome.
- **IBM Plex Mono** (`--font-ibm-plex-mono`, weights 400/500) → `--font-mono` / the `.mono` utility class. Used only for: eyebrows, section numerals ("01", "02"...), spec-style labels ("CAPABILITY STUDY / 01—05"), tech-stack tags, form field errors' adjacent captions, and the fake UI chrome inside decorative product mockups.

This gives a reliable read-order rule: **mono = system/meta label, display = structural heading or interactive control, serif = prose.** That rule is directly portable to an app: mono for IDs/timestamps/status codes, display (Archivo) for every UI label/button/nav item, serif reserved for long-form content only (a note, a description field, an email body — not table cells or buttons).

### Font usage details
- Headings never use the serif. Every `<h1>`–`<h6>` inherits Archivo globally.
- Weights used: 700 (`font-bold`) is the default heading weight; 800 (`font-extrabold`) is reserved for the very largest hero/CTA headlines; 600 (`font-semibold`) is used for buttons, nav links, labels, and smaller sub-headings.
- Body paragraphs are consistently `text-base` (16px) or `text-lg` (18px) with `leading-relaxed`.

### Letter spacing
- All-caps mono labels: `tracking-[0.2em]` (eyebrows) or `tracking-[0.1em]`–`tracking-[0.15em]` (denser technical captions, badge text). This wide tracking on tiny uppercase mono text is a signature, repeated motif — it's what makes the site feel "spec sheet" rather than "brochure."
- Large display headlines: `tracking-tight` on the biggest sizes (hero H1, final-CTA H2) to counteract the natural looseness of very large type; body-weight headings (H2/H3 at section level) mostly carry no explicit tracking override.

### Heading styles
- H1 (hero/page title): `text-4xl`–`text-[4.55rem]` responsive, `font-extrabold`, `leading-[1.02]`–`leading-tight`, often rendered through `TextReveal` (masked word-by-word animation) rather than a plain `<h1>`.
- H2 (section title): `text-3xl md:text-5xl` or `text-2xl md:text-3xl` depending on section weight, `font-bold`, `leading-[1.08]`.
- Every section heading is preceded by an `Eyebrow` or `SectionLabel` — never appears unlabeled. This "label → heading" two-step is a strict, repeated pattern worth carrying into the app (e.g. a page always shows a small kicker/breadcrumb before the page `<h1>`).

### Body text
- `text-base` (16px) default paragraph, `text-lg` (18px) for lead/intro paragraphs, `text-sm` (14px) for secondary/meta text, `text-xs` (12px) for the smallest captions and mono labels.
- Body color is never pure `text-ink` at full opacity for secondary copy — it's `text-ink/70` or `text-ink/80` (paper sections) or `text-paper/65`–`/75` (ink sections), i.e. opacity-modulated contrast rather than a separate gray token. `steel` is reserved for genuinely secondary/meta elements (labels, captions, borders), not paragraph body.

### Buttons
Two shapes only, both `rounded-full` (pill), never rectangular or `rounded-md`:
- **Primary**: `bg-ember-deep text-paper`, `px-6–8 py-3–3.5`, `font-display font-semibold text-sm`. Hover: `scale-[1.03]` + a colored glow shadow keyed to ember (`shadow-[0_10px_28px_-10px_rgba(224,130,74,0.55)]` or the deep variant `rgba(154,74,28,0.45)`). Active: `scale-[0.98]`. Disabled: `opacity-60 cursor-not-allowed`, hover effects suppressed.
- **Secondary** (only ever seen on dark/ink backgrounds): `border border-paper/30 text-paper`, hover `border-paper/60`, no fill, paired with a `HoverArrow`.
- There is no tertiary/ghost/destructive button anywhere in the codebase — those variants are **NOT CURRENTLY DEFINED** and will need to be designed fresh for the app (delete, archive, bulk actions, etc.).

### Links
- Nav links: animated underline — an absolute `span` with `h-px bg-ember-deep` that grows `w-0 → w-full` on hover/active via `transition-all`.
- Inline text CTAs (the dominant link pattern site-wide): `group` + `HoverArrow` component — text goes `text-ink → hover:text-ember-deep`, a trailing `→` glyph nudges right on hover. This exact pattern repeats dozens of times ("See full pricing →", "Explore the case study →", "See full service detail →") — it is the site's single most-repeated interactive idiom.
- Footer links on ink background use `ember-bright` (not `ember-deep`) on hover — correctly chosen for AA contrast on dark.

### Borders
Hairlines do almost all of the visual separation work — **not** shadows, **not** background-color blocking. Standard opacities: `border-steel/15` (lightest divider), `/20`, `/25`, `/30` (form fields, stronger card edges), `/40` (device-frame chrome). On ink backgrounds the equivalent is `border-paper/10` through `/34`. A `border-t-2 border-ink` (solid, full-opacity, 2px) is used once as a deliberately heavier "section start" rule (WhoWeBuildFor cards) — the one place a border is used for emphasis rather than quiet separation.

### Radius
- `rounded-full`: by far the dominant radius (17 occurrences in a small codebase) — every button, tag/badge, tab control, and small icon dot.
- `rounded-2xl` (1rem): cards, forms, device-frame mockups, the pricing table container — the "content card" radius.
- `rounded-xl` / `rounded-lg`: smaller sub-elements only (form inputs, workflow step tiles).
- Notably, the **logo mark itself is 100% angular** — built from straight-line SVG paths, zero curves, deliberately echoing forge/anvil metalwork geometry. This is an intentional contrast: soft, friendly, rounded UI chrome vs. a hard, faceted brand mark. That contrast is a real piece of brand DNA worth preserving in the app (rounded UI everywhere; the mark itself stays sharp).

### Shadows
Used sparingly and almost always **tinted**, not neutral gray:
- CTA hover glow: ember-colored, e.g. `shadow-[0_10px_28px_-10px_rgba(224,130,74,0.55)]`.
- Elevated cards (pricing table, work-listing card): ink-tinted, e.g. `shadow-[0_18px_45px_-36px_rgba(23,20,15,0.45)]`.
- The dark decorative "interface study" mockups use large, soft, heavily-blurred neutral-black shadows with negative offset to read as "floating device" — `0 38px 80px -38px rgba(0,0,0,0.95)`.
- Utility-class shadows (`shadow-sm`, `shadow-lg`, `shadow-xl`, `shadow-2xl`) appear only as hover-state upgrades (`shadow-sm → hover:shadow-lg`), never as a static resting shadow on a flat surface.

### Spacing / grid system / containers
- **Container widths are content-scoped, not universal**: `max-w-6xl` (72rem) for full marketing sections (home, header, footer); `max-w-4xl` for the case-study body and Services page; `max-w-3xl` for narrower single-column pages (About, Pricing, Team); `max-w-2xl` for Contact (narrowest — form-focused). This "narrower container for denser/more-focused content" principle maps directly onto an app's content-width strategy (see §6).
- Horizontal gutter is a flat `px-6` (24px) at every breakpoint — there is no separate mobile-vs-desktop gutter token.
- Section vertical rhythm: `py-20` default, `md:py-28` for hero-weight sections, `md:py-24` for medium sections; the case-study's short one-line "band" sections (Industry, Problem) compress to `py-8`.

### Section spacing / numbering ledger
Every major marketing section carries a two-digit mono numeral via `Eyebrow`/`SectionLabel` (01 through 11, continuing across the case-study page too). This creates a sitewide "table of contents" feeling and is a strong, distinctive, low-cost brand signature — it should very plausibly carry over into the app (e.g. numbered onboarding steps, numbered form sections) but must **not** be used decoratively where it isn't structurally meaningful (a dashboard widget grid is not "01–06").

### Background treatments
Strictly binary — `bg-ink` or `bg-paper` as full section fills, per `CLAUDE.md`'s locked rule; confirmed in code, no gradient is ever used as a section background. Gradients appear only as small **decorative accents**: a soft radial ember glow behind the hero device mockup, a linear sheen inside the same mockup, and a horizontal `ember-soft → transparent` wash behind the active row of the services list. A recurring **1px grid-line texture** (schematic/blueprint pattern, low-opacity paper or ink lines, masked to fade toward the bottom) appears behind the hero and inside every dark "interface study" panel — this is a genuine repeating motif, not a one-off.

### Accent usage
Ember is single-purpose: CTAs, links/hover states, focus rings, the active accordion "+", the nav underline, and tiny signal/status dots inside decorative mockups. It is **never** a large fill or section background. Two AA-safe derived tokens exist specifically because the base `ember` (#B85A22) fails WCAG AA at small text size on both paper (~4.05:1) and ink (~3.96:1): `ember-deep` (#9A4A1C, 5.4:1 on paper) for text/fills on light surfaces, `ember-bright` (#E0824A, 6.5:1 on ink) for text on dark surfaces. **This distinction is critical and must carry into the Business OS at every ember touchpoint** — the app will have far more ember-colored text (links in tables, active nav states, status accents) than the marketing site does, so getting this wrong at scale is a real accessibility risk.

### Motion / animation
A disciplined three-duration, two-easing system defined once in `globals.css` and reused everywhere via CSS custom properties:
- `--duration-fast: 180ms` — micro-interactions (hover, tap).
- `--duration-standard: 320ms` — reveals, section/state transitions.
- `--duration-emphasis: 620ms` — hero entrance, headline reveal, CTA-weight moments.
- `--ease-out-forge: cubic-bezier(0.16,1,0.3,1)` — strong deceleration, used for nearly everything (entrances, reveals, hovers).
- `--ease-in-out-forge: cubic-bezier(0.65,0,0.35,1)` — symmetric, reserved for "morph" interactions (hamburger icon, FAQ accordion chevron rotation).

Named, reusable motion components:
- **`Reveal`** — IntersectionObserver-driven scroll reveal with 6 named variants (`up`, `subtle`, `emphasis`, `fade`, `clip`, `sequence`), each a distinct hidden/visible transform pairing. SSR-safe: content is visible in the initial HTML and only synchronously hidden pre-paint if below the fold, so nothing depends on JS to be readable.
- **`TextReveal`** — pure-CSS, word-by-word masked headline reveal (no JS dependency at all — survives slow/failed hydration).
- **`CornerMarks`** — the site's most distinctive signature motif: four corner brackets that scale-snap inward on reveal, like a camera viewfinder finding focus ("precision lock"). Reused on the hero device mockup, Featured Work, and case-study product screens.
- **`PageTransition`** — a short 260ms fade+settle on route change, keyed by pathname.
- Decorative "interface study" panels (`ForgeProductShowcase`, `CapabilityStage`, `.forge-work-preview`) are explicitly documented in the CSS as **"deliberately DOM surfaces, not WebGL"** — CSS/HTML-rendered fake product UI (fake browser chrome, fake phone, fake floating card) with subtle pointer-driven 3D parallax tilt, an animated "signal travel" dot simulating live data flow, and a pulsing "● LIVE" status dot. This is the single most distinctive visual device on the site: abstract, schematic, blueprint-styled mock UI instead of real screenshots, stock photography, or generic illustration.
- Everything respects `prefers-reduced-motion: reduce` via one blanket global override plus explicit disabling of the pointer-parallax tilt effects.

### Hover states
- Buttons: scale + tinted glow shadow (above).
- Cards/rows get a bold **full color inversion** on hover in two places (pricing table rows, WhyForge reason tiles: `bg-ink hover:bg-paper` and vice versa) — not a subtle tint, a confident swap. This is a strong, opinionated pattern, not a timid one.
- List/rail rows (services showcase): padding-left nudge + gradient wash + ember color shift, all animated together.
- Links: color shift + arrow nudge (`HoverArrow`).
- Nav: underline sweep.
- The device-mockup panels get a border-color brighten + shadow deepen on hover (`hover: hover` media-query gated, so it never fires on touch).

### Responsive behavior
- Breakpoints are **stock Tailwind defaults** — `sm` 640px, `md` 768px, `lg` 1024px. No custom breakpoints are declared anywhere (no `tailwind.config.*` exists at all; this is Tailwind v4's CSS-first `@theme inline` setup).
- Mobile nav is a **full-screen ink-colored portal overlay** (not a slide-in drawer) with staggered link entrance (`transitionDelay: index * 40ms`) — a confident, editorial take on mobile nav rather than a generic drawer.
- The services showcase collapses a desktop sticky two-column layout (list + sticky preview stage) into a single-column accordion where each open item inlines its own preview — genuine content reflow, not just hide/show.
- Decorative mockup CSS has hand-tuned overrides at `640px`, `768px`, `430px`/`440px` breakpoints — real device-size care, not just a blanket mobile collapse.

---

## 2. Existing Component System

| Component | What it looks like | Where used | Design purpose | Reuse verdict for Business OS |
|---|---|---|---|---|
| **`Header.tsx`** | Sticky, `h-[69px]`, translucent paper (`bg-paper/95 backdrop-blur`), logo left, inline nav center-right (desktop), single primary pill CTA + hamburger (mobile). Mobile nav renders through a `createPortal` full-screen overlay. | Every page (root layout) | Primary site navigation + conversion CTA | **Adapt.** The sticky-blur bar, logo-left/actions-right layout, and underline-active-state idiom are good app top-bar DNA. The nav-link *set* (Work/Services/About/Pricing/Contact) is marketing-only and must be fully replaced by app navigation (see §5). The full-screen mobile takeover is wrong for a desktop-first internal tool — the app needs a collapsible sidebar instead (see §7). |
| **`Footer.tsx`** | Ink band, logo + address, nav links, contact info, copyright/legal row. `Reveal` fade-in. | Every page | Closing trust/contact block | **Avoid** — a marketing footer has no place in an authenticated app shell. Not reusable as-is; the *contact/address block* styling could inform a settings/about page. |
| **`Logo.tsx` / `LogoMark.tsx`** | Full horizontal lockup and standalone angular "F" mark, both pure SVG paths, `currentColor` fill. | Header, Footer | Brand identity | **Reuse directly.** `LogoMark` alone is the right choice for a collapsed sidebar rail / favicon-adjacent app icon; `Logo` for expanded sidebar header or login screen. |
| **`Eyebrow.tsx`** | Mono, uppercase, `tracking-[0.2em]`, small leading tick that draws in on reveal, optional 2-digit numeral. | Top of nearly every marketing section | Section identification / editorial rhythm | **Adapt.** The *pattern* (small mono kicker above a heading) is worth keeping for page headers in the app (e.g. above a page `<h1>`), but drop the scroll-triggered tick-draw animation — an app page header renders once, it isn't scrolled into view as a "reveal moment." |
| **`SectionLabel.tsx`** | Same idea as Eyebrow, static (no tick animation), always paired number+label. | Case-study sections | Structural section marker for a long narrative page | **Situational reuse** — good for a long, ordered flow the user reads top-to-bottom (an onboarding wizard, a multi-step form) but wrong for a dashboard grid with no inherent order. |
| **`HoverArrow.tsx`** | Single `→` glyph, `group-hover:translate-x-1`, centralizes the site's one hover-nudge interaction. | Every text CTA, dozens of places | Consistent micro-interaction timing | **Reuse directly** as-is — cheap, consistent, works in an app ("View all →", "Open record →"). |
| **`CornerMarks.tsx`** | Four animated viewfinder-style corner brackets, "precision lock" snap-in. | Hero, Featured Work, case-study product screens | Signature visual brand device, frames key visuals | **Adapt selectively.** Excellent for framing a genuinely important, rare visual (an empty-state illustration, a first-run screenshot, a "system architecture" diagram on a settings/integrations page). **Do not** scatter it across every card in a dense dashboard — it's a spotlight device, not a card-border style, and its cost (JS reveal, animation) doesn't belong on high-frequency UI. |
| **`Reveal.tsx` + `useReveal.ts`** | Scroll-triggered fade/slide-in, 6 variants, SSR-safe, IntersectionObserver-based. | Almost every section on every page | Editorial pacing / narrative reveal | **Avoid for the app interior** (dashboard, tables, forms shouldn't fade in on scroll — it reads as slow/precious in a tool used dozens of times a day) **but reuse the underlying pattern** for a genuinely new-content moment: a first-load dashboard, an onboarding flow, or a newly-inserted list item (a "new row" subtle entrance, using the `fade` or `subtle` variant only, `--duration-fast`/`--duration-standard`, never `--duration-emphasis`). |
| **`TextReveal.tsx`** | Pure-CSS masked word-by-word reveal, hero-weight only. | Hero H1, case-study masthead H1 | Headline-moment polish | **Avoid.** Reserve for the app's own "hero" moments if any exist (a login screen headline, an empty-state hero message) — never for routine page titles. |
| **`PageTransition.tsx`** | 260ms fade+settle on route change, keyed by pathname. | Root layout, wraps all page content | Smooths client-side navigation | **Reuse the concept**, but reconsider duration/necessity for a data-heavy app where route changes happen very frequently — a transition that plays 50+ times a day should be closer to `--duration-fast` and may want to be skippable/instant for keyboard/command-palette navigation. |
| **`DeviceFramePlaceholder.tsx`** | Dark rounded frame with fake browser dots, dashed inner placeholder area, grid texture, mono caption. Honest "image pending" marker. | Case study, Work listing | Marks unshipped/placeholder visual content without pretending it's real | **Reuse the philosophy directly** — the Business OS will constantly need honest empty/placeholder states (no data yet, chart pending, integration not connected). This component's restrained, labeled, non-decorative approach to "nothing here yet" is exactly the right tone for those states (see §5, Empty states). |
| **`ContactForm.tsx`** | Rounded-2xl card, 2-col field grid, `rounded-lg` inputs (the one place the site breaks from `rounded-full`), inline field errors in `ember-deep`, disabled/loading submit state, a "submitted" success view that renders the data back as a definition list instead of a generic toast/modal. | Contact page | Lead-generation form | **Adapt heavily.** The input styling (border/radius/focus-ring/error pattern) is a solid base for every app form field. The "success state replaces the form with a readback summary" pattern is genuinely good UX and worth reusing for confirmation-heavy app flows (e.g. "Invoice created" showing the invoice, not just a toast) — but the app additionally needs toasts, inline validation-as-you-type, and multi-step forms this component doesn't attempt. |
| **Capability/Product-showcase mockups** (`ForgeProductShowcase`, `CapabilityStage` variants, `.forge-work-preview`) | Elaborate CSS/HTML fake-UI dioramas: browser chrome, sidebar dots, fake charts (bars), fake task lists, fake mobile screens, animated "signal travel" and "live pulse" dots. | Hero, Services (What We Build), Featured Work | Show "what we build" abstractly without needing real screenshots; reinforce the schematic/technical brand feel | **Avoid entirely as an app UI pattern** — these are illustration, not interface, and are expensive (large, hand-tuned CSS, many magic numbers, breakpoint-specific overrides). They are a marketing-site-only device. Their *visual grammar* (mono spec labels, coordinate captions, dotted grid backgrounds, restrained ember accent dots) is worth harvesting for genuinely decorative app moments (an empty-state graphic, an onboarding illustration) but never for real functional UI. |
| **FAQ accordion** (native `<details>`/`<summary>` in `Faq.tsx`) | Native disclosure element, `+` rotates 45° to `×` on open, no JS state. | Home FAQ | Lightweight, accessible, no-JS-required accordion | **Reuse the technique** (native `<details>` over a custom JS accordion) wherever the app needs a simple disclosure — it's free accessibility and keyboard support. For anything stateful (multi-open, controlled, animated height) the app will need a real component. |
| **Pricing table rows** (`PricingSection.tsx`, pricing page) | Flat list of rows in a bordered `rounded-2xl` card, full ink/paper color-invert on row hover. | Home, Pricing page | Present a short list of scannable options | **Adapt as a "simple list" pattern** for low-density app lists (e.g. a settings list, a plan/tier picker) — not for real data tables (see §6, table density is a completely different problem this component doesn't solve). |
| **Team cards** (`about/Team.tsx`) | Square `aspect-square` cards in a hand-placed 5-slot cross layout (founder centered), bordered, hover lift. | About page | Humanize the small team | **Avoid** — bespoke one-off layout logic (manual slot positioning) that doesn't generalize. The *card anatomy* (numeral, name, role, meta line, footer caption) is a fine template for a generic "profile/contact card" component in a CRM (e.g. a client contact card). |

### Notably absent from the existing system (confirm as **NOT CURRENTLY DEFINED**, not silently invented)
- **Modals / dialogs** — no `Modal.tsx` exists; the FAQ uses native `<details>` instead. Zero precedent for an app-style modal, drawer, or confirmation dialog.
- **Toasts / inline system notifications** — none exist.
- **Data tables** — none exist; nothing in the codebase renders tabular data.
- **Tabs** (as a distinct component) — the services-showcase list/rail behaves tab-like but is bespoke, non-generic markup, not a reusable `Tabs` primitive.
- **Badges with semantic color** (success/warning/error/info) — the only "badge" is the neutral bordered-mono tech-stack pill; there is no color-coded status vocabulary anywhere.
- **Loading states** (skeletons, spinners) — none exist; the only "loading" affordance is a disabled button with a text swap (`"Sending…"`).
- **Error states** (page-level, e.g. 404/500) — not present in what was inspected (no custom `not-found.tsx`/`error.tsx` found in the file listing).
- **Charts** — the "charts" that exist are purely decorative CSS bar shapes inside the fake-UI mockups, not real data visualization.
- **Search / command palette / filters** — none exist.
- **A generic `Card`, `Badge`, `Table`, `Tabs`, `Button`, or `Input` component** — every one of these is hand-rolled inline per usage site with repeated Tailwind strings, not abstracted into a shared component. This matters a great deal for the Business OS (see §11P): the marketing site could afford to hand-roll everything because it has ~20 unique UI moments total; a Business OS with tables, kanban, forms, and detail pages across dozens of screens cannot.

---

## 3. Brand Translation

### Core visual principles
1. **Two backgrounds, one accent, always.** Every surface is ink or paper; ember appears in small, deliberate doses (CTA, link, focus, active state) and is capped at "1–2 visible at once" by explicit rule.
2. **Label before heading, always.** Nothing appears unannounced — a mono kicker precedes almost every heading. This creates a rhythm of *orientation → statement*.
3. **Hairlines over shadows.** Structure is drawn with 1px borders at low opacity, not drop shadows or filled panels. Shadows are reserved for genuine elevation/hover moments and are tinted, not neutral.
4. **Restraint as confidence.** One typeface per role, one accent color, two backgrounds. The site never reaches for a second accent, a gradient background, or a decorative icon set to solve a problem restraint already solves.
5. **Schematic honesty.** Where real content doesn't exist yet (screenshots, outcomes, metrics), the site marks it explicitly rather than faking it — `DeviceFramePlaceholder`, the case study's own "these are placeholders" copy, the "no retention percentages... to report here" line in Outcome.tsx. This is a *trust* principle as much as a visual one, and it's enforced by `CLAUDE.md`'s hard "never fabricate" rule.

### Brand personality
Precise, unhurried, technically credible, quietly confident — a studio that writes like an engineer and designs like an editor. It does not perform enthusiasm (no exclamation points, no "revolutionary," no gradient hero blobs); it earns trust through structure and specificity (numbered sections, named workflows, exact pricing floors, an honestly-labeled placeholder instead of a fake screenshot).

### Visual rhythm
Alternating full-bleed ink/paper bands, each opening with a numbered mono label, each internally following label → heading → supporting copy → (optional) CTA. The rhythm is metronomic across the whole site — once a user has seen two sections, the third is predictable in *structure* even though the content changes. That predictability is a feature, not monotony — it's what a design system is for.

### Contrast strategy
High-contrast typography (near-black ink on near-white paper, and the reverse) does the primary contrast work; color contrast is reserved almost entirely for the accent. This is a "monochrome-plus-one" strategy, not a multi-hue palette — it's part of why a single warm accent (ember) reads as premium rather than playful.

### Use of negative space
Large `py-20`–`py-28` vertical rhythm, wide `max-w-6xl`/`max-w-4xl` containers with a flat `px-6` gutter, and single-column-per-idea layouts (WhyForge's 6 tiles are the densest grid on the entire site, and even that is only 2–3 columns with generous internal padding). Nothing on the site is dense. This is the single biggest thing that will **not** transfer directly to the Business OS — an internal tool used all day cannot afford hero-level whitespace (see §6).

### Relationship between typography and UI
UI chrome (nav, buttons, labels, badges) is always Archivo (display); long-form reading content is always Source Serif 4 (body); system/meta text is always IBM Plex Mono. This three-way split, cleanly maintained with zero exceptions found in the codebase, is the single strongest, most portable piece of brand DNA for the Business OS — a dashboard can keep the exact same rule (UI = Archivo, notes/descriptions = serif, IDs/timestamps/codes = mono) and instantly feel like the same company.

### How the logo is treated
Always monochrome via `currentColor` (never a fixed-color logo asset), always paired with generous clear space, always angular against a rounded-everything-else UI. The full lockup (`Logo`) is used in the header/footer; the mark-only (`LogoMark`) exists but is currently unused on the marketing site (a strong signal it was built *for* a future compact context — like a collapsed sidebar).

### How the INK/PAPER palette is used
Ink is used for both the darkest text-on-light *and* full dark-mode-style section backgrounds — it is a true bivalent color, not a "text color" and a "background color" that happen to share a name. Paper works the same way in reverse. This bivalence is what makes the alternating-band rhythm possible: a component built as "ink text on paper" can be inverted to "paper text on ink" by swapping exactly two tokens, which is precisely what happens on hover in the pricing table and WhyForge tiles. **The Business OS should preserve this bivalence** — an app surface and its inverse (e.g. a default sidebar vs. a focused/active sidebar item) should be expressible as the same token swap, not a separate gray-scale.

---

## 4. Business OS Design Direction

The Business OS must be **recognizably the same company**, achieved through the portable brand DNA above (ink/paper/ember palette, Archivo/Serif/Mono role split, pill buttons, hairline borders, angular logo against rounded UI, mono spec-label idiom, restrained single-accent discipline) — while being its **own** thing, not a re-skinned marketing site.

What changes fundamentally:
- **Purpose**: persuade once → be used correctly, dozens of times a day, by people who already trust the brand and need speed and clarity instead.
- **Information density**: sparse/editorial → dense/operational (see §6).
- **Motion**: reveal-on-scroll and word-by-word headline animation → near-instant feedback, motion used to explain state change (a row entering/leaving, a status flipping), never to entertain.
- **Color vocabulary**: today ember is the *only* semantic color. An app needs a real status vocabulary (success, warning, danger, info, neutral/pending) that does not yet exist and must be designed without inventing brand-conflicting hues (see §9, §11).
- **Navigation model**: a five-link top nav → a persistent sidebar + top bar + command palette, because an app has dozens of destinations, not six.

What must **not** change: the accent discipline (ember stays the *only* brand accent; new semantic status colors are functional, not brand, and should be visually subordinate to ember — see §9), the Archivo/Serif/Mono role split, the pill-button shape language, the hairline-border structural language, and the "always label the placeholder" trust principle — which is arguably *more* important in a CRM/finance tool than on a marketing site, since fabricated-looking data in a business system is actively dangerous (a fake-looking revenue number erodes trust in the real ones next to it).

**Reference posture, not reference visuals:** think Linear's speed and keyboard-first discipline, Stripe's numerical/tabular precision and restraint, Vercel's monospace-meets-sans technical confidence, Notion's calm information density, Raycast's command-palette-centric interaction model — as *operating principles*, never as component designs to copy. Forge's differentiator against all five is that it already owns a warm, editorial, slightly analog identity (serif body text, warm paper/ink instead of cool grays, an angular hand-drawn-feeling logo) that none of those reference products have — that warmth *is* the wedge, and it should survive the transition to "serious software" rather than being sanded off in the name of looking generically "SaaS."

---

## 5. Application UI System

For each area: visual direction consistent with the extracted DNA, stated as concrete decisions. Where the marketing site gives no precedent, this is new design and is labeled as such.

**App shell.** Fixed-height top bar (not the marketing site's `sticky`/blurred pattern — an app top bar should be truly fixed, no scroll-blur ambiguity) + fixed-width collapsible left sidebar + scrollable content region. Background: **paper**, not ink — the marketing site's ink is a *statement* color for hero/CTA moments; an all-day interior workspace on paper reduces eye strain and matches "paper" as a literal workspace metaphor (documents, records). Ink is reserved for the sidebar (see below) and for genuine emphasis surfaces (a modal scrim, a "danger zone" panel), continuing the site's rule that ink = weight/emphasis, paper = default working surface.

**Sidebar.** Ink background (this is the one place ink becomes a *persistent* UI surface rather than a section band — it anchors the app's identity in the same color that anchors the marketing site's hero, and gives permanent contrast against the paper content area). `LogoMark` alone when collapsed, full `Logo` when expanded. Nav items in Archivo, `text-sm font-semibold`, using the *same* underline/active-state idiom as the marketing header but adapted to vertical: an active item gets a left-edge ember bar (2px, `bg-ember-deep`) rather than a bottom underline — same accent, orientation adapted to context. Icons: simple line icons, ember only on the active item's icon, `steel`/`paper-60` for inactive. Section grouping labels use the existing mono-uppercase-tracked eyebrow style (static, no tick animation — see §2 verdict on Eyebrow).

**Top navigation.** Houses: current-page breadcrumb (mono, small, echoing the "spec label" idiom), global search trigger (opens command palette), notifications bell, user/account menu. No marketing nav links here — this bar is 100% operational.

**Dashboard.** Paper background, `paper-elev` (white) cards for discrete widgets, hairline `steel/20` borders (not shadows) between/around widgets by default — reserve shadow for a widget that's actively draggable/reorderable or a modal, consistent with "shadow = interaction/elevation, not resting decoration." KPI tiles use the mono-number idiom already present in the pricing table (`mono` for the numeral, Archivo for the label) rather than inventing a new numeral style. Charts follow the `dataviz` skill's system-agnostic method with Forge's own palette substituted in (see §11J and the Charts entry below) — never the decorative CSS bar-chart shapes from the marketing mockups, which are illustration, not data.

**Data tables.** The single largest net-new surface with zero precedent in the current codebase. Direction: dense by default (see §6), hairline row dividers (`border-steel/15`, matching the site's existing divider opacity), no zebra-striping (it would compete with the borders-do-the-work principle), row hover = a *subtle* background tint (`ink/[0.02]`–`[0.03]`, matching the exact hover tint already used in the pricing page's row hover, `hover:bg-ink/[0.02]`) rather than the marketing site's bold full-invert hover (full-invert is a "look at me" marketing gesture, wrong for a 40-row table scanned dozens of times a day). Column headers: mono, uppercase, tracked, `text-steel`, echoing the eyebrow/label idiom exactly. Sortable column indicator: small ember chevron, only on hover/active — never a resting colored element per the "ember stays rare" rule.

**Kanban boards.** Columns on paper, cards on `paper-elev` with hairline borders (not shadow-elevated by default — shadow appears only while dragging, as a genuine elevation cue). Column header: mono count badge + Archivo label, matching the header pattern used throughout the marketing site (numeral + label pairing). Card content: Archivo for title, mono for meta (assignee initials, due date, ID), status via the new semantic badge system (§9), never via card background color (card background color ownership stays with "selected/dragging" states only — status lives in a badge, keeping the ink/paper/ember discipline intact).

**Detail pages.** Follow the case-study page's proven long-form pattern almost directly: a masthead-style header band (title + key metadata as a `dl`, echoing `FeaturedWork.tsx`'s Industry/Stack `dl` treatment) followed by clearly labeled sections, each with a mono `SectionLabel`-style kicker. This is genuinely the closest existing precedent to a CRM "record detail" page and should be leaned on heavily — it's proof the visual system already handles "one entity, many structured facts about it" gracefully.

**Forms.** Directly extend `ContactForm.tsx`'s field anatomy: `rounded-lg` inputs (not full — confirmed as the site's one intentional exception to pill-everything), `border-steel/30` default, inline errors in `ember-deep` text (AA-safe variant, not base `ember`), Archivo semibold labels. Add what the marketing form doesn't need: inline as-you-type validation, multi-column dense layouts for power users, and a single unified focus treatment (see §8 — the marketing site currently has two different focus styles that must be reconciled before scaling to a form-heavy app).

**Command palette.** New surface, no precedent — should be the most "Linear/Raycast-postured" (not "-styled") element in the app: a centered ink or paper-elev overlay (test both; ink likely reads more "instrument panel," which suits a fast keyboard tool), mono for keyboard-shortcut hints, Archivo for command labels, ember reserved for the selected/highlighted row only.

**Search.** Inline search inputs follow the standard form-field style; global search lives inside the command palette rather than as a separate top-bar text field, keeping the accent/attention budget concentrated in one place.

**Filters.** Pill-shaped filter chips (this is one of the few dense-UI elements where `rounded-full` genuinely still fits, since the marketing site already uses bordered mono pills for its tech-stack tags) — active filter = ember-deep border + text, inactive = steel border. Avoid inventing a second, competing "chip" shape.

**Tabs.** New primitive. Underline-active-state, directly reusing the header nav's exact underline idiom (ember-deep `h-px`, width sweeps in on selection) rather than inventing pill-tabs or boxed-tabs — this keeps "underline = navigation/selection" as a single consistent affordance across the whole product.

**Status badges.** New semantic system required (see §9) — small, `rounded-full`, low-fill or bordered-only (matching the existing tech-tag badge, not a heavy solid-fill chip), text in the semantic AA-safe color, never the raw hue at full saturation as a background fill (that would violate the "no large color fills" discipline the whole system is built on).

**Activity timeline.** A vertical hairline rail with small circular nodes — direct visual descendant of `HowWeWork.tsx`'s process-step timeline (connecting line + small ink-bordered circle nodes) and the case-study `Workflow.tsx` step cards. Strong existing precedent, very little new design needed.

**Notifications.** Toast-style, bottom-right or top-right, `paper-elev` background, hairline border, small ember-deep accent bar on the leading edge for unread/action-needed ones — no precedent exists, so keep it visually quiet and card-like rather than inventing a loud new surface.

**Modals.** New surface. Ink-tinted scrim (not a generic black overlay — reinforces brand even in the "pause" moment), `paper-elev` panel, `rounded-2xl`, matching the contact form's card anatomy. Reserve for genuinely blocking, rare actions — the marketing site's total absence of modals is itself a signal that Forge's instinct is to avoid interrupting the user, and the app should default to inline/drawer patterns before reaching for a modal.

**Drawers.** Preferred over modals for "view/edit a record without leaving context" — slide in from the right on ink-bordered `paper-elev`, reuse the detail-page section anatomy at a smaller scale.

**Empty states.** Directly extend `DeviceFramePlaceholder.tsx`'s philosophy: dashed border, grid texture, small mono caption stating plainly what's missing and (where relevant) a single primary action — never a large illustration or mascot, which would contradict the site's demonstrated allergy to decorative fluff.

**Loading states.** New — skeleton blocks using the `steel/10`–`/15` fill (matching existing low-opacity steel usage) with a subtle shimmer, not a spinner-heavy treatment; reserve a spinner for button-level "submitting" states, directly extending the contact form's existing `"Sending…"` disabled-button pattern.

**Error states.** New. Should borrow the case-study's "state the honest current state" tone in copy, and visually stay in the same card/border language as empty states — an error is a variant of "nothing to show," not a reason to break the visual system with a red banner takeover.

**Confirmation dialogs.** Small modal variant, single sentence, one ember-deep primary action + one steel/bordered secondary — directly reusing the two existing button variants (primary pill, bordered secondary), no third button style needed.

**Toasts.** As above under Notifications — same component, different trigger/duration.

**Charts.** No real precedent exists (the decorative CSS bars are illustration). Build per the `dataviz` skill's method with Forge's actual tokens substituted for its neutral placeholder palette: ink/paper/paper-elev for structure, ember-deep/ember-bright as the single categorical accent for the "hero" series, steel for gridlines/secondary series, mono for axis labels and tooltips (continuing the "mono = system/meta text" rule). Load the `dataviz` skill before building any chart in the app.

**Financial screens.** Numbers in mono (the site already treats prices this way — see the pricing table's `mono` price column), right-aligned in tables, `tabular-nums` (already used once, on the Eyebrow numeral) enforced everywhere numbers appear in a list so digits align. Positive/negative deltas use the new semantic green/red (§9), never ember (ember must stay reserved for brand/primary-action meaning, not "this number went up").

**Project management screens.** Kanban (above) + a list/table view toggle, both reading from the same data — list view uses the dense-table rules (§6), kanban uses the card rules above.

**Client portal.** The one Business OS surface actually closest to the *marketing site's* register (an external, less-frequent-use audience) — it should feel warmer and slightly more editorial than the internal app: paper background throughout (not the ink sidebar treatment), the case-study detail-page pattern for a project/invoice view, and it's the one place `Reveal`-style entrance animation is legitimately appropriate again, since a client visits rarely and a bit of polish reads as care rather than friction (see §11K).

---

## 6. Information Density

The marketing site's whitespace is a poor default for daily operational software; the Business OS needs its own, tighter scale — while keeping the same *ratios* (label:heading:body proportions, border opacities, etc.) so it still feels like Forge, just compressed.

- **Table density:** default to a compact row — enough to comfortably fit 15–20+ rows in a standard viewport without scrolling excessively. Row height should be driven by a single content line (primary text + a couple of mono meta fields), not by decorative padding. Offer a "comfortable" density toggle for read-heavy views (e.g. a CRM contact list someone scans slowly) but ship compact as the default, since this is an internal tool used by people who already know the data.
- **Row heights:** tables tightest; kanban cards next; list/settings rows (the pricing-table-style flat list) loosest of the "list" family, since those are low-frequency, low-count views.
- **Sidebar width:** narrow enough to maximize content area but wide enough that Archivo nav labels never truncate — collapsible to an icon-only rail (`LogoMark`-anchored) for power users, matching Linear/Raycast-style posture without copying their exact width.
- **Content width:** unlike the marketing site's fixed `max-w-*` centered columns, most app screens should use the *available* width (tables and kanban need it), while narrow, form-like, or long-form screens (a detail page's notes section, a settings form) should cap width for readability — directly inheriting the marketing site's own principle of "narrower container for denser/more-focused content" (§1), just applied per-panel instead of per-page.
- **Cards vs. flat layouts:** use a card (`paper-elev` + hairline border) when a cluster of data needs a visually distinct boundary from unrelated neighbors (a dashboard widget, a kanban card, a detail-page summary block). Use flat rows/lists (no card, hairline divider only) for anything repeated many times in a row (table rows, activity timeline entries, a settings list) — cards at that frequency create visual noise the marketing site's own restraint principle would reject.
- **When borders should be used:** to separate repeated/listed content (rows, timeline entries) and to define a card's edge in place of a shadow. Skip borders inside a single logical unit (don't box every field inside a form section) — over-bordering is exactly the kind of decorative fussiness the source system avoids.
- **When visual decoration should be removed:** any time it's not load-bearing for scanning or hierarchy. No decorative icons next to every label, no gratuitous dividers, no card-inside-a-card nesting, no gradient fills anywhere in the interior app — all of this directly extends the marketing site's demonstrated discipline, just enforced more strictly because density raises the cost of any wasted pixel.

---

## 7. Responsive Design

- **Desktop (≥1280px):** primary target for the internal Business OS. Full sidebar (expanded by default), multi-column dashboards, wide tables with all columns visible.
- **Laptop (1024–1280px):** sidebar defaults to collapsed/icon-rail to preserve table/kanban width; dashboard grids drop from 3–4 columns to 2–3.
- **Tablet (768–1024px):** internal app becomes read/triage-oriented — tables gain horizontal scroll (the marketing site already has precedent for this exact pattern in `Workflow.tsx`'s horizontally-scrolling step rail), kanban shows 1.5–2 columns at a time with scroll-snap, sidebar becomes an overlay drawer rather than a persistent column.
- **Mobile (<768px):** internal Business OS is explicitly **not** optimized for full operation here (per the brief: desktop-first) — provide a reduced "essentials" view (notifications, quick-approve actions, record lookup) rather than attempting the full table/kanban/dashboard experience. Reuse the marketing site's full-screen ink overlay pattern for any mobile nav that is needed, since it already solves "small screen, many destinations" well.
- **Client Portal — mobile-friendly by requirement:** here, unlike the internal app, design mobile-first-or-equal. Reuse the marketing site's actual responsive patterns directly (stacked single-column sections, `px-6` gutter, full-width pill CTAs matching the mobile nav's full-width "Start a Project" treatment) since the Client Portal's audience and usage pattern (infrequent, external, often on-the-go) is much closer to the marketing site's own audience than to the internal team's.

---

## 8. Accessibility

- **Contrast requirements:** continue enforcing the AA-safe ember split (`ember-deep` on light, `ember-bright` on dark) for **every** new ember usage in the app — active nav states, links inside tables, chart accents, badge text. Any new semantic colors (success/warning/danger, §9) must be contrast-checked the same way before shipping, exactly as `CLAUDE.md` already mandates for ember, with the darkened/lightened pair pattern reused as the template.
- **Keyboard navigation:** must be substantially stronger than the marketing site, which has no special keyboard affordances beyond default browser behavior. The Business OS needs full keyboard operability for tables (arrow-key row navigation), the command palette (its entire reason to exist), kanban (keyboard-accessible drag alternative, e.g. a "move to..." menu), and forms (logical tab order, no keyboard traps in custom selects/comboboxes).
- **Focus states:** the marketing site currently has **two divergent focus treatments** — a global `:focus-visible` rule (`2px solid ember-deep`, `3px` offset) applied everywhere by default, but form inputs override it locally with a *different* ring (`ring-2 ring-ink/20`, no ember). **This inconsistency should not carry into the Business OS** — pick one unified focus treatment (the global ember-deep outline is the better candidate, since it's already the site's intentional, accessible, on-brand default) and apply it uniformly, including inside custom components like the command palette, kanban cards, and table rows, where focus visibility matters even more than on a five-page marketing site.
- **Screen-reader considerations:** the marketing site sets a reasonable baseline (skip-link, `aria-current` on active nav, `aria-expanded`/`aria-controls` on the mobile menu button, `aria-invalid`/`aria-describedby` wiring on form errors, `aria-hidden` on all decorative SVG/illustration). Extend the same discipline to new app-only patterns that have no marketing-site precedent: live regions for toast notifications, proper roles for the command palette (`role="dialog"`/combobox pattern), table semantics (real `<table>` markup or full ARIA grid roles — not styled `div`s), and kanban drag-and-drop needs an accessible non-drag fallback per the keyboard-navigation point above.
- **Interactive target sizes:** the marketing site's buttons/links (roughly 44px+ tap targets via generous `py-3`+ padding) are a good baseline to keep for anything touch-relevant (mobile essentials view, client portal). Dense desktop table rows will necessarily be shorter than 44px — compensate by making the *entire row* (not just a small icon) the click target, and keep any inline icon-only actions (edit/delete in a row) at a minimum ~32px hit area even if the visible icon is smaller.
- **Reduced-motion behavior:** the existing global `prefers-reduced-motion: reduce` override (collapses all animation/transition durations to near-zero) should be inherited as-is at the token/CSS level. New app-specific motion (toast enter/exit, drawer slide, skeleton shimmer, kanban drag) must be added to that same blanket rule's scope, not exempted from it.

---

## 9. Design Tokens

Values below are taken directly from `src/app/globals.css` and confirmed in-context. Anything the current codebase does not define is marked explicitly rather than invented.

### Colors (existing, confirmed)
```
--color-ink:          #17140F   (primary dark surface + primary text-on-light)
--color-paper:         #F3EFE7   (primary light surface + primary text-on-dark)
--color-paper-elev:    #FFFFFF   (elevated card surface on paper sections)
--color-ember:          #B85A22   (base accent — decorative use only; FAILS AA at normal text size on both paper ~4.05:1 and ink ~3.96:1)
--color-ember-soft:    #E8DCC8   (subtle tint backgrounds behind ember callouts)
--color-steel:           #6B6459   (secondary text, borders, dividers, captions)
--color-ember-deep:    #9A4A1C   (AA-safe ember text/fill on paper/paper-elev — 5.4:1)
--color-ember-bright: #E0824A   (AA-safe ember text on ink — 6.5:1)
```
Opacity-modulated derivatives in active use (not separate tokens, but a consistent enough pattern to document): `ink/70`, `ink/80` (secondary body text on paper), `paper/65`–`/75` (secondary body text on ink), `steel` borders at `/10` `/15` `/20` `/25` `/30` `/40`, `paper` borders at `/10` `/15` `/18`–`/34` on dark surfaces.

**Business OS semantic colors — NOT CURRENTLY DEFINED.** No success/warning/danger/info color exists anywhere in the codebase. Do not invent saturated new brand hues freely; the recommended approach (see §11) is to derive semantic colors as the minimum necessary addition, contrast-tested the same way `ember-deep`/`ember-bright` were derived, and kept visually subordinate to ember (lower saturation or reserved for small badge/text use only, never large fills) so ember unambiguously remains the *one* brand accent.

### Typography
```
Display:  Archivo, weights loaded: 600, 700, 800
Body:     Source Serif 4, weight loaded: 400 only
Mono:     IBM Plex Mono, weights loaded: 400, 500
```
**Font sizes in active use** (Tailwind defaults, no custom scale defined): `text-xs` (0.75rem/12px) → `text-6xl` (3.75rem/60px), plus several arbitrary hero-only values (`text-[2.7rem]`, `text-[4.55rem]`) that exist outside the standard scale for hero-weight moments only.
**Font weights in active use:** 400 (serif body default), 500 (mono, rare), 600 (`font-semibold` — buttons, labels, nav), 700 (`font-bold` — most headings), 800 (`font-extrabold` — hero/largest headings only).
**Line heights in active use:** tight/custom for headings (`leading-[1.02]`, `leading-[1.05]`, `leading-[1.08]`, `leading-tight`, `leading-snug`), `leading-relaxed` for body copy. **No formal named line-height scale is defined** — values are chosen per-heading-size rather than from a token; a Business OS component library should tighten this into an actual scale (e.g. `heading-tight` / `heading-snug` / `body-relaxed`) rather than continuing the marketing site's per-instance arbitrary values.
**Letter-spacing in active use:** `tracking-tight` (large headlines), default/none (most body and mid headings), `tracking-[0.1em]`–`tracking-[0.2em]` (uppercase mono labels only).

### Spacing
No custom spacing scale is defined — pure Tailwind default scale (4px base unit) throughout. The only *pattern* worth tokenizing formally for the app is the container-width-by-content-density idea (`max-w-6xl`/`4xl`/`3xl`/`2xl`) and the section-padding rhythm (`py-8` tight / `py-20` default / `py-24`–`py-28` hero-weight) — neither exists as a named token today, both exist only as repeated literal values.

### Border widths
`1px` (default, nearly universal), `2px` (`border-t-2 border-ink` emphasis rule, and the global focus-visible outline). No other border widths appear.

### Radius
`rounded-full` (pills/badges/circular dots — dominant), `rounded-2xl` (1rem — cards/panels), `rounded-xl` (0.75rem — occasional), `rounded-lg` (0.5rem — form inputs specifically). No custom radius scale beyond Tailwind defaults; no radius token is named in CSS.

### Shadows
No named shadow tokens — every shadow is either a Tailwind default utility (`shadow-sm/lg/xl/2xl`) or a bespoke arbitrary value tuned per use (ember-tinted CTA glows, ink-tinted card elevation, black-based mockup shadows, listed in full in §1). **A Business OS shadow scale (e.g. `elevation-1` resting card, `elevation-2` hover/dragging, `elevation-3` modal) is NOT CURRENTLY DEFINED** and should be designed fresh, following the existing tinting convention (ink-tinted for structural elevation, ember-tinted reserved for interactive/accent moments only).

### Motion durations
```
--duration-fast:      180ms   (micro-interactions)
--duration-standard: 320ms   (reveals, transitions)
--duration-emphasis: 620ms   (hero-weight entrances only)
--ease-out-forge:      cubic-bezier(0.16, 1, 0.3, 1)
--ease-in-out-forge:  cubic-bezier(0.65, 0, 0.35, 1)
```
These four values are well-defined and should be inherited by the Business OS wholesale — they're general-purpose enough to cover app-level micro-interactions too, with `--duration-emphasis` used far more sparingly in-app (first-load moments only, never routine interactions).

### Breakpoints
`sm: 640px`, `md: 768px`, `lg: 1024px` — Tailwind v4 defaults, no overrides defined anywhere in the repo (confirmed: no `tailwind.config.*` file exists). `xl`/`2xl` defaults (1280px/1536px) are inherited but not observably used in any inspected component. **A dedicated `laptop`-range breakpoint for sidebar-collapse behavior is NOT CURRENTLY DEFINED** and will need to be added for the app shell (§7).

---

## 10. What Not to Do

Patterns that would actively damage the Forge identity if introduced in the Business OS:

- **Generic Bootstrap/admin-template dashboard** — blue/gray/white "enterprise SaaS" look, default table striping, boxed everything. Directly contradicts the hairlines-over-boxes, one-accent-color discipline documented above.
- **Excessive rounded cards** — wrapping every piece of UI (including individual table rows, individual stat numbers, every tiny label) in its own soft-cornered card. The source system uses cards sparingly and deliberately (§6); overusing them flattens the meaningful hierarchy cards currently signal.
- **Purple/blue SaaS gradients** — no gradient has ever been used as a fill or background in this codebase; the two gradient uses that exist are tiny decorative accents (a soft ember radial glow, a subtle sheen). A gradient hero, gradient button, or gradient background anywhere in the app would be an immediate, obvious brand break.
- **Glassmorphism** beyond the header's restrained `backdrop-blur` (which exists for a specific functional reason — a sticky bar staying legible over scrolling content) — heavy frosted-glass panels, translucent cards stacked over busy backgrounds, would contradict the paper/ink solidity that anchors the whole palette.
- **Generic "AI dashboard" aesthetics** — dark-mode-by-default neon accents, glowing borders, sci-fi gradients, particle backgrounds. Forge's dark surface (ink) is warm and matte, not neon/cyber; any AI-feature surfaces in the Business OS should stay inside the existing ink/paper/ember language, not adopt a separate "AI" visual dialect.
- **Overuse of shadows** — the source system treats shadow as an *event* (hover, drag, modal), never a resting decoration. A UI where every card, button, and input carries a permanent drop shadow would read as generic SaaS template, not Forge.
- **Excessive decorative illustrations/mascots** — the marketing site's only "illustration" is the schematic CSS-rendered interface mockups, and even those are restrained, abstract, and technical rather than cute/character-driven. No mascot, no stock illustration style, no emoji-as-icon system.
- **Overuse of the CornerMarks / word-reveal / scroll-reveal motion devices** — these are proven, distinctive, and *rare-by-design* on the marketing site (a handful of hero/case-study moments). Applying them to every card, every table row, or every route change would cheapen the exact thing that makes them a signature rather than a gimmick.
- **Template-like admin UI** — anything that could be mistaken for an unmodified admin-dashboard starter kit (default component-library styling left unthemed, default icon sets, default gray/blue palettes) fails the same "could a competitor have shipped this exact screen" test `CLAUDE.md` already applies to marketing copy — apply it to UI too.
- **Unnecessary animation on high-frequency interactions** — a 620ms emphasis-tier animation on something a user does 100 times a day (opening a row, switching a tab, dismissing a toast) is the single most likely way to make Forge's proven motion language feel like friction instead of polish. Reserve emphasis-tier motion for genuinely rare, first-time, or celebratory moments only.

---

## 11. Final Recommendation

### A. Existing Forge design DNA
Two-color (ink/paper) editorial system with one disciplined accent (ember, split into AA-safe `-deep`/`-bright` variants); a strict three-font role split (Archivo=UI, Source Serif 4=prose, IBM Plex Mono=system/meta); hairline borders as the primary structural device; `rounded-full` pills for every interactive control alongside an intentionally angular logo mark; a numbered mono-label ledger preceding every heading; a three-tier, two-easing motion system; and an explicit, enforced trust principle — never fabricate, always label a placeholder honestly.

### B. Extracted design tokens
See §9 in full. Summary of what's solid and portable as-is: colors (all 8, including the AA-derivation pattern), the four motion primitives, the three font families and their role assignments, and the Tailwind-default breakpoints. Summary of what's genuinely **NOT CURRENTLY DEFINED** and must be designed fresh for the Business OS, without inventing arbitrary new brand colors: semantic status colors, a named shadow/elevation scale, a named line-height scale, a laptop-range sidebar-collapse breakpoint, and a formal spacing/density scale for dense UI.

### C. Existing components worth reusing directly
`Logo` / `LogoMark` (as-is), `HoverArrow` (as-is), the motion tokens and easing curves (as-is), the `DeviceFramePlaceholder` philosophy for empty/placeholder states (as-is), native `<details>` for simple disclosures (as-is), the AA-safe ember-color-derivation *method* (as-is, applied to any new semantic color).

### D. Components that need to be redesigned for SaaS
`Header`/nav (restructure into sidebar + top bar), `Reveal`/`TextReveal` (retire from routine UI, keep only for rare first-load/hero moments), `Eyebrow`/`SectionLabel` (keep the visual style, drop the scroll-tick animation for app contexts), form fields (extend `ContactForm`'s anatomy with validation states, density, and a unified focus treatment), pricing-table-style flat lists (extend into a real dense data-table component), FAQ accordion pattern (extend into a controlled, app-grade disclosure/accordion where needed), team-card anatomy (extract into a generic profile/contact card, drop the bespoke 5-slot layout logic).

### E. Proposed Business OS application shell
Fixed top bar (breadcrumb, search trigger, notifications, account) + collapsible ink sidebar (logo, grouped nav with left-edge ember active indicator, icon-rail collapse mode) + paper content region with `paper-elev` cards for discrete widgets. See §5 for full detail.

### F. Proposed navigation visual treatment
Vertical adaptation of the header's exact underline-active idiom: a left-edge ember-deep bar instead of a bottom underline, Archivo semibold labels, mono uppercase group headers, ember reserved for the single active item only (never a permanently-colored nav item for anything short of "you are here").

### G. Dashboard design direction
Paper background, `paper-elev` widget cards with hairline borders (shadow reserved for drag/reorder states only), mono numerals for KPI figures (extending the pricing table's existing mono-price convention), charts built via the `dataviz` skill using Forge's real tokens in place of its placeholder palette, ember as the single categorical "hero" accent with steel/neutral for everything else.

### H. CRM design direction
Contact/company records use the case-study detail-page pattern almost directly (masthead-style header with a `dl` of key facts, numbered/labeled sections below). Lists default to dense table density (§6); activity/interaction history uses the `HowWeWork`-style vertical timeline rail. Status (lead/qualified/won/lost, etc.) uses the new semantic badge system (§9/§11J-adjacent), never ember or raw background color fills.

### I. Project management design direction
Kanban and list/table views over the same underlying data, switchable by tab (reusing the underline-tab pattern from F). Kanban cards mirror the case-study workflow-step card anatomy (numeral/meta up top, title, then a bottom meta row) at a denser scale. Activity/audit trail reuses the same timeline component as CRM.

### J. Finance design direction
Every numeric value in mono with `tabular-nums`, right-aligned in tables. A strict semantic-color rule: ember never means "money" or "positive/negative" — introduce a dedicated, AA-tested green/red pair (or a single neutral-mono "±" prefix approach if the team wants to avoid adding new hues at all, which is the more brand-conservative option worth considering given the "don't invent arbitrary colors" instruction). Invoices/proposals reuse the case-study detail-page section pattern, matching the copy tone of the site's existing scope-based-pricing framing (Requirements → Scope → Fixed Proposal → Milestones → Development → Delivery, already defined in `CLAUDE.md`/`lib/content/pricing.ts`).

### K. Client portal design direction
The one Business OS surface that should lean back toward the marketing site's warmer, more editorial register: paper throughout (no ink sidebar), case-study-style detail pages for project/invoice status, legitimate (if restrained) use of `Reveal`-style entrance motion since usage is infrequent enough that a little polish reads as care, not friction, and full-width pill CTAs matching the mobile-nav treatment for the (mobile-friendly, per requirement) primary actions.

### L. Responsive strategy
Desktop-first for the internal OS (full detail at ≥1280px, sidebar auto-collapses through the laptop range, tables/kanban gain horizontal scroll on tablet, mobile gets a reduced "essentials" view only) versus mobile-friendly/near-parity for the Client Portal, which can directly reuse the marketing site's proven responsive patterns (stacked sections, flat `px-6` gutter, full-width CTAs). Full detail in §7.

### M. Accessibility strategy
Inherit and extend, don't reinvent: keep the AA-safe ember-color-derivation method and apply it to every new semantic color; resolve the marketing site's two-different-focus-styles inconsistency into one unified `:focus-visible` treatment before scaling to a keyboard-heavy app; add the keyboard/ARIA patterns the marketing site never needed (command palette, real table semantics, accessible kanban drag fallback, toast live-regions); keep the existing reduced-motion blanket rule as the base and extend its scope to every new app-specific animation. Full detail in §8.

### N. Design principles (carried forward, restated for app context)
1. Two backgrounds, one accent — always.
2. Label before content — every page/section orients before it states.
3. Hairlines over shadows; shadow means "this is elevated/moving right now," not "this is a card."
4. Restraint as confidence — no second accent color, no gradients, no mascots.
5. Never fabricate; always label a placeholder or empty state honestly — doubly important in a CRM/finance tool.
6. Archivo for interface, serif for prose, mono for system/meta — no exceptions.
7. Motion explains state change; it does not perform enthusiasm. Reserve emphasis-tier timing for genuinely rare moments.

### O. Anti-patterns
See §10 in full — generic admin-dashboard aesthetics, over-carding, gradients, glassmorphism beyond the functional header blur, generic "AI dashboard" neon/dark themes, shadow-as-default-decoration, mascots/stock illustration, over-application of the site's signature motion devices, and unthemed component-library defaults.

### P. Recommended component architecture
The marketing codebase hand-rolls every UI moment inline with repeated Tailwind strings — workable for ~20 unique sections, not workable for a multi-screen app. Recommend a real shared component layer before building app screens: `Button` (primary/secondary/ghost/destructive — only the first two exist today), `Input`/`Select`/`Textarea` (extending `ContactForm`'s field anatomy into reusable primitives with shared validation-state styling), `Badge` (extending the tech-tag pill into a semantic-variant system), `Card` (formalizing the `paper-elev` + hairline-border + `rounded-2xl` pattern that's currently rebuilt per section), `Table` (net-new, per §5/§6), `Tabs` (net-new, reusing the header's underline idiom), `Modal`/`Drawer`/`Toast` (all net-new, no precedent), and a `Kicker`/`Eyebrow` primitive split into a static app variant vs. the existing animated marketing variant. Keep `Logo`, `LogoMark`, `HoverArrow`, and the motion-token CSS custom properties exactly as they are — they're already correctly built as shared primitives and need no rework, just import into the new app.

---

*This document reflects the codebase as of the current `main` branch (recent commits through "Fix 500 on contact form..."). No files were created or modified outside this document. No packages were installed. No commits were made.*
