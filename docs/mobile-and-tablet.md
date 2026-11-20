# Phones, tablets and the "bigger screen" funnel — 20 November 2026

## What changed

**Layout** (`css/devices.css`, loaded last so it refines the other sheets)

- Bottom tab bar below 1080px (phones, portrait and small landscape tablets): Home · Papers ·
  Practice · Data Hub when signed in; Home · Papers · Practice · **Sign up free** for guests.
  Hidden in the exam runner (`data-layout="focus"`). Respects the iPhone home indicator
  (`viewport-fit=cover` + `safe-area-inset-bottom`). The account menu no longer repeats the tabs.
- 1081–1279px (iPad landscape, small laptops): top tabs stay on one line; the "answered" tag hides.
- Touch screens (`pointer: coarse`): 44px minimum for buttons, chips, tags, palette numbers,
  Enlarge buttons and top tabs; colour dots get a larger invisible hit area.
- Inputs are 16px on phones and tablets so iOS no longer zooms the page when a field is focused.
- Phones: Home section cards become a compact list; dialogs open as bottom sheets (not the
  welcome tour or the Enlarge viewer); Data Hub tables become labelled rows (`.table--stack`,
  labels filled from the header by `installStackedTables` in `js/ui/device.js`); the paper's
  question card no longer leans past the screen edge.
- Sign-up below 900px: heading, then the form, then "What you get" (the form used to sit
  under the whole pitch on phones).

**Funnel** (`js/ui/funnel.js`, `js/ui/device.js`)

1. Guests on a phone: after three pages, or as soon as they finish something worth keeping, one
   sheet above the tab bar explains that guest answers vanish and that a free account keeps
   them on their laptop and tablet too. "Not now" snoozes it for three days; it never shows on
   sign-up/log-in pages, in the runner, or on laptops.
2. Signed-in on a phone: a "Carry on on a bigger screen" card on Home (Email me the link —
   a `mailto:` to their own address — or Send link via the share sheet / clipboard). "Hide this"
   is saved to their account. It disappears by itself once they have used a laptop or tablet.
3. Starting a timed paper of 45+ minutes on a phone asks "Sit this on a bigger screen?" —
   Sit it here (with "Don't ask me again") or Send to my laptop. Guests are offered a free
   account first, returning to the same paper afterwards.
4. The first time a phone user opens their account on a laptop, PC or tablet they see a short
   "Welcome to the bigger screen" toast.

Device use is stored as `preferences.devicesSeen` (`{ phone, tablet, desktop }` → last day
used) in the synced progress document. No new tables, keys or schemas.

**Copy**: guest prompts used to say an account saves progress "in this browser". With cloud
accounts on, they now say it is saved on every device (`savedWhere()`), because cross-device
sync is the point of the funnel. Browser-only (legacy) accounts keep the old wording.

## Checks run

- `npm test`: 316 passing, including the new `tests/devices.test.mjs` (tab bar per device,
  guest sheet and snooze, sign-up order and 16px fields, bigger-screen card and long-paper
  prompt, stacked Data Hub table, no sideways scroll).
- `npm run validate`: 0 errors.
- Screenshots and measurements of guest and demo routes at 390×844 (phone), 820×1180 (tablet
  portrait) and 1180×820 (tablet landscape), in light and dark: no page-wide horizontal
  overflow, no page errors.

## Not measured

There is no analytics on the site, so funnel conversion (sheet shown → account created →
first laptop visit) can't be counted yet. `preferences.devicesSeen` lets you count accounts
that have used both a phone and a bigger screen from the Supabase progress table.

`tools/browser-navigation.cjs` and `tools/browser-regression.cjs` fail on `main` already
(the welcome tour blocks a click; a new "answered" filter option); unrelated to this change.
