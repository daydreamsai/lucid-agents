# Lucid Agents Brand System

This document is the source of truth for the Lucid Agents master brand. It
governs Lucid-owned websites, documentation, repository graphics, package
artwork, launch material, social assets, and presentations.

It does not replace [`DESIGN.md`](DESIGN.md). That document governs the
generated public service storefront and its `dossier`, `folio`, and `console`
presets. When the two systems meet:

- use this document for Lucid master-brand elements;
- use `DESIGN.md` for generated service UI behavior and composition;
- do not force Lucid branding onto an agent-owned storefront;
- use a quiet "Powered by Lucid" attribution only when attribution is useful.

## Brand foundation

### Core idea

**Machine commerce, made clear.**

Lucid turns opaque machine actions into typed, inspectable, and accountable
service contracts. The brand should make complicated infrastructure feel
legible without pretending the work is simple.

### Positioning

**Lucid Agents is the TypeScript application runtime for machine commerce.**

It turns typed functions into services that agents and applications can
discover, call, stream, run as tasks, and pay for. It owns the runtime contract
around application behavior while wallets, networks, payment protocols,
facilitators, and model frameworks remain explicit external dependencies.

### Audience

Primary:

- TypeScript developers building paid machine services;
- platform and infrastructure engineers integrating agent commerce;
- teams moving from payment demos to production fulfillment;
- maintainers evaluating protocol and framework boundaries.

Secondary:

- technical founders and product leaders evaluating machine-commerce systems;
- ecosystem partners working on wallets, protocols, identity, or settlement;
- buyers integrating paid services into applications or agents.

### Brand character

Lucid is:

- **precise**, because money and fulfillment punish ambiguity;
- **calm**, because serious infrastructure does not need theatrical urgency;
- **transparent**, because boundaries and failure modes should be visible;
- **capable**, because the system must work beyond the demo path;
- **commercial**, because the product exists to support real exchange.

Lucid is not:

- mystical, sentient, or framed as "AI magic";
- cyberpunk, militaristic, or science-fiction decorative;
- cute, toy-like, or excessively rounded;
- corporate, inflated, or vague about ownership boundaries;
- a wallet, facilitator, model framework, or blockchain network.

### Memorable thing

After seeing Lucid Agents, people should remember:

> Machine commerce can be explicit, understandable, and dependable.

Every brand decision should reinforce that memory.

## Naming and messaging

### Names

- Use **Lucid Agents** on first mention.
- Use **Lucid** after the full name has been established.
- Use lowercase package names exactly as published:
  `@lucid-agents/core`, `@lucid-agents/payments`, and so on.
- Do not shorten the name to "LA."
- Do not write "Lucid AI" or "Lucid Agent" as the master brand.

### Messaging hierarchy

Use these lines for different jobs:

1. **Brand promise:** Machine commerce, made clear.
2. **Category statement:** The TypeScript runtime for machine commerce.
3. **Product explanation:** Turn typed functions into services agents and
   applications can discover, call, and pay for.

The brand promise is not a substitute for the product explanation. On technical
surfaces, state what the runtime does before using abstract campaign language.

### Message structure

Write product copy in this order:

1. **Outcome:** what the developer can ship or the buyer can do.
2. **Mechanism:** the typed runtime behavior that makes it possible.
3. **Boundary:** what Lucid owns and what remains external.
4. **Proof:** a command, response, compatibility statement, or verified example.

Example:

> Turn a typed function into a paid service. Lucid uses one capability
> definition for validation, discovery, invocation, and payment admission.
> Wallets and settlement providers remain external. Complete the testnet flow
> with the verified quick start.

## Logo system

### Concept

The logo is the **Resolved Core**.

- The outer black field represents the explicit runtime boundary.
- The inner citron core represents the resolved capability: typed, visible, and
  ready to transact.
- The contrast between the sharper outer squircle and softer inner squircle is
  called **Tension**.

The design originated from an abstract neuron exploration, but the public
meaning is not "artificial intelligence" or "a brain." The final mark expresses
clarity within a system boundary.

### Canonical geometry

The mark uses two centered superellipses on a 256 by 256 unit canvas.

For a superellipse point at angle `t`:

```text
x = cx + a × sign(cos(t)) × |cos(t)|^(2/n)
y = cy + b × sign(sin(t)) × |sin(t)|^(2/n)
```

Outer field:

- center: `128, 128`;
- half-width and half-height: `128`;
- exponent: `n = 5.2`;
- color: Ink `#0C0F0D`.

Inner core:

- center: `128, 128`;
- width and height: `104` units, or `40.625%` of the mark;
- half-width and half-height: `52`;
- exponent: `n = 2.8`;
- color: Lucid Citron `#DFFF45`.

Do not approximate the canonical mark with CSS `border-radius`. Use the supplied
SVG path or regenerate the superellipse using the values above.

### Logo variants

Use:

- [`brand/assets/mark-color.svg`](brand/assets/mark-color.svg) on Paper,
  Citron, Mist, or light photography with sufficient quiet space;
- [`brand/assets/mark-reverse.svg`](brand/assets/mark-reverse.svg) on Ink or
  another dark field;
- [`brand/assets/mark-monochrome.svg`](brand/assets/mark-monochrome.svg) when
  only one ink is available;
- [`brand/assets/lockup-horizontal.svg`](brand/assets/lockup-horizontal.svg) as
  the default horizontal signature;
- [`brand/assets/lockup-reverse.svg`](brand/assets/lockup-reverse.svg) on dark
  branded surfaces.

The SVG lockups contain live text. Bundle the brand fonts or convert the text to
outlines before sending a standalone production asset to a third party.

### Wordmark

Until custom lettering is commissioned:

- set **lucid** in lowercase Instrument Sans, weight 600;
- use tight display tracking, approximately `-0.05em`;
- set **AGENTS** beneath it in Fragment Mono, uppercase;
- use approximately `0.4em` tracking for the descriptor;
- align the descriptor to the left edge of the `u`, not the icon.

The wordmark is calm and subordinate to the product. Do not stylize individual
letters with circuit traces, sparkles, neuron branches, or gradient cuts.

### Clear space

Define `x` as half the width of the inner core: `52 / 256` of the mark width.

- Keep at least `x` clear on all sides of the standalone mark.
- Keep at least `x` around the outer bounds of a lockup.
- Do not place rules, text, partner marks, or crop edges inside that area.

More space is preferred on editorial and campaign surfaces.

### Minimum size

- Standalone digital mark: `16px`.
- Monochrome print mark: `6mm`.
- Horizontal lockup: `120px` wide digitally or `28mm` in print.
- Below the lockup minimum, use the standalone mark and nearby accessible text.

At 16px, preserve the two-color construction. Do not add an outline.

### Background use

- On Paper or Mist: use the color mark.
- On Citron: use the color mark; the inner core merges with the background by
  design and reads as a window.
- On Ink: use the reverse mark.
- On photography: place the mark in a quiet area only. If the image is busy,
  use a solid Paper or Ink field rather than a glow, shadow, or translucent tile.

### Misuse

Never:

- change the superellipse exponents or core ratio casually;
- stretch, skew, rotate, crop, or add perspective;
- add strokes, gradients, glows, shadows, bevels, or textures;
- put the mark inside another rounded square;
- turn the inner core into a circle, sparkle, eye, or literal neuron;
- recolor the core with semantic status colors;
- repeat the squircle on every card, button, avatar, or UI container;
- animate the core continuously;
- place copy inside the core.

## Color

### Primary palette

| Token        | Hex       | Role                                              |
| ------------ | --------- | ------------------------------------------------- |
| Ink          | `#0C0F0D` | Primary text, dark fields, canonical outer mark   |
| Paper        | `#F6F7F2` | Primary light background                          |
| Lucid Citron | `#DFFF45` | Identity, active action, resolved state           |
| Graphite     | `#2B302C` | Secondary dark surface and strong supporting text |
| Slate        | `#626B64` | Muted text on Paper                               |
| Mist         | `#DDE2DC` | Rules, low-emphasis surfaces, quiet diagrams      |
| Pale Citron  | `#EFFFC4` | Rare highlight field behind dark text             |

### Usage ratio

For a typical Lucid-owned light composition:

- 70–80% Paper or open space;
- 15–25% Ink and Graphite;
- no more than 5% Citron.

Citron is a signal, not a background habit. Large Citron fields are allowed for
launch art or a single focal section, but never as a repeating section rhythm.

### Contrast

Verified WCAG contrast ratios:

| Pair              |     Ratio | Use                               |
| ----------------- | --------: | --------------------------------- |
| Ink on Paper      | `17.90:1` | All text sizes                    |
| Graphite on Paper | `12.49:1` | All text sizes                    |
| Slate on Paper    |  `5.12:1` | Body and auxiliary text           |
| Ink on Citron     | `17.00:1` | Buttons, labels, and focal fields |
| Paper on Ink      | `17.90:1` | All text sizes                    |
| Mist on Ink       | `14.67:1` | Secondary text and rules          |
| Citron on Ink     | `17.00:1` | Labels and identity accents       |

Do not use:

- Citron text on Paper: `1.05:1`;
- Paper text on Citron: `1.05:1`;
- Slate body text on Ink: `3.49:1`.

Use Ink for text on Citron. Use Mist or Paper for muted text on Ink.

### Semantic colors

Semantic colors communicate system state. They do not replace the brand accent.

Light surfaces:

| State       | Hex       |
| ----------- | --------- |
| Success     | `#18794E` |
| Warning     | `#9A6700` |
| Error       | `#C53935` |
| Information | `#2563B8` |

Dark surfaces:

| State       | Hex       |
| ----------- | --------- |
| Success     | `#55D590` |
| Warning     | `#F4B942` |
| Error       | `#FF6B66` |
| Information | `#72A7FF` |

Always pair state color with a label, icon, or status word. Never communicate
payment, trust, or task state through color alone.

### Dark mode

Dark mode is a surface redesign, not an inversion filter.

- background: Ink `#0C0F0D`;
- raised surface: `#151917`;
- primary text: Paper `#F6F7F2`;
- muted text: `#AAB3AC`;
- quiet rules: `#303730`;
- accent: Citron `#DFFF45`;
- logo: reverse variant.

Keep Citron saturation stable so the brand remains recognizable. Reduce the
area it occupies rather than muting it into olive.

## Typography

### Font system

| Role                  | Typeface         | Use                                                 |
| --------------------- | ---------------- | --------------------------------------------------- |
| Display, body, and UI | Instrument Sans  | Primary brand voice and readable interface copy     |
| Metadata and code     | Fragment Mono    | Packages, protocols, commands, receipts, and labels |
| Editorial accent      | Instrument Serif | Rare essays, launch statements, and pull quotes     |

Use Instrument Serif only when the surrounding layout has enough space to make
the contrast intentional. It is not a UI font and should not appear in product
navigation, forms, or data tables.

Preferred loading strategy:

1. self-host subsetted WOFF2 files;
2. preload only the weights used above the fold;
3. use `font-display: swap`;
4. fall back to the stacks in [`brand/tokens.css`](brand/tokens.css).

### Weights

Instrument Sans:

- 400 for body copy;
- 500 for navigation and controls;
- 600 for headings and the provisional wordmark;
- avoid 700 unless a constrained environment lacks 600.

Fragment Mono:

- 400 for code and metadata;
- 500 for short labels only;
- do not fake bold weights in the browser.

Instrument Serif:

- 400 only.

### Type scale

| Token      | Size / line-height | Tracking   | Role                  |
| ---------- | ------------------ | ---------- | --------------------- |
| Display XL | `80px / 0.95`      | `-0.055em` | Campaign hero         |
| Display L  | `64px / 0.98`      | `-0.045em` | Marketing hero        |
| Heading 1  | `48px / 1.02`      | `-0.035em` | Page title            |
| Heading 2  | `32px / 1.10`      | `-0.025em` | Major section         |
| Heading 3  | `24px / 1.20`      | `-0.015em` | Subsection            |
| Body L     | `18px / 1.55`      | normal     | Introductory copy     |
| Body       | `16px / 1.55`      | normal     | Default copy          |
| Label      | `14px / 1.30`      | `0.01em`   | Controls and captions |
| Metadata   | `12px / 1.40`      | `0.14em`   | Uppercase mono labels |

Scale large type fluidly on small screens. Do not reduce default body copy below
16px on public web surfaces.

### Typographic behavior

- Align prose left.
- Keep body lines between 55 and 75 characters.
- Use sentence case for headings and controls.
- Reserve uppercase for short Fragment Mono metadata labels.
- Use tabular numerals for prices, balances, durations, and usage.
- Use a true multiplication sign in dimensions: `256 × 256`.
- Keep code, package names, routes, and headers in monospace.

## Layout and spacing

### Grid

Lucid layouts are disciplined but not centered by default.

- desktop: 12 columns, 24px gutters, maximum content width 1280px;
- tablet: 6 columns, 20px gutters;
- mobile: 4 columns, 16px gutters;
- long-form reading column: maximum 720px;
- wide technical tables and diagrams may use the full grid.

Prefer left-weighted compositions with clear open space. A centered hero is
allowed only when the content has one short claim and no competing hierarchy.

### Spacing

Use a 4px base:

`4, 8, 12, 16, 24, 32, 48, 64, 96`.

- Use 4–12px inside compact control groups.
- Use 16–32px inside content regions.
- Use 48–96px between major brand sections.
- Prefer removing a container over adding more padding and another border.

### Rules and containers

- Use one-pixel Mist rules to organize information.
- Prefer flat fields and aligned sections over nested cards.
- Do not wrap every heading, metric, or feature in a container.
- When a card is necessary, use a single boundary and one content hierarchy.
- Avoid icon circles, floating glass panels, and uniform three-column feature
  grids.

### UI radii

The logo squircle is a protected brand shape. It is not the UI radius system.

- square: `0px` for rules, tables, code, and editorial fields;
- small: `4px` for compact controls;
- medium: `8px` for dialogs and bounded interactive regions;
- full: only for genuine pills, avatars, and status dots.

Do not use large bubbly radii on cards or buttons.

## Imagery and illustration

### Visual subject

Show systems becoming legible:

- typed contracts and schemas;
- explicit boundaries;
- paths resolving into one accountable output;
- state transitions and transaction phases;
- discover, verify, reserve, fulfill, and settle flows;
- real developer artifacts such as commands, responses, receipts, and diagrams.

### Illustration language

- flat fills and one-pixel rules;
- Ink, Paper, Mist, and rare Citron;
- exact labels and honest data;
- asymmetric but grid-aligned composition;
- one focal core or resolved state;
- diagrams that can still be understood in monochrome.

### Avoid

- brains, glowing neurons, humanoid robots, eyes, and sparkles;
- generic node networks or orbit diagrams;
- chrome 3D objects and translucent glass;
- purple gradients and electric-blue cyberpunk light;
- fake terminals, fake code, or invented transaction data;
- generic stock photos of people pointing at screens;
- decorative complexity that obscures the product boundary.

If photography is used, prefer documentary images of real builders,
infrastructure, physical commerce, or environments where automation has a clear
job. Treat photography as evidence, not mood filler.

## Iconography and data visualization

### Icons

- Use simple two-dimensional strokes.
- Prefer square terminals and 1.5–2px strokes at 24px.
- Use consistent optical weight, not identical bounding-box occupancy.
- Use Lucid Citron only for active or resolved states.
- Do not place every icon inside a colored container.
- Do not derive feature icons from the Resolved Core mark.

### Data visualization

- Start with Ink, Slate, Mist, and Citron.
- Reserve Citron for the selected series or resolved outcome.
- Add semantic colors only when the data meaning requires them.
- Direct-label lines and bars where space permits.
- Use patterns, labels, or shapes in addition to color.
- Use tabular numerals and state units explicitly.
- Never use a gradient merely to make a chart look more technical.

## Motion

### Principle

Motion should make state change easier to understand. It should not make the
brand feel alive for its own sake.

### Behaviors

- **Resolve:** paths or fields align into one stable result.
- **Reveal:** a mask exposes the core or a new state.
- **Focus:** low-emphasis elements recede while the active contract remains.
- **Confirm:** the core changes once when a transaction reaches a settled state.

### Timing

| Token  | Duration | Use                                 |
| ------ | -------: | ----------------------------------- |
| Micro  |   `80ms` | Hover and pressed feedback          |
| Short  |  `160ms` | Core reveal and small state change  |
| Medium |  `240ms` | Panel transition or path resolution |

Use the easing tokens in [`brand/tokens.css`](brand/tokens.css).

Never:

- loop the logo continuously;
- bounce, pulse, or breathe the core at rest;
- use scroll motion without an information purpose;
- delay primary actions for choreography;
- animate transaction success before it is confirmed.

Honor `prefers-reduced-motion` by removing nonessential transforms and reducing
durations to zero where comprehension does not require a transition.

## Voice and writing

### Voice

Lucid sounds like a builder talking to another builder:

- lead with the result;
- name the exact mechanism;
- state ownership boundaries;
- distinguish Stable from Next;
- separate verified support from planned support;
- use short sentences and concrete nouns;
- give commands and evidence when a claim can be tested.

### Vocabulary

Prefer:

- typed capability;
- service contract;
- payment admission;
- fulfillment;
- settlement;
- discoverable service;
- runtime boundary;
- verified path;
- durable state;
- buyer and seller.

Avoid:

- AI magic;
- unleash, revolutionize, supercharge, or transform everything;
- seamless when boundaries or setup still exist;
- intelligent when typed, automated, or policy-controlled is more accurate;
- agentic as a substitute for a concrete behavior;
- trustless when external trust or operational dependencies remain;
- built for X or designed for Y as empty headline patterns.

### Example rewrites

Weak:

> Unleash intelligent agents with seamless payments.

Lucid:

> Turn a typed function into a paid service. Lucid verifies payment admission,
> runs fulfillment, and records the result through one runtime contract.

Weak:

> One platform for the future of autonomous commerce.

Lucid:

> Define, price, and serve machine-callable work from TypeScript.

Weak:

> Enterprise-grade reliability.

Lucid:

> Move idempotency, entitlements, tasks, and schedules to explicit durable
> stores before production.

## Brand applications

### Documentation

- Use the horizontal lockup in the global header.
- Use the standalone mark for the favicon and social image signature.
- Keep code examples and proof above decorative brand content.
- Use Citron for selected navigation, active commands, and resolved states.
- Do not recolor protocol or partner logos to match Lucid.

### GitHub and npm

- Use the standalone color mark for avatars and package artwork.
- Use the horizontal lockup or plain text for README headers.
- Keep badges secondary to the product name and category statement.
- Replace dense sci-fi infographics with flat, legible system diagrams.

### CLI and terminals

Color is optional. The CLI must remain clear without ANSI support.

- plain-text signature: `lucid`;
- optional color: Citron only for the product label or confirmed success;
- errors use the semantic error color and an explicit `error` label;
- never render the logo as large terminal ASCII art by default.

### Social and launch material

- Use one strong claim per composition.
- Keep the mark small unless the asset is an avatar.
- Use large Paper or Ink fields with one Citron focal point.
- Prefer real commands, contracts, and flow diagrams over invented lifestyle art.
- Keep partner attribution optically balanced and outside the logo clear space.

### Generated service storefronts

Generated storefronts represent the service owner first.

- Do not make the Lucid master brand the page identity.
- Preserve the semantics and preset rules in `DESIGN.md`.
- If attribution is present, keep it small, text-led, and outside the primary
  service hierarchy.
- Never expose private runtime state to make a storefront feel more technical.

## Accessibility

- Meet WCAG 2.2 AA contrast for all public text and interactive controls.
- Keep body text at 16px or larger.
- Maintain 44px minimum interactive targets.
- Never use color alone for state.
- Provide text alternatives for diagrams and meaningful brand imagery.
- Treat decorative logo marks as decorative when adjacent text already names
  Lucid Agents.
- Preserve focus indicators; Citron may support them but must not be the only
  visible change.
- Honor reduced motion.
- Test zoom to 200% and narrow layouts before publishing.

## Asset inventory

| File                                                                       | Purpose                                                  |
| -------------------------------------------------------------------------- | -------------------------------------------------------- |
| [`brand/assets/mark-color.svg`](brand/assets/mark-color.svg)               | Primary mark on light fields                             |
| [`brand/assets/mark-reverse.svg`](brand/assets/mark-reverse.svg)           | Mark on dark fields                                      |
| [`brand/assets/mark-monochrome.svg`](brand/assets/mark-monochrome.svg)     | One-color and cutout use                                 |
| [`brand/assets/lockup-horizontal.svg`](brand/assets/lockup-horizontal.svg) | Primary horizontal signature                             |
| [`brand/assets/lockup-reverse.svg`](brand/assets/lockup-reverse.svg)       | Horizontal signature on dark fields                      |
| [`brand/tokens.css`](brand/tokens.css)                                     | Portable color, type, spacing, radius, and motion tokens |

Raster exports should be generated from these SVG sources. Do not manually
trace raster previews or use the exploratory files under `~/.gstack` as
production assets.

## Governance

### Source precedence

1. `BRAND.md` governs Lucid-owned brand expression.
2. Files in `brand/assets/` are canonical logo geometry.
3. `brand/tokens.css` is the portable token reference.
4. `DESIGN.md` governs generated service UI.
5. Product code may adapt tokens to its framework but must preserve their
   meaning and contrast requirements.

### Change process

A brand change is complete only when it:

1. states the user-facing reason;
2. updates this guide;
3. updates affected canonical assets or tokens;
4. tests the mark at 16, 32, and 64px;
5. checks color and monochrome variants;
6. checks light and dark surfaces;
7. checks contrast and reduced motion;
8. records the decision below.

Do not change the mark geometry to solve a one-off layout problem. Change the
layout.

## Decisions

| Date       | Decision                                              | Rationale                                                                                                         |
| ---------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 2026-07-26 | Create a separate master brand system                 | The existing `DESIGN.md` is a generated service UI contract, not a corporate identity guide.                      |
| 2026-07-26 | Anchor the brand on "Machine commerce, made clear."   | It connects the Lucid name to the runtime's real job without generic AI claims.                                   |
| 2026-07-26 | Use the Resolved Core mark                            | A system boundary containing a visible core is simpler and more ownable than a literal neuron or routing diagram. |
| 2026-07-26 | Use Tension superellipses                             | A sharper outer field and softer inner core give the elemental mark a distinctive relationship.                   |
| 2026-07-26 | Keep Citron as a rare signal                          | It preserves a small thread of existing equity while leaving the cyberpunk treatment behind.                      |
| 2026-07-26 | Keep the logo squircle out of the UI radius system    | Repeating the protected shape would weaken the mark and recreate rounded-SaaS visual habits.                      |
| 2026-07-26 | Roll the system into the repository and documentation | Lucid-owned technical surfaces should establish the new identity before asking readers to evaluate the runtime.   |
| 2026-07-26 | Keep generated storefront branding subordinate        | Agent identity remains primary; Lucid appears only as a compact Resolved Core footer attribution.                 |
