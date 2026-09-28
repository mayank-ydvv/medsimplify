# MedSimplify

**Your lab report, in language you actually understand.**
Upload a lab report. See what's normal, what isn't, and what's changed since last time — explained so anyone can read it.

MedSimplify **explains a document the patient already owns. It never diagnoses.** Every abnormal value routes to a clinician, and every results screen carries: *"This explains what your report says. It does not diagnose. Discuss results with your doctor."*

```
medsimplify/
  shared/        single source of truth read by BOTH apps
    catalog.json          60 tests · LOINC · aliases · ranges (sex × age) · critical values · unit conversions
    explanations/*.json   static explanations in en, hi, bn, ta, te, mr (no numbers baked in)
    classify_cases.json   classification test vectors run by pytest AND vitest
    sample.json           the illustrative sample patient from the brief
  api/           FastAPI pipeline (pdfplumber → clustering → parsing → matching → classify → FHIR)
  db/schema.sql  Postgres/Supabase schema: RLS, cascade deletes, trend index
  web/           Vite + React + TypeScript + Recharts frontend
```

## Run it

```bash
# API (Python 3.11+)
cd medsimplify/api
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8000        # seeded with the sample patient
.venv/bin/pytest                                  # 124 tests

# Web
cd medsimplify/web
npm install
npm run dev                                       # http://localhost:5173
npm test                                          # 79 tests: classify parity, safety, store, sync, copy guard
npm run build
```

`VITE_API_URL` points the web app at the API (default `http://localhost:8000`). In this repo both are also in `.claude/launch.json` as `medsimplify-web` and `medsimplify-api`.

**Three ways in:**
- **Use a sample report**: runs entirely in the browser through the TypeScript mirror of the pipeline. No API needed.
- **Try a real sample PDF**: sends `web/public/sample-lab-report.pdf` through the real FastAPI pipeline.
- **Drop your own PDF**: same path as the sample PDF. Scanned images need the optional OCR extra (see below).

**Reach every state:** append `?demo=parse-fail | error | slow | offline | empty` to any URL (`?demo=off` clears it).

## What's deliberate

### Classification is code, never a model
`classify()` in `api/app/pipeline/classify.py` is mirrored exactly by `web/src/lib/classify.ts`. Both run the same vectors in `shared/classify_cases.json`.
- **Critical thresholds are checked first**, so a panic value can never be reported as a mild abnormality.
- **Deviation is measured against the bound that was crossed**, not the range width. The brief's formula divides by `(high − low)`, which crashes on one-sided ranges (LDL `< 100`, HbA1c) and would call Ferritin 8 (range 30–400) only "borderline". With this change Ferritin reads `low` (73% below) and B12 198 vs 211 reads `borderline_low` (6% below).
- **Values less than 10% outside the range are "borderline"**, so nobody is alarmed about a value 0.1 units out.
- **Qualitative urine results** (Nil / Trace / 1+ …) are compared on an ordinal scale against an expected result, not a numeric range.

### The mock data's `status` field is ignored and recomputed
The deterministic layer decides, and three values come out differently from the brief:

| Test | Brief says | Computed | Why |
|---|---|---|---|
| Creatinine 1.1 (0.6–1.1) | borderline_high | **normal**, shown "at the upper limit" | `>` is strict; it's still the delta-check case (0.9 → 1.1, +22%, "moving quickly, still within range") |
| Vitamin B12 198 (211–911) | low | **borderline_low** | 6% below the bound |
| Potassium 6.3 | critical_high | critical_high | checked against critical ≥ 6.0 before "high" |

### Values that must never mislead
- **No range, no verdict.** A value with nothing to compare against is `unknown` ("No range to compare" / "ask your doctor"), never "Within range". Critical thresholds are still checked first.
- **Impossible numbers aren't alarms.** Each test has a plausible `[min, max]` in `catalog.json`. A value outside it, like Hb 104 from a dropped decimal point, is marked `implausible` and shown as "check this value" on the confirm screen, instead of raising the critical banner.
- **Indian number formats.** "7,200" is 7200 and "2,60,000" is 260000; only "1,5" is a decimal comma. Abnormal flags printed by the value ("6.3 H", "188 *", "↑ 6.3") are stripped rather than causing the row to be dropped.
- **Nothing disappears silently.** Lines that look like results but can't be parsed are listed on the confirm screen under "Lines we couldn't read".

### Keeping data in the right place
- **Every file upload asks who it's for.** Real reports can never be filed under the illustrative sample person.
- **Re-uploading the same file** (same SHA-256 for the same person) returns the existing report with `status: "duplicate"`, and the app opens the saved copy instead of storing a second one.
- **The report date and lab are editable** on the confirm screen, with a warning when no date was found in the file. The date decides where the report sits on trend charts.
- **Only real edits are synced.** The confirm screen sends just the changed fields, plus added and removed rows. Unchanged range fields are never sent, so a catalog range can't turn into "printed on your report".
- **Backing out of the sample leaves nothing behind.** Its two older reports are saved only when the user confirms.
- **Delete everything also withdraws consent**, so it's asked again next time. Results pages say when saving is off.

### Range precedence
The range printed on the report always wins, because it's specific to that lab's assay. The catalog range for the person's sex and age band is only a fallback. Which one was used is stored as `ref_source` and shown in the detail drawer: a green "Range printed on your report" tag, or an amber "Standard range for …" tag. In the sample, HbA1c uses the catalog range.

Critical thresholds live in canonical units and are converted to the unit printed on each row. For example, platelets < 20,000/cumm becomes 0.2 lakh/cumm.

### Table extraction
- `pdfplumber` provides word boxes, and rows and columns are recovered by 1-D gap clustering in O(n log n).
- Both thresholds are **derived from each document**: rows use 0.6 × median line height, columns use 2 × median character width.
- `tests/test_cluster.py` proves a 10pt and a 13pt copy of the same report recover identical rows.
- Range regexes accept the hyphen, en-dash, em-dash and minus sign.

### Name matching
Matching tries, in order:
1. An exact normalised key.
2. The alias table (SGPT/S.G.P.T = ALT, SGOT = AST, Sr. Creatinine, Vit. D (25-OH), Hb/HGB …).
3. Trigram retrieval plus a rapidfuzz ratio, with cutoff 85.
4. Otherwise the row is unmatched and shown with the grey "unrecognised" chip, excluded from analysis until the user maps it.

Punctuated aliases and fuzzy hits show the amber "auto-matched" chip.

### LLM guardrails (stubbed provider, real guards)
`api/app/pipeline/explain.py` is set up for a model:
- Its input is structured facts only, never the document.
- Every number in a response must appear in the input facts, otherwise it falls back to the static text.
- Readability is checked with textstat at grade ≤ 8, with one regeneration before falling back.
- All cache misses go into one batched call.
- The cache key is `sha256(test | status | deviation@0.25 | lang)`.

The default `StaticProvider` serves the curated text in `shared/explanations`. A real model plugs in through the `Provider` protocol. The UI renders every number from parsed state, never from explanation strings, and a test enforces that explanations contain no digits other than inside test names.

### Scope boundary, enforced in code
`web/src/lib/copy.test.ts` fails the build if any UI string or explanation, in any language, says "safe", "fine", "healthy", "harmless" or "nothing to worry about" (or the local equivalents), or states a condition as a conclusion. Placeholders must match across all six locales.

### Robustness
- **PDF parsing runs in a separate process** with a 20-second timeout and a 30-page cap. A hung or crashing parser returns a plain "we couldn't read this" and can't take the API down.
- **The delta check ignores tiny absolute moves.** A change must be ≥ 20% (per test) *and* at least 10% of the reference range's scale, so CRP 0.1 → 0.3 (+200%) isn't flagged.
- **An unconfirmed report survives a reload.** It's kept in sessionStorage, which is cleared when the tab closes.

### Privacy
- The raw file is parsed in memory and never written to disk. Only its SHA-256 is kept, to detect re-uploads.
- Row-level security policies are in `db/schema.sql`. The in-memory API store applies the same per-user scoping, which `test_row_level_scoping` tests.
- Deleting a patient cascades to their reports and values, and `test_cascade_delete` tests it.
- Health data is written to browser storage **only** if the user turned on "Save my results"; language and consent choices are always remembered.
- "Delete everything" wipes local data and calls `DELETE /patients/{id}` for each profile.

## API (matches the brief's contract)
The brief's endpoints:

`POST /patients` · `GET /patients/{id}` · `POST /reports/upload` · `GET /reports/{id}` (`?format=fhir` returns FHIR R4 Observations) · `PATCH /reports/{id}/values/{vid}` · `DELETE /reports/{id}` · `GET /trends/{pid}?test=HBA1C` · `GET /trends/{pid}/summary` · `POST /explain` · `GET /reports/{id}/questions` · `GET /reports/{id}/summary?lang=hi` · `DELETE /patients/{id}`

Additions beyond the brief: `GET /patients`, `PATCH /patients/{id}` (edit a person; re-analyses their values), `PATCH /reports/{id}` (correct the date or lab; re-analyses every value), `POST /reports/{id}/values` (add a row manually), `DELETE /reports/{id}/values/{vid}`, `GET /catalog`, `GET /health`.

Auth is stubbed with an `X-User-Id` header in place of the Supabase JWT, and the store is in memory. `db/schema.sql` is the production schema, but it has not been applied to a Supabase project.

## Known limits and follow-ups
- **Translations are draft.** The Hindi, Bengali, Tamil, Telugu and Marathi UI text, and the explanations for the 16 sample tests, were written by me and need review by a native speaker with clinical background. Other tests fall back to a panel-level explanation in the chosen language.
- **LOINC codes and fallback ranges** are typical adult values and should be checked against loinc.org and the clinical team before production.
- **OCR for scans and photos** needs `requirements-ocr.txt` (PaddleOCR, pdf2image), which may not have wheels for the newest Python. Without it, a scanned upload gives a plain-language "we couldn't read this" plus manual entry.
- **Colour tokens were adjusted for WCAG AA.** Status colours are used for icons, bars and borders. Status words use darker ink tokens (`--ink-*`), because coral and amber text on a tint fall below 4.5:1. `--text-faint` (2.9:1) is used for decoration only, and caption text uses `--text-caption`.
- **The privacy page says which claims are production-only.** Row-level security is only in `db/schema.sql`; in this prototype, saved results live unencrypted in the browser, and the page says so. A PIN or app lock for shared devices is a sensible next step.
- **Bundle size.** The main bundle is about 183 KB gzipped, and Trends and Recharts are lazy-loaded. The six languages ship together; splitting them per language is an easy next step.
- **The summary PDF** comes from the browser's print-to-PDF with a dedicated print stylesheet.
- **Offline:** production builds register `public/sw.js`, which caches the app shell (page, JS, CSS) so the app opens without a connection and saved reports stay readable. It never caches API responses. Development builds don't register it.

---
This material contains content from LOINC (loinc.org). LOINC is copyright © Regenstrief Institute, Inc.
