# BiletFlow database design

Start with **[the browser preview](BiletFlow_Database_Preview.html)** or open **[BiletFlow_Database.drawio](BiletFlow_Database.drawio)** in draw.io / diagrams.net. All diagram shapes and connectors remain editable.

The atlas contains 54 pages:

- 1 introduction and notation page.
- 16 physical-schema pages with every table, field, key and CHECK constraint.
- 1 core relationship overview.
- 16 complete foreign-key graph pages, partitioned by domain.
- 5 integrity-rule pages.
- 5 checkout/refund/admission/offline/outbox activity pages.
- 7 transaction-contract pages.
- 3 state-transition pages.

There are **66 tables, 129 foreign keys, 156 row CHECK constraints, 102 unique constraints, 5 conditional unique indexes, 28 global integrity rules and 26 transaction contracts**. Additional indexes support FK lookups and common workloads. The diagram labels every relationship's cardinality and distinguishes nullable from mandatory references.

## Files

| File | Purpose |
|---|---|
| `BiletFlow_Database.drawio` | Primary editable multi-page atlas |
| `BiletFlow_Database_Preview.html` + `preview/` | Local, no-account browser view; keep the folder beside the HTML |
| `BiletFlow_Database_Specification.md` | Full data dictionary, transaction write sets, lock order, permissions, lifecycle rules and design assumptions |
| `BiletFlow_PostgreSQL_Schema.sql` | Reference DDL for an empty PostgreSQL schema |
| `Validation_Report.md` | What was actually checked, and what still requires application implementation |
| `schema_model.json` | Shared source for the atlas, DDL and specification |
| `atlas_manifest.json` | Page index |
| `sql_validation.json`, `render_validation.json` | Machine-readable validation evidence |

The model implements the project's confirmed requirements as a database design. It preserves the difference between user-confirmed decisions and proposed defaults in the backend requirements. No production database was changed.

**Important:** SQL constraints do not implement the entire application. Rules marked **TX**—such as aggregate capacity, campaign limits, refund sequencing and authorization—require the specified atomic service operations. Their contract is fully documented; they are not claimed to be already implemented.

To regenerate diagram/DDL/specification from the shared model, run `python tools/build_database_schema.py` from the project root. The browser preview is a native draw.io-rendered snapshot and must be regenerated after diagram changes. The helper rendering/validation scripts use temporary tool dependencies; these are not backend dependencies and are not included in the delivery package.
