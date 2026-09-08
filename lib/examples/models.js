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
