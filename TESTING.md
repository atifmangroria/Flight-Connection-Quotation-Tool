# Automated QA Testing

This repository includes Playwright end-to-end tests for the Flight Connection Quotation Tool live GitHub Pages site.

## 1. Install Playwright

Install Node.js 18 or newer, then run:

```bash
npm install
npx playwright install
```

## 2. Set Login Credentials

The tests require a valid approved account. Do not commit credentials.

macOS/Linux:

```bash
export FC_TEST_EMAIL="admin@example.com"
export FC_TEST_PASSWORD="your-password"
```

Windows PowerShell:

```powershell
$env:FC_TEST_EMAIL="admin@example.com"
$env:FC_TEST_PASSWORD="your-password"
```

Optional non-admin role check:

```powershell
$env:FC_TEST_NON_ADMIN_EMAIL="user@example.com"
$env:FC_TEST_NON_ADMIN_PASSWORD="user-password"
```

The default target is:

```text
https://atifmangroria.github.io/Flight-Connection-Quotation-Tool
```

Override it with `FC_BASE_URL` when testing another deployment.

## 3. Run Tests

```bash
npm run test:e2e
```

## 4. Run With Browser Visible

```bash
npm run test:e2e:headed
```

## 5. Open Playwright Report

```bash
npm run test:e2e:report
```

## 6. Failed Test Artifacts

Playwright keeps screenshots, videos, and traces for failures under:

```text
test-results/
playwright-report/
```

Open the HTML report to inspect the exact browser steps, DOM snapshots, screenshots, and retained videos.

## Test Data and Cleanup

All generated client names start with:

```text
QA_TEST_DO_NOT_USE
```

The tests remove matching quotations from browser `localStorage` after each run. If Firebase sync already stored a record, filter by the same prefix in the app or Firestore and delete it manually after review.

## Coverage

The suite covers:

- Admin login and dashboard loading
- Admin module access: User Management, Reports, Package Builder, Notifications
- Umrah, International, and Domestic quotation pages
- Passenger scenarios for adults, children with bed, children without bed, infants, small/large pax counts, optional services, add-ons, multiple rooms, multiple hotels, and currency-specific flows
- Status transitions: Pending, Follow up, Booked, Vouchered, Cancel, Expired
- Voucher availability only after Booked status
- Voucher draft/publish flow and live voucher link
- Live quotation link total check
- Helper-level assertions for passenger calculation and room calculation rules

Domestic tests assert PKR-only behavior through PKR inputs. Umrah tests use SAR-to-PKR helper coverage and set ROE where the UI exposes it. International tests exercise multiple-currency scenarios and compare calculated totals across calculation, preview, saved quotation, and public link surfaces.
