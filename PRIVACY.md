# Privacy Policy

_Last updated: October 4, 2026_

This policy covers **LCR Callings**: the LCR Callings Chrome extension and the
LCR Callings web app at [https://lcrcallings.click/](https://lcrcallings.click/)
(together, "LCR Callings" or "the app"). It explains what information the app
accesses, how it uses it, and the choices you have.

## Summary

- LCR Callings helps leaders track who is being considered for each calling,
  in a Google Sheet that they choose and share with each other.
- The app has **no server, no database, no analytics, no advertising and no
  tracking**. It runs entirely in your browser.
- Data goes directly between your browser, your Google Sheet (through Google's
  Sheets API) and Leader and Clerk Resources (LCR), using your own signed-in
  accounts. **The developer never receives, stores or sees any of it.**
- The app does not sell, rent or share your information with anyone.

## Information the app accesses

### Your Google account

When you sign in with Google, the app asks for one permission: the Google
Sheets API scope `https://www.googleapis.com/auth/spreadsheets`, which Google
describes as "See, edit, create and delete all your Google Sheets
spreadsheets". The app uses it **only for the single Google Sheet whose link
you give it**. It never lists, opens, creates or deletes any other
spreadsheet.

The app does not ask for, and does not receive, your name, email address,
profile picture, contacts, Google Drive files or any other Google account
data. Google gives the app a temporary access token, which the app uses only
to call the Google Sheets API.

### The Google Sheet you choose

In that sheet, the app reads and writes two tabs that it adds:

- **Considering**: one row per calling, with the calling's name, organization
  and position on LCR's Organizations page, the LCR member id of its current
  holder and their status (for example "Considering Release"), the LCR member
  ids of the members being considered for it, their status (for example
  "Discussion" or "Sustained"), notes you type, and when the row was last
  updated.
- **Members**: the LCR member id and name of each member of your unit, so the
  web app can show names. Nothing else about members is copied.

The app does not read or change any other tab in the sheet.

### Leader and Clerk Resources (Chrome extension only)

On LCR's Organizations page, the extension reads the callings on the page and
who holds them, and fetches your unit's member list from LCR's Member List
page using your existing LCR session, so you can pick members by name. It
copies only each member's LCR member id and name into the sheet's Members
tab. It does not change anything in LCR.

### Settings kept in your browser

So you don't have to enter them each time, your browser remembers:

- the link to the sheet you chose (in the extension's Chrome storage, which
  Chrome may sync to your other signed-in Chrome browsers, or in the web
  app's local storage)
- in the extension, whether you chose light or dark colors, in LCR's local
  storage
- in the web app, your Google access token, in session storage, which is
  cleared when you close the tab and expires within an hour

These stay in your browser and are never sent to the developer.

## How the app uses information

The app uses the information above only to provide its features to you:

- showing the callings, candidates, statuses and notes from your sheet next
  to the callings in LCR, or in the web app
- saving the changes you make to your sheet
- showing members' names in place of their LCR member ids

It does not use the information for any other purpose.

## How information is shared

The app does not sell, rent, share or transfer your information to anyone.
The only places data is sent are:

- **Google**, through the Google Sheets API, to read and write your sheet.
  Who else can see the sheet is decided by the sheet's own sharing settings
  in Google Drive, which you control.
- **LCR**, to read the Organizations and Member List pages you already have
  access to.

The app's web pages are static files hosted on GitHub Pages. Like any web
host, GitHub may record technical information such as your IP address when
your browser loads them; see the
[GitHub Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).
GitHub never receives your Google token or the contents of your sheet.

## Google API Services User Data Policy

LCR Callings' use and transfer of information received from Google APIs to
any other app will adhere to the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including the Limited Use requirements. In particular, information received
from Google APIs is:

- used only to provide the features described above, which are visible in
  the app
- not transferred to anyone, except as needed to provide those features
  (that is, back to Google Sheets), to comply with applicable law, or as part
  of a merger or acquisition with notice to you
- not used or transferred for serving advertisements, including retargeting,
  personalized or interest-based advertising
- not read by any person, including the developer
- not used to develop, improve or train generalized artificial intelligence
  or machine learning models
- not sold, and not used to determine credit-worthiness or for lending

## Data retention and deletion

- **Google access tokens** expire within an hour. In the web app, **Sign out**
  revokes the token immediately. You can remove the app's access to your
  Google account at any time from your Google account's
  [third-party connections](https://myaccount.google.com/connections).
- **Sheet data** stays in your Google Sheet until you or someone the sheet is
  shared with deletes it. To delete it, delete the Considering and Members
  tabs, or the whole sheet.
- **Browser settings** are deleted when you remove the extension or clear the
  web app's site data in your browser.

The developer holds no copy of any of this data, so there is nothing for the
developer to delete.

## Security

All connections to Google, LCR and the app's web pages use HTTPS. The Google
access token is only ever sent to Google's APIs. Because the app has no
server, there is no central store of user data that could be breached.

## Children

LCR Callings is meant for adult leaders and is not directed to children under
13. The [Terms of Service](https://lcrcallings.click/terms/) require users to
be at least 18.

## Changes to this policy

If this policy changes, the updated version will be posted at
[https://lcrcallings.click/privacy/](https://lcrcallings.click/privacy/) with
a new "Last updated" date.

## Contact

Questions about this policy or your data can be raised as an issue on the
[project's GitHub repository](https://github.com/DavidTanner/lcrCallings/issues).
