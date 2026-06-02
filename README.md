# Job Search Agent

Automated lead agent to find US marketing agencies with 25-150 employees using your Azure OpenAI deployment, then output/update a Google Sheet.

## What it does

- Uses Azure OpenAI to research US marketing agencies (`25-150` employees)
- Restricts agency types to: integrated marketing, creative, PR, brand, and brand strategy agencies
- Extracts likely senior decision-makers (Founder, CEO, Owner, President, Managing Director, CSO, Head/VP/Director of Strategy)
- Keeps only contacts with business email addresses
- Upserts into your Google Sheet so repeated runs refresh the same tab

## Setup

1. Copy env template:

```bash
cp .env.example .env.local
```

2. Fill in `.env.local` with your Azure OpenAI values plus Google Sheets settings.

`npm run start` now auto-loads `.env.local` (if present), so you do not need to manually export variables each time.

`AZURE_OPENAI_ENDPOINT` must be a resource base URL:
- `https://<resource>.openai.azure.com/` or
- `https://<resource>.cognitiveservices.azure.com/`

Do not use project-style endpoints like `https://...services.ai.azure.com/api/projects/...` in this app.

Optional control:

- `LEAD_SEARCH_NOTES` (extra prompt instructions)
- `GOOGLE_SHEET_ID` (URL or plain id; defaults to your shared sheet id)
- `GOOGLE_SHEET_TAB` (defaults to `Sheet1`)
- `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` (path to service account JSON file)
- OR `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`

Important:

- Share the Google Sheet with your service account email as `Editor`.

## Run

```bash
npm run start
```

Output destination:

- Google Sheet tab (default `Sheet1`)

## Refresh regularly

Run this on a schedule (cron/GitHub Actions/local scheduler):

```bash
npm run start
```

Each run merges updates by `company_domain + contact_email`.

## Validate project

```bash
npm run lint
npm test
npm run build
```

## Dev server

```bash
npm run dev
```

This serves a minimal status page and prints local/network URLs.
