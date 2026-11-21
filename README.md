# Offerwala

```
backend/   FastAPI + async Playwright scrapers
frontend/  React + Vite — `/` pre-launch homepage, `/dashboard` deals dashboard (filters, sync, details), `/admin` scraper status
```

## Run

From the project root, one command starts both (Ctrl+C stops both):

```bash
npm install      # first time only
npm start        # api → http://localhost:8000/docs · web → http://localhost:5173
npm run setup    # fresh machine: installs frontend deps + creates backend venv + Chromium
```

Or run them separately:

```bash
# backend  (venv + Chromium already installed)
cd backend
source .venv/bin/activate          # or: uv venv && uv pip install -r requirements.txt && playwright install chromium
uvicorn app.main:app --reload      # http://localhost:8000/docs

# frontend
cd frontend
npm install && npm start           # http://localhost:5173 (proxies /api -> :8000)
```

### Quick start: scrape MCB locally in a visible (headed) browser

```bash
# terminal 1 — start the API
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload

# terminal 2 — call the public endpoint (a Chromium window opens so you can watch)
curl -X POST "http://localhost:8000/api/public/scrape?type=bank&name=mcb&headed=true"
# quick test: 5 merchants, slowed down 300ms per action
curl -X POST "http://localhost:8000/api/public/scrape?type=bank&name=mcb&headed=true&limit=5&slow_mo_ms=300"

# check progress / result (use the "id" returned above)
curl http://localhost:8000/api/public/scrape/jobs
curl http://localhost:8000/api/public/scrape/jobs/<job_id>
```

Work on a single scraper without the server:

```bash
cd backend
python -m app.cli meezan --headed    # watch the browser
python -m app.cli all --json
```

## Database (PostgreSQL 18 + pgAdmin 4)

Postgres runs as a Homebrew service (`brew services start postgresql@18`). Database `offerwala`,
user `offerwala`; the connection string is `DATABASE_URL` in `backend/.env`.

```bash
cd backend
alembic upgrade head                 # create/upgrade tables
python -m app.db.seed                # insert all registered banks
python -m app.cli meezan --save      # scrape + save to Postgres
alembic revision --autogenerate -m "..."   # after changing app/db/models.py
```

Tables (`backend/app/db/models.py`):

| Table | Purpose |
|---|---|
| `users` | app users |
| `banks` | one row per bank scraper (`slug` matches the scraper) |
| `cards` | card types per bank: Platinum, Gold, Silver… (`tier`, `card_type`, `network`) |
| `businesses` | restaurants, cafes, shops… (`category`) with one location: address, city, lat/lng |
| `offers` | one offer per bank deal, default `discount_percent` / `max_discount_amount`, valid days/dates |
| `offer_cards` | which cards an offer covers, **with per-card discount/cap** (Platinum 40%, Gold 25% on the same offer) |
| `offer_businesses` | which businesses an offer applies to |
| `user_favourite_offers` | a user's saved offers |
| `waitlist_signups` | pre-launch sign-ups from the homepage (email, city, banks) — `POST /api/public/waitlist` |

Scrapers fill `business_name`, `city`, `discount_percent`, `cards=[CardDiscount(...)]` on each `Offer`;
`app/db/repository.py` upserts everything. Offers not seen in a bank's latest successful scrape are set `is_active=false`.

## API

| Scope | Route | Auth |
|---|---|---|
| public | `GET /api/public/scrapers`, `POST /api/public/scrape`, `GET /api/public/scrape/jobs/{id}` (see below) | none |
| public | `GET /api/public/health`, `/banks`, `/banks/{slug}/offers` (DB), `/offers` (DB), `/results` | none |
| isolated | `POST /api/isolated/scrape/banks/{slug}` (scrapes + saves to DB), `POST /api/isolated/scrape/banks`, `GET /api/isolated/scrape/status` | `X-API-Key` header = `ISOLATED_API_KEY` |

## Scraper layout

```
backend/app/public/
├── bank_scrapers/
│   ├── __init__.py          # BANKS registry (slug -> scraper class)
│   ├── base.py              # BaseBankScraper: context, timing, error -> ScrapeResult
│   ├── common_methods/      # actions.py: goto, click, input_text, press_enter, get_text, ...
│   │                        # errors.py (TagNotFoundError, ...)
│   ├── tags/<bank>.py       # named selectors per bank
│   ├── variables/<bank>.py  # BASE_URL, DISCOUNTS_PATH, DISCOUNTS_URL per bank
│   └── hbl.py meezan.py alfalah.py ubl.py mcb.py ... (11 Pakistani banks)
├── restaurant_scrapers/
└── other_scrapers/
```

**Never write selectors inside a scraper** — put them in `tags/<bank>.py` as plain variables (`OFFER_CARD = ".deal-card"`) and pass them to `actions.*`.
When a site changes, the result says exactly what broke, e.g.:

```json
{"kind": "tag_not_found", "tag_name": "meezan.OFFER_CARD", "selector": "...",
 "action": "wait_for", "page_url": "...", "screenshot": "artifacts/failures/....png"}
```

Pass `optional=True` to an action when the element may not exist (returns None instead of failing).

### Add a bank
1. `variables/<slug>.py` — `BANK_SLUG`, `BANK_NAME`, `BASE_URL`, `DISCOUNTS_PATH`, `DISCOUNTS_URL`
2. `tags/<slug>.py` — selector strings
3. `<slug>.py` — class extending `BaseBankScraper`, implement `async def scrape(page)`
4. Register in `bank_scrapers/__init__.py`

## Run scrapers from the API

```bash
curl -X POST "localhost:8000/api/public/scrape"                                   # every scraper
curl -X POST "localhost:8000/api/public/scrape?type=bank"                         # all banks
curl -X POST "localhost:8000/api/public/scrape?type=bank&name=mcb&headed=true"    # watch MCB in a browser window
curl -X POST "localhost:8000/api/public/scrape?name=mcb&headed=true&limit=5&slow_mo_ms=300"  # quick, slowed-down test
curl localhost:8000/api/public/scrape/jobs/<id>                                   # progress / results
```

| Param | Default | |
|---|---|---|
| `type` | `all` | `all`, `bank`, `restaurant`, `other` |
| `name` | – | one scraper by slug or name (`mcb`, `MCB Bank`) |
| `headed` | `false` | opens a visible Chromium window; only when `APP_ENV=development` (or `ALLOW_HEADED_SCRAPES=true`) |
| `slow_mo_ms` | – | slow each browser action, for watching |
| `limit` | – | max merchants per scraper; limited runs don't deactivate unseen offers |
| `save` | `true` | save to Postgres |

Jobs run in the background and are kept in memory until the server restarts.

## MCB scraper (working)

`backend/app/public/bank_scrapers/mcb.py` scrapes MCB's deals portal (mcb-web.peekaboo.guru) with Playwright as a normal visitor:
category pages (+ "See More") → merchant list → each merchant page, reading the deals/branches JSON the page loads.
Each deal becomes one offer; each branch becomes one `businesses` row with address + lat/lng; each eligible MCB card is linked with the discount.

Settings in `variables/mcb.py`: `CITIES` (default `["lahore"]`), `MAX_MERCHANTS` (limit while developing),
`DETAIL_PAGE_CONCURRENCY`, and the `*_RESPONSE` markers (update these if the site's API paths change — the error names which one).
Shared parsers for days ("Every Saturday", "Mon to Thu"), caps ("cap PKR 4,000") and card tiers live in `common_methods/parsing.py`.

```bash
python -m app.cli mcb --save
```

## Note: bot protection
Some sites (e.g. Askari, Faysal) return **HTTP 403** to automated clients. `PROXY_SERVER` (+ user/pass) in `backend/.env` routes Playwright through a proxy if needed.
