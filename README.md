# LCR Callings

A Chrome extension (Manifest V3) for the Organizations page in Leader and
Clerk Resources. It adds a **Considering** column after **Name** to track who
is being considered for each calling, saved to a Google Sheet shared by
everyone who uses it.

Built with React, Mantine, TypeScript 6 and esbuild.

Its home page is https://lcrcallings.click/. See the
[privacy policy](PRIVACY.md), [terms of service](TOS.md) and
[disclaimer](DISCLAIMER.md), which are also published at
https://lcrcallings.click/privacy/, https://lcrcallings.click/terms/ and
https://lcrcallings.click/disclaimer/.

## Using it

1. Open the Organizations page in LCR and click the extension's toolbar button.
2. The first time, paste the link to a Google Sheet shared with everyone who
   should see the column, and approve Google sign-in.
3. In the **Considering** column, pick members for each calling, then set
   each one's status (Submitted by Presidency, Discussion, … Sustained,
   Released, …) and add notes in the fields that appear under them. Picks and
   statuses save right away, notes after a second's pause or when you leave
   the box; **Refresh** pulls in changes others made.
4. **Sync all callings** adds a row to the sheet for every calling on the page
   that isn't in it yet, so the sheet lists them all, not just the ones
   someone has picked candidates for. Rows already in the sheet are left as
   they are, except for their Organization and Position, which are brought up
   to date.
5. **Copy link** copies a link to the [web page](#web-page) that opens the
   same sheet, to send to people who can't use the extension. It only shows
   if the extension was built with `WEB_URL`.

Members come from LCR's Member List page (`/mlt/records/member-list`),
fetched with your LCR session. Each time the panel opens, the extension also
copies each member's id and name (nothing else) into a `Members` tab in the
sheet, for the [web page](#web-page).

The extension keeps its rows in a `Considering` tab it adds to the sheet:
`Key | Calling | Held by | Considering | Updated | Notes | Data | Status | Organization | Position`. Members are
recorded by their LCR member id (uuid), never by name, since members can share
a name: Held by is the current holder's id, Considering lists each candidate's
id, Notes are `<id>: <notes>`, Status is `<id>: <status>`, and Data (JSON) is
`[{"id": …, "notes": …, "status": …}]` (status is left out until one is set).
Organization is the headings the calling is under on the Organizations page,
joined with ` > ` (e.g. `Aaronic Priesthood Quorums > Priests Quorum > Priests
Quorum Presidency`), and Position is its place on the page, from 0, so the web
page can group and order callings as LCR does.
The extension shows names from LCR's member list; anyone no longer in it shows
by their id. The key identifies the row by calling, current holder's member id
and occurrence, so an entry stops showing once the calling changes hands. The
extension reads candidates back from Data, so edits made in the sheet itself
should go there. Rows from before candidates were picked from the member list
show their Considering text as a candidate.

It also adds `callings-row` and `callings-calling-<calling>` classes to every
row (e.g. `callings-calling-elders-quorum-teacher`), so callings can be hidden
with CSS. Clicking the toolbar button again, or the ×, removes everything it
added to the page.

## Setup

Google only issues tokens to an OAuth client tied to the extension's id, so:

1. `npm run keygen` adds `EXTENSION_KEY` to `.env` (git-ignored) and prints
   the extension id. The key keeps the id the same wherever it's loaded.
2. In [Google Cloud Console](https://console.cloud.google.com/), in a project:
   - enable the **Google Sheets API**
   - configure the **OAuth consent screen** (External, Testing) and add each
     user's Google account as a test user. Tokens for apps in Testing expire
     after 7 days, so users will occasionally re-approve.
   - create an **OAuth client ID** of type **Chrome Extension** with the id
     from step 1
3. Add the client id to `.env` as `OAUTH_CLIENT_ID=….apps.googleusercontent.com`.
4. `npm run build`, then in `chrome://extensions` turn on Developer mode,
   **Load unpacked**, and pick `dist/`.

Chrome must be signed in to the Google account that has access to the sheet.

To share it, send others the built `dist/` folder to load unpacked, or publish
it to the Chrome Web Store as unlisted (see [Releasing](#releasing); the
store assigns its own id, so add that id to the OAuth client too).

## Web page

For people who can't install the extension, e.g. on an iPad, `web/` is a
static page that shows every calling in the sheet and lets them pick
candidates and set statuses and notes, saving to the same sheet. It signs in
with Google in the browser and talks to the Sheets API directly, so it needs
no server. It only knows what's in the sheet, so someone with the extension
needs to have pressed **Sync all callings** (for the callings) and opened the
panel (for the `Members` tab, which holds the names). Changes made there show
in the extension on **Refresh**, and the other way round.

Callings are grouped by organization, and the headings within it, in LCR's
order. Like on LCR's Organizations page, the **Organizations** dropdown has a
checkbox by each organization to add it to the view or take it out, and **All
organizations** to show or hide them all at once. Callings the sheet
doesn't have an Organization for yet (rows from before it was recorded) show
last, under **Not grouped yet**, until someone presses **Sync all callings**.

Open it with `?sheet=<link or id>` to pick the sheet, e.g.
`https://lcrcallings.click/app/?sheet=https://docs.google.com/spreadsheets/d/…`,
or paste the sheet's link the first time it opens. It's remembered after that.
**Copy link**, on the page or in the extension's panel, copies a link like
that for the sheet that's open. If the browser won't copy it, the link shows
in a box to copy by hand.

To set it up:

1. In the same Google Cloud project, create another **OAuth client ID**, of
   type **Web application**, with the page's origin (`https://lcrcallings.click`,
   with no path, and `http://127.0.0.1:8002` for `npm run web`) under
   **Authorized JavaScript origins**. Everyone using it still needs to be a
   test user on the consent screen.
2. On GitHub, add its client id as a repository variable `WEB_OAUTH_CLIENT_ID`
   (Settings → Secrets and variables → Actions → **Variables**), and
   optionally `SPREADSHEET_ID` so the page opens that sheet without being
   told. Neither is secret: they end up in the page.
3. Under Settings → Pages, set **Source** to **GitHub Actions** and
   **Custom domain** to `lcrcallings.click` (see [Website](#website)).
4. Push to `main`. `.github/workflows/deploy.yml` runs the checks, then
   `npm run pages:build` builds the [website](#website) into `public/`, the
   page into `public/app/` and the [demo](#demo) into `public/demo/`, and
   publishes them to GitHub Pages at https://lcrcallings.click/,
   https://lcrcallings.click/app/ and https://lcrcallings.click/demo/.
5. Add the page's address to `.env` as `WEB_URL=https://lcrcallings.click/app/`
   and rebuild the extension, so its panel can share links to the page.

Links from before the page moved to `/app/` (`/?sheet=…`) are sent on to it.

Google's tokens last an hour. When one runs out the page keeps unsaved edits
and shows **Save again**, which signs in again and saves them.

## Website

`site/` is the public site at https://lcrcallings.click/: a home page that
explains the app without signing in, and the privacy policy, terms and
disclaimer, rendered from `PRIVACY.md`, `TOS.md` and `DISCLAIMER.md`
(`scripts/pages.ts`). Google checks these before it verifies the OAuth
consent screen, so the home page must name the app exactly as the consent
screen does (`APP_NAME` in `src/constants.ts`) and link to the privacy
policy; `scripts/pages.test.ts` checks both. If the `CWS_EXTENSION_ID`
variable is set, the home page links to the Chrome Web Store listing.

To set up the domain, once:

1. At the DNS provider for `lcrcallings.click`, add `A` records for
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and
   `185.199.111.153` (and optionally `AAAA` records for `2606:50c0:8000::153`
   through `2606:50c0:8003::153`), and a `CNAME` for `www` to
   `davidtanner.github.io`.
2. On GitHub, under Settings → Pages, set **Custom domain** to
   `lcrcallings.click` and, once the certificate is issued, turn on **Enforce
   HTTPS**. Pages deployed by Actions ignore a `CNAME` file, so it's set only
   here. `davidtanner.github.io/lcrCallings/` then redirects to the domain.
3. In [Google Search Console](https://search.google.com/search-console), add
   a **Domain** property for `lcrcallings.click` and verify it with the `TXT`
   record it gives, signed in as an owner of the Google Cloud project.
4. In Google Cloud Console, under **Google Auth Platform → Branding**, set the
   app name to `LCR Callings`, the home page to `https://lcrcallings.click/`,
   the privacy policy to `https://lcrcallings.click/privacy/`, the terms of
   service to `https://lcrcallings.click/terms/`, and add `lcrcallings.click`
   under **Authorized domains**. Add `https://lcrcallings.click` to the web
   OAuth client's **Authorized JavaScript origins**.
5. Update the `WEB_URL` repository variable to `https://lcrcallings.click/app/`.

## Releasing

Pushing to `main` with a new `version` in `package.json` publishes the
extension to the Chrome Web Store. The `extension` job in
`.github/workflows/deploy.yml` sees that there's no `v<version>` tag yet, so it
builds `dist/`, zips it, uploads it with `npm run store:publish` and submits it
for review. Then it tags the commit `v<version>` and attaches the zip to a
GitHub release. Pushes that don't change the version skip it. The store only
accepts versions higher than the last one uploaded.

To set it up, once:

1. Upload a zip of `dist/` to the [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   by hand, fill in the store listing and privacy tabs, and publish it
   (unlisted, say). The API can only update an item that already exists, and
   always publishes with the visibility it already has.
2. The store assigns its own extension id, shown in the Developer Dashboard.
   Create another **OAuth client ID** of type **Chrome Extension** with that
   id as its **Item ID** (a client takes only one), and use its client id as
   `OAUTH_CLIENT_ID` below. Keep the one in `.env` for the unpacked build.
3. In the Google Cloud project, enable the **Chrome Web Store API**, create a
   **service account** and add a JSON key for it. In the Developer Dashboard,
   under **Account**, add the service account's email. The service account
   is used because refresh tokens from a consent screen in Testing expire
   after 7 days.
4. On GitHub (Settings → Secrets and variables → Actions), add:
   - secret `CWS_SERVICE_ACCOUNT`: the whole JSON key
   - variable `CWS_PUBLISHER_ID`: from the Developer Dashboard, under
     **Publisher → Settings**
   - variable `CWS_EXTENSION_ID`: the store's id for the extension
   - variable `OAUTH_CLIENT_ID`: the OAuth client id for the store's
     extension id
   - variable `WEB_URL`: `https://lcrcallings.click/app/`, so the
     panel can share links to the [web page](#web-page)

If the job fails after the store accepted the upload, re-running it fails too,
as the version is already uploaded. Bump the version, or tag the commit and
make the release by hand.

## Scripts

| Command             | What it does                                                             |
| ------------------- | ------------------------------------------------------------------------ |
| `npm run build`     | Builds the extension into `dist/`                                        |
| `npm run dev`       | Rebuilds `dist/` on change (reload the extension in `chrome://extensions` to pick it up). If `resources/existingCallingsPage.html` exists it's served at http://127.0.0.1:8000/demo.html, where the dev build also runs, and `resources/mltRecordsMemberList.txt` answers its member list requests |
| `npm run demo`      | Serves a mock Organizations page at http://127.0.0.1:8001/ that runs the panel without Chrome, Google or real member data (see [Demo](#demo)) |
| `npm run demo:build` | Builds the demo into `public/demo/`, after `site:build` (which empties `public/`) |
| `npm run demo:sheet` | Writes the demo ward to `demo/sheet/` as CSV files to import into a Google Sheet (see [Demo sheet](#demo-sheet)) |
| `npm run keygen`    | Adds a key pinning the extension id to `.env`                            |
| `npm run store:publish -- <zip>` | Uploads a zip of `dist/` to the Chrome Web Store and submits it for review (see [Releasing](#releasing)) |
| `npm run web`       | Serves the [web page](#web-page) at http://127.0.0.1:8002/, rebuilding on each load (needs `WEB_OAUTH_CLIENT_ID` in `.env`) |
| `npm run site:build` | Builds the [website](#website) into `public/`, emptying it first        |
| `npm run web:build` | Builds the web page into `public/app/`, after `site:build`               |
| `npm run pages:build` | Builds the website, web page and demo into `public/`, as published to GitHub Pages |
| `npm run members -- [file]` | Prints the members in a saved LCR page payload as JSON (default `resources/mltRecordsMemberList.txt`) |
| `npm test`          | Runs `node:test` over `src/**/*.test.{ts,tsx}` and `scripts/**/*.test.ts` |
| `npm run lint`      | ESLint (typescript-eslint strict + `@stylistic`, no semicolons)           |
| `npm run typecheck` | `tsc`                                                                     |
| `npm run check`     | Typecheck, lint and test                                                  |

## Demo

`npm run demo` serves `demo/` at http://127.0.0.1:8001/: a mock of LCR's
Organizations page for a made-up ward, with a button standing in for the
toolbar button. It runs the real panel and column (`src/mount.tsx`) with a
fake `ExtensionApi` (`demo/api.ts`) whose "shared sheet" lives in the
browser's `localStorage`, starting with a few callings already being
considered, and whose members are made up (`demo/data.ts`). Nothing is sent
anywhere, so it's safe to show or share. **Reset demo** puts the sheet back;
`?open` opens the panel on load.
It's published at https://lcrcallings.click/demo/ along
with the [web page](#web-page).

### Demo sheet

To try the [web page](#web-page) against a real Google Sheet without real
member data, `demo/sheet/` has the same made-up ward as one CSV file per tab:
`Considering.csv` (every calling, already synced, with the demo's candidates)
and `Members.csv`. To set up a sheet from them:

1. Create a blank Google Sheet.
2. **File → Import → Upload**, pick `Considering.csv`, choose **Insert new
   sheet(s)** and **Import data**. Google names the tab after the file, which
   is the name the page looks for.
3. Do the same for `Members.csv`, then delete the empty `Sheet1` if you like.
4. Share the sheet with whoever will try it, and open the web page with
   `?sheet=<the sheet's link>`.

`npm run demo:sheet` rewrites the files from `demo/data.ts`; a test fails if
they're out of date.

## How it works

- `src/background/` is the service worker. It opens and closes the panel when
  the toolbar button is clicked, and talks to the Sheets API (`sheets.ts`)
  with tokens from `chrome.identity`. Requests from here aren't subject to
  LCR's Content Security Policy, which blocks connections to Google.
- `src/content/` is the content script. It mounts the panel and asks the
  background to load and save through `api.ts`, which is the only part that
  touches Chrome APIs; tests use a fake instead.
- `src/App.tsx` is the panel: pick a sheet, connect, then show sync status.
- `src/Tracker.tsx` renders a `MultiSelect` and notes into each row's cell
  through React portals, and saves changes. Each cell is its own shadow root
  (`src/shadow.ts`) so LCR's CSS and Mantine's stay apart; dropdowns render
  into a layer over the page so tables can't clip them.
- `src/mount.tsx` renders the panel into a shadow root so page CSS and Mantine
  CSS stay isolated. Mantine's stylesheet is imported as text (esbuild `text`
  loader) and shared by every shadow root; the panel's Mantine portals render
  in its root too.
- `src/page/enhance.ts` adds the column, an empty slot in each row for the
  field, and classes (finding columns by the label LCR repeats in each cell
  for its mobile card view) and re-applies them when LCR re-renders.
- `src/lcr/members.ts` parses the React Server Components payload LCR's
  `/mlt` pages send (`parseFlight`) and extracts the unique members in it
  (`parseMembers`).
- `src/lcr/memberList.ts` gets everyone in the unit from LCR's Member List
  page (`fetchMemberList`), asking for its payload with the `RSC` header, or
  pulling it out of the page's HTML (`flightFromHtml`) if that's what comes
  back. It needs the LCR session cookie, so it runs in the content script.
- `web/` is the web page. `google.ts` gets tokens from Google Identity
  Services for the same Sheets client the extension uses; the page reuses
  the extension's candidate field (`src/CandidatesField.tsx`) and editing
  and saving (`src/useConsiderations.ts`).
- `scripts/manifest.ts` generates `manifest.json` from `package.json` and
  `.env`.
- `scripts/webstore.ts` talks to the Chrome Web Store API as a service
  account, for `scripts/publish.ts`.
- `resources/` holds saved LCR pages for development. They contain member
  data, so the folder is git-ignored.
- Tests run in jsdom via `test/setup.ts`, which also teaches Node to import
  `.css` files as text the same way esbuild does.
