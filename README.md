# Purpose Vunani Asset Management website

Static multipage site: `index.html`, `about.html`, `solutions.html`, `process.html`, `fees.html`, `team.html`, `documents.html`, `contact.html`, plus `styles.css`, `script.js` and `assets/`.

The root HTML pages are **generated**. Edit `src/pages/*.html` (page bodies) and `src/partials/*.html` (nav, credentials strip, process dial, closing banner, footer), then rebuild:

    python tools/build.py           # writes the root *.html files
    python -m http.server 8091      # preview at http://127.0.0.1:8091/

In the sources, `{{nav}}` etc. insert a partial and `{{icon:name}}` (or `{{icon:name:class}}`) inlines a Phosphor duotone icon from `assets/icons/`.

## Tools
- `tools/build.py` assembles the pages, inlines icons, marks the current nav link and stamps photo framing data.
- `tools/prepare_images.py <client folder> <unsplash folder>` rebuilds `assets/img` and the brand files (light logo, monogram) from the sources.
- `tools/focus.py` holds each photo's subject box (`data-focus`). `script.js` uses it to crop every photo on the visitor's screen so faces are never cut off or covered by text or cards.
- `tools/patterns.py` writes the guilloche and V-chevron patterns.
- `tools/audit.py` is the pre-launch checklist: console errors, failed requests, overflow at 1280 and 390, missing files and CSS urls, hero fit at six screen sizes, text that wraps on phones or runs past four lines, no-JavaScript rendering, the mobile menu and dash characters.
- `tools/qa.py` checks every page at 1440, 1280, 820 and 390 px plus six hero sizes: photo framing, broken or stretched images, sideways scrolling and script errors (needs Playwright; serves the site itself if nothing is on port 8091).

## Before launch
- **iStock photos are unlicensed comps and show the iStock watermark**: research-desk (and its mirrored copy), boardroom, boardroom-call, exec-office, remote-desk (mirrored), advisor-tablet, advisor-portrait, retired-terrace, beach-couple, terrace-lunch, holiday-friends and the five goal-* images. Buy the licences, put the clean files in the client folder under the same names, and rerun `prepare_images.py`.
- Vunani figures (R16bn+, 100+ people, 30+ JSE listings) come from the old site and may be out of date. Confirm them with Vunani.
- The example portfolio mixes (conservative, balanced, growth) on the home and Solutions pages are illustrative. Have the team confirm or replace them.
- Nomsa Chigwada's listed email is a Gmail address (copied from the old site). Consider a purpose.co.zw address.
- Forms and audited accounts link to the PDFs on www.purpose.co.zw. If that host is retired, copy the PDFs into `assets/docs/` and update the links.
- The contact form opens the visitor's email app (mailto). Swap in a form service if submissions should arrive without one.

## Credits
Photos (Unsplash License): Harare skyline, Omoniyi David. Victoria Falls, Ed Wingate. Markets tablet, Jakub Żerdzicki.
Icons: Phosphor Icons (MIT), `assets/icons/LICENSE.txt`.
Fonts (SIL Open Font License, self-hosted in `assets/fonts/`): Plus Jakarta Sans (headings, nav and the "Talk to us" button), Manrope (body), Montserrat (labels), Square Peg (script accents), Sora (big numbers and statistics).
