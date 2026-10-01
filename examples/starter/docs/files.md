Any file in a docs folder shows up in the sidebar. The browser opens what it can (PDF, text, audio, video) in a new tab and downloads the rest.

Link to a spreadsheet: [[Budget 2026.xlsx]]

Link to a PDF: [[Q3 summary.pdf]]

Embedded spreadsheet:

![[Budget 2026.xlsx]]

Embedded PDF:

![[Q3 summary.pdf]]

Hidden files: `docs/.cantipignore` leaves out the `Archive/` folder and `*.tmp` files, and `docs/Reports/.cantipignore` leaves out drafts in that folder. None of them appear in the sidebar or in `public/`.
