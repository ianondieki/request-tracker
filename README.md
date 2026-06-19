# Request Tracker

A small web app for submitting and managing requests — bugs, feature ideas, general feedback, partnership enquiries — with a live queue where each request can be triaged, filtered, searched and exported.

**Live demo:** _https://request-tracker.nyamungaian.workers.dev/_

## What it does

- **Submit a request** with full name, email, product/company, request type (Bug, Feature Request, General Feedback, Partnership, Other), priority (Low, Medium, High) and a message. Every field is validated inline before the request is accepted.
- **Queue view** — each submitted request appears as a card showing all its details, a sequential reference (`REQ-0001`, `REQ-0002`, …) and a relative timestamp.
- **Status management** — every request starts as **New** and can be moved to **In Review**, **Resolved** or **Rejected** directly from its card. The colored spine on the card's left edge reflects its current status.
- **Filtering and search** — filter by status, type, priority or product (individually or combined), plus free-text search across name, email, message and reference. A "Clear" button resets everything. The header meter's legend is also clickable: tap a status to filter by it, tap again to clear.
- **Edit and delete** — any request can be loaded back into the form ("Edit"), updated and saved; its reference, status and created time are preserved and the card is marked "edited". Delete asks for confirmation first.
- **Persistence** — requests are saved to `localStorage`, so they survive page refreshes and browser restarts.
- **Extras** — live queue-breakdown meter in the header, inline validation errors that clear as you type, CSV export, empty/no-match states, toast notifications, self-refreshing relative timestamps, responsive layout down to mobile, keyboard-visible focus states, and `prefers-reduced-motion` support.

## Tech stack

Plain **HTML, CSS and JavaScript** — no frameworks, no build step.

I deliberately kept the stack simple: the assessment values clear, understandable code over a complicated setup, and vanilla JS is enough for a single-page CRUD app like this. The code is split so each file has one job:

```
index.html        page structure (form + queue)
css/styles.css    design system and all styling
js/storage.js     persistence layer — the only file that touches localStorage
js/app.js         app logic: config, state, validation, rendering, filters, actions
```

Separating `storage.js` means that if this app ever moved to a real backend (e.g. Cloudflare D1), only that one file would need to change.

## How to run locally

No install needed. Either:

1. Clone the repo and open `index.html` directly in a browser, **or**
2. Serve it locally (avoids any browser restrictions on `file://` pages):

```bash
git clone <your-repo-url>
cd request-tracker
npx serve .        # or: python3 -m http.server 8000
```

Then open the printed URL.

## Configuration

The product/company options live in one constant at the top of `js/app.js`:

```js
const PRODUCTS = ["Photomed", "Photomed Web", "Photomed Mobile", "Other"];
```

Update this list to match the options provided in the recruitment email.

## Deployment

Deployed on **Cloudflare Pages** (no build step needed):

1. Push this repo to GitHub.
2. In the Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**, select the repo.
3. Leave **Build command** empty and set **Build output directory** to `/`.
4. Deploy — Cloudflare gives you a `*.pages.dev` URL within a minute or two.

## Design notes

- The header **queue meter** is a segmented bar showing the proportion of New / In Review / Resolved / Rejected requests — it updates live as statuses change.
- Each card's **status spine** (the colored left edge) gives the queue scannability: you can read triage state at a glance without reading any text.
- Type system: Bricolage Grotesque for headings, Instrument Sans for body text, IBM Plex Mono for reference numbers, timestamps and tags — the mono face signals "machine data" the way real ticketing systems do.
- User-entered text is escaped before rendering (`escapeHtml` in `app.js`) so a message containing `<script>` tags is displayed as text, not executed.

## What's completed

Everything in the basic brief: working form, validated inputs, queue list, status changes, multiple filters plus search, and `localStorage` persistence. Optional improvements included: edit and delete actions, CSV export, summary meter (with click-to-filter), form validation, and responsive design.

## What I'd improve with more time

-Move storage to a shared backend (Cloudflare D1 + a small API) so requests sync across devices instead of living in one browser.
-An admin-only view behind authentication, so status changes aren't open to every visitor.
-Automated tests for the filtering and validation logic.
-Server-side pagination once the queue grows beyond a few hundred records.
-An "undo" window after delete, rather than a blocking confirm dialog.

## Challenges faced

-The trickiest bug was a horizontal scroll that only appeared on mobile. The layout looked fine on desktop, and it took me a while to trace it to the hidden radio inputs behind the priority buttons stretching the page. I also had to figure out the right Cloudflare build settings, since a plain HTML site has no build command._

## Use of AI tools

I used an AI assistant (Claude) while building this project — for scaffolding, debugging and improving the UI. I reviewed the output, tested every feature, and I understand and can explain all of the code in this repository.
