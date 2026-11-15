---
name: Adamas University Online Examination System
description: A departmental exam portal set like the university's official typographic notice.
colors:
  cobalt: "#1F3BFF"
  cobalt-hover: "#1530DB"
  cobalt-active: "#0E22B0"
  ink: "#111111"
  ink-secondary: "#3B3B38"
  ink-muted: "#64645F"
  ink-faint: "#8A8A84"
  paper: "#F6F6F4"
  paper-white: "#FFFFFF"
  paper-tint: "#F1F1EE"
  paper-shade: "#E7E7E3"
  rule-subtle: "#E0E0DB"
  rule-prominent: "#CACAC4"
  success: "#0A7A45"
  warning: "#9A5B00"
  danger: "#C21A2E"
typography:
  display:
    fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(3.25rem, 9.4vw, 9.5rem)"
    fontWeight: 800
    lineHeight: 0.86
    letterSpacing: "-0.04em"
    fontVariation: "'wdth' 68"
  numeral:
    fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(2.5rem, 5vw, 4rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
    fontVariation: "'wdth' 72"
  headline:
    fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(2rem, 4.2vw, 3.25rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.03em"
    fontVariation: "'wdth' 80"
  title:
    fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "2.375rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.03em"
    fontVariation: "'wdth' 85"
  body:
    fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
    fontVariation: "'wdth' 100"
  label:
    fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0"
rounded:
  none: "0"
  full: "999px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.25rem"
  "6": "1.5rem"
  "8": "2rem"
  "10": "2.5rem"
  "12": "3rem"
  "16": "4rem"
  "24": "6rem"
  gutter: "24px"
components:
  button-primary:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.none}"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.cobalt-hover}"
  button-primary-active:
    backgroundColor: "{colors.cobalt-active}"
  button-submit-bar:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.none}"
    height: "52px"
    width: "100%"
    padding: "0 1.25rem"
  button-confirm:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.none}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  button-secondary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper-white}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.none}"
  input-field:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  card:
    backgroundColor: "{colors.paper-white}"
    rounded: "{rounded.none}"
  cobalt-field:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.none}"
  ink-field:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.none}"
  timetable-row-open-focus:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.paper-white}"
---

# Design System: Adamas University Online Examination System

## Overview

**Creative North Star: "The Institutional Poster"**

The portal is set like a university's official typographic notice in the Swiss International Typographic Style: a visible twelve-column grid, hierarchy carried by scale alone, and one committed colour that owns whole regions. Cool paper and ink do almost all the work; cobalt arrives as a solid field (the sign-in field, the dashboard masthead, an open exam row in focus, a passing grade slip), never as a scattering of accents. Trust comes from precision, not decoration.

Time is the signature graphic, drawn to scale. A bar's length is a fact: the day ruler on the sign-in field is a real 24-hour rule with the elapsed day as a faint fill and "now" as the strongest mark; the window bar on the dashboard is an exam's real access window with the elapsed part filled. These are measurements, never progress-bar decoration.

Density is calm and generous: ruled rows instead of card grids, large statements set against narrow detail columns, and 1px rules doing the separating that shadows and tints would do elsewhere. The system refuses the dark glassmorphic dashboard it replaced: no glows, gradient blobs, frosted panels or tilted cards.

**Key Characteristics:**
- Paper (#F6F6F4) and ink (#111111) with cobalt (#1F3BFF) owning whole fields.
- A twelve-column grid drawn as faint hairlines, visible behind the page and inside the cobalt field.
- One family, Archivo, whose width axis runs from condensed monumental numerals (wdth 68) to normal text (wdth 100); tabular figures everywhere.
- Square corners, 1px rules, flat surfaces; only overlays lift.
- Durations and windows drawn to their real length.
- One motion grammar (clip-path settle on scroll), visible by default, absent on the exam screen.

## Colors

A near-achromatic paper-and-ink palette with a single saturated cobalt that is used as territory, not trim.

### Primary
- **Notice Cobalt** (cobalt): the one committed colour. Fills the seven-column sign-in field, the dashboard masthead, the primary action bar, an open timetable row when hovered or focused, the passing grade-slip score, the boot screen, focus outlines and text selection. Marks and grades read in cobalt too: achievement speaks in the same voice.
- **Pressed Cobalt** (cobalt-hover, cobalt-active): hover and active states of cobalt buttons only.

### Neutral
- **Notice Ink** (ink): body text, headings, strong 1px rules (section heads, form column edge, crosslink rules), the confirm button, and the inverted admin field.
- **Graphite** (ink-secondary): long-form detail text beside large statements.
- **Pencil** (ink-muted): hints, metadata, footer, placeholders (raised to this value to meet 4.5:1).
- **Faint Pencil** (ink-faint): non-text marks only (scrollbar thumb); too light for reading text on paper.
- **Cool Paper** (paper): page ground beneath the grid.
- **Sheet White** (paper-white): the form column, cards, inputs, tables, alerts.
- **Paper Tint / Paper Shade** (paper-tint, paper-shade): ghost-button hover and quiet secondary surfaces.
- **Hairline / Rule** (rule-subtle, rule-prominent): grid hairlines and row dividers / field and card outlines.

### Status
- **Ledger Green** (success), **Ochre** (warning), **Seal Red** (danger): dark, legible on paper, never neon. Each appears as text, icon or a thin border with a 7-8% tint at most; status colour marks, it does not fill. Danger is the only status that fills a button.

On cobalt, text is white at full strength for primary content, white at 78% for secondary text, and white at 28% for rules.

### Named Rules
**The Owned Field Rule.** Cobalt is applied as a whole region or a whole bar, never as a sprinkle of coloured icons, borders or badges across a paper surface. If a screen has cobalt in more than two small places, consolidate it into one field.

**The Ink Inversion Rule.** The staff side carries the same composition with the field set in ink instead of cobalt; the action bar stays cobalt.

## Typography

**Display Font:** Archivo (with -apple-system, BlinkMacSystemFont, sans-serif)
**Body Font:** Archivo (same stack)
**Label/Mono Font:** Archivo; tabular figures replace a monospace.

**Character:** One grotesk carries every role. Scale and the width axis (wdth 62..125, wght 100..900, loaded as a variable font) do the work a second family would do elsewhere: condensed and heavy for monumental words and numerals, normal width for reading.

### Hierarchy
- **Display** (800, clamp(3.25rem, 9.4vw, 9.5rem), 0.86, wdth 68): one monumental word per field ("Examinations", "Console"), flush left with a slight negative indent. On phones it drops to clamp(3rem, 17vw, 5rem). The dashboard student name uses the same voice at clamp(2.75rem, 7.5vw, 6rem), wdth 70.
- **Numeral** (800, clamp(2.5rem, 5vw, 4rem), 1, wdth 72, tabular): the live clock above the day ruler; grade values and the exam timer share the condensed heavy setting (wdth 72-80).
- **Headline** (800, clamp(2rem, 4.2vw, 3.25rem), wdth 80): section titles, max 16ch. Large ruled statements sit just below at clamp(1.625rem, 3.3vw, 2.75rem), 700, wdth 88.
- **Title** (800, 2.375rem, wdth 85): form titles. Timetable exam titles clamp(1.375rem, 2.4vw, 1.875rem); section-head titles 1.75rem.
- **Body** (400, 0.9375rem, 1.5, -0.01em, tabular): running text. Detail columns use 1rem at 1.65 with a 42ch measure; descriptions cap at 60ch; field ledes at 34ch.
- **Label** (600, 0.8125rem, sentence case, no tracking): form labels, metadata, crosslinks, badges.

### Named Rules
**The Width-Axis Rule.** Hierarchy is made by size and the wdth axis, not by adding a family. Bigger means more condensed: display 68-72, headlines 80-88, body 100.

**The Sentence-Case Rule.** Labels, table headers, badges and alerts are sentence case with zero or near-zero tracking. The poster layer explicitly reset the legacy uppercase tracked labels.

**The Tabular Rule.** Figures are tabular everywhere (set on body), so times, marks and counts align without a mono costume.

## Layout

A twelve-column grid with a 24px gutter (gutter) is both structure and image. Behind every page a fixed layer draws twelve faint hairlines across the 1280px shell; inside the cobalt or ink field, hairlines are measured from the content edge so type, the masthead rule and the ruler's 00 / 12 / 24 ticks sit on lines. Below the fold the paper section draws its own columns so the grid survives the fold.

- **Sign-in split:** field spans columns 1-7, the white form column 8-12 with a 1px ink left edge and a 400px form measure. At 1080px it becomes 6/6; at 760px it stacks, the field first, the form below a 1px ink top rule, and the grid drops to four columns.
- **Ruled statements:** each principle is a twelve-column row, statement in columns 1-7, detail in 9-12, separated by 1px ink rules.
- **Dashboard:** a cobalt masthead on the twelve-column grid, then sections opened by a 2px ink top rule and a baseline-aligned title/meta pair. Timetable rows split 6 / 4 / 2 (main, window, action), collapsing to full width then stacked.
- **Spacing:** a 4px-based scale (0.25rem to 6rem). Fields and form columns pad with clamp(1.5rem, 4vw, 4rem) horizontally; sections breathe with 6rem above on desktop, 4rem on phones.

**The Shared Edge Rule.** Content below the fold aligns to the field's left edge (same clamp padding), not to a re-centred container.

## Elevation & Depth

Flat paper. Surfaces have no shadow; depth is conveyed by 1px rules, by the contrast of a cobalt or ink field against paper, and by a focused row lifting into cobalt. Only overlays lift, and they lift softly.

### Shadow Vocabulary
- **Overlay lift** (`box-shadow: 0 18px 40px -18px rgba(17, 17, 17, 0.28)` / `0 24px 56px -20px rgba(17, 17, 17, 0.32)`): popovers and menus.
- **Dialog** (`box-shadow: 0 28px 64px -18px rgba(17, 17, 17, 0.38)`): modal cards, over an ink scrim at 55%.

### Named Rules
**The Flat Paper Rule.** Cards, buttons, inputs, rows, alerts and the exam timer carry no shadow and no lift on hover. Hover is shown by a stronger rule or a fill change, never by elevation or transform.

## Shapes

Square corners everywhere (0): buttons, inputs, cards, badges, tables, grade tiles, bars, palette buttons. Circles stay circles (999px) only where a thing is intrinsically round (avatar, spinner). Borders are 1px; the one heavier stroke is the 2px ink rule that opens a dashboard section, and the 2-3px "now" mark on the day ruler. Upcoming windows use a dashed track; open windows a solid one.

## Components

### Buttons
Solid bars, no glow.
- **Shape:** square (0), weight 600, no tracking.
- **Primary:** cobalt fill, white text. On sign-in forms it is a full-width bar, 52px tall, label left and arrow right (justify space-between).
- **Hover / Focus:** colour-only transitions (0.13s, standard ease); cobalt-hover then cobalt-active. No transform, no shadow. Focus is a 2px cobalt outline offset 2px.
- **Confirm:** ink fill, white text; hover goes to pure black.
- **Secondary:** transparent with a 1px ink border; hover inverts to ink fill and white text.
- **Ghost:** transparent; hover paper-tint.
- **Danger:** seal-red fill. **Disabled:** 45% opacity.

### Inputs / Fields
- **Style:** sheet white, 1px rule-prominent border, square, no shadow; labels 600 0.8125rem ink above.
- **Hover:** border to ink-muted. **Focus:** border cobalt plus a 1px inset cobalt line (a 2px ruled edge), no glow.
- **Placeholder:** ink-muted.

### Cards / Containers
- **Corner Style:** square. **Background:** sheet white. **Border:** 1px rule-prominent; interactive cards take an ink border on hover. **Shadow:** none (dialogs excepted).

### Badges
Square tags, 600, sentence case, tinted with their status colour.

### Tables
Header in ink-muted 600 sentence case over a 1px ink rule; cells divided by rule-subtle; row hover is a 7% cobalt wash.

### Navigation
Top bar on paper with a 1px ink bottom rule and no shadow when scrolled. The brand mark is a square cobalt tile; the active item is marked by a 2px cobalt underline (inset), not a pill or fill.

### Alerts
Sheet white with a 1px ink rule; the status colour marks only the icon and label, never the ground.

### Crosslink
A full-width row between two 1px ink rules: muted context on the left, a bold ink action with an arrow on the right. On hover the action turns cobalt and the arrow moves 4px right.

### Day Ruler (signature)
On the cobalt field: the live clock as a condensed numeral, then an 18px outlined track for 24 hours, the elapsed day as a 24% white fill, "now" as a 3px full-white mark overshooting the track by 8px, and hour ticks every hour with labels at 00, 06, 12, 18, 24. Updates once a minute.

### Window Bar (signature)
An exam's access window to scale: a 0.75rem caption ("Closes in 2h 10m"), a 10px track bordered in cobalt whose filled part is the elapsed fraction, and start/end times at either end. Upcoming windows use a dashed rule-coloured track and no fill.

### Timetable Row (signature)
Exams are ruled rows, not cards. An open row in hover or focus-within lifts into the field: the whole row fills cobalt, text turns white, the window bar inverts to white, and the primary button inverts to white with cobalt text.

### Motion
One grammar. On scroll, marked elements settle upward 18px out of a top-down clip (opacity 0.7s, transform and clip-path 0.9s, `cubic-bezier(0.19, 1, 0.22, 1)`), staggered 70ms per step; bars then grow to their real length (1.2-1.4s, same ease). Content is visible by default: the start state applies only after the script arms the page, never under reduced motion or in a hidden tab, and a 1.2s failsafe reveals anything on screen. The exam screen has no motion at all: reveals are forced visible and timer pulses and question fades are disabled.

## Do's and Don'ts

### Do:
- **Do** give cobalt (#1F3BFF) a whole region: a field, a masthead, a full-width action bar, a focused row.
- **Do** draw time to scale: a bar's length must be the real duration or window, and "now" is the strongest mark.
- **Do** keep the twelve-column hairline grid visible and align blocks to it; drop to four columns under 760px.
- **Do** set hierarchy with Archivo's size and width axis (wdth 68 to 100) and keep figures tabular.
- **Do** separate with 1px rules; open dashboard sections with a 2px ink top rule.
- **Do** keep content visible by default and gate motion behind script, reduced motion and tab visibility.
- **Do** keep the exam screen still: same palette and type, no reveal, pulse or fade.

### Don't:
- **Don't** round corners on anything that is not intrinsically circular.
- **Don't** put shadows, glows, lifts or transforms on cards, buttons, inputs or rows; only overlays and dialogs lift.
- **Don't** sprinkle cobalt as accent icons, coloured borders or tinted badges across paper.
- **Don't** bring back the dark glassmorphic dashboard: no frosted panels, gradient blobs, glare or tilt cards.
- **Don't** add a second typeface or a monospace; Archivo with tabular figures covers numerals.
- **Don't** set labels, headers or badges in uppercase with wide tracking.
- **Don't** fill a surface with a status colour except a danger button; status marks icon, label or a thin border.
- **Don't** use ink-faint (#8A8A84) for reading text on paper.
