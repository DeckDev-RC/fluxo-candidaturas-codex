# Controlled browser E2E

Run from the repository root with Node 24+, the project dependencies, PowerShell and Playwright Chromium installed:

```powershell
npm ci
npx playwright install chromium
node --test e2e/*.test.mjs
```

These tests run actual headless Chromium through the production Playwright driver, runtime, approval policy, script adapter, evidence service and SQLite authority. A loopback-only HTTP server supplies a synthetic job board. Every test uses a new temporary Fluxo root containing only public scripts/config/templates, `.env.example`, and a generated profile/resume. Runtime/browser/server resources close and the synthetic roots are removed after each test.

The success scenario covers onboarding and campaign persistence, observed job discovery, fit assessment, preparation, confirmed-only form filling, rejection before user approval, an explicit synthetic user approval, submission, a PNG screenshot and evidence metadata, direct SQLite verification, close/restart, exactly-once replay, and a real browser follow-up observation. It also starts the real Fluxo HTTP UI and navigates Fila → Candidaturas → Acompanhamento, checking rendered queue data and browser JavaScript errors. The UI's real auth service is configured with an absent executable so it does not inspect the user's Codex login.

Two rejection scenarios verify that negative and conditional responses create no application, increment no submission counter, and are not clicked again after uncertainty.

Screenshots are regenerated in `output/playwright/e2e/`:

- `confirmed-application.png`
- `response-2.png` (negative)
- `response-3.png` (conditional)
- `fluxo-ui-followup.png`

Scope: the preflight readiness document is explicitly synthetic (`fixture: controlled-browser-e2e`). This suite does not validate OS installation, OAuth, live job-board compatibility or model reasoning. Those require separate prerequisite checks. Browser interaction, approval persistence and application authority are real; no browser/authority mocks are used.

Regression evidence: the committed baseline browser adapter was loaded separately and exercised with real Chromium showing “Candidatura não enviada. O envio falhou.” The expected `confirmed === false` assertion failed (`true !== false`); the production fix and this suite reject that response. Concurrent production work had landed before the full suite's first execution, which passed; this was a separate baseline regression check, not an initial full-suite failure.
