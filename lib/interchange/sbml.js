import { randomUUID } from "node:crypto";
import { XMLValidator } from "fast-xml-parser";
import { migratePayloadV1ToV2 } from "../saved-simulations/migrations.js";
import { validateModelV2 } from "../model-v2/schema.js";

export class SBMLCompatibilityError extends Error {
  constructor(issues) {
    super("The model is outside the supported SBML Level 3 Core subset.");
    this.name = "SBMLCompatibilityError";
    this.issues = issues;
  }
}

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

function attributes(source) {
  const result = {};
  for (const match of source.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*(["'])(.*?)\2/g)) {
    result[match[1]] = match[3];
  }
  return result;
}

function attribute(value, name) {
  if (value[name] != null) return value[name];
  const entry = Object.entries(value).find(([key]) => key.split(":").at(-1) === name);
  return entry?.[1];
}

function tokenizeExpression(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const whitespace = rest.match(/^\s+/);
    if (whitespace) { index += whitespace[0].length; continue; }
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (number) { tokens.push({ type: "number", value: number[0] }); index += number[0].length; continue; }
    const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (identifier) { tokens.push({ type: "identifier", value: identifier[0] }); index += identifier[0].length; continue; }
    if ("+-*/^()".includes(rest[0])) { tokens.push({ type: rest[0], value: rest[0] }); index += 1; continue; }
    throw new Error(`Unsupported token near "${rest.slice(0, 16)}".`);
  }
  return tokens;
}

function expressionToMathML(source) {
  const tokens = tokenizeExpression(String(source));
  let cursor = 0;
  const peek = () => tokens[cursor];
  const take = () => tokens[cursor++];
  const apply = (op, left, right) => `<apply><${op}/>${left}${right}</apply>`;
  const parsePrimary = () => {
    const token = take();
    if (!token) throw new Error("Unexpected end of expression.");
    if (token.type === "number") return `<cn>${escapeXml(token.value)}</cn>`;
    if (token.type === "identifier") return `<ci>${escapeXml(token.value)}</ci>`;
    if (token.type === "(") {
      const node = parseAdd();
      if (take()?.type !== ")") throw new Error("Missing closing parenthesis.");
      return node;
    }
    if (token.type === "-") return `<apply><minus/>${parsePrimary()}</apply>`;
    throw new Error(`Unexpected token "${token.value}".`);
  };
  const parsePower = () => {
    let left = parsePrimary();
    if (peek()?.type === "^") { take(); left = apply("power", left, parsePower()); }
    return left;
  };
  const parseMul = () => {
    let left = parsePower();
    while (["*", "/"].includes(peek()?.type)) {
      const op = take().type;
      left = apply(op === "*" ? "times" : "divide", left, parsePower());
    }
    return left;
  };
  const parseAdd = () => {
    let left = parseMul();
    while (["+", "-"].includes(peek()?.type)) {
      const op = take().type;
      left = apply(op === "+" ? "plus" : "minus", left, parseMul());
    }
    return left;
  };
  const output = parseAdd();
  if (cursor !== tokens.length) throw new Error(`Unexpected token "${peek().value}".`);
  return output;
}

function v2Payload(savedSimulation) {
  return savedSimulation.payloadVersion === 1
    ? migratePayloadV1ToV2({
        id: savedSimulation.id,
        simulatorType: savedSimulation.simulatorType,
        payload: savedSimulation.payload,
      })
    : savedSimulation.payload;
}

function sbmlId(value, fallback) {
  const normalized = String(value ?? "").replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(normalized) ? normalized : `_${normalized || fallback}`;
}

export function createSBMLExport(savedSimulation) {
  const issues = [];
  if (savedSimulation.simulatorType !== "gillespie") {
    throw new SBMLCompatibilityError([{ path: "simulatorType", message: "Only Gillespie models can be exported as SBML." }]);
  }
  const payload = v2Payload(savedSimulation);
  const speciesIds = new Map();
  const species = (payload.variables ?? []).map((variable, index) => {
    const id = sbmlId(variable.name, `S${index + 1}`);
    speciesIds.set(variable.id, id);
    const initial = Number(variable.initialValue);
    if (!Number.isSafeInteger(initial) || initial < 0) {
      issues.push({ path: `variables[${index}].initialValue`, message: "SBML species require a non-negative integer initial amount." });
    }
    return { id, name: variable.name || id, initial };
  });
  const parameters = (payload.parameters ?? []).map((parameter, index) => {
    const value = Number(parameter.value);
    if (!Number.isFinite(value)) issues.push({ path: `parameters[${index}].value`, message: "SBML parameters must be constant finite numbers." });
    return { id: sbmlId(parameter.name, `p${index + 1}`), value };
  });
  const reactions = (payload.transitions ?? []).map((transition, index) => {
    const reactants = [];
    const products = [];
    for (const [changeIndex, change] of (transition.changes ?? []).entries()) {
      const delta = change.delta;
      if (!Number.isSafeInteger(delta)) {
        issues.push({ path: `transitions[${index}].changes[${changeIndex}].delta`, message: "SBML stoichiometry must be a constant integer." });
        continue;
      }
      const target = delta < 0 ? reactants : products;
      if (delta !== 0) target.push({ species: speciesIds.get(change.variableId), stoichiometry: Math.abs(delta) });
      if (!speciesIds.has(change.variableId)) issues.push({ path: `transitions[${index}].changes[${changeIndex}].variableId`, message: "Transition references an unknown species." });
    }
    let math = "";
    try { math = expressionToMathML(transition.rate || "0"); }
    catch (error) { issues.push({ path: `transitions[${index}].rate`, message: error.message }); }
    return { id: sbmlId(transition.name, `r${index + 1}`), reactants, products, math };
  });
  if (issues.length) throw new SBMLCompatibilityError(issues);
  const refs = (items) => items.map((item) =>
    `<speciesReference species="${escapeXml(item.species)}" stoichiometry="${item.stoichiometry}" constant="true"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level3/version2/core" level="3" version="2">
  <model id="${escapeXml(sbmlId(savedSimulation.slug, "markov_lab_model"))}" name="${escapeXml(savedSimulation.name)}" substanceUnits="item">
    <listOfUnitDefinitions><unitDefinition id="item"><listOfUnits><unit kind="dimensionless" exponent="1" scale="0" multiplier="1"/></listOfUnits></unitDefinition></listOfUnitDefinitions>
    <listOfCompartments><compartment id="default" spatialDimensions="0" size="1" constant="true"/></listOfCompartments>
    <listOfSpecies>${species.map((item) => `<species id="${escapeXml(item.id)}" name="${escapeXml(item.name)}" compartment="default" initialAmount="${item.initial}" hasOnlySubstanceUnits="true" boundaryCondition="false" constant="false"/>`).join("")}</listOfSpecies>
    <listOfParameters>${parameters.map((item) => `<parameter id="${escapeXml(item.id)}" value="${item.value}" constant="true"/>`).join("")}</listOfParameters>
    <listOfReactions>${reactions.map((item) => `<reaction id="${escapeXml(item.id)}" reversible="false" fast="false"><listOfReactants>${refs(item.reactants)}</listOfReactants><listOfProducts>${refs(item.products)}</listOfProducts><kineticLaw><math xmlns="http://www.w3.org/1998/Math/MathML">${item.math}</math></kineticLaw></reaction>`).join("")}</listOfReactions>
  </model>
</sbml>
`;
}

function decodeXml(value) {
  return String(value).replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&");
}

function mathMLToExpression(source) {
  const tokens = [...source.matchAll(/<\/?(?:[A-Za-z_][\w.-]*:)?([A-Za-z]+)(?:\s[^>]*)?\s*\/?>|([^<]+)/g)]
    .map((match) => ({ raw: match[0], tag: match[1], text: match[2]?.trim() }))
    .filter((token) => token.tag || token.text);
  let cursor = 0;
  const parseNode = () => {
    const token = tokens[cursor++];
    if (!token) throw new Error("Incomplete MathML expression.");
    if (token.tag === "ci" || token.tag === "cn") {
      const text = tokens[cursor++]?.text;
      const closing = tokens[cursor++];
      if (!text || !closing?.raw.startsWith("</")) throw new Error(`Invalid <${token.tag}> element.`);
      if (token.tag === "ci" && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) throw new Error("Invalid MathML identifier.");
      if (token.tag === "cn" && !Number.isFinite(Number(text))) throw new Error("Invalid MathML number.");
      return decodeXml(text);
    }
    if (token.tag !== "apply" || token.raw.startsWith("</")) throw new Error("Only arithmetic MathML apply expressions are supported.");
    const operator = tokens[cursor++];
    const names = { plus: "+", minus: "-", times: "*", divide: "/", power: "^" };
    const op = names[operator?.tag];
    if (!op || !operator.raw.endsWith("/>")) throw new Error("Unsupported MathML operator.");
    const args = [];
    while (tokens[cursor] && !tokens[cursor].raw.startsWith("</apply")) args.push(parseNode());
    cursor += 1;
    if (args.length === 1 && op === "-") return `(-${args[0]})`;
    if (args.length < 2) throw new Error("MathML arithmetic operator has too few arguments.");
    return `(${args.join(` ${op} `)})`;
  };
  return parseNode();
}

export function parseSBMLImport(xml) {
  if (typeof xml !== "string" || Buffer.byteLength(xml, "utf8") > 2 * 1024 * 1024) {
    throw new SBMLCompatibilityError([{ path: "document", message: "SBML must be text no larger than 2 MiB." }]);
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new SBMLCompatibilityError([{ path: "document", message: "DTD and entity declarations are forbidden." }]);
  }
  const validation = XMLValidator.validate(xml, { allowBooleanAttributes: false });
  if (validation !== true) throw new SBMLCompatibilityError([{ path: "document", message: validation.err?.msg || "Malformed XML." }]);
  const issues = [];
  if (!/<(?:\w+:)?sbml\b[^>]*\blevel=["']3["']/i.test(xml)) issues.push({ path: "sbml.level", message: "Only SBML Level 3 Core is supported." });
  const unsupportedElements = [
    "event",
    "assignmentRule",
    "rateRule",
    "algebraicRule",
    "delay",
    "initialAssignment",
    "constraint",
    "functionDefinition",
    "stoichiometryMath",
    "modifierSpeciesReference",
    "localParameter",
  ];
  for (const feature of unsupportedElements) {
    if (new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${feature}\\b`, "i").test(xml)) {
      issues.push({ path: feature, message: `${feature} is not supported; the model was not approximated.` });
    }
  }
  const modelTag = xml.match(/<(?:[A-Za-z_][\w.-]*:)?model\b([^>]*)>/i);
  if (modelTag && attribute(attributes(modelTag[1]), "conversionFactor") != null) {
    issues.push({ path: "model.conversionFactor", message: "Model conversion factors are not supported; the model was not approximated." });
  }
  const species = [...xml.matchAll(/<(?:\w+:)?species\b([^>]*)\/>/gi)].map((match, index) => {
    const attr = attributes(match[1]);
    const initial = Number(attribute(attr, "initialAmount"));
    if (attribute(attr, "initialConcentration") != null) issues.push({ path: `species[${index}]`, message: "Concentrations are not reinterpreted as amounts." });
    if (!Number.isSafeInteger(initial) || initial < 0) issues.push({ path: `species[${index}].initialAmount`, message: "Initial amount must be a non-negative integer." });
    if (attribute(attr, "hasOnlySubstanceUnits") !== "true") issues.push({ path: `species[${index}].hasOnlySubstanceUnits`, message: "Species must be explicitly amount-based; concentrations are not reinterpreted." });
    if (attribute(attr, "boundaryCondition") !== "false" || attribute(attr, "constant") !== "false") issues.push({ path: `species[${index}]`, message: "Species must explicitly be non-constant and non-boundary." });
    if (attribute(attr, "conversionFactor") != null) issues.push({ path: `species[${index}].conversionFactor`, message: "Species conversion factors are not supported; the model was not approximated." });
    const id = attribute(attr, "id");
    return { id: randomUUID(), sbmlId: id, name: id, initialValue: initial };
  });
  const bySbmlId = new Map(species.map((item) => [item.sbmlId, item]));
  const parameters = [...xml.matchAll(/<(?:\w+:)?parameter\b([^>]*)\/>/gi)].map((match, index) => {
    const attr = attributes(match[1]);
    const value = Number(attribute(attr, "value"));
    if (!Number.isFinite(value) || attribute(attr, "constant") !== "true") issues.push({ path: `parameters[${index}]`, message: "Parameters must be explicitly finite constants." });
    return { id: randomUUID(), name: attribute(attr, "id"), value };
  });
  const transitions = [...xml.matchAll(/<(?:\w+:)?reaction\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?reaction>/gi)].map((match, index) => {
    const attr = attributes(match[1]);
    if (attribute(attr, "reversible") !== "false") issues.push({ path: `reactions[${index}]`, message: "Reactions must explicitly be irreversible; reversible reactions are not split automatically." });
    if (attribute(attr, "fast") === "true") issues.push({ path: `reactions[${index}].fast`, message: "Fast reactions are not supported; the model was not approximated." });
    const body = match[2];
    const deltas = new Map(species.map((item) => [item.id, 0]));
    for (const [kind, sign] of [["Reactants", -1], ["Products", 1]]) {
      const list = body.match(new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?listOf${kind}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?listOf${kind}>`, "i"))?.[1] ?? "";
      for (const ref of list.matchAll(/<(?:[A-Za-z_][\w.-]*:)?speciesReference\b([^>]*?)(?:\/>|>\s*<\/(?:[A-Za-z_][\w.-]*:)?speciesReference>)/gi)) {
        const refAttr = attributes(ref[1]);
        const variable = bySbmlId.get(attribute(refAttr, "species"));
        const stoichiometry = Number(attribute(refAttr, "stoichiometry") ?? 1);
        const constant = attribute(refAttr, "constant");
        if (!variable || !Number.isSafeInteger(stoichiometry) || stoichiometry < 1) {
          issues.push({ path: `reactions[${index}].stoichiometry`, message: "Stoichiometry must reference a species with a positive constant integer." });
        } else if (constant !== "true") {
          issues.push({ path: `reactions[${index}].stoichiometry`, message: "Stoichiometry must explicitly be constant; the model was not approximated." });
        } else deltas.set(variable.id, deltas.get(variable.id) + sign * stoichiometry);
      }
    }
    const math = body.match(/<(?:[A-Za-z_][\w.-]*:)?math\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?math>/i)?.[1];
    let rate = "0";
    try { if (!math) throw new Error("Kinetic MathML is required."); rate = mathMLToExpression(math); }
    catch (error) { issues.push({ path: `reactions[${index}].kineticLaw`, message: error.message }); }
    const allowedSymbols = new Set([...bySbmlId.keys(), ...parameters.map((parameter) => parameter.name), "t", "time"]);
    for (const symbol of rate.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
      if (!allowedSymbols.has(symbol)) {
        issues.push({ path: `reactions[${index}].kineticLaw`, message: `Kinetic law references unsupported symbol ${JSON.stringify(symbol)}; the model was not approximated.` });
      }
    }
    return { id: randomUUID(), name: attribute(attr, "id") || `Reaction ${index + 1}`, rate, changes: [...deltas].filter(([, delta]) => delta !== 0).map(([variableId, delta]) => ({ variableId, delta })) };
  });
  if (!species.length) issues.push({ path: "species", message: "At least one amount-based species is required." });
  const payload = {
    format: "markov-lab/model",
    version: 2,
    solverFamily: "gillespie",
    variables: species.map(({ sbmlId: _sbmlId, ...item }) => item),
    parameters,
    helpers: [],
    transitions,
    noiseSources: [],
    sdeComponents: [],
    correlations: null,
    settings: { solver: "gillespie-direct-v2", tMax: 10, runs: 1, seed: "0" },
    plots: [],
    migration: { from: "sbml-level-3-core", sourceVersion: 3 },
  };
  const canonicalValidation = validateModelV2(payload);
  issues.push(...canonicalValidation.issues.map((issue) => ({
    path: issue.path,
    message: issue.message,
    code: issue.code,
  })));
  if (issues.length) throw new SBMLCompatibilityError(issues);
  return {
    simulatorType: "gillespie",
    payloadVersion: 2,
    payload,
    provenance: { kind: "sbml-import", sbmlLevel: 3, importedAt: new Date().toISOString() },
  };
}
