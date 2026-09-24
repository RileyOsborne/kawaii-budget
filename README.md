# 🌸 Kawaii Budget - Friction-Free Personal Finance

A local-first, zero-friction budgeting and debt payoff web application styled in a beautiful cherry blossom kawaii aesthetic (deep mauve, blush pinks, and rounded cards). Built with React, TypeScript, Tailwind CSS, Express, and SQLite.

---

## ✨ Features & Architecture

- **🌸 Monthly Budget Planner:** Visual budget planner with custom status badges, categories, and progress bars. Tracks Budget vs. Actual vs. Difference vs. Delta %.
- **📅 Monthly Bill Breakdown:** Itemized recurring bills categorized by **Paycheck 1 (1st–15th)** vs. **Paycheck 2 (16th–31st)**, with one-click monthly paid tracking.
- **📦 Sinking Funds:** Track annual, biannual, and periodic expenses with automatic monthly savings allocation targets.
- **💳 Debt Freedom Hub & Snowball Simulator:**
  - Full tracking for revolving credit cards, personal loans, and auto loans.
  - Dynamic **Snowball (Lowest Balance)** vs. **Avalanche (Highest APR)** calculator.
  - Interactive **Extra Monthly Payment Slider** calculating exact debt-free dates and interest saved.
- **🏦 Account Ledgers:** Dedicated running balance ledgers for Checking (with safety buffer), Savings, Cash, and debt accounts.
- **🎀 Paycheck Waterfall:** Bi-monthly cash-flow waterfall modeling paycheck arrival, fixed bill commitments, variable spending umbrella, and debt pay-down.
- **🔮 Compound Growth Projections:** Multi-year compound interest savings growth forecasting.
- **🎯 Goals & Milestones:** Visual progress rings with celebratory confetti animations.
- **⚡ Friction-Free Hotkeys:** Press `N` anywhere for instant Quick Add; press `Cmd+K` / `Ctrl+K` for the command palette.
- **💾 SQLite Persistence & Atomic Backups:** Fast, zero-configuration local SQLite storage with WAL mode. Automatic daily snapshots and 1-click tarball / JSON backup & restore.

---

## 🚀 Running Locally (Node.js)

```bash
# 1. Install dependencies
npm install

# 2. Run both backend API & Vite frontend with live reload
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## 🐳 Running with Docker

```bash
# Build and start container in the background
docker compose up -d --build
```

Open **http://localhost:3000** in your browser.  
Your SQLite database is automatically persisted to the `./data` volume.

---

## 📦 Deploying via GHCR (GitHub Container Registry)

To run the published container image:

```bash
docker run -d \
  --name kawaii-budget \
  -p 3000:3000 \
  -v kawaii_budget_data:/data \
  --restart unless-stopped \
  ghcr.io/rileyosborne/kawaii-budget:latest
```

---

## 💾 Backup & Migration

- Go to the **⚙️ Backup & Docker** tab in the web app to create manual snapshots or download/upload backups.
- Backups are stored as atomic `.tar.gz` archives containing your complete SQLite database file and metadata.
- To migrate your database to a hosted server or Docker container:
  1. Create or download a backup from the web UI (or copy `data/kawaii_budget.sqlite`).
  2. Upload or place it in the `/data` volume of your hosted environment.
  3. The app will immediately load and display your complete state.
