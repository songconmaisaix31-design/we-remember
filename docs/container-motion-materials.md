# Container and Motion Materials

## Purpose

This document is the handoff inventory for the container treatments and motion recipes currently used by the conversational schedule prototype. The implementation source of truth remains [`app/styles.css`](../app/styles.css), with container placement in [`app/index.html`](../app/index.html) and the generated schedule draft in [`app/app.js`](../app/app.js).

## Visual reference

- Reference: [davidwang.space](https://davidwang.space)
- Adopted principles: a stable identity rail, translucent rounded surfaces, restrained elevation, short state transitions, and persistent feedback while media input is active.
- Boundary: the project does not copy or load the reference site's images, text, branding, source code, or hosted assets. Its palette, hierarchy, content, and SVG identity assets are original to this product.
- Runtime rule: the application must remain fully usable if the reference URL is unavailable.

## Foundation materials

| Material | Current value | Usage |
| --- | --- | --- |
| Translucent paper | `rgba(255, 253, 249, 0.79)` | Shared `.surface` background |
| Surface edge | `1px solid rgba(255, 255, 255, 0.82)` | Separates glass surfaces from the backdrop |
| Surface blur | `blur(20px) saturate(1.08)` | Shared `.surface` backdrop treatment |
| Resting shadow | `0 16px 50px rgba(80, 57, 38, 0.09)` | Default surface depth |
| Raised shadow | `0 22px 58px rgba(80, 57, 38, 0.15)` | Hover and composer-focus depth |
| Large radius | `26px` | Rails and primary cards |
| Medium radius | `18px` | Secondary containers |
| Product easing | `cubic-bezier(0.22, 1, 0.36, 1)` | Entry, dialog, and spatial state changes |
| Ambient backdrop | Two fixed `340px` blurred color fields plus page radial gradients | Soft depth behind translucent containers; CSS only |

The shared `.surface` class is the base material. Component classes should add layout, radius, and interaction behavior without duplicating the blur and shadow recipe.

## Container inventory

| Container | Selector | Material and shape | Motion | Product role |
| --- | --- | --- | --- | --- |
| Entry shell | `.auth-card.surface` | Translucent surface, `32px` radius | Child `.auth-step` enters in `260ms` | Keeps family matching and avatar selection visually contained |
| Entry step | `.auth-step` | White overlay, `24px` radius | `enter`: fade, `8px` rise, `.985` to `1` scale | Makes each setup state change legible without a page transition |
| Identity rail | `.identity-rail.surface` | Sticky translucent rail, `26px` radius | Navigation shifts `2px` horizontally; avatar rotates `4deg` and scales to `1.04` | Preserves identity and primary navigation on desktop |
| Family badge | `.family-badge.surface` | Compact translucent identity chip | No container animation | Keeps the selected family and avatar visible without competing with the Agent |
| Composer | `.composer.surface` | Floating translucent input, `24px` radius | Focus rises `2px` over `220ms` and uses the raised shadow | Signals that text or voice input is active |
| Schedule draft | `.draft-card` | Warm opaque card, `22px` radius, resting shadow | Arrives with its parent message using `enter` in `260ms` | Separates reviewable intent from a committed schedule item |
| Agenda card | `.agenda-card.surface.lift-card` | Shared surface, `26px` radius | Hover rises `4px` over `250ms` | Makes the timeline summary inspectable without implying an action |
| People card | `.people-card.surface.lift-card` | Shared surface, `26px` radius | Hover rises `4px` over `250ms` | Groups presence and notification context |
| Notification receipt | `.receipt-card.surface` | Shared surface, `20px` radius | `enter` in `260ms` | Shows local confirmation only after the user confirms a draft |
| Connection dialog | `.integrations-dialog` and `.integrations-shell` | Opaque warm sheet, `28px` radius, blurred backdrop | `dialog-in` over `280ms`: fade, `12px` rise, `.97` to `1` scale | Establishes a focused integration-management layer |
| Channel card | `.channel-card` | White overlay, `20px` radius | Hover rises `4px` over `230ms`; details enter in `200ms` | Exposes each channel as an independent installation |
| Mobile navigation | `.mobile-nav.surface` | Fixed translucent bar, `20px` radius | Active state changes color/background; global reduced-motion rule applies | Keeps the four primary destinations reachable above the mobile edge |
| Toast | `.toast` | Dark solid feedback container, `14px` radius | `enter` in `220ms` | Provides brief, non-persistent operation feedback |
| Schedule overview | `.summary-card.surface.lift-card` | Shared surface, `24px` radius | Hover rises `4px` over `250ms` | Keeps family counts visually grouped with the established inspectable-card behavior |
| Schedule workspace | `.schedule-panel.surface.lift-card` | Shared surface, `28px` radius; `20px` event rows | Hover rises `4px`; rows change edge, fill, and bounded shadow without moving | Separates filters from confirmed events while keeping static rows from implying click behavior |
| Family roster | `.people-panel.surface.lift-card` | Shared surface, `28px` radius; `20px` member rows | Panel rises `4px`; rows use non-spatial hover feedback | Groups member reachability and demo routes |
| Receipt history | `.receipts-panel.surface.lift-card` | Shared surface, `28px` radius; `20px` receipt rows | Panel rises `4px`; rows use non-spatial hover feedback | Keeps delivery evidence distinct from family-member state |

## Motion recipes

### Entry

Use `enter` for newly inserted content or a state that replaces another state:

```css
@keyframes enter {
  from { opacity: 0; transform: translateY(8px) scale(.985); }
  to { opacity: 1; transform: none; }
}
```

Current durations are `200ms`, `220ms`, or `260ms`. Do not apply this animation to a permanently visible layout container on initial page load unless it communicates a real state change.

### Elevation hierarchy

- `translateY(-2px)`: buttons, avatar options, suggestions, and composer focus.
- `translateY(-3px)`: date cells.
- `translateY(-4px)`: inspectable cards such as agenda, people, and integration channels.

Detail-page overview and primary panels reuse `.lift-card`. Their nested schedule, member, and receipt rows deliberately do not move: a background, edge, and bounded-shadow change supplies inspection feedback without suggesting that a static row is clickable.

This hierarchy matters because it distinguishes a direct control from a larger inspectable surface. Avoid lifts larger than `4px`; they make the interface feel unstable and can imply draggable behavior.

### Dialog reveal

`dialog-in` uses a `12px` rise, `.97` initial scale, and `280ms` product easing. The backdrop is `rgba(32, 29, 26, 0.46)` with `7px` blur. At widths up to `520px`, the dialog becomes a bottom sheet with only the top corners rounded.

### Voice activity

The waveform bars alternate between `5px` and `17px` height over `760ms`. This is persistent state feedback, not decoration: it runs only while voice input is active and stops when recording stops.

### Active and focus states

Motion never carries state by itself. Active navigation, selected avatars, focused inputs, expanded channel details, and voice recording also use color, border, text, or `aria-*` state so the interaction remains understandable without animation.

## Asset inventory

The container and motion system has no external image dependency.

- Surface depth, ambient color fields, borders, shadows, and transitions are CSS-native.
- Icons used inside containers are text or inline interface marks; there is no icon package dependency.
- The 12 static SVG avatars under `app/assets/family-work/` are identity content placed inside containers. They are not container-motion assets.
- The transition SVGs under `svg-transition/` are separate showcase assets and are intentionally not loaded by the application.
- Locally uploaded avatars are user content. They must not be treated as reusable design assets or committed to the repository.

## Accessibility and reliability rules

- Preserve the global `prefers-reduced-motion: reduce` override. It reduces animation and transition duration to `0.001ms` and limits animations to one iteration.
- Keep keyboard focus visible. Hover transforms must never be the only interaction feedback.
- Do not animate layout dimensions for primary containers. Prefer opacity and transform to avoid reflow and visual jitter.
- Do not load motion assets from the reference site or make product rendering depend on that site's availability.
- New persistent animation must communicate a live state and must stop when that state ends.

## Responsive behavior

- At `1120px`, the identity rail collapses to its icon-led form.
- At `960px`, desktop side rails are removed, the composer and mobile navigation become fixed, and the main content receives bottom clearance. The single-column shell can grow to `840px` so tablet layouts use the available width.
- Primary detail containers use `28px` desktop/tablet padding and `20px` mobile padding. List rows use a minimum `64–76px` height to preserve a comfortable scan rhythm.
- At `520px`, the entry shell becomes full-screen with no outer radius, integration cards become one column, and the connection dialog becomes a bottom sheet.
- Container changes must be checked at `1440px` desktop and a true `390px` mobile viewport for overflow, overlap, clipped actions, and fixed-layer collisions.

## Reuse checklist

Before adding or changing a container:

1. Reuse `.surface` when the container belongs to the shared translucent layer.
2. Select the smallest established lift that matches the interaction semantics.
3. Keep state transitions within the current `150–300ms` range, except persistent voice feedback.
4. Provide a non-motion state cue and preserve reduced-motion behavior.
5. Verify desktop and mobile layouts with representative content.
6. Update this inventory when a new reusable container or motion recipe is introduced.
