# DESIGN.md — SDG Nexus visual system (as built, Phase 6)

World: **Survey of India topographic sheet.** Light, daylight scenes (officers at office desks, citizens on phones
outdoors). The landing page is the sheet itself; working screens are calm sheets on paper.

## Colour (tokens in `src/app/globals.css`, `@theme`)
| Token | Hex | Use |
|---|---|---|
| `--color-paper` | #eef1ea | page ground (survey paper, grey-green — never cream) |
| `--color-paper-deep` | #e3e8de | loading slots, code chips |
| `--color-sheet` | #fbfcf9 | panels, tables, inputs |
| `--color-ink` | #16212c | text, sheet frames |
| `--color-ink-soft` / `-muted` | #3c4a57 / #5d6b77 | secondary text (≥4.5:1 on paper) |
| `--color-survey` (+`-deep`, `-wash`) | #1f4e8c | primary actions, links, graticule, focus |
| `--color-forest` (+`-wash`) | #2f5d3a | resolved, positive |
| `--color-ochre` (+`-wash`) | #b7791f | open / needs attention marks |
| `--color-rust` (+`-wash`) | #a4372a | errors, rejection, sign-out hover |
| `--color-rule` / `-soft` | #c9d2c4 / #dde3d8 | hairlines, borders |

Strategy: Restrained on Operate screens (paper + ink + one survey-blue accent; ochre/forest/rust only carry status).
Tailwind's `slate`, `blue`, `indigo`, `emerald`, `green`, `amber`, `rose`, `red` scales are **remapped** to these tones in
`@theme`, so older utility classes across the app inherit the world. UN SDG colours (`.sdg-1`…`.sdg-17`) stay official.

## Type
- Display: **Anek Latin** (Ek Type) via `next/font` → `--font-display`; headings, figures. Tracking ≥ -0.02em.
- Text: **Mukta** (Ek Type) → `--font-sans`; 400/500/600/700.
- Figures use `tabular-nums` (`.tabular`, all tables).

## Components and rules
- Panels: `.glass-card` / `.glass-card-dark` are now flat sheets — 1px rule border, 6px radius, soft offset shadow.
  No glass, no blur, no glow, no gradient text (`.gradient-text` renders as survey-blue bold).
- Buttons: `.btn-neon` = solid survey blue, 4px radius; `.btn-outline` = survey outline. Press moves 1px.
- Inputs: `.input-dark-theme` = sheet field, survey focus ring (3px wash).
- Figures: `StatCard` = label above an Anek number on a sheet; no icon tile.
- Icons: lucide line icons only (sidebar maps its entries through `ICONS`). No emoji as icons anywhere in `src/app`.
- Maps: Esri Light Gray Canvas basemap printed through `.survey-tiles` (CSS filter); marks in palette colours; the
  landing sheet adds a dashed graticule, degree labels on the frame and a legend box with a 1px ink border.
- Title block: data in a 1px ink-bordered grid (`dl`), like the box in a sheet's corner.
- Selection, focus ring, caret and scrollbar are themed from the palette (`@layer base`).
- Motion: one ease-out (cubic-bezier(.16,1,.3,1)); reduced-motion respected globally.

## Known gaps
- Basemap boundaries come from Esri, not Survey of India; for an official deployment use Bhuvan or MapmyIndia tiles.
- Large legacy pages (`dashboard/government`, `heatmap`, `ngo`, `corporate`) still carry their old layouts and some
  hard-coded hex colours; they now read in the palette through the remap but were not re-composed.
- Finish review ran in-thread (no reviewer sub-agent in this harness), not by a fresh reviewer.
