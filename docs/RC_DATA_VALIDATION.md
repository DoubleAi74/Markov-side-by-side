# Isolated release-candidate data validation

Validation date: 2026-08-20

The configured source database was accessed read-only. Only the
`savedsimulations` and `simulationruns` collections were copied into a newly
named isolated database. No account credentials, sessions, password-reset
tokens, or verification tokens were copied.

## Migration and rollback

- Source-shaped fixture: 5 saved simulations and 0 run records.
- Initial migration: 5 changed, 5 converted to canonical payload version 2,
  0 placed in repair mode.
- Second dry run: 0 changes (idempotent).
- Existing slug continuity: passed.
- Missing-visibility Public default: passed.
- Repair-path byte preservation check: passed.
- Rollback restored the exact canonical BSON digest: passed.
- Reapplication after rollback: 5 changed and 5 converted.
- Final isolated-model digest:
  `eba1e87e1fd488b5f1e5604c45a7601a6380ab47bffcba24ced3372b0320924c`.

## Purge and object storage

A separate isolated database and a uniquely generated object under the
`rc-verification` preview prefix were used for this test.

- Expired synthetic models purged: 1.
- Dependent run records remaining: 0.
- Model records remaining: 0.
- Preview objects deleted: 1.
- Preview deletion failures: 0.
- Object absence confirmed after purge: passed.

The purge order deletes the preview object before database records. An object
deletion failure therefore leaves the recoverable database record in place
instead of creating an untracked storage orphan.

All temporary isolated databases created by this audit were dropped after the
checks completed. The uniquely prefixed preview object was deleted by the purge
workflow itself.
