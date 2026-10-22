Lab Test Bundle Finder

A web application that finds the lowest-cost combination of lab test packages and individual tests to cover a user's selected tests.

Tech Stack
Backend: Node.js, TypeScript, Express
Frontend: React, Vite, TypeScript
Catalog: Loaded into memory at startup
Getting Started
1. Start the Backend
cd backend
npm install
npm run dev


The API runs at http://localhost:3000.

2. Start the Frontend

Open a second terminal:

cd frontend
npm install
npm run dev


The UI runs at http://localhost:5173. API requests to /api are proxied to the backend.

3. Run Tests
cd backend
npm test


The test suite includes all examples from the catalog, API tests, tie-break rules, error cases, and performance checks.

Optional Environment Variables
PORT — Backend port.
CATALOG_PATH — Path to the lab catalog JSON file. Defaults to backend/data/lab-catalog.json.
How It Works

The planner finds the cheapest way to cover all selected tests using available packages and individual tests.

When multiple plans have the same total cost, it prefers:

Fewer items.
Fewer extra tests included in the selected packages.
The lexicographically smallest sorted list of item IDs.

The planner uses an exact depth-first search with cost-based pruning. This avoids checking every possible combination while still finding the optimal plan.

If a selected test cannot be purchased individually or through any usable package, the planner returns NOT_AVAILABLE and lists the unavailable tests.

Catalog Handling

Catalog issues are handled once at startup in backend/src/catalog.ts. Repairs are logged as warnings.

Inactive packages: Excluded from planning.
Inactive tests: Cannot be selected and are excluded from the tests API.
Duplicate tests in a package: Counted only once.
Unknown test IDs in a package: Ignored; valid tests in the package remain usable.
Duplicate selections: Counted once, preserving their original order.

The API returns cleaned package data through GET /api/packages.

API Overview
Method	Endpoint	Description
GET	/api/tests	Get selectable tests
GET	/api/packages	Get usable packages
POST	/api/plan	Find the cheapest plan for selected tests

The planning endpoint accepts a testIds array. Invalid or empty selections return an appropriate error response.

Frontend Features
Search tests by name or code.
Select and remove tests using chips.
View the recommended plan as selections change.
See the total cost and savings when available.
Get clear error messages and retry failed network requests.

The frontend cancels outdated requests and ignores stale responses, preventing an older result from replacing a newer plan.

The layout is responsive and supports screen widths down to 375 px.

Performance

The planner was tested with the real catalog and synthetic catalogs containing 40 packages.

Real catalog: Approximately 10 ms for all 19 selectable tests, including initial JIT warm-up.
Typical selections: Under 1 ms in local measurements.
Synthetic catalogs: Up to approximately 17 ms across 20 random catalogs with 40 packages.

These are local measurements, not performance guarantees. The search is exponential in the worst case, but pruning and targeted branching make it efficient for the current catalog.

Future Improvements
Add frontend tests with Vitest and Testing Library.
Improve keyboard navigation in the test picker.
Cache plans for repeated selections.
Validate request bodies with Zod.
Show alternative plans so users can compare options.
Add a NestJS backend if needed.