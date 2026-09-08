function row(text) {
  return { text, noteEnabled: false, noteLabel: "" };
}

function transition(rate, deltas) {
  return {
    rate,
    deltas: deltas.map((delta) => String(delta)),
    noteEnabled: false,
    noteLabel: "",
  };
}

function component(name, init, drift, diff) {
  return {
    name,
    init,
    drift,
    diff,
    noteEnabled: false,
    noteLabel: "",
  };
}

function discreteComponent(name, init, outcomes) {
  return {
    name,
    init,
    outcomes,
    noteEnabled: false,
    noteLabel: "",
  };
}

function walkComponent(name, init, outcomes, useSlider = false) {
  return {
    name,
    init,
    mode: "increments",
    useSlider,
    outcomes,
    noteEnabled: false,
    noteLabel: "",
  };
}

function matrixComponent(name, init, states, matrix) {
  return {
    name,
    init,
    mode: "matrix",
    useSlider: false,
    states,
    matrix,
    noteEnabled: false,
    noteLabel: "",
  };
}

export const EXAMPLE_MODELS = [
  {
    slug: "food-chain",
    name: "Food Chain",
    simulatorType: "gillespie",
    category: "Homogeneous CTMC",
    cardLabel: "CTMC Gillespie",
    description:
      "A three-species chain: plants grow toward a carrying capacity, herbivores graze, carnivores hunt.",
    previewImage: "/examples/food-chain.png",
    payload: {
      varRows: [
        row("Plants = 500"),
        row("Herbivores = 500"),
        row("Carnivores = 100"),
      ],
      paramRows: [
        row("p_growth = 100.0"),
        row("K = 1000.0"),
        row("p_decay = 0.1"),
        row("h_eat = 0.06"),
        row("h_death = 0.2"),
        row("c_eat = 0.01"),
        row("c_death = 0.8"),
      ],
      transitions: [
        transition("p_growth * (1 - Plants/K)", [1, 0, 0]),
        transition("p_decay * Plants", [-1, 0, 0]),
        transition("h_eat * Plants * Herbivores", [-1, 1, 0]),
        transition("h_death * Herbivores", [0, -1, 0]),
        transition("c_eat * Herbivores * Carnivores", [0, -1, 1]),
        transition("c_death * Carnivores", [0, 0, -1]),
      ],
      settings: {
        tMax: 5,
        numSims: 1,
      },
    },
  },
  {
    slug: "seasonal-lotka-volterra",
    name: "Seasonal Lotka–Volterra",
    simulatorType: "ctmp-inhomo",
    category: "Inhomogeneous CTMC",
    cardLabel: "CTMP Time Var",
    description:
      "Predator–prey dynamics with a seasonal birth rate Season(t).",
    previewImage: "/examples/seasonal-lotka-volterra.png",
    payload: {
      varRows: [row("Prey = 300"), row("Pred = 100")],
      paramRows: [
        row("A = 2"),
        row("w = 6.28"),
        row("birth = 2"),
        row("eat = 0.005"),
        row("die = 2"),
      ],
      helperRows: [row("Season(t) = 1 + A * sin(w*t)")],
      transitions: [
        transition("birth * Season(t) * Prey", [1, 0]),
        transition("eat * Prey * Pred", [-1, 1]),
        transition("die * Pred", [0, -1]),
      ],
      settings: {
        tMax: 7,
        dt: 0.000002,
        numSims: 1,
      },
    },
  },
  {
    slug: "stochastic-lotka-volterra",
    name: "Stochastic Lotka–Volterra",
    simulatorType: "sde",
    category: "SDE",
    cardLabel: "SDE Solver",
    description:
      "Continuous predator–prey with multiplicative noise on both species.",
    previewImage: "/examples/stochastic-lotka-volterra.png",
    payload: {
      paramRows: [
        row("a = 1.1"),
        row("b = 0.01"),
        row("c = 1.0"),
        row("d = 0.005"),
        row("sigma_x = 0.2"),
        row("sigma_y = 0.2"),
      ],
      components: [
        component("Prey", 300, "a*Prey - b*Prey*Pred", "sigma_x * Prey"),
        component("Pred", 10, "-c*Pred + d*Prey*Pred", "sigma_y * Pred"),
      ],
      settings: {
        tMax: 20,
        dt: 0.005,
        numSims: 1,
      },
    },
  },
  {
    slug: "galton-watson",
    name: "Galton–Watson Process",
    simulatorType: "discrete-time",
    category: "Discrete-time Markov process",
    cardLabel: "Discrete Time",
    description:
      "A branching process in which each individual either dies or produces two offspring at every generation.",
    previewImage: "/examples/galton-watson.png",
    payload: {
      components: [
        discreteComponent(
          "Population",
          10,
          [
            { offspring: 0, probability: 0.45 },
            { offspring: 2, probability: 0.55 },
          ],
        ),
      ],
      settings: {
        generations: 30,
        numSims: 12,
      },
    },
  },
  {
    slug: "predator-prey",
    name: "Predator–Prey",
    simulatorType: "gillespie",
    category: "Homogeneous CTMC",
    cardLabel: "CTMC Gillespie",
    description:
      "Lotka–Volterra cycles: prey grow, predators hunt, predators die.",
    previewImage: "/examples/predator-prey.png",
    payload: {
      varRows: [row("Prey = 220"), row("Pred = 160")],
      paramRows: [
        row("a = 0.75"),
        row("b = 0.004"),
        row("c = 0.55"),
        row("eps = 4"),
      ],
      transitions: [
        transition("a * Prey", [1, 0]),
        transition("b * Prey * Pred", [-1, 1]),
        transition("c * Pred", [0, -1]),
        transition("eps", [1, 0]),
      ],
      settings: {
        tMax: 24,
        numSims: 1,
      },
    },
  },
  {
    slug: "seasonal-sirs",
    name: "Seasonal SIRS",
    simulatorType: "ctmp-inhomo",
    category: "Inhomogeneous CTMC",
    cardLabel: "CTMP Time Var",
    description:
      "Infection, recovery, and waning immunity, with a seasonal infection rate.",
    previewImage: "/examples/seasonal-sirs.png",
    payload: {
      varRows: [row("S = 160"), row("I = 16"), row("R = 24")],
      paramRows: [
        row("beta = 0.0038"),
        row("gamma = 0.48"),
        row("wane = 0.22"),
        row("A = 0.75"),
        row("w = 0.9"),
      ],
      helperRows: [row("Season(t) = 1 + A * sin(w * t)")],
      transitions: [
        transition("beta * Season(t) * S * I", [-1, 1, 0]),
        transition("gamma * I", [0, -1, 1]),
        transition("wane * R", [1, 0, -1]),
      ],
      settings: {
        tMax: 24,
        dt: 0.0006,
        numSims: 1,
      },
    },
  },
  {
    slug: "double-well",
    name: "Double Well",
    simulatorType: "sde",
    category: "SDE",
    cardLabel: "SDE Solver",
    description:
      "A bistable Langevin process: noisy paths fall into one well or the other.",
    previewImage: "/examples/double-well.png",
    payload: {
      paramRows: [row("sigma = 0.4")],
      components: [
        {
          name: "X",
          init: 0,
          drift: "X - X * X * X",
          diff: "sigma",
          noteEnabled: false,
          noteLabel: "",
        },
      ],
      settings: {
        tMax: 10,
        dt: 0.01,
        numSims: 12,
      },
    },
  },
  {
    slug: "sir-epidemic",
    name: "SIR Epidemic",
    simulatorType: "gillespie",
    category: "Homogeneous CTMC",
    cardLabel: "CTMC Gillespie",
    description:
      "An outbreak in a closed population of 1000: susceptibles fall, infections peak, recoveries accumulate.",
    previewImage: "/examples/sir-epidemic.png",
    payload: {
      varRows: [row("S = 990"), row("I = 10"), row("R = 0")],
      paramRows: [row("beta = 0.0005"), row("gamma = 0.2")],
      transitions: [
        transition("beta * S * I", [-1, 1, 0]),
        transition("gamma * I", [0, -1, 1]),
      ],
      settings: {
        tMax: 60,
        numSims: 1,
      },
    },
  },
  {
    slug: "rush-hour-queue",
    name: "Rush Hour Queue",
    simulatorType: "ctmp-inhomo",
    category: "Inhomogeneous CTMC",
    cardLabel: "CTMP Time Var",
    description:
      "A single-server queue whose arrival rate spikes twice a day, so the backlog builds at rush hour and drains between.",
    previewImage: "/examples/rush-hour-queue.png",
    payload: {
      varRows: [row("Queue = 0")],
      paramRows: [
        row("base = 15"),
        row("peak = 800"),
        row("width = 0.02"),
        row("morning = 0.35"),
        row("evening = 0.72"),
        row("service = 220"),
      ],
      helperRows: [
        row(
          "Rush(t) = base + peak * exp(-((t - floor(t) - morning)**2) / (2*width**2)) + peak * exp(-((t - floor(t) - evening)**2) / (2*width**2))",
        ),
      ],
      transitions: [
        transition("Rush(t)", [1]),
        transition("service * min(Queue, 1)", [-1]),
      ],
      settings: {
        tMax: 3,
        dt: 0.00005,
        numSims: 1,
      },
    },
  },
  {
    slug: "noise-burst-wells",
    name: "Noise Burst Periodic Wells",
    simulatorType: "sde",
    category: "SDE",
    cardLabel: "SDE Solver",
    description:
      "Paths rest in one of many evenly spaced wells until a burst of noise near t = 5 scatters them into neighbouring wells.",
    previewImage: "/examples/noise-burst-wells.png",
    payload: {
      paramRows: [row("a = 1")],
      components: [
        component("X", 10, "-a * sin(4*X)", "0.1 + 3 * exp(-10*(t-5)**2)"),
      ],
      settings: {
        tMax: 10,
        dt: 0.005,
        numSims: 20,
      },
    },
  },
  {
    slug: "random-walk-drift",
    name: "Random Walk with Drift",
    simulatorType: "discrete-time",
    category: "Discrete-time Markov process",
    cardLabel: "Discrete Time",
    description:
      "Twelve walkers step up or down each generation with a slight upward bias, spreading as the square root of time.",
    previewImage: "/examples/random-walk-drift.png",
    payload: {
      components: [
        walkComponent(
          "Position",
          0,
          [
            { change: 1, probability: 0.52 },
            { change: -1, probability: 0.48 },
          ],
          true,
        ),
      ],
      settings: {
        generations: 200,
        numSims: 12,
      },
    },
  },
  {
    slug: "gene-expression",
    name: "Gene Expression",
    simulatorType: "gillespie",
    category: "Homogeneous CTMC",
    cardLabel: "CTMC Gillespie",
    description:
      "Transcription and translation with decay: noisy mRNA counts drive a smoother, much larger protein pool.",
    previewImage: "/examples/gene-expression.png",
    payload: {
      varRows: [row("mRNA = 0"), row("Protein = 0")],
      paramRows: [
        row("k_transcribe = 40"),
        row("d_mRNA = 2"),
        row("k_translate = 2.5"),
        row("d_protein = 0.5"),
      ],
      transitions: [
        transition("k_transcribe", [1, 0]),
        transition("d_mRNA * mRNA", [-1, 0]),
        transition("k_translate * mRNA", [0, 1]),
        transition("d_protein * Protein", [0, -1]),
      ],
      settings: {
        tMax: 15,
        numSims: 1,
      },
    },
  },
  {
    slug: "antibiotic-dosing",
    name: "Antibiotic Dosing",
    simulatorType: "ctmp-inhomo",
    category: "Inhomogeneous CTMC",
    cardLabel: "CTMP Time Var",
    description:
      "A bacterial population knocked back by a daily dose that clears exponentially, regrowing before the next one lands.",
    previewImage: "/examples/antibiotic-dosing.png",
    payload: {
      varRows: [row("Bacteria = 50")],
      paramRows: [
        row("growth = 3"),
        row("K = 400"),
        row("kill = 8"),
        row("clear = 5"),
      ],
      helperRows: [row("Dose(t) = exp(-clear * (t - floor(t)))")],
      transitions: [
        transition("growth * Bacteria * (1 - Bacteria/K)", [1]),
        transition("kill * Dose(t) * Bacteria", [-1]),
      ],
      settings: {
        tMax: 6,
        dt: 0.00002,
        numSims: 1,
      },
    },
  },
  {
    slug: "fitzhugh-nagumo",
    name: "FitzHugh–Nagumo Neuron",
    simulatorType: "sde",
    category: "SDE",
    cardLabel: "SDE Solver",
    description:
      "An excitable neuron held just below threshold, where noise alone triggers occasional full spikes.",
    previewImage: "/examples/fitzhugh-nagumo.png",
    payload: {
      paramRows: [
        row("eps = 0.08"),
        row("a = 0.7"),
        row("b = 0.8"),
        row("I_ext = 0.25"),
        row("sigma = 0.35"),
      ],
      components: [
        component("V", -1.03, "V - V^3/3 - W + I_ext", "sigma"),
        component("W", -0.41, "eps * (V + a - b*W)", "0"),
      ],
      settings: {
        tMax: 120,
        dt: 0.01,
        numSims: 1,
      },
    },
  },
  {
    slug: "ehrenfest-urn",
    name: "Ehrenfest Urn",
    simulatorType: "discrete-time",
    category: "Discrete-time Markov process",
    cardLabel: "Discrete Time",
    description:
      "Six molecules diffusing between two chambers, relaxing from all-on-one-side to a fluctuating equilibrium.",
    previewImage: "/examples/ehrenfest-urn.png",
    payload: {
      components: [
        matrixComponent("LeftChamber", 6, [0, 1, 2, 3, 4, 5, 6], [
          [0, 1, 0, 0, 0, 0, 0],
          [1 / 6, 0, 5 / 6, 0, 0, 0, 0],
          [0, 2 / 6, 0, 4 / 6, 0, 0, 0],
          [0, 0, 3 / 6, 0, 3 / 6, 0, 0],
          [0, 0, 0, 4 / 6, 0, 2 / 6, 0],
          [0, 0, 0, 0, 5 / 6, 0, 1 / 6],
          [0, 0, 0, 0, 0, 1, 0],
        ]),
      ],
      settings: {
        generations: 80,
        numSims: 3,
      },
    },
  },
  {
    slug: "critical-branching",
    name: "Critical Branching Process",
    simulatorType: "discrete-time",
    category: "Discrete-time Markov process",
    cardLabel: "Discrete Time",
    description:
      "Each individual leaves 0, 1, or 3 offspring with mean exactly one — the knife edge where extinction is certain but slow.",
    previewImage: "/examples/critical-branching.png",
    payload: {
      components: [
        discreteComponent("Population", 20, [
          { offspring: 0, probability: 0.4 },
          { offspring: 1, probability: 0.4 },
          { offspring: 3, probability: 0.2 },
        ]),
      ],
      settings: {
        generations: 40,
        numSims: 12,
      },
    },
  },
];

const EXAMPLE_BY_SLUG = new Map(
  EXAMPLE_MODELS.map((example) => [example.slug, example]),
);

export function getExampleBySlug(slug) {
  if (typeof slug !== "string") return null;
  return EXAMPLE_BY_SLUG.get(slug) ?? null;
}

export function toExampleSavedSimulation(example) {
  if (!example) return null;

  return {
    name: example.name,
    simulatorType: example.simulatorType,
    payload: example.payload,
  };
}
