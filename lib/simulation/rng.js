import { SimulationError } from "./errors.js";

const MASK = 0xffffffffffffffffn;
const UINT64_MAX = MASK;
const rotl = (x, k) => ((x << BigInt(k)) | (x >> BigInt(64 - k))) & MASK;

export function parseUint64Seed(seed) {
  if (!/^(0|[1-9]\d*)$/.test(String(seed ?? ""))) throw new SimulationError("INVALID_SEED", "Seed must be a uint64 decimal string.");
  const value = BigInt(seed);
  if (value > UINT64_MAX) throw new SimulationError("INVALID_SEED", "Seed exceeds uint64.");
  return value;
}

function splitmix64Step(state) {
  state.value = (state.value + 0x9e3779b97f4a7c15n) & MASK;
  let z = state.value;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
  return (z ^ (z >> 31n)) & MASK;
}

/** Scheduling-independent xoshiro256** stream for one run. */
export class SeededRng {
  constructor(seed) {
    const source = { value: parseUint64Seed(seed) };
    this.state = [splitmix64Step(source), splitmix64Step(source), splitmix64Step(source), splitmix64Step(source)];
    this.normalSpare = null;
  }

  nextUint64() {
    const s = this.state;
    const result = (rotl((s[1] * 5n) & MASK, 7) * 9n) & MASK;
    const t = (s[1] << 17n) & MASK;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t; s[3] = rotl(s[3], 45);
    return result;
  }

  // Strictly inside (0, 1), avoiding log(0) in stochastic solvers.
  nextFloat() {
    return (Number(this.nextUint64() >> 11n) + 0.5) / 9007199254740992;
  }

  normal() {
    if (this.normalSpare != null) { const value = this.normalSpare; this.normalSpare = null; return value; }
    const radius = Math.sqrt(-2 * Math.log(this.nextFloat()));
    const angle = 2 * Math.PI * this.nextFloat();
    this.normalSpare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  }
}

export function deriveRunSeed(rootSeed, runIndex) {
  const root = parseUint64Seed(rootSeed);
  if (!Number.isSafeInteger(runIndex) || runIndex < 0) throw new SimulationError("INVALID_RUN_INDEX", "Run index must be a non-negative safe integer.");
  const source = { value: (root ^ (BigInt(runIndex) * 0xd2b74407b1ce6e93n)) & MASK };
  return splitmix64Step(source).toString();
}

export function createRunRng(rootSeed, runIndex) {
  return new SeededRng(deriveRunSeed(rootSeed, runIndex));
}

export function createRootSeed(cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.getRandomValues) throw new SimulationError("SECURE_RANDOM_UNAVAILABLE", "Secure random seed generation is unavailable.");
  const words = new Uint32Array(2); cryptoImpl.getRandomValues(words);
  return ((BigInt(words[0]) << 32n) | BigInt(words[1])).toString();
}
