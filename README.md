# Vello ops board

Public interactive kanban for Ryan Iacoviello’s cross-book work under **Vello Industry** (Allocent, Chamba, GrowthX, Personal, Crypto, Ops). This is the umbrella ops board — not an Allocent product surface. Ship Tracker is retired; this app replaces it.

**Live URL:** [https://velloindustry.github.io/vello-ops-board/](https://velloindustry.github.io/vello-ops-board/)

If that GitHub Pages URL is not live yet, use the one-time steps below. After Vercel is linked, the Vercel URL is preferred (shared persistence is available there).

## What it does

- Dark-theme columns: **Blocked**, **Waiting on Ryan**, **Doing**, **Scheduled**, **Backlog**
- Cards show book badge, title, detail, date, owner
- Drag-and-drop between columns and reorder within a column (mouse and touch)
- Click a card to edit (book, title, detail, date, owner, column) or delete
- Add card from the header or from any column
- Export JSON / Import JSON in the header
- Seeded from [`data.json`](data.json) (16 cards) on first load in a browser

## Persistence

| Mode | When | What happens |
| --- | --- | --- |
| **This browser** | Default on GitHub Pages, or Vercel without KV | Board is saved to `localStorage`. Survives refresh on that device/browser. |
| **Shared** | Vercel project with KV connected | Same board for every device. Status chip reads `Shared`. |
| **Cross-device without KV** | Any host | Use **Export JSON** on one device and **Import JSON** on another. |

No local Python server is required. The old `server.py` is not part of this app.

The site is public. Anyone with the URL can open it. With KV enabled, anyone with the URL can edit the shared board.

## Deploy

### Option A — Vercel (recommended, enables shared board)

1. Open [https://vercel.com/new](https://vercel.com/new) and sign in (GitHub).
2. Import **VelloIndustry/vello-ops-board**.
3. Framework Preset: **Other**. Root directory: `.` Leave build command empty.
4. Deploy. The URL will look like `https://vello-ops-board.vercel.app`.
5. Optional shared persistence: Vercel project → **Storage** → **Create Database** → **KV** → connect to this project → **Redeploy**.
6. Put the Vercel URL in this README’s **Live URL** line if you want that to be canonical.

No secrets belong in this repo. KV credentials stay in the Vercel project env.

### Option B — GitHub Pages (works without Vercel)

1. Repo **Settings → Pages**.
2. Build and deployment source: **GitHub Actions**.
3. Merge to `main` (or run **Actions → Deploy GitHub Pages → Run workflow**).
4. Site: [https://velloindustry.github.io/vello-ops-board/](https://velloindustry.github.io/vello-ops-board/)

The workflow is [`.github/workflows/pages.yml`](.github/workflows/pages.yml). Persistence on Pages is per-browser `localStorage` unless you also deploy to Vercel with KV.

## Local preview

Any static server, for example:

```bash
python3 -m http.server 8765
```

Then open http://127.0.0.1:8765/

## Data

[`data.json`](data.json) is the first-load seed. After the first visit, that browser keeps its own copy until you import JSON or (on Vercel+KV) until the shared API overwrites it.
