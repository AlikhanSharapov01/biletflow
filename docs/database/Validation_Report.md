# Database design validation report

Validated: 22 September 2026. No application/production database was accessed.

## Results

- Editable draw.io XML validates against the official mxfile XSD.
- All 54 pages render using the official draw.io viewer in local headless Microsoft Edge, with zero renderer errors.
- All 129 foreign keys have explicit connector representations on the 16 domain relationship pages.
- Model references and target unique keys validate; table-card bounding-box overlap checks pass.
- Reviewed contact sheets for all pages and detailed samples for tables, relationship graphs and refund activity; corrected overview connector routing.
- Full SQL schema executed successfully in disposable in-memory PostgreSQL through PGlite 0.5.8.
- Created 66 tables, 129 foreign keys, 156 CHECK constraints, 102 UNIQUE constraints, 66 primary keys and supporting/conditional indexes.
- All 20 structural database checks passed.

## Executed structural checks

| Check | Result |
|---|---|
| Complete reference DDL loads in disposable PostgreSQL | PASS |
| All 66 physical tables created | PASS |
| Duplicate normalized account email rejected | PASS |
| Cross-organization event staff assignment rejected | PASS |
| Negative ticket price rejected | PASS |
| Same physical seat can belong to a different event | PASS |
| Seat cannot map to another event ticket type | PASS |
| Second live seat allocation rejected | PASS |
| Refund-quarantined seat remains unavailable | PASS |
| Released seat permits a new allocation while preserving old row | PASS |
| Order arithmetic mismatch rejected | PASS |
| Duplicate canonical ticket per unit rejected | PASS |
| Entry confirmation cannot use different recipient | PASS |
| Duplicate current admission rejected | PASS |
| A new admission after reversal preserves first check-in | PASS |
| Extra successful external charge can be retained for compensation | PASS |
| Second logical refund for same charge rejected | PASS |
| Audit updates rejected by append-only trigger | PASS |
| Audit deletion rejected by append-only trigger | PASS |
| Deleting event with dependent records is restricted | PASS |

## Scope of validation

These checks validate the physical schema and selected constraint behavior. They do not claim that FastAPI transaction services, authorization, payment adapters, capacity/promo aggregate guards, provider reconciliation or client applications are implemented.

A multi-connection PostgreSQL concurrency benchmark, production security validation and full AC-01 through AC-28 end-to-end tests remain implementation work. PGlite was used for disposable structural execution; a native PostgreSQL deployment and its infrastructure were not configured.

The browser preview is generated from native draw.io SVG renderings. Keep its preview/ directory beside the HTML. Machine-readable results are in sql_validation.json, render_validation.json and preview_validation.json.
