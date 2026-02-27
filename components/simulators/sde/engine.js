// Euler-Maruyama SDE engine (extracted from SDE_main.html)

// Box-Muller transform for standard normal samples
function randn_bm() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export class SDEComponent {
  constructor(driftFunc, diffFunc) {
    this.drift = driftFunc;
    this.diffusion = diffFunc;
  }
}

export class TimeStepperSDE {
  constructor(components, params, initialState, tMax, dt) {
    this.components = components;
    this.params = params;
    this.initialState = initialState;
    this.tMax = tMax;
    this.dt = dt;
  }

  run() {
    let state = [...this.initialState];
    let t = 0.0;
    const times = [t];
    const history = [[...state]];
    const sqrtDt = Math.sqrt(this.dt);
    const nComps = this.components.length;
    const MAX_STEPS = 500000;
    let stepCount = 0;

    while (t < this.tMax && stepCount < MAX_STEPS) {
      stepCount++;

      const dWs = new Array(nComps).fill(0).map(() => randn_bm() * sqrtDt);

      const driftVec = this.components.map((c) => c.drift(state, t, this.params));
      const diffVec = this.components.map((c) => c.diffusion(state, t, this.params));

      const nextState = new Array(nComps);
      for (let i = 0; i < nComps; i++) {
        nextState[i] = state[i] + driftVec[i] * this.dt + diffVec[i] * dWs[i];
      }

      state = nextState;
      t += this.dt;
      times.push(t);
      history.push([...state]);
    }

    return { times, history };
  }
}
