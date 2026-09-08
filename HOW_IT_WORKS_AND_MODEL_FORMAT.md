# How It Works And Model Format

This app is a browser-based stochastic simulation tool with four simulators:

- `gillespie`: exact CTMC / Gillespie simulation
- `ctmp-inhomo`: time-varying CTMP with helper functions of time
- `sde`: stochastic differential equations solved with Euler-Maruyama
- `discrete-time`: integer-valued processes updated once per generation

Users type models into editor fields, run the simulation in the browser, and see the result on a chart. If they are logged in, they can save the model and reopen it later.

## The Short Version

The app does **not** save simulation output histories as the main model format.

It saves:

- which simulator the user was using
- the current editor contents
- the run settings like `tMax`, `dt`, and `numSims`
- some metadata like model name, slug, preview image, and timestamps

So the saved model is basically a snapshot of the editor state, not a dump of plotted results.

## Where The Format Lives

The real source of truth is:

- [lib/saved-simulations/validators.js](/Users/adamaldridge/Desktop/Projects%20A/Markob.sbs/MAIN/stochastic-app-DB/lib/saved-simulations/validators.js)
- [lib/saved-simulations/serializers.js](/Users/adamaldridge/Desktop/Projects%20A/Markob.sbs/MAIN/stochastic-app-DB/lib/saved-simulations/serializers.js)

`serializers.js` defines how UI state is turned into saved JSON.

`validators.js` defines what JSON shape is accepted by the API.

## Overall Saved Record Shape

At the database/API level, a saved model looks like this:

```json
{
  "id": "65f...",
  "userId": "65e...",
  "simulatorType": "gillespie",
  "name": "Predator Prey",
  "slug": "predator-prey",
  "description": "",
  "payloadVersion": 1,
  "payload": {
    "...": "simulator-specific data"
  },
  "preview": {
    "imageUrl": "https://...",
    "blurDataURL": "data:image/jpeg;base64,...",
    "objectKey": "model-previews/...",
    "width": 400,
    "height": 300,
    "format": "image/webp",
    "fileSize": 12345,
    "generatedAt": "2026-03-20T12:34:56.000Z"
  },
  "lastOpenedAt": null,
  "createdAt": "2026-03-20T12:00:00.000Z",
  "updatedAt": "2026-03-20T12:34:56.000Z"
}
```

The important part is `payload`.

## Important Encoding Idea

There are two layers:

1. The **UI/editor layer**
   - rows have temporary `id` fields so React can manage them

2. The **saved layer**
   - those temporary IDs are stripped out
   - only the meaningful model content is persisted

Example:

```json
{
  "id": "client-only-row-id",
  "text": "A = 100",
  "noteEnabled": false,
  "noteLabel": ""
}
```

is saved as:

```json
{
  "text": "A = 100",
  "noteEnabled": false,
  "noteLabel": ""
}
```

## How The User's Model Is Actually Encoded

Most of the model is stored as small JSON objects that still contain the user's original text.

That means the app usually saves:

- text rows like `"A = 100"`
- transition rate expressions like `"k * A"`
- helper function text like `"Season(t) = 1 + A*sin(w*t)"`
- SDE expressions like `"a*Prey - b*Prey*Pred"`

Then, when the user runs the simulator, the app parses and compiles those strings in the browser.

So the storage format is:

- **JSON envelope**
- containing **string-based mathematical model definitions**

## Simulator-Specific Payload Formats

### 1. Gillespie

Saved payload:

```json
{
  "varRows": [
    { "text": "Prey = 300", "noteEnabled": false, "noteLabel": "" },
    { "text": "Pred = 10", "noteEnabled": false, "noteLabel": "" }
  ],
  "paramRows": [
    { "text": "a = 1.1", "noteEnabled": false, "noteLabel": "" },
    { "text": "b = 0.01", "noteEnabled": false, "noteLabel": "" }
  ],
  "transitions": [
    {
      "rate": "a * Prey",
      "deltas": ["1", "0"],
      "noteEnabled": false,
      "noteLabel": ""
    },
    {
      "rate": "b * Prey * Pred",
      "deltas": ["-1", "1"],
      "noteEnabled": false,
      "noteLabel": ""
    }
  ],
  "settings": {
    "tMax": 5,
    "numSims": 1
  }
}
```

Meaning:

- `varRows`: initial state variables, stored as `"name = number"`
- `paramRows`: parameters, stored as `"name = number"`
- `transitions[i].rate`: rate expression as a string
- `transitions[i].deltas`: how each variable changes if that transition fires
- `settings`: run controls

### 2. CTMP Inhomogeneous

Saved payload:

```json
{
  "varRows": [
    { "text": "Prey = 300", "noteEnabled": false, "noteLabel": "" }
  ],
  "paramRows": [
    { "text": "A = 2", "noteEnabled": false, "noteLabel": "" },
    { "text": "w = 6.28", "noteEnabled": false, "noteLabel": "" }
  ],
  "helperRows": [
    { "text": "Season(t) = 1 + A*sin(w*t)", "noteEnabled": false, "noteLabel": "" }
  ],
  "transitions": [
    {
      "rate": "birth * Season(t) * Prey",
      "deltas": ["1", "0"],
      "noteEnabled": false,
      "noteLabel": ""
    }
  ],
  "settings": {
    "tMax": 7,
    "dt": 0.000002,
    "numSims": 1
  }
}
```

Extra part compared with Gillespie:

- `helperRows`: named time functions, stored as strings like `Name(t) = expression`
- `settings.dt`: fixed time step is required here

### 3. SDE

Saved payload:

```json
{
  "paramRows": [
    { "text": "a = 1.1", "noteEnabled": false, "noteLabel": "" },
    { "text": "sigma_x = 0.2", "noteEnabled": false, "noteLabel": "" }
  ],
  "components": [
    {
      "name": "Prey",
      "init": 300,
      "drift": "a*Prey - b*Prey*Pred",
      "diff": "sigma_x * Prey",
      "noteEnabled": false,
      "noteLabel": ""
    },
    {
      "name": "Pred",
      "init": 10,
      "drift": "-c*Pred + d*Prey*Pred",
      "diff": "sigma_y * Pred",
      "noteEnabled": false,
      "noteLabel": ""
    }
  ],
  "settings": {
    "tMax": 20,
    "dt": 0.005,
    "numSims": 1
  }
}
```

Difference from the other two:

- SDE variables are stored as structured `components`
- each component has:
  - `name`
  - `init`
  - `drift`
  - `diff`

So SDE is a little more structured and a little less text-row based.

### 4. Discrete Time

Saved payload:

```json
{
  "components": [
    {
      "name": "Population",
      "init": 10,
      "outcomes": [
        { "offspring": 0, "probability": 0.45 },
        { "offspring": 2, "probability": 0.55 }
      ],
      "noteEnabled": false,
      "noteLabel": ""
    }
  ],
  "settings": {
    "generations": 30,
    "numSims": 12
  }
}
```

Discrete-time components now have a `mode` field:

- `branching`: each individual independently draws an offspring count. Initial values and offspring are non-negative integers. This is the default when `mode` is absent, so existing models keep their original meaning.
- `increments`: one change is drawn per step and added to the variable. Initial values and changes can be negative integers. Outcomes use `change` instead of `offspring`.
- `matrix`: a finite-state chain uses integer `states` and a square `matrix`. Row i describes probabilities from state i to each destination column. Each row must total 1, and the initial value must be one of the states.

A simple random walk is represented as:

```json
{
  "name": "X",
  "init": 0,
  "mode": "increments",
  "useSlider": true,
  "outcomes": [
    { "change": 1, "probability": 0.5 },
    { "change": -1, "probability": 0.5 }
  ],
  "noteEnabled": false,
  "noteLabel": ""
}
```

A finite-state chain can instead use:

```json
{
  "name": "State",
  "init": 0,
  "mode": "matrix",
  "states": [0, 1],
  "matrix": [[0.8, 0.2], [0.3, 0.7]],
  "useSlider": false,
  "noteEnabled": false,
  "noteLabel": ""
}
```

`useSlider` records the editor preference. With two outcomes (or two matrix columns), enabling it links the first probability `p` to the second probability `1 - p`. Exact numeric inputs remain available. More than two outcomes use independent numeric probability inputs.

Variables evolve independently. Increment probabilities are constant; finite-state dependence is specified through matrix rows. The browser and save API share validation in `lib/discrete-time/model.js`. The UI calls generations “steps” for all three modes, while the saved setting remains `generations` for compatibility. JSON exports retain the active mode and its definition. Native runner export remains unavailable for discrete-time models.

## What Is Not Saved In The Main Model Format

These are not the core saved-model payload:

- rendered chart points
- random draws
- full simulation histories as the canonical saved format
- temporary React row IDs

Preview images are stored separately in `preview`, not inside `payload`.

## Parsing Rules Behind The Format

The text strings follow simple conventions:

- variables and params: `Name = 123`
- CTMP helper functions: `Season(t) = 1 + A*sin(w*t)`
- transitions: rate expression + delta vector
- SDE components: stored structurally, not as one text line in the saved payload
- discrete-time components: `name`, integer `init`, `mode`, and either offspring outcomes, changes per step, or a transition matrix

The user sees text, but the app saves a JSON representation of that text.

## Best Mental Model

Think of each saved model as:

> a JSON snapshot of the editor

not:

> a compiled program or a raw simulation result file

## If You Need To Change The Format

Check these first:

- [lib/saved-simulations/serializers.js](/Users/adamaldridge/Desktop/Projects%20A/Markob.sbs/MAIN/stochastic-app-DB/lib/saved-simulations/serializers.js)
- [lib/saved-simulations/validators.js](/Users/adamaldridge/Desktop/Projects%20A/Markob.sbs/MAIN/stochastic-app-DB/lib/saved-simulations/validators.js)
- [models/SavedSimulation.js](/Users/adamaldridge/Desktop/Projects%20A/Markob.sbs/MAIN/stochastic-app-DB/models/SavedSimulation.js)

And remember:

- `payloadVersion` is currently `1`
- the API validates by `simulatorType`
- changing the payload shape means updating both serialization and validation
