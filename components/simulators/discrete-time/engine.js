import { MAX_DISCRETE_STATE, normalizeDiscreteComponent } from "../../../lib/discrete-time/model.js";

const MAX_GENERATIONS = 10000;

function requireProbability(value, label) {
  const probability = Number(value);
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new Error(`${label} must be between 0 and 1.`);
  }
  return probability;
}

export function sampleBinomial(trials, probability, random = Math.random) {
  const numericTrials = Number(trials);
  if (!Number.isFinite(numericTrials) || numericTrials < 0) {
    throw new Error("binomial trials must be a non-negative number.");
  }

  const n = Math.floor(numericTrials);
  if (n > MAX_DISCRETE_STATE) {
    throw new Error(
      `binomial trials cannot exceed ${MAX_DISCRETE_STATE.toLocaleString()}.`,
    );
  }

  const p = requireProbability(probability, "binomial probability");
  if (p === 0 || n === 0) return 0;
  if (p === 1) return n;

  let successes = 0;
  for (let index = 0; index < n; index += 1) {
    if (random() < p) successes += 1;
  }
  return successes;
}

export function sampleIndependentOutcomes(
  population,
  outcomes,
  random = Math.random,
) {
  const populationSize = Math.floor(Number(population));
  if (!Number.isFinite(populationSize) || populationSize < 0) {
    throw new Error("Population must be a non-negative integer.");
  }
  if (populationSize > MAX_DISCRETE_STATE) {
    throw new Error(
      `Population cannot exceed ${MAX_DISCRETE_STATE.toLocaleString()}.`,
    );
  }
  if (!Array.isArray(outcomes) || outcomes.length === 0) {
    throw new Error("At least one independent outcome is required.");
  }

  const normalizedOutcomes = outcomes.map((outcome, index) => {
    const offspring = Number(outcome?.offspring);
    if (!Number.isInteger(offspring) || offspring < 0) {
      throw new Error(
        `Outcome ${index + 1} offspring must be a non-negative integer.`,
      );
    }
    return {
      offspring,
      probability: requireProbability(
        outcome?.probability,
        `Outcome ${index + 1} probability`,
      ),
    };
  });

  const probabilityTotal = normalizedOutcomes.reduce(
    (total, outcome) => total + outcome.probability,
    0,
  );
  if (Math.abs(probabilityTotal - 1) > 1e-9) {
    throw new Error("Independent outcome probabilities must total 1.");
  }

  if (normalizedOutcomes.length === 2) {
    const secondOutcomeCount = sampleBinomial(
      populationSize,
      normalizedOutcomes[1].probability,
      random,
    );
    const nextPopulation =
      (populationSize - secondOutcomeCount) *
        normalizedOutcomes[0].offspring +
      secondOutcomeCount * normalizedOutcomes[1].offspring;
    if (nextPopulation > MAX_DISCRETE_STATE) {
      throw new Error(
        `Next population exceeded ${MAX_DISCRETE_STATE.toLocaleString()}.`,
      );
    }
    return nextPopulation;
  }

  let nextPopulation = 0;
  for (let individual = 0; individual < populationSize; individual += 1) {
    const draw = random();
    let cumulativeProbability = 0;
    let selected = normalizedOutcomes.at(-1);

    for (const outcome of normalizedOutcomes) {
      cumulativeProbability += outcome.probability;
      if (draw < cumulativeProbability) {
        selected = outcome;
        break;
      }
    }

    nextPopulation += selected.offspring;
    if (nextPopulation > MAX_DISCRETE_STATE) {
      throw new Error(
        `Next population exceeded ${MAX_DISCRETE_STATE.toLocaleString()}.`,
      );
    }
  }

  return nextPopulation;
}

export class DiscreteTimeComponent {
  constructor(name, outcomes, { mode = "branching", states, matrix } = {}) {
    this.name = name;
    this.outcomes = outcomes;
    this.mode = mode;
    this.states = states;
    this.matrix = matrix;
  }
}

function sampleTransitionIndex(probabilities, random) {
  const draw = random();
  let cumulative = 0;
  let lastPossible = 0;
  for (let index = 0; index < probabilities.length; index += 1) {
    if (probabilities[index] > 0) lastPossible = index;
    cumulative += probabilities[index];
    if (draw < cumulative) return index;
  }
  // Permit rounding within the validation tolerance without selecting a
  // trailing state whose probability is zero.
  return lastPossible;
}

export class DiscreteTimeStepper {
  constructor(components, initialState, generations, random = Math.random) {
    this.components = components;
    this.initialState = initialState;
    this.generations = generations;
    this.random = random;
  }

  run() {
    const generationCount = Number(this.generations);
    if (
      !Number.isInteger(generationCount) ||
      generationCount < 1 ||
      generationCount > MAX_GENERATIONS
    ) {
      throw new Error(
        `Generations must be an integer between 1 and ${MAX_GENERATIONS.toLocaleString()}.`,
      );
    }

    if (!this.components.length || this.components.length !== this.initialState.length) {
      throw new Error("Define one initial value for each variable.");
    }
    const components = this.components.map((component, index) =>
      normalizeDiscreteComponent({ ...component, init: this.initialState[index] }, `Variable ${index + 1}`),
    );
    let state = components.map((component) => component.init);
    const times = [0];
    const history = [[...state]];

    for (let generation = 0; generation < generationCount; generation += 1) {
      const nextState = components.map((component, componentIndex) => {
        let rawValue;
        try {
          if (component.mode === "increments") {
            const selected = sampleTransitionIndex(component.outcomes.map((outcome) => outcome.probability), this.random);
            rawValue = state[componentIndex] + component.outcomes[selected].change;
          } else if (component.mode === "matrix") {
            const rowIndex = component.states.indexOf(state[componentIndex]);
            const selected = sampleTransitionIndex(component.matrix[rowIndex], this.random);
            rawValue = component.states[selected];
          } else {
            rawValue = sampleIndependentOutcomes(
              state[componentIndex],
              component.outcomes,
              this.random,
            );
          }
        } catch (error) {
          throw new Error(
            `Outcomes for "${component.name}" failed at generation ${generation + 1}: ${error.message}`,
          );
        }

        if (!Number.isFinite(rawValue)) {
          throw new Error(
            `Outcomes for "${component.name}" returned a non-finite value at generation ${generation + 1}.`,
          );
        }

        const discreteValue = rawValue;
        if (!Number.isInteger(discreteValue) || Math.abs(discreteValue) > MAX_DISCRETE_STATE) {
          throw new Error(
            `State for "${component.name}" exceeded the integer range ±${MAX_DISCRETE_STATE.toLocaleString()} at generation ${generation + 1}.`,
          );
        }
        return discreteValue;
      });

      state = nextState;
      times.push(generation + 1);
      history.push([...state]);
    }

    return { times, history };
  }
}
