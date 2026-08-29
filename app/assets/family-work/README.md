# Family ↔ Work SVG Suite

This package contains six people in two static forms and both animation directions.

## Structure

Each role directory contains:

- `family.svg` — static family-life form
- `work.svg` — static professional form
- `family-to-work.svg` — one-shot forward transition
- `work-to-family.svg` — one-shot reverse transition

Open `preview.html` in a modern browser to inspect all 24 SVG files and replay either direction. The SVG files are self-contained and use `currentColor`, so their monochrome color can be controlled by the embedding context.

## Roles

- Mother: cooking ↔ office professional
- Father: home repair ↔ site engineer
- Daughter: reading ↔ laboratory scientist
- Son: skateboarding ↔ photographer
- Grandfather: home life ↔ teacher and mentor
- Grandmother: knitting ↔ professional tailor

No family form uses a child as an identity prop.

## Accessibility and motion

Every SVG includes a title, description, and metadata. Animations play for 2400 ms, hold on the destination, and immediately show the destination when `prefers-reduced-motion: reduce` is enabled.

## Attribution

The Working Woman source is Noun Project icon 7641720 by sentya irma and is identified as Creative Commons. The mother artwork is a derivative. Confirm the applicable attribution and license requirements before external distribution.
