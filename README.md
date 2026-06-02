# Job Search Agent

Automated lead agent to find US marketing agencies with 25-150 employees using your Azure OpenAI deployment, then output/update a single spreadsheet CSV.

## What it does

- Uses Azure OpenAI to research US marketing agencies (`25-150` employees)
- Extracts likely senior decision-makers (Founder, CEO, Owner, President, Managing Director, CSO, Head/VP/Director of Strategy)
- Keeps only contacts with business email addresses
- Upserts into `data/agency_leads.csv` so repeated runs refresh the same sheet

## Setup

1. Copy env template:

```bash
cp .env.example .env.local
```

2. Fill in `.env.local` with your Azure OpenAI values.

`npm run start` now auto-loads `.env.local` (if present), so you do not need to manually export variables each time.

`AZURE_OPENAI_ENDPOINT` must be a resource base URL:
- `https://<resource>.openai.azure.com/` or
- `https://<resource>.cognitiveservices.azure.com/`

Do not use project-style endpoints like `https://...services.ai.azure.com/api/projects/...` in this app.

Optional control:

- `LEAD_SEARCH_NOTES` (extra prompt instructions)

## Run

```bash
npm run start
```

Output file:

- `data/agency_leads.csv`

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
