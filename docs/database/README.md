# BiletFlow reference database design

This folder holds the **full target design** of the BiletFlow database: a 66-table model with
diagrams, a data dictionary, reference SQL and validation evidence. It is a planning and review
document, **not** the database the application runs on.

> **Deployed schema vs this design.** The running application uses the schema created by
> `backend/migrations/` — 16 migrations and 66 tables in the verified disposable test database at
> `0016_image_cleanup` on 9 November 2026 (see
> [`backend/README.md`](../../backend/README.md#database-and-migrations)). Never run
> `BiletFlow_PostgreSQL_Schema.sql` against the application database.

---

## Start here

- Open **[the browser preview](BiletFlow_Database_Preview.html)** (keep the `preview/` folder next to it), or
- open **[BiletFlow_Database.drawio](BiletFlow_Database.drawio)** in draw.io / diagrams.net — every shape and connector is editable.

The atlas has 54 pages: an introduction and notation page, 16 physical-schema pages, a core
relationship overview, 16 foreign-key graph pages by domain, 5 integrity-rule pages, 5 activity
pages (checkout, refund, admission, offline, outbox), 7 transaction-contract pages and 3
state-transition pages.

The model contains **66 tables, 129 foreign keys, 156 row CHECK constraints, 102 unique
constraints, 5 conditional unique indexes, 28 global integrity rules and 26 transaction
contracts**.

---

## Files

| File | Purpose |
|---|---|
| `BiletFlow_Database.drawio` | Editable multi-page atlas |
| `BiletFlow_Database_Preview.html` + `preview/` | Offline browser view of the atlas |
| `BiletFlow_Database_Specification.md` | Data dictionary, transaction write sets, lock order, permissions, lifecycle rules, assumptions |
| `BiletFlow_PostgreSQL_Schema.sql` | Reference DDL for an empty schema (for review only) |
| `Validation_Report.md` | What was checked, and what depends on application code |
| `schema_model.json` | Single source the atlas, DDL and specification are generated from |
| `atlas_manifest.json` | Page index |
| `*_validation.json` | Machine-readable validation evidence |

---

## How the design relates to the implementation

The deployed migrations follow this design area by area, with small, documented differences (for
example a nullable password hash for Google-only accounts and a few supporting authentication
tables).

The following matrix compares actual migration table names with the reference design (9 November
2026). The dedicated test database was inspected at `0016_image_cleanup`; this is not evidence
that every developer or production database has been upgraded. Both inventories happen to contain
66 tables, but they are different sets and their columns/constraints are not identical.

| Design area | Implementation status | Tables / difference |
|---|---|---|
| Promo campaigns | Migrated in `0013_campaigns`; campaign/discount services implemented | `campaign`, `campaign_ticket_type`, `promo_code`, `promo_reservation`, `promo_redemption` |
| Finance and payouts | Migrated in `0014_finance`; simulated finance/payout services implemented | `finance_entry`, `demo_payout`; canonical commerce records supply totals, ledger rows retain payout debits and adjustments rather than duplicating every commerce entry |
| Event media | Migrated in `0015_event_images`; protected gallery API implemented | `event_media`; `0016_image_cleanup` adds `stored_file.cleanup_after` and cleanup index, no table |
| GA4 / analytics integration | Designed, not migrated or implemented | `ga4_connection`, `analytics_export`, `ga4_cache`; operational analytics is computed from authoritative commerce/inventory/admission tables |
| Ticket claims | No separate deployed table | `ticket_claim` is design-only; recipient claims are stored on `ticket` |
| Authentication extensions | Migrated beyond the reference table inventory | `auth_rate_bucket`, `external_identity`, `oauth_attempt`, `refresh_token`; Google-only passwords are nullable |

The other 62 reference table names occur in migrations; matching names do not establish identical
schemas or complete feature acceptance. For example, deployed `moderation_action` has user/event
targets; paid-sales moderation uses immutable `audit_log` evidence, unlike the reference activation
target. See [admin contract](../../backend/ADMIN_API.md) and [validation](../../backend/VALIDATION.md).
Application transaction contracts remain separate from database constraints.

When adding a migration based on this design, copy the relevant table definitions and constraints
into a new `backend/migrations/versions/NNNN_name.py` (with SQL alongside when appropriate), add matching models, and keep the
transaction rules marked **TX** in the specification in the service code — SQL constraints alone
do not enforce rules such as campaign limits, aggregate capacity or refund sequencing.

---

## Regenerating

From the repository root:

```bash
python tools/build_database_schema.py
```

This rebuilds the diagram, DDL and specification from `schema_model.json`. The browser preview is a
rendered snapshot and must be re-rendered after diagram changes (`tools/render_database_atlas.mjs`,
`tools/check_database_preview.mjs`, `tools/validate_database_schema.mjs`). Those helper scripts use
temporary tool dependencies that are not part of the application.
