// Gillespie exact SSA engine (extracted from CTMP_standard.html)

export class Transition {
  constructor(updateSpec, rateFunc) {
    this.rateFunc = rateFunc;
    this.updateSpec = updateSpec;
  }

  getRate(state, params) {
    try {
      return this.rateFunc(state, params);
    } catch {
      return 0;
    }
  }

  resolveDelta(state, t, params) {
    if (typeof this.updateSpec === "function") {
      return this.updateSpec(state, t, params);
    }
    return this.updateSpec;
  }

  applyUpdate(state, t, params) {
    const deltas = this.resolveDelta(state, t, params);
    return state.map((val, i) => {
      const raw = deltas?.[i] ?? 0;
      const delta = Number(raw);
      const next = val + (Number.isFinite(delta) ? delta : 0);
      return Math.max(0, Math.floor(next));
    });
  }
}

export class Gillespie {
  constructor(transitions, params) {
    this.transitions = transitions;
    this.params = params;
  }

  run(initialState, tMax) {
    let state = [...initialState];
    let t = 0.0;
    const times = [t];
    const history = [[...state]];
    const MAX_ITERATIONS = 500000;
    let iter = 0;

    while (t < tMax && iter < MAX_ITERATIONS) {
      iter++;

      const rates = this.transitions.map((tr) =>
        Math.max(0, tr.getRate(state, this.params))
      );
      const totalRate = rates.reduce((a, b) => a + b, 0);

      if (totalRate < 1e-12) break;

      const tau = -Math.log(Math.random()) / totalRate;
      if (t + tau >= tMax) break;
      t += tau;

      let r = Math.random() * totalRate;
      let cumSum = 0;
      let chosenIdx = rates.length - 1;

      for (let i = 0; i < rates.length; i++) {
        cumSum += rates[i];
        if (r <= cumSum) {
          chosenIdx = i;
          break;
        }
      }

      state = this.transitions[chosenIdx].applyUpdate(state, t, this.params);
      times.push(t);
      history.push([...state]);
    }

    return { times, history };
  }
}
