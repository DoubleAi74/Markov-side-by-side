#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

struct CompiledToken {
  int kind;
  int index;
  int aux;
  double value;
};

struct CompiledExprRef {
  int offset;
  int count;
};

struct CompiledModelData {
  int simulatorType = 0;
  bool csvIncludeHeader = true;
  double tMax = 0.0;
  double dt = 0.0;
  std::vector<std::string> variableNames;
  std::vector<double> initialValues;
  std::vector<double> parameterValues;
  std::vector<CompiledToken> tokens;
  std::vector<CompiledExprRef> helperExpressions;
  std::vector<CompiledExprRef> rateExpressions;
  std::vector<CompiledExprRef> changeExpressions;
  std::vector<CompiledExprRef> driftExpressions;
  std::vector<CompiledExprRef> diffusionExpressions;
};

namespace {

constexpr int kTokenNumber = 0;
constexpr int kTokenState = 1;
constexpr int kTokenParam = 2;
constexpr int kTokenTime = 3;
constexpr int kTokenAdd = 4;
constexpr int kTokenSub = 5;
constexpr int kTokenMul = 6;
constexpr int kTokenDiv = 7;
constexpr int kTokenPow = 8;
constexpr int kTokenNeg = 9;
constexpr int kTokenCallBuiltin = 10;
constexpr int kTokenCallHelper = 11;

constexpr int kSimulatorGillespie = 0;
constexpr int kSimulatorCTMPInhomo = 1;
constexpr int kSimulatorSDE = 2;

constexpr std::uint64_t kSplitMixIncrement = 0x9e3779b97f4a7c15ULL;
constexpr double kPi = 3.14159265358979323846264338327950288;
constexpr char kModelDataMagic[] = "MSBNDAT1";
constexpr std::size_t kModelDataMagicSize = 8;

struct RuntimeOptions {
  std::string modelDataPath;
  std::string outputPath;
  std::size_t runCount = 0;
  std::uint64_t seed = 0;
  bool seedProvided = false;
  std::size_t threadCount = 0;
  std::vector<std::size_t> recordedRuns;
};

CompiledModelData gModel;

std::uint64_t splitMix64(std::uint64_t& state) {
  state += kSplitMixIncrement;
  std::uint64_t z = state;
  z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ULL;
  z = (z ^ (z >> 27)) * 0x94d049bb133111ebULL;
  return z ^ (z >> 31);
}

std::uint64_t rotateLeft(std::uint64_t value, int amount) {
  return (value << amount) | (value >> (64 - amount));
}

class Rng {
 public:
  explicit Rng(std::uint64_t seed) {
    std::uint64_t source = seed;
    for (std::uint64_t& word : state_) {
      word = splitMix64(source);
    }
  }

  std::uint64_t nextU64() {
    const std::uint64_t result = rotateLeft(state_[1] * 5ULL, 7) * 9ULL;
    const std::uint64_t shifted = state_[1] << 17;
    state_[2] ^= state_[0];
    state_[3] ^= state_[1];
    state_[1] ^= state_[2];
    state_[0] ^= state_[3];
    state_[2] ^= shifted;
    state_[3] = rotateLeft(state_[3], 45);
    return result;
  }

  double uniformOpen01() {
    double value =
      ((nextU64() >> 11) + 0.5) *
      (1.0 / 9007199254740992.0);
    if (value <= 0.0) {
      return std::numeric_limits<double>::min();
    }
    if (value >= 1.0) {
      return std::nextafter(1.0, 0.0);
    }
    return value;
  }

  double normal() {
    const double u1 = uniformOpen01();
    const double u2 = uniformOpen01();
    return std::sqrt(-2.0 * std::log(u1)) * std::cos(2.0 * kPi * u2);
  }

 private:
  std::uint64_t state_[4]{};
};

template <typename T>
T readPod(std::istream& stream) {
  T value{};
  stream.read(reinterpret_cast<char*>(&value), sizeof(T));
  if (!stream) {
    throw std::runtime_error("Failed to read compiled model data.");
  }
  return value;
}

std::string readString(std::istream& stream) {
  const std::uint32_t length = readPod<std::uint32_t>(stream);
  std::string value(length, '\0');
  if (length > 0) {
    stream.read(value.data(), static_cast<std::streamsize>(length));
    if (!stream) {
      throw std::runtime_error("Failed to read compiled model string data.");
    }
  }
  return value;
}

std::vector<std::string> readStringArray(std::istream& stream) {
  const std::uint32_t count = readPod<std::uint32_t>(stream);
  std::vector<std::string> values;
  values.reserve(count);
  for (std::uint32_t index = 0; index < count; index += 1) {
    values.push_back(readString(stream));
  }
  return values;
}

std::vector<double> readDoubleArray(std::istream& stream) {
  const std::uint32_t count = readPod<std::uint32_t>(stream);
  std::vector<double> values;
  values.reserve(count);
  for (std::uint32_t index = 0; index < count; index += 1) {
    values.push_back(readPod<double>(stream));
  }
  return values;
}

std::vector<CompiledToken> readTokenArray(std::istream& stream) {
  const std::uint32_t count = readPod<std::uint32_t>(stream);
  std::vector<CompiledToken> values;
  values.reserve(count);
  for (std::uint32_t index = 0; index < count; index += 1) {
    const std::int32_t kind = readPod<std::int32_t>(stream);
    const std::int32_t tokenIndex = readPod<std::int32_t>(stream);
    const std::int32_t aux = readPod<std::int32_t>(stream);
    const double value = readPod<double>(stream);
    values.push_back(
      CompiledToken{
        static_cast<int>(kind),
        static_cast<int>(tokenIndex),
        static_cast<int>(aux),
        value,
      }
    );
  }
  return values;
}

std::vector<CompiledExprRef> readExprRefArray(std::istream& stream) {
  const std::uint32_t count = readPod<std::uint32_t>(stream);
  std::vector<CompiledExprRef> values;
  values.reserve(count);
  for (std::uint32_t index = 0; index < count; index += 1) {
    const std::int32_t offset = readPod<std::int32_t>(stream);
    const std::int32_t exprCount = readPod<std::int32_t>(stream);
    values.push_back(
      CompiledExprRef{
        static_cast<int>(offset),
        static_cast<int>(exprCount),
      }
    );
  }
  return values;
}

CompiledModelData loadCompiledModel(const std::string& modelDataPath) {
  std::ifstream input(modelDataPath, std::ios::binary);
  if (!input) {
    throw std::runtime_error("Failed to open compiled model data file.");
  }

  char magic[kModelDataMagicSize];
  input.read(magic, static_cast<std::streamsize>(kModelDataMagicSize));
  if (!input || std::memcmp(magic, kModelDataMagic, kModelDataMagicSize) != 0) {
    throw std::runtime_error("Compiled model data file is not recognized.");
  }

  CompiledModelData model;
  model.simulatorType = static_cast<int>(readPod<std::uint32_t>(input));
  model.csvIncludeHeader = readPod<bool>(input);
  model.tMax = readPod<double>(input);
  model.dt = readPod<double>(input);
  model.variableNames = readStringArray(input);
  model.initialValues = readDoubleArray(input);
  model.parameterValues = readDoubleArray(input);
  model.tokens = readTokenArray(input);
  model.helperExpressions = readExprRefArray(input);
  model.rateExpressions = readExprRefArray(input);
  model.changeExpressions = readExprRefArray(input);
  model.driftExpressions = readExprRefArray(input);
  model.diffusionExpressions = readExprRefArray(input);
  return model;
}

void validateCompiledModel() {
  if (gModel.variableNames.size() != gModel.initialValues.size()) {
    throw std::runtime_error(
      "Compiled model data is invalid: variable names and initial values do not match."
    );
  }
  if (gModel.tokens.empty()) {
    throw std::runtime_error("Compiled model data is invalid: token table is empty.");
  }
  if (gModel.tMax <= 0.0) {
    throw std::runtime_error("Compiled model data is invalid: T_MAX must be positive.");
  }
  if (gModel.simulatorType == kSimulatorCTMPInhomo || gModel.simulatorType == kSimulatorSDE) {
    if (gModel.dt <= 0.0) {
      throw std::runtime_error("Compiled model data is invalid: DT must be positive.");
    }
  }
  if (
    gModel.simulatorType == kSimulatorGillespie ||
    gModel.simulatorType == kSimulatorCTMPInhomo
  ) {
    if (gModel.rateExpressions.empty()) {
      throw std::runtime_error("Compiled model data is invalid: no transitions were found.");
    }
    if (gModel.changeExpressions.size() != gModel.rateExpressions.size() * gModel.variableNames.size()) {
      throw std::runtime_error(
        "Compiled model data is invalid: transition change expressions are incomplete."
      );
    }
  }
  if (gModel.simulatorType == kSimulatorSDE) {
    if (gModel.driftExpressions.size() != gModel.variableNames.size()) {
      throw std::runtime_error(
        "Compiled model data is invalid: drift expressions are incomplete."
      );
    }
    if (gModel.diffusionExpressions.size() != gModel.variableNames.size()) {
      throw std::runtime_error(
        "Compiled model data is invalid: diffusion expressions are incomplete."
      );
    }
  }
}

std::size_t variableCount() {
  return gModel.variableNames.size();
}

std::size_t transitionCount() {
  return gModel.rateExpressions.size();
}

std::size_t componentCount() {
  return gModel.driftExpressions.size();
}

std::uint64_t deriveRunSeed(std::uint64_t masterSeed, std::size_t runIndex) {
  std::uint64_t source = masterSeed ^
    (static_cast<std::uint64_t>(runIndex) * 0xd2b74407b1ce6e93ULL);
  return splitMix64(source);
}

double applyBuiltin(int builtinCode, double left, double right) {
  switch (builtinCode) {
    case 0:
      return std::sin(left);
    case 1:
      return std::cos(left);
    case 2:
      return std::tan(left);
    case 3:
      return std::exp(left);
    case 4:
      return std::log(left);
    case 5:
      return std::sqrt(left);
    case 6:
      return std::abs(left);
    case 7:
      return std::pow(left, right);
    case 8:
      return std::min(left, right);
    case 9:
      return std::max(left, right);
    case 10:
      return std::floor(left);
    case 11:
      return std::ceil(left);
    default:
      throw std::runtime_error(
        "Unsupported builtin function code " + std::to_string(builtinCode)
      );
  }
}

double evaluateExpression(
  const CompiledExprRef& ref,
  const std::vector<double>& state,
  double time,
  const std::vector<double>& params,
  int recursionDepth = 0
) {
  if (recursionDepth > 64) {
    throw std::runtime_error("Helper recursion depth exceeded.");
  }

  std::vector<double> stack;
  stack.reserve(static_cast<std::size_t>(ref.count) + 4);

  for (int offset = 0; offset < ref.count; offset += 1) {
    const CompiledToken& token =
      gModel.tokens[static_cast<std::size_t>(ref.offset + offset)];

    switch (token.kind) {
      case kTokenNumber:
        stack.push_back(token.value);
        break;

      case kTokenState:
        stack.push_back(state.at(static_cast<std::size_t>(token.index)));
        break;

      case kTokenParam:
        stack.push_back(params.at(static_cast<std::size_t>(token.index)));
        break;

      case kTokenTime:
        stack.push_back(time);
        break;

      case kTokenAdd: {
        const double rhs = stack.back();
        stack.pop_back();
        const double lhs = stack.back();
        stack.back() = lhs + rhs;
        break;
      }

      case kTokenSub: {
        const double rhs = stack.back();
        stack.pop_back();
        const double lhs = stack.back();
        stack.back() = lhs - rhs;
        break;
      }

      case kTokenMul: {
        const double rhs = stack.back();
        stack.pop_back();
        const double lhs = stack.back();
        stack.back() = lhs * rhs;
        break;
      }

      case kTokenDiv: {
        const double rhs = stack.back();
        stack.pop_back();
        const double lhs = stack.back();
        stack.back() = lhs / rhs;
        break;
      }

      case kTokenPow: {
        const double rhs = stack.back();
        stack.pop_back();
        const double lhs = stack.back();
        stack.back() = std::pow(lhs, rhs);
        break;
      }

      case kTokenNeg:
        stack.back() = -stack.back();
        break;

      case kTokenCallBuiltin: {
        const int arity = token.aux;
        const double rhs = arity == 2 ? stack.back() : 0.0;
        if (arity == 2) {
          stack.pop_back();
        }
        const double lhs = stack.back();
        stack.back() = applyBuiltin(token.index, lhs, rhs);
        break;
      }

      case kTokenCallHelper: {
        const double helperTime = stack.back();
        stack.back() = evaluateExpression(
          gModel.helperExpressions.at(static_cast<std::size_t>(token.index)),
          state,
          helperTime,
          params,
          recursionDepth + 1
        );
        break;
      }

      default:
        throw std::runtime_error(
          "Unsupported token kind " + std::to_string(token.kind)
        );
    }
  }

  if (stack.size() != 1 || !std::isfinite(stack.back())) {
    throw std::runtime_error("Expression evaluation failed.");
  }

  return stack.back();
}

std::string buildCsvHeader() {
  std::ostringstream stream;
  stream << "run,t";
  for (const std::string& variableName : gModel.variableNames) {
    stream << "," << variableName;
  }
  stream << "\n";
  return stream.str();
}

void writeCsvRow(
  std::ostream& stream,
  std::size_t runIndex,
  double time,
  const std::vector<double>& state
) {
  stream << runIndex << "," << std::setprecision(17) << time;
  for (double value : state) {
    stream << "," << std::setprecision(17) << value;
  }
  stream << "\n";
}

void maybeWriteCsvRow(
  std::ostream* stream,
  std::size_t runIndex,
  double time,
  const std::vector<double>& state
) {
  if (stream == nullptr) {
    return;
  }
  writeCsvRow(*stream, runIndex, time, state);
}

std::vector<double> buildInitialState() {
  return gModel.initialValues;
}

std::vector<double> buildParameterValues() {
  return gModel.parameterValues;
}

CompiledExprRef changeExpressionRef(std::size_t transitionIndex, std::size_t variableIndex) {
  const std::size_t flatIndex = transitionIndex * variableCount() + variableIndex;
  return gModel.changeExpressions.at(flatIndex);
}

void applyDiscreteTransition(
  std::size_t transitionIndex,
  std::vector<double>& state,
  double time,
  const std::vector<double>& params
) {
  std::vector<double> nextState = state;
  for (std::size_t variableIndex = 0; variableIndex < variableCount(); variableIndex += 1) {
    const double delta = evaluateExpression(
      changeExpressionRef(transitionIndex, variableIndex),
      state,
      time,
      params
    );
    if (!std::isfinite(delta) || std::trunc(delta) != delta) {
      throw std::runtime_error("A CTMC transition delta is not a finite integer.");
    }
    const double nextValue = state[variableIndex] + delta;
    if (
      !std::isfinite(nextValue) ||
      std::trunc(nextValue) != nextValue ||
      nextValue < 0.0 ||
      std::abs(nextValue) > 9007199254740991.0
    ) {
      throw std::runtime_error("A CTMC transition would produce an invalid state.");
    }
    nextState[variableIndex] = nextValue;
  }
  state.swap(nextState);
}

void runGillespieSimulation(
  std::size_t runIndex,
  std::ostream* stream,
  std::uint64_t runSeed
) {
  constexpr std::size_t kMaxIterations = 5000000;

  Rng rng(runSeed);
  std::vector<double> state = buildInitialState();
  const std::vector<double> params = buildParameterValues();
  double time = 0.0;

  maybeWriteCsvRow(stream, runIndex, time, state);

  std::size_t iteration = 0;
  while (time < gModel.tMax) {
    if (iteration >= kMaxIterations) {
      throw std::runtime_error("Gillespie run exceeded the explicit 5000000-event resource budget.");
    }
    iteration += 1;
    std::vector<double> rates(transitionCount(), 0.0);
    double totalRate = 0.0;

    for (std::size_t transitionIndex = 0; transitionIndex < transitionCount(); transitionIndex += 1) {
      const double rate = evaluateExpression(
        gModel.rateExpressions[transitionIndex],
        state,
        0.0,
        params
      );
      if (!std::isfinite(rate) || rate < 0.0) {
        throw std::runtime_error("Gillespie propensity is negative or non-finite.");
      }
      rates[transitionIndex] = rate;
      totalRate += rate;
    }

    if (totalRate < 1e-12) {
      maybeWriteCsvRow(stream, runIndex, gModel.tMax, state);
      break;
    }

    const double tau = -std::log(rng.uniformOpen01()) / totalRate;
    if (time + tau >= gModel.tMax) {
      maybeWriteCsvRow(stream, runIndex, gModel.tMax, state);
      break;
    }
    time += tau;

    const double selector = rng.uniformOpen01() * totalRate;
    double cumulative = 0.0;
    std::size_t chosenTransition = transitionCount() - 1;
    for (std::size_t transitionIndex = 0; transitionIndex < transitionCount(); transitionIndex += 1) {
      cumulative += rates[transitionIndex];
      if (selector <= cumulative) {
        chosenTransition = transitionIndex;
        break;
      }
    }

    applyDiscreteTransition(chosenTransition, state, time, params);
    maybeWriteCsvRow(stream, runIndex, time, state);
  }
}

void runCTMPInhomogeneousSimulation(
  std::size_t runIndex,
  std::ostream* stream,
  std::uint64_t runSeed
) {
  constexpr std::size_t kMaxSteps = 5000000;
  constexpr std::size_t kMaxEvents = 5000000;

  Rng rng(runSeed);
  std::vector<double> state = buildInitialState();
  const std::vector<double> params = buildParameterValues();
  double time = 0.0;

  maybeWriteCsvRow(stream, runIndex, time, state);
  std::size_t stepCount = 0;
  std::size_t eventCount = 0;
  while (time < gModel.tMax) {
    if (stepCount >= kMaxSteps) {
      throw std::runtime_error("CTMP run exceeded the explicit 5000000-interval resource budget.");
    }
    stepCount += 1;
    const double freezeTime = time;
    double intervalEnd = std::min(gModel.tMax, freezeTime + gModel.dt);
    while (time < intervalEnd) {
      if (eventCount >= kMaxEvents) {
        throw std::runtime_error("CTMP run exceeded the explicit 5000000-event resource budget.");
      }
      std::vector<double> rates(transitionCount(), 0.0);
      double totalRate = 0.0;
      for (std::size_t transitionIndex = 0; transitionIndex < transitionCount(); transitionIndex += 1) {
        const double rate = evaluateExpression(
          gModel.rateExpressions[transitionIndex], state, freezeTime, params
        );
        if (!std::isfinite(rate) || rate < 0.0) {
          throw std::runtime_error("CTMP rate is negative or non-finite.");
        }
        rates[transitionIndex] = rate;
        totalRate += rate;
      }
      if (totalRate == 0.0) {
        time = intervalEnd;
        break;
      }
      intervalEnd = std::min(
        intervalEnd,
        std::max(time, freezeTime + std::min(gModel.dt, 0.25 / totalRate))
      );
      if (intervalEnd <= time) {
        break;
      }
      const double eventTime = time - std::log(rng.uniformOpen01()) / totalRate;
      if (eventTime >= intervalEnd) {
        time = intervalEnd;
        break;
      }
      const double selector = rng.uniformOpen01() * totalRate;
      double cumulative = 0.0;
      std::size_t selected = transitionCount() - 1;
      for (std::size_t transitionIndex = 0; transitionIndex < transitionCount(); transitionIndex += 1) {
        cumulative += rates[transitionIndex];
        if (selector < cumulative) {
          selected = transitionIndex;
          break;
        }
      }
      applyDiscreteTransition(selected, state, eventTime, params);
      time = eventTime;
      eventCount += 1;
      maybeWriteCsvRow(stream, runIndex, time, state);
    }
  }
  maybeWriteCsvRow(stream, runIndex, gModel.tMax, state);
}

void runSDESimulation(
  std::size_t runIndex,
  std::ostream* stream,
  std::uint64_t runSeed
) {
  constexpr std::size_t kMaxSteps = 500000;

  Rng rng(runSeed);
  std::vector<double> state = buildInitialState();
  const std::vector<double> params = buildParameterValues();
  double time = 0.0;

  maybeWriteCsvRow(stream, runIndex, time, state);

  std::size_t stepCount = 0;
  while (time < gModel.tMax) {
    if (stepCount >= kMaxSteps) {
      throw std::runtime_error("SDE run exceeded the explicit 500000-step resource budget.");
    }
    stepCount += 1;
    const double step = std::min(gModel.dt, gModel.tMax - time);
    const double sqrtStep = std::sqrt(step);
    std::vector<double> nextState = state;

    for (std::size_t componentIndex = 0; componentIndex < componentCount(); componentIndex += 1) {
      const double dW = rng.normal() * sqrtStep;
      const double drift = evaluateExpression(
        gModel.driftExpressions[componentIndex],
        state,
        time,
        params
      );
      const double diffusion = evaluateExpression(
        gModel.diffusionExpressions[componentIndex],
        state,
        time,
        params
      );
      nextState[componentIndex] =
        state[componentIndex] +
        drift * step +
        diffusion * dW;
      if (!std::isfinite(nextState[componentIndex])) {
        throw std::runtime_error("SDE state became non-finite.");
      }
    }

    state.swap(nextState);
    time += step;
    maybeWriteCsvRow(stream, runIndex, time, state);
  }
}

std::vector<std::size_t> parseRecordedRuns(const std::string& value) {
  std::vector<std::size_t> recordedRuns;
  if (value.empty()) {
    return recordedRuns;
  }

  std::stringstream stream(value);
  std::string item;
  while (std::getline(stream, item, ',')) {
    if (item.empty()) {
      throw std::runtime_error(
        "Invalid --record-runs value. Use a comma-separated list such as 0,1,2."
      );
    }
    recordedRuns.push_back(static_cast<std::size_t>(std::stoull(item)));
  }

  std::sort(recordedRuns.begin(), recordedRuns.end());
  recordedRuns.erase(
    std::unique(recordedRuns.begin(), recordedRuns.end()),
    recordedRuns.end()
  );
  return recordedRuns;
}

bool shouldRecordRun(
  std::size_t runIndex,
  const std::vector<std::size_t>& recordedRuns
) {
  if (recordedRuns.empty()) {
    return true;
  }
  return std::binary_search(recordedRuns.begin(), recordedRuns.end(), runIndex);
}

void runRange(
  std::size_t rangeStart,
  std::size_t rangeEnd,
  const std::string& partPath,
  std::uint64_t seed,
  const std::vector<std::size_t>& recordedRuns
) {
  std::ofstream stream(partPath, std::ios::binary | std::ios::trunc);
  if (!stream) {
    throw std::runtime_error("Failed to open output part file.");
  }
  stream << std::setprecision(17);

  for (std::size_t runIndex = rangeStart; runIndex < rangeEnd; runIndex += 1) {
    const std::uint64_t runSeed = deriveRunSeed(seed, runIndex);
    std::ostream* output = shouldRecordRun(runIndex, recordedRuns) ? &stream : nullptr;

    if (gModel.simulatorType == kSimulatorGillespie) {
      runGillespieSimulation(runIndex, output, runSeed);
    } else if (gModel.simulatorType == kSimulatorCTMPInhomo) {
      runCTMPInhomogeneousSimulation(runIndex, output, runSeed);
    } else if (gModel.simulatorType == kSimulatorSDE) {
      runSDESimulation(runIndex, output, runSeed);
    } else {
      throw std::runtime_error("Unsupported simulator type.");
    }
  }
}

RuntimeOptions parseArgs(int argc, char** argv) {
  RuntimeOptions options;

  for (int index = 1; index < argc; index += 1) {
    const std::string arg = argv[index];
    if (arg == "--model-data" && index + 1 < argc) {
      options.modelDataPath = argv[++index];
    } else if (arg == "--output" && index + 1 < argc) {
      options.outputPath = argv[++index];
    } else if (arg == "--runs" && index + 1 < argc) {
      options.runCount = static_cast<std::size_t>(std::stoull(argv[++index]));
    } else if (arg == "--seed" && index + 1 < argc) {
      options.seed = static_cast<std::uint64_t>(std::stoull(argv[++index]));
      options.seedProvided = true;
    } else if (arg == "--threads" && index + 1 < argc) {
      options.threadCount = static_cast<std::size_t>(std::stoull(argv[++index]));
    } else if (arg == "--record-runs" && index + 1 < argc) {
      options.recordedRuns = parseRecordedRuns(argv[++index]);
    } else {
      throw std::runtime_error("Unknown or incomplete argument: " + arg);
    }
  }

  if (options.modelDataPath.empty()) {
    throw std::runtime_error("Model data path must not be empty.");
  }
  if (options.outputPath.empty()) {
    throw std::runtime_error("Output path must not be empty.");
  }
  if (options.runCount == 0) {
    throw std::runtime_error("Run count must be greater than zero.");
  }
  if (!options.seedProvided) {
    throw std::runtime_error("Seed must be provided as a uint64 decimal value.");
  }
  return options;
}

std::size_t chooseThreadCount(const RuntimeOptions& options) {
  if (options.runCount == 0) {
    return 1;
  }

  std::size_t threadCount = options.threadCount;
  if (threadCount == 0) {
    threadCount = std::thread::hardware_concurrency();
  }
  if (threadCount == 0) {
    threadCount = 1;
  }
  return std::min(threadCount, options.runCount);
}

std::vector<std::pair<std::size_t, std::size_t>> partitionRuns(
  std::size_t totalRuns,
  std::size_t threadCount
) {
  std::vector<std::pair<std::size_t, std::size_t>> ranges;
  ranges.reserve(threadCount);

  const std::size_t baseSize = totalRuns / threadCount;
  const std::size_t remainder = totalRuns % threadCount;
  std::size_t cursor = 0;

  for (std::size_t threadIndex = 0; threadIndex < threadCount; threadIndex += 1) {
    const std::size_t size = baseSize + (threadIndex < remainder ? 1 : 0);
    ranges.push_back({cursor, cursor + size});
    cursor += size;
  }

  return ranges;
}

std::string buildPartPath(
  const std::string& outputPath,
  std::size_t partIndex
) {
  const std::string partSuffix = "_part" + std::to_string(partIndex);
  const std::size_t separatorIndex = outputPath.find_last_of("/\\");
  const std::size_t extensionIndex = outputPath.find_last_of('.');

  if (
    extensionIndex == std::string::npos ||
    (separatorIndex != std::string::npos && extensionIndex < separatorIndex + 1)
  ) {
    return outputPath + partSuffix;
  }

  return (
    outputPath.substr(0, extensionIndex) +
    partSuffix +
    outputPath.substr(extensionIndex)
  );
}

void mergePartFiles(
  const std::string& outputPath,
  const std::vector<std::string>& partPaths
) {
  std::ofstream output(outputPath, std::ios::binary | std::ios::trunc);
  if (!output) {
    throw std::runtime_error("Failed to open final CSV output path.");
  }

  if (gModel.csvIncludeHeader) {
    output << buildCsvHeader();
  }

  for (const std::string& partPath : partPaths) {
    std::ifstream input(partPath, std::ios::binary);
    if (!input) {
      throw std::runtime_error("Failed to open worker output part.");
    }
    output << input.rdbuf();
    input.close();
    std::remove(partPath.c_str());
  }
}

}  // namespace

int main(int argc, char** argv) {
  try {
    const RuntimeOptions options = parseArgs(argc, argv);
    gModel = loadCompiledModel(options.modelDataPath);
    validateCompiledModel();

    for (std::size_t runIndex : options.recordedRuns) {
      if (runIndex >= options.runCount) {
        throw std::runtime_error(
          "Recorded run index is outside the available run range."
        );
      }
    }

    const std::size_t threadCount = chooseThreadCount(options);
    const auto ranges = partitionRuns(options.runCount, threadCount);

    std::vector<std::string> partPaths;
    partPaths.reserve(threadCount);
    for (std::size_t index = 0; index < threadCount; index += 1) {
      partPaths.push_back(buildPartPath(options.outputPath, index));
    }

    std::vector<std::thread> workers;
    std::exception_ptr workerError;
    std::mutex workerErrorMutex;
    workers.reserve(threadCount);
    for (std::size_t index = 0; index < threadCount; index += 1) {
      workers.emplace_back(
        [&, index]() {
          try {
            runRange(
              ranges[index].first,
              ranges[index].second,
              partPaths[index],
              options.seed,
              options.recordedRuns
            );
          } catch (...) {
            std::lock_guard<std::mutex> lock(workerErrorMutex);
            if (!workerError) {
              workerError = std::current_exception();
            }
          }
        }
      );
    }

    for (std::thread& worker : workers) {
      worker.join();
    }

    if (workerError) {
      std::rethrow_exception(workerError);
    }

    mergePartFiles(options.outputPath, partPaths);
  } catch (const std::exception& error) {
    std::cerr << error.what() << "\n";
    return 1;
  }

  return 0;
}
