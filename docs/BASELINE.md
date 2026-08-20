# Markov Lab baseline

Recorded on 2026-08-13 before the overhaul was applied.

- Source root: `stochastic-app-DB` (433 files excluding `node_modules` and `.next`).
- Source snapshot: `/private/tmp/markov-lab-baseline/stochastic-app-DB-source-2026-08-13.tgz`.
- Hash manifest: `/private/tmp/markov-lab-baseline/source.sha256`.
- Secrets and generated artefacts were deliberately excluded from the snapshot.
- Baseline `npm run lint`: passed.
- Baseline `npm run build`: passed; 14 application routes were generated.
- Baseline expression runtime: `lib/compile.js` used `new Function`.
- Baseline engines: Gillespie, CTMP, and SDE used unseeded `Math.random`.
- Baseline product name: Markov Side-by-Side.

The surrounding parent repository was already heavily dirty and this application
directory was untracked. No pre-existing files were reset, deleted, staged, or
committed as part of the baseline process.
