// Gillespie exact SSA engine (extracted from CTMP_standard.html)

export class Transition {
  constructor(updateVector, rateFunc) {
    this.rateFunc = rateFunc;
    this.updateVector = updateVector;
  }

  getRate(state, params) {
    try {
      return this.rateFunc(state, params);
    } catch {
      return 0;
    }
  }

  applyUpdate(state) {
    return state.map((val, i) =>
      Math.max(0, Math.floor(val + (this.updateVector[i] || 0)))
    );
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

      state = this.transitions[chosenIdx].applyUpdate(state);
      times.push(t);
      history.push([...state]);
    }

    return { times, history };
  }
}
