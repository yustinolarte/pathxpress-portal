# Migration history notes

`drizzle-kit migrate` is broken for this project: the `__drizzle_migrations`
tracking table in the live database only has rows through
`0011_mute_mister_sinister` (confirmed 2026-08-12 by querying it directly).
Everything from `0012_dapper_nuke` onward was applied to the database by hand
(via `mysql2`/one-off scripts), never through `drizzle-kit migrate`. **Never run
`drizzle-kit migrate` or `pnpm db:push` against the real database** — it would
try to re-run migrations 12+ that already exist live and fail on duplicate
columns/indexes, or worse.

The correct workflow going forward: edit `drizzle/schema.ts`, run
`npx drizzle-kit generate` (writes a new `.sql` file + updates
`meta/_journal.json`/`meta/*_snapshot.json`, touches nothing in the live DB),
review the generated SQL, then apply it to the database by hand.

## Bootstrapping a brand-new database (dev/test)

The "never run `drizzle-kit migrate` against the real database" rule above is
specifically about the existing production database, whose migrations 12+
were applied out-of-band. Against a **brand-new, empty** database (a local
MySQL instance for `TEST_DATABASE_URL`, a fresh dev environment, etc.)
`drizzle-kit migrate` is the correct and safe way to build the schema — there
is nothing already applied to conflict with, so it just runs the full
journal (0000 through 0036) in order:

```
# PowerShell — point at the empty target DB only for this one command
$env:DATABASE_URL = "mysql://user:pass@host:port/your_new_empty_db"
npx drizzle-kit migrate
```

Close and reopen the terminal afterward (or run `Remove-Item Env:\DATABASE_URL`)
so the override doesn't leak into later commands in that same window.

## What was reconciled on 2026-08-12

- `meta/_journal.json` idx 22 pointed at a tag (`0022_lovely_kitty_pryde`) that
  had no matching `.sql` file. The real file is `0022_service_selection.sql`,
  and its `meta/0022_snapshot.json` was already correctly paired with idx 22 —
  someone had renamed the `.sql` file by hand without updating the journal tag.
  Fixed by correcting the tag string only; no SQL content changed.
- Running `drizzle-kit generate` after that fix produced one new migration
  (`0036_consolidate_manual_migrations.sql`) containing exactly the union of 4
  changes that were already live in the database via hand-applied files:
  `0032_driver_cash_remittance.sql`, `0033_order_billing_excluded.sql`,
  `0034_driver_shifts_driver_endtime_idx.sql`, `0035_route_orders_sequence_idx.sql`.
  It is a no-op marker (see the warning comment at the top of the file) that
  exists only so the journal/snapshot chain matches the real, current schema —
  do not execute it.
- `0030_handy_fallen_one.sql` (adds `invoices.type` + index) is not referenced
  by the journal and has no snapshot of its own, but its change is already
  present in `meta/0031_snapshot.json` — it was folded in when
  `0031_driver_route_shift_tracking` was generated. No action needed.

## Known historical duplicates (pre-existing, not touched)

These `.sql` files share a number prefix with an officially journaled
migration from an earlier branch merge. Their schema changes are already fully
captured in the tracked snapshot chain (confirmed: a fresh `drizzle-kit
generate` today found no diff related to them) — they are dead files kept only
as a historical record, not meant to be applied:

- `0016_add_pickup_driver_id.sql` (real: `0016_add-hide-consignee-address.sql`)
- `0017_add_route_order_type.sql` (real: `0017_chief_havok.sql`)
- `0018_add_items_description.sql` (real: `0018_absent_the_hand.sql`)
- `0019_add_bullet_to_rate_tiers.sql` (real: `0019_third_nitro.sql`)
- `0025_add_delivered_coords.sql` (real: `0025_neat_phil_sheldon.sql`)
