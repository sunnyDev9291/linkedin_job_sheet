# LinkedIn Job Sheet

Chrome extension that shows whether the current page URL is already on a Google Sheet and lets you add it with the top-right Add button. Every row is written with Job_Platform set to LinkedIn. The country comes from the popup or options page.

The Google service-account private key stays on the backend. It is not part of the extension package.

## Sheet layout

Create one spreadsheet with these tabs, using the names exactly:

- Brazil
- Argentina
- Colombia
- Dominican Republic

Row 1 of each tab:

| A | B | C | D | E | F |
| --- | --- | --- | --- | --- | --- |
| No | Date | Day_Count | Country | Job_Platform | Job_URL |

Example data row:

`1 | 2026-09-27 | 1 | Argentina | LinkedIn | https://www.linkedin.com/jobs/view/123`

- Date uses the America/New_York calendar date, written as `2026-09-27` so Google Sheets stores a Date value (not plain text).
- No is the next integer after the highest No already on that tab.
- Day_Count is how many rows on that tab already use today's date, plus one.
- Job_Platform is always LinkedIn. The backend overwrites any other platform a client sends.
- A URL already on that tab is skipped. Comparison trims the URL, lowercases the host, and removes a trailing slash.
- Leave empty rows under the data. The backend updates the next empty A:F cells. It does not insert rows, so a sheet that blocks row insertion still accepts new jobs while empty rows remain. If a tab runs out of empty rows, add empty rows at the bottom in Google Sheets, then try again.

## Share the spreadsheet with the service account

1. In Google Cloud Console, enable the Google Sheets API for the project.
2. Create a service account and add a JSON key.
3. Copy `client_email` and `private_key` from that JSON file into `backend/.env`. Do not commit the JSON file or place it in this repository.
4. Open the spreadsheet. Copy the ID from the URL: `https://docs.google.com/spreadsheets/d/<spreadsheet-id>/edit`.
5. Click **Share**.
6. Paste the service account email (`GOOGLE_SERVICE_ACCOUNT_EMAIL`).
7. Set the role to **Editor**.
8. Turn off notification email if you do not want one.
9. Click **Share** or **Send**.
10. If any country tab uses protected ranges, add that same service account email as an editor of those ranges. The account must be able to edit existing cells.

## Backend environment

```powershell
Copy-Item backend\.env.example backend\.env
```

Fill in:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email that has Editor access |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Private key from the JSON file. Keep `\n` escapes inside double quotes. |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Spreadsheet ID from the sheet URL |
| `EXTENSION_API_KEY` | Long random string. This is the only secret the extension stores. |
| `PORT` | Defaults to `8787` |
| `HOST` | Defaults to `127.0.0.1` |

`backend/.env` is gitignored. Never put the private key in the extension, in a Chrome zip, or in git.

## Run

```bash
npm install
npm test
npm run build
npm run backend
```

The API listens on `http://127.0.0.1:8787`.

- `GET /health` checks the extension key and that all four country tabs exist.
- `POST /add-job` with header `X-Extension-Key` adds jobs.

```powershell
curl.exe -X POST http://127.0.0.1:8787/add-job -H "Content-Type: application/json" -H "X-Extension-Key: your-extension-key" -d '{"country":"Argentina","jobs":[{"jobUrl":"https://www.linkedin.com/jobs/view/123","platform":"LinkedIn"}]}'
```

Success:

```json
{ "ok": true, "added": 1, "skipped": 0, "message": "Added 1 job to Argentina." }
```

Duplicate:

```json
{ "ok": true, "added": 0, "skipped": 1, "message": "URL already on Argentina sheet." }
```

A bad extension key returns 401. A bad country or URL returns 400.

## Load the extension

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Turn on Developer mode.
4. Click **Load unpacked** and select the `build/extension` folder.

Load `build/extension`, not the repository root. That folder contains only the extension. The service-account key in `backend/.env` stays outside it.

Then open the extension popup. The country dropdown is at the top and defaults to Argentina. Changing it saves immediately. The same dropdown is on the options page, along with the API base (`http://127.0.0.1:8787`), the extension key, and **Test connection**.

On a job page, the top-right panel shows **In sheet** or **Not yet** for the saved country tab. When it says Not yet, click Add. The page URL, without the hash, is added and the status switches to In sheet. Hold Shift while clicking Add to pick a country for that save only; Escape cancels. The picked country does not change the saved default.

`npm run pack` writes `linkedin-job-sheet.zip` from `build/extension`. Use that zip if you need to pass the extension to someone. Do not zip the repository.
