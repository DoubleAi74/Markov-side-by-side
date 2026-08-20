function finite(values) { return Array.from(values).filter(Number.isFinite); }

export function histogram(values, binCount = Math.max(1, Math.ceil(Math.sqrt(values.length)))) {
  const samples = finite(values);
  if (!samples.length) return { bins: [], included: 0, excluded: values.length };
  const min = Math.min(...samples), max = Math.max(...samples);
  const width = max === min ? 1 : (max - min) / binCount;
  const counts = new Uint32Array(binCount);
  for (const value of samples) counts[Math.min(binCount - 1, Math.floor((value - min) / width))] += 1;
  return {
    bins: Array.from(counts, (count, index) => ({ start: min + index * width, end: min + (index + 1) * width, count })),
    included: samples.length,
    excluded: values.length - samples.length,
  };
}

export function ecdf(values) {
  const samples = finite(values).sort((a, b) => a - b);
  return {
    points: samples.map((value, index) => ({ value, probability: (index + 1) / samples.length })),
    included: samples.length,
    excluded: values.length - samples.length,
  };
}

export function autocorrelation(values, maxLag = Math.min(100, Math.floor(values.length / 4))) {
  const samples = finite(values);
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const denominator = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return Float64Array.from({ length: maxLag + 1 }, (_, lag) => {
    if (denominator === 0) return lag === 0 ? 1 : 0;
    let numerator = 0;
    for (let index = 0; index + lag < samples.length; index += 1) {
      numerator += (samples[index] - mean) * (samples[index + lag] - mean);
    }
    return numerator / denominator;
  });
}

export function welchPsd(values, sampleInterval, segmentLength = 256) {
  const samples = finite(values);
  if (!(sampleInterval > 0)) throw new RangeError("sampleInterval must be positive");
  const n = Math.min(segmentLength, samples.length);
  if (n < 4) return { frequency: new Float64Array(), power: new Float64Array(), caution: "At least four uniformly sampled points are required." };
  const stride = Math.max(1, Math.floor(n / 2));
  const power = new Float64Array(Math.floor(n / 2) + 1);
  let segments = 0;
  for (let start = 0; start + n <= samples.length; start += stride) {
    const windowed = new Float64Array(n);
    let windowEnergy = 0;
    for (let index = 0; index < n; index += 1) {
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (n - 1));
      windowed[index] = samples[start + index] * window;
      windowEnergy += window ** 2;
    }
    for (let k = 0; k < power.length; k += 1) {
      let real = 0, imaginary = 0;
      for (let index = 0; index < n; index += 1) {
        const angle = (-2 * Math.PI * k * index) / n;
        real += windowed[index] * Math.cos(angle);
        imaginary += windowed[index] * Math.sin(angle);
      }
      power[k] += (real ** 2 + imaginary ** 2) / (windowEnergy / sampleInterval);
    }
    segments += 1;
  }
  if (segments) for (let index = 0; index < power.length; index += 1) power[index] /= segments;
  return {
    frequency: Float64Array.from({ length: power.length }, (_, index) => index / (n * sampleInterval)),
    power,
    segments,
    caution: "Welch PSD assumes uniformly sampled, approximately stationary data; inspect the trajectory and ACF alongside it.",
  };
}

export function reactionDiagnostics(run) {
  const ids = run.transitionIds ?? [];
  const counts = {};
  ids.forEach((id) => { counts[id] = (counts[id] ?? 0) + 1; });
  const waitingTimes = [];
  for (let index = 1; index < run.times.length - 1; index += 1) waitingTimes.push(run.times[index] - run.times[index - 1]);
  return { counts, waitingTimes: Float64Array.from(waitingTimes), eventCount: ids.length };
}

export function firstPassageKaplanMeier(observations) {
  const sorted = observations
    .filter((entry) => Number.isFinite(entry.time) && entry.time >= 0)
    .sort((a, b) => a.time - b.time || Number(b.reached) - Number(a.reached));
  let atRisk = sorted.length, survival = 1;
  const curve = [{ time: 0, survival, atRisk, events: 0, censored: 0 }];
  for (let index = 0; index < sorted.length;) {
    const time = sorted[index].time;
    let events = 0, censored = 0;
    while (index < sorted.length && sorted[index].time === time) {
      if (sorted[index].reached) events += 1; else censored += 1;
      index += 1;
    }
    if (events) survival *= 1 - events / atRisk;
    curve.push({ time, survival, atRisk, events, censored });
    atRisk -= events + censored;
  }
  return { curve, included: sorted.length, excluded: observations.length - sorted.length };
}

export function fanoFactor(values) {
  const samples = finite(values);
  if (!samples.length) return Number.NaN;
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  if (mean === 0) return Number.NaN;
  const variance = samples.length > 1 ? samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (samples.length - 1) : 0;
  return variance / mean;
}
