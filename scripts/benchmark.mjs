import { performance } from "node:perf_hooks";

const iterations = Number(process.env.MARKOV_BENCH_ITERATIONS || 5_000_000);
let state = 0x9e3779b97f4a7c15n;
const mask = (1n << 64n) - 1n;
const started = performance.now();
let checksum = 0;

for (let index = 0; index < iterations; index += 1) {
  state ^= state >> 12n;
  state ^= (state << 25n) & mask;
  state ^= state >> 27n;
  const value = (state * 0x2545f4914f6cdd1dn) & mask;
  checksum = (checksum + Number(value >> 32n)) >>> 0;
}

const durationMs = performance.now() - started;
console.log(JSON.stringify({
  benchmark: "uint64-reference-loop",
  iterations,
  durationMs: Number(durationMs.toFixed(2)),
  millionIterationsPerSecond: Number((iterations / durationMs / 1000).toFixed(2)),
  checksum,
  node: process.version,
}, null, 2));
