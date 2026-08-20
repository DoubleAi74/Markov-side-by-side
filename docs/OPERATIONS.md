# Operations and retention

No deployment is performed by this repository change.

## Model migration

Run the migration script without write flags first. It prints the proposed
conversion of each saved simulation, including models that require repair. Only
the explicit apply option writes changes. Legacy payloads that cannot be
converted remain intact and are marked `needsRepair`; they cannot execute until
repaired.

## Soft deletion

Deleting a saved model sets a deletion timestamp. Owners can restore it for 30
days. The purge maintenance endpoint and CLI permanently remove expired models,
bounded run-history records, and associated preview objects. The endpoint must
be protected by the dedicated maintenance secret and should be callable only by
the deployment scheduler.

## Privacy

Visibility is either Public or Private and defaults to Public for compatibility.
Private and missing models return the same response to non-owners. Public pages
remain `noindex`. Run histories are owner-private and store exact input
snapshots, provenance, warnings, and bounded summaries—not full trajectories.
Performance telemetry is disabled unless explicitly enabled, and must never
contain names, expressions, parameters, states, seeds, or user identity.
