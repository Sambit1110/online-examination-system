---
version: 1
slug: "src-pages-auth-studentloginpage-tsx"
primary_target: "src/pages/auth/StudentLoginPage.tsx"
related_targets: ["src/pages/student/StudentDashboard.tsx","src/pages/student/ExamInstructionsPage.tsx","src/pages/student/ExamInterfacePage.tsx","src/pages/student/StudentResultPage.tsx","src/pages/auth/AdminLoginPage.tsx"]
---

# Student portal surface brief

Scope: student and admin sign-in, student dashboard, exam instructions, exam interface, result / grade slip. Admin console inherits through shared styles only. Mode: operate (sign-in doubles as the product's first impression for evaluators).

Audience and job: CSE students checking what is open, sitting a timed exam, reading results; a professor judging the system in a live demo. Constraints: exam screen stays calm (no scroll effects or decorative motion during an attempt); reduced motion respected; phone width; campus Wi-Fi.

Memorable moment: time itself is the graphic, drawn to scale. On the dashboard each exam's access window is a bar whose length is the real window. On the sign-in pages there is no exam data before sign-in (exam rows are only read by a signed-in session), so the field shows the day itself: a 24-hour rule, the elapsed day as a faint fill, the current time as a monumental numeral and the strong 'now' mark.

## Direction contract

THESIS: The portal is set like a university's official typographic notice: visible grid, scale contrast and one committed colour field. It refuses the dark glassmorphic dashboard, glows, gradient blobs and card grids.

OWN-WORLD: Cool paper white #F6F6F4 and ink #111111, with cobalt #1F3BFF owning whole regions (never sprinkled). A 12-column grid drawn as faint hairlines. One grotesk family (Archivo, width axis) from caption to monumental numerals, tabular figures, square corners, 1px rules, no shadows except dialogs.

STORY: A student instantly sees what is open now, how long it stays open, and where to act. Trust comes from precision, not decoration.

FIRST VIEWPORT: Login on a split: left seven columns a solid cobalt field with the word "Examinations" monumental and flush-left, the date, and today's windows as white time bars. Right five columns white with the sign-in form aligned to the grid. The primary button is a full-width cobalt bar.

FORM: Swiss International Typographic Style institutional poster system, position 6 of 7, seed key 098b1d01. Raises: visible grid (Crouwel), length = exact duration (labanotation), hierarchy by scale alone (variable specimen), focused row lifts into the field (streaming wall).

Motion grammar: one orchestrated reveal (rules draw in, then type rises in a stagger, then bars grow to their real length), and on scroll, sections settle with clip-path reveals. Everything visible by default; nothing moves on the exam screen.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
