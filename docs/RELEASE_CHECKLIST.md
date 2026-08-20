# Release-candidate checklist

- [ ] Back up the production database and preview-object inventory.
- [ ] Run the model migration in dry-run mode and review every repair case.
- [ ] Apply migration to an isolated production-shaped copy and rerun dry-run to verify idempotency.
- [ ] Exercise the anonymous/owner/non-owner access matrix for public, private, and deleted models.
- [ ] Run `npm run lint`, `npm test`, `npm run audit:security`, and `npm run build`.
- [ ] Compile and smoke-test the native runner on macOS and Linux.
- [ ] Run browser workflows in Chromium, Firefox, and WebKit, including keyboard-only paths.
- [ ] Run axe and Lighthouse in a network-enabled CI environment; require no serious axe violations and mobile scores of Performance 90 / Accessibility 95.
- [ ] Review numerical fixtures, convergence evidence, worker cancellation, bundle analysis, and retained-buffer hashes.
- [ ] Enable WASM Auto or experimental WebGPU only if their checked-in benchmark reports pass every documented gate.
- [ ] Verify purge credentials and preview deletion on staging.
- [ ] Verify rollback from the database backup and continuity of existing public URLs.
