// Fixed time-step CTMP engine for time-dependent rates (extracted from CTMP_inhomo.html)

export class Transition {
  constructor(updateVector, rateFunc) {
    this.rateFunc = rateFunc;
    this.updateVector = updateVector;
  }

  getRate(state, t, params) {
    try {
      return this.rateFunc(state, t, params);
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

export class TimeStepper {
  constructor(transitions, params) {
    this.transitions = transitions;
    this.params = params;
  }

  run(initialState, tMax, dt) {
    let t = 0.0;
    let state = [...initialState];
    const times = [t];
    const logInterval = Math.max(1, Math.floor(0.01 / dt));
    const history = [[...state]];
    let stepCount = 0;
    let warningMsg = null;
    const MAX_STEPS = 5000000;

    while (t < tMax && stepCount < MAX_STEPS) {
      const rates = this.transitions.map((tr) => tr.getRate(state, t, this.params));
      const probs = rates.map((r) => Math.max(0, r) * dt);
      const totalProb = probs.reduce((a, b) => a + b, 0);

      if (totalProb > 0.1 && !warningMsg) {
        warningMsg = `High event probability (${totalProb.toFixed(2)}) at t=${t.toFixed(2)}. Consider decreasing dt.`;
      }

      const U = Math.random();
      let cumulative = 0;
      let eventOccurred = false;

      if (U < totalProb) {
        for (let i = 0; i < probs.length; i++) {
          cumulative += probs[i];
          if (U < cumulative) {
            state = this.transitions[i].applyUpdate(state);
            eventOccurred = true;
            break;
          }
        }
      }

      t += dt;
      stepCount++;

      if (stepCount % logInterval === 0 || eventOccurred) {
        times.push(t);
        history.push([...state]);
      }
    }

    return { times, history, warningMsg };
  }
}
