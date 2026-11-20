# Muscules regression tests

Install dependencies and the managed browser once with `npm ci` and
`npx playwright install chromium`. Run the browser suite with `npm test`.
Playwright starts a local static server on `127.0.0.1:4173` and uses isolated
Chromium contexts. The tests seed only synthetic storage values in those
contexts; they do not access a personal browser profile, Supabase, or
production storage.

The suite covers QA storage isolation, combat persistence and outcomes, reward
claims, inventory behavior, corrupt battle states, encounter links/expiry,
profile synchronization, and JavaScript errors on the main pages.

The repository currently has no test workflow in GitHub Actions; this command
is ready to be added to CI separately. Visual checks and browser engines other
than Chromium are not covered. The expiration case moves a synthetic encounter
timestamp into the past rather than waiting 24 hours.
