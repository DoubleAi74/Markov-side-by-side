#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass


WRAPPER_VERSION = "2"
MODEL_DATA_MAGIC = b"MSBNDAT1"

TOKEN_NUMBER = 0
TOKEN_STATE = 1
TOKEN_PARAM = 2
TOKEN_TIME = 3
TOKEN_ADD = 4
TOKEN_SUB = 5
TOKEN_MUL = 6
TOKEN_DIV = 7
TOKEN_POW = 8
TOKEN_NEG = 9
TOKEN_CALL_BUILTIN = 10
TOKEN_CALL_HELPER = 11

SIMULATOR_TYPES = {
    "gillespie": 0,
    "ctmp-inhomo": 1,
    "sde": 2,
}

BUILTIN_CODES = {
    "sin": (0, 1),
    "cos": (1, 1),
    "tan": (2, 1),
    "exp": (3, 1),
    "log": (4, 1),
    "sqrt": (5, 1),
    "abs": (6, 1),
    "pow": (7, 2),
    "min": (8, 2),
    "max": (9, 2),
    "floor": (10, 1),
    "ceil": (11, 1),
}

RESERVED_IDENTIFIERS = set(BUILTIN_CODES) | {"t", "time", "PI", "E", "random"}
IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class ConfigError(Exception):
    pass


def format_permission_guidance(path: Path, action: str):
    return (
        f"Permission denied while trying to {action}:\n"
        f"{path}\n\n"
        "On macOS this often means Python or your IDE is trying to access a protected "
        "folder such as Downloads, Desktop, or Documents.\n\n"
        "Try one of these:\n"
        "1. Move the extracted native bundle to a normal project folder such as "
        "~/Projects/markov-native\n"
        "2. Set CONFIG_FILE and OUTPUT_CSV to paths outside protected folders\n"
        "3. Grant Files and Folders or Full Disk Access to your IDE and Python "
        "interpreter in System Settings > Privacy & Security"
    )


def get_native_cache_roots():
    home = Path.home()
    if sys.platform == "darwin":
        base = home / "Library" / "Caches"
    elif os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA", home / "AppData" / "Local"))
    else:
        base = Path(os.environ.get("XDG_CACHE_HOME", home / ".cache"))
    roots = [base / "markov_native", Path(tempfile.gettempdir()) / "markov_native"]
    deduped = []
    seen = set()
    for root in roots:
        key = str(root)
        if key not in seen:
            deduped.append(root)
            seen.add(key)
    return deduped


def ensure_cache_subdirectory(relative_path: str, action: str):
    last_error = None
    for root in get_native_cache_roots():
        path = root / relative_path
        try:
            path.mkdir(parents=True, exist_ok=True)
            return path
        except PermissionError as error:
            last_error = error

    if last_error is not None:
        raise ConfigError(format_permission_guidance(path, action)) from last_error
    raise ConfigError(f"Could not prepare cache directory for {action}.")


@dataclass(frozen=True)
class NumberNode:
    value: float


@dataclass(frozen=True)
class SymbolNode:
    name: str


@dataclass(frozen=True)
class UnaryNode:
    op: str
    operand: object


@dataclass(frozen=True)
class BinaryNode:
    op: str
    left: object
    right: object


@dataclass(frozen=True)
class CallNode:
    name: str
    args: tuple


@dataclass(frozen=True)
class CompiledToken:
    kind: int
    index: int = 0
    aux: int = 0
    value: float = 0.0


class ExpressionParser:
    def __init__(self, text: str):
        self.tokens = self._tokenize(text)
        self.index = 0

    @staticmethod
    def _tokenize(text: str):
        tokens = []
        index = 0
        while index < len(text):
            char = text[index]
            if char.isspace():
                index += 1
                continue

            if char.isdigit() or (
                char == "."
                and index + 1 < len(text)
                and text[index + 1].isdigit()
            ):
                start = index
                index += 1
                while index < len(text) and text[index].isdigit():
                    index += 1
                if index < len(text) and text[index] == ".":
                    index += 1
                    while index < len(text) and text[index].isdigit():
                        index += 1
                if index < len(text) and text[index] in ("e", "E"):
                    exponent_index = index + 1
                    if exponent_index < len(text) and text[exponent_index] in ("+", "-"):
                        exponent_index += 1
                    if exponent_index >= len(text) or not text[exponent_index].isdigit():
                        raise ConfigError(f"Invalid number in expression '{text}'.")
                    index = exponent_index + 1
                    while index < len(text) and text[index].isdigit():
                        index += 1
                tokens.append(("NUMBER", text[start:index]))
                continue

            if char.isalpha() or char == "_":
                start = index
                index += 1
                while index < len(text) and (
                    text[index].isalnum() or text[index] == "_"
                ):
                    index += 1
                tokens.append(("IDENT", text[start:index]))
                continue

            if char in "+-*/^(),":
                tokens.append((char, char))
                index += 1
                continue

            raise ConfigError(f"Unsupported character '{char}' in expression '{text}'.")

        tokens.append(("EOF", ""))
        return tokens

    def current(self):
        return self.tokens[self.index]

    def match(self, kind: str):
        if self.current()[0] == kind:
            token = self.current()
            self.index += 1
            return token
        return None

    def expect(self, kind: str):
        token = self.match(kind)
        if token is None:
            raise ConfigError(f"Expected token '{kind}' in expression.")
        return token

    def parse(self):
        node = self.parse_additive()
        if self.current()[0] != "EOF":
            raise ConfigError("Unexpected token at end of expression.")
        return node

    def parse_additive(self):
        node = self.parse_multiplicative()
        while self.current()[0] in ("+", "-"):
            op = self.current()[0]
            self.index += 1
            rhs = self.parse_multiplicative()
            node = BinaryNode(op, node, rhs)
        return node

    def parse_multiplicative(self):
        node = self.parse_power()
        while self.current()[0] in ("*", "/"):
            op = self.current()[0]
            self.index += 1
            rhs = self.parse_power()
            node = BinaryNode(op, node, rhs)
        return node

    def parse_power(self):
        node = self.parse_unary()
        if self.current()[0] == "^":
            self.index += 1
            rhs = self.parse_power()
            node = BinaryNode("^", node, rhs)
        return node

    def parse_unary(self):
        if self.current()[0] == "+":
            self.index += 1
            return self.parse_unary()
        if self.current()[0] == "-":
            self.index += 1
            return UnaryNode("-", self.parse_unary())
        return self.parse_primary()

    def parse_primary(self):
        token_type, token_value = self.current()
        if token_type == "NUMBER":
            self.index += 1
            return NumberNode(float(token_value))

        if token_type == "IDENT":
            self.index += 1
            identifier = token_value
            if self.match("("):
                args = []
                if self.current()[0] != ")":
                    args.append(self.parse_additive())
                    while self.match(","):
                        args.append(self.parse_additive())
                self.expect(")")
                return CallNode(identifier, tuple(args))
            return SymbolNode(identifier)

        if self.match("("):
            node = self.parse_additive()
            self.expect(")")
            return node

        raise ConfigError("Expected number, identifier, or parenthesized expression.")


def parse_expression(text: str):
    text = str(text).strip()
    if not text:
        raise ConfigError("Expression cannot be empty.")
    return ExpressionParser(text).parse()


def require_object(value, context: str):
    if not isinstance(value, dict):
        raise ConfigError(f"{context} must be an object.")
    return value


def require_array(value, context: str):
    if not isinstance(value, list):
        raise ConfigError(f"{context} must be an array.")
    return value


def require_string(value, context: str):
    if not isinstance(value, str) or not value.strip():
        raise ConfigError(f"{context} must be a non-empty string.")
    return value.strip()


def require_identifier(value, context: str):
    identifier = require_string(value, context)
    if not IDENTIFIER_PATTERN.match(identifier):
        raise ConfigError(f"{context} must be a valid identifier.")
    if identifier in RESERVED_IDENTIFIERS:
        raise ConfigError(f"{context} uses a reserved identifier '{identifier}'.")
    return identifier


def require_finite_number(value, context: str):
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        raise ConfigError(f"{context} must be a finite number.")
    if not math.isfinite(numeric):
        raise ConfigError(f"{context} must be a finite number.")
    return numeric


def require_positive_integer(value, context: str):
    if isinstance(value, bool):
        raise ConfigError(f"{context} must be a positive integer.")
    try:
        numeric = int(value)
    except (TypeError, ValueError):
        raise ConfigError(f"{context} must be a positive integer.")
    if numeric <= 0:
        raise ConfigError(f"{context} must be a positive integer.")
    return numeric


def require_uint64(value, context: str):
    if isinstance(value, bool):
        raise ConfigError(f"{context} must be a uint64 decimal value.")
    try:
        numeric = int(value)
    except (TypeError, ValueError):
        raise ConfigError(f"{context} must be a uint64 decimal value.")
    if numeric < 0 or numeric > (1 << 64) - 1:
        raise ConfigError(f"{context} must be between 0 and 18446744073709551615.")
    return numeric


def normalize_expression_text(value, context: str):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if not math.isfinite(float(value)):
            raise ConfigError(f"{context} must be finite.")
        return format(float(value), ".17g")
    if isinstance(value, str) and value.strip():
        return value.strip()
    raise ConfigError(f"{context} must be a string or finite number.")


def walk_helper_calls(node, helper_names: set[str], calls: set[str]):
    if isinstance(node, CallNode):
        if node.name in helper_names:
            calls.add(node.name)
        for arg in node.args:
            walk_helper_calls(arg, helper_names, calls)
        return
    if isinstance(node, UnaryNode):
        walk_helper_calls(node.operand, helper_names, calls)
        return
    if isinstance(node, BinaryNode):
        walk_helper_calls(node.left, helper_names, calls)
        walk_helper_calls(node.right, helper_names, calls)


def ensure_acyclic_helper_graph(helper_asts: dict[str, object]):
    helper_names = set(helper_asts)
    graph = {}
    for helper_name, ast in helper_asts.items():
        calls: set[str] = set()
        walk_helper_calls(ast, helper_names, calls)
        graph[helper_name] = calls

    visiting = set()
    visited = set()

    def visit(name: str):
        if name in visited:
            return
        if name in visiting:
            raise ConfigError(f"Cyclic helper dependency detected at '{name}'.")
        visiting.add(name)
        for dependency in graph[name]:
            visit(dependency)
        visiting.remove(name)
        visited.add(name)

    for helper_name in graph:
        visit(helper_name)


def compile_ast(node, *, variable_index, parameter_index, helper_index, allow_state):
    if isinstance(node, NumberNode):
        return [CompiledToken(TOKEN_NUMBER, value=node.value)]

    if isinstance(node, SymbolNode):
        if node.name in ("t", "time"):
            return [CompiledToken(TOKEN_TIME)]
        if node.name == "PI":
            return [CompiledToken(TOKEN_NUMBER, value=math.pi)]
        if node.name == "E":
            return [CompiledToken(TOKEN_NUMBER, value=math.e)]
        if allow_state and node.name in variable_index:
            return [CompiledToken(TOKEN_STATE, index=variable_index[node.name])]
        if node.name in parameter_index:
            return [CompiledToken(TOKEN_PARAM, index=parameter_index[node.name])]
        if node.name in helper_index:
            raise ConfigError(
                f"Helper '{node.name}' must be called with parentheses."
            )
        raise ConfigError(f"Unknown symbol '{node.name}'.")

    if isinstance(node, UnaryNode):
        if node.op != "-":
            raise ConfigError(f"Unsupported unary operator '{node.op}'.")
        tokens = compile_ast(
            node.operand,
            variable_index=variable_index,
            parameter_index=parameter_index,
            helper_index=helper_index,
            allow_state=allow_state,
        )
        tokens.append(CompiledToken(TOKEN_NEG))
        return tokens

    if isinstance(node, BinaryNode):
        tokens = compile_ast(
            node.left,
            variable_index=variable_index,
            parameter_index=parameter_index,
            helper_index=helper_index,
            allow_state=allow_state,
        )
        tokens.extend(
            compile_ast(
                node.right,
                variable_index=variable_index,
                parameter_index=parameter_index,
                helper_index=helper_index,
                allow_state=allow_state,
            )
        )
        if node.op == "+":
            tokens.append(CompiledToken(TOKEN_ADD))
        elif node.op == "-":
            tokens.append(CompiledToken(TOKEN_SUB))
        elif node.op == "*":
            tokens.append(CompiledToken(TOKEN_MUL))
        elif node.op == "/":
            tokens.append(CompiledToken(TOKEN_DIV))
        elif node.op == "^":
            tokens.append(CompiledToken(TOKEN_POW))
        else:
            raise ConfigError(f"Unsupported operator '{node.op}'.")
        return tokens

    if isinstance(node, CallNode):
        if node.name == "random":
            raise ConfigError("random() is not supported by the native runner.")
        if node.name in BUILTIN_CODES:
            builtin_code, arity = BUILTIN_CODES[node.name]
            if len(node.args) != arity:
                raise ConfigError(
                    f"Function '{node.name}' expects {arity} arguments."
                )
            tokens = []
            for argument in node.args:
                tokens.extend(
                    compile_ast(
                        argument,
                        variable_index=variable_index,
                        parameter_index=parameter_index,
                        helper_index=helper_index,
                        allow_state=allow_state,
                    )
                )
            tokens.append(
                CompiledToken(
                    TOKEN_CALL_BUILTIN,
                    index=builtin_code,
                    aux=arity,
                )
            )
            return tokens
        if node.name in helper_index:
            if len(node.args) != 1:
                raise ConfigError(
                    f"Helper '{node.name}' expects exactly one argument."
                )
            tokens = compile_ast(
                node.args[0],
                variable_index=variable_index,
                parameter_index=parameter_index,
                helper_index=helper_index,
                allow_state=allow_state,
            )
            tokens.append(
                CompiledToken(
                    TOKEN_CALL_HELPER,
                    index=helper_index[node.name],
                    aux=1,
                )
            )
            return tokens
        raise ConfigError(f"Unknown function '{node.name}'.")

    raise ConfigError("Unsupported expression node.")


def normalize_base_config(config):
    config = require_object(config, "Config")
    if config.get("format") not in {"markov-lab/native-config", "markov-side-by-side/model-config"}:
        raise ConfigError("Config format is not supported.")
    expected_version = 2 if config.get("format") == "markov-lab/native-config" else 1
    if int(config.get("formatVersion")) != expected_version:
        raise ConfigError(f"Config formatVersion must be {expected_version}.")

    simulator_type = require_string(config.get("simulatorType"), "simulatorType")
    if simulator_type not in SIMULATOR_TYPES:
        raise ConfigError("Unsupported simulatorType.")

    model = require_object(config.get("model"), "model")
    run = require_object(config.get("run"), "run")

    run_config = {
        "num_simulations": require_positive_integer(
            run.get("numSimulations"), "run.numSimulations"
        ),
        "seed": require_uint64(run.get("seed"), "run.seed"),
        "csv_filename": require_string(
            require_object(run.get("csv"), "run.csv").get("filename"),
            "run.csv.filename",
        ),
        "include_header": bool(
            require_object(run.get("csv"), "run.csv").get("includeHeader", True)
        ),
    }

    base = {
        "name": require_string(config.get("name"), "name"),
        "simulator_type": simulator_type,
        "simulator_code": SIMULATOR_TYPES[simulator_type],
        "model": model,
        "run": run_config,
    }
    return base


def normalize_discrete_model(base_config, with_helpers: bool):
    model = base_config["model"]
    variables = []
    variable_index = {}
    for index, item in enumerate(require_array(model.get("variables"), "model.variables")):
        item = require_object(item, f"model.variables[{index}]")
        name = require_identifier(item.get("name"), f"model.variables[{index}].name")
        if name in variable_index:
            raise ConfigError(f"Duplicate variable name '{name}'.")
        variable_index[name] = index
        variables.append(
            {
                "name": name,
                "initial": require_finite_number(
                    item.get("initial"),
                    f"model.variables[{index}].initial",
                ),
            }
        )
    if not variables:
        raise ConfigError("model.variables must contain at least one variable.")

    parameters = []
    parameter_index = {}
    for index, item in enumerate(
        require_array(model.get("parameters"), "model.parameters")
    ):
        item = require_object(item, f"model.parameters[{index}]")
        name = require_identifier(item.get("name"), f"model.parameters[{index}].name")
        if name in parameter_index or name in variable_index:
            raise ConfigError(f"Duplicate parameter name '{name}'.")
        parameter_index[name] = index
        parameters.append(
            {
                "name": name,
                "value": require_finite_number(
                    item.get("value"),
                    f"model.parameters[{index}].value",
                ),
            }
        )

    helpers = []
    helper_index = {}
    helper_asts = {}
    if with_helpers:
        for index, item in enumerate(require_array(model.get("helpers", []), "model.helpers")):
            item = require_object(item, f"model.helpers[{index}]")
            name = require_identifier(item.get("name"), f"model.helpers[{index}].name")
            if name in helper_index or name in variable_index or name in parameter_index:
                raise ConfigError(f"Duplicate helper name '{name}'.")
            helper_index[name] = index
            expression = normalize_expression_text(
                item.get("expression"),
                f"model.helpers[{index}].expression",
            )
            ast = parse_expression(expression)
            helper_asts[name] = ast
            helpers.append({"name": name, "expression": expression, "ast": ast})
        ensure_acyclic_helper_graph(helper_asts)

    transitions = []
    for index, item in enumerate(
        require_array(model.get("transitions"), "model.transitions")
    ):
        item = require_object(item, f"model.transitions[{index}]")
        rate = normalize_expression_text(item.get("rate"), f"model.transitions[{index}].rate")
        change = require_object(item.get("change"), f"model.transitions[{index}].change")
        transitions.append(
            {
                "rate_ast": parse_expression(rate),
                "change_asts": [
                    parse_expression(
                        normalize_expression_text(
                            change.get(variable["name"], "0"),
                            f"model.transitions[{index}].change.{variable['name']}",
                        )
                    )
                    for variable in variables
                ],
            }
        )
    if not transitions:
        raise ConfigError("model.transitions must contain at least one transition.")

    time_config = require_object(model.get("time"), "model.time")
    t_max = require_finite_number(time_config.get("tMax"), "model.time.tMax")
    if t_max <= 0:
        raise ConfigError("model.time.tMax must be greater than 0.")

    dt = None
    if with_helpers:
        dt = require_finite_number(time_config.get("dt"), "model.time.dt")
        if dt <= 0:
            raise ConfigError("model.time.dt must be greater than 0.")

    return {
        **base_config,
        "variables": variables,
        "parameters": parameters,
        "helpers": helpers,
        "variable_index": variable_index,
        "parameter_index": parameter_index,
        "helper_index": helper_index,
        "transitions": transitions,
        "t_max": t_max,
        "dt": dt,
    }


def normalize_sde_model(base_config):
    model = base_config["model"]

    parameters = []
    parameter_index = {}
    for index, item in enumerate(
        require_array(model.get("parameters"), "model.parameters")
    ):
        item = require_object(item, f"model.parameters[{index}]")
        name = require_identifier(item.get("name"), f"model.parameters[{index}].name")
        if name in parameter_index:
            raise ConfigError(f"Duplicate parameter name '{name}'.")
        parameter_index[name] = index
        parameters.append(
            {
                "name": name,
                "value": require_finite_number(
                    item.get("value"),
                    f"model.parameters[{index}].value",
                ),
            }
        )

    components = []
    variable_index = {}
    for index, item in enumerate(
        require_array(model.get("components"), "model.components")
    ):
        item = require_object(item, f"model.components[{index}]")
        name = require_identifier(item.get("name"), f"model.components[{index}].name")
        if name in variable_index or name in parameter_index:
            raise ConfigError(f"Duplicate component name '{name}'.")
        variable_index[name] = index
        components.append(
            {
                "name": name,
                "initial": require_finite_number(
                    item.get("initial"),
                    f"model.components[{index}].initial",
                ),
                "drift_ast": parse_expression(
                    normalize_expression_text(
                        item.get("drift"),
                        f"model.components[{index}].drift",
                    )
                ),
                "diff_ast": parse_expression(
                    normalize_expression_text(
                        item.get("diffusion"),
                        f"model.components[{index}].diffusion",
                    )
                ),
            }
        )
    if not components:
        raise ConfigError("model.components must contain at least one component.")

    time_config = require_object(model.get("time"), "model.time")
    t_max = require_finite_number(time_config.get("tMax"), "model.time.tMax")
    dt = require_finite_number(time_config.get("dt"), "model.time.dt")
    if t_max <= 0:
        raise ConfigError("model.time.tMax must be greater than 0.")
    if dt <= 0:
        raise ConfigError("model.time.dt must be greater than 0.")

    return {
        **base_config,
        "variables": components,
        "components": components,
        "parameters": parameters,
        "helpers": [],
        "variable_index": variable_index,
        "parameter_index": parameter_index,
        "helper_index": {},
        "t_max": t_max,
        "dt": dt,
    }


def normalize_config(config):
    base = normalize_base_config(config)
    if base["simulator_type"] == "gillespie":
        return normalize_discrete_model(base, with_helpers=False)
    if base["simulator_type"] == "ctmp-inhomo":
        return normalize_discrete_model(base, with_helpers=True)
    if base["simulator_type"] == "sde":
        return normalize_sde_model(base)
    raise ConfigError("Unsupported simulator type.")


def build_compiled_model(normalized_config):
    variable_index = normalized_config["variable_index"]
    parameter_index = normalized_config["parameter_index"]
    helper_index = normalized_config["helper_index"]

    all_tokens = []

    def add_expression(tokens):
        offset = len(all_tokens)
        all_tokens.extend(tokens)
        return (offset, len(tokens))

    helper_refs = []
    for helper in normalized_config["helpers"]:
        helper_refs.append(
            add_expression(
                compile_ast(
                    helper["ast"],
                    variable_index=variable_index,
                    parameter_index=parameter_index,
                    helper_index=helper_index,
                    # Canonical helpers share the same symbol environment as
                    # transition expressions. The C++ VM receives the current
                    # state when it evaluates a helper, so retaining state
                    # references here keeps native and browser semantics equal.
                    allow_state=True,
                )
            )
        )

    rate_refs = []
    change_refs = []
    drift_refs = []
    diffusion_refs = []

    if normalized_config["simulator_type"] in ("gillespie", "ctmp-inhomo"):
        for transition in normalized_config["transitions"]:
            rate_refs.append(
                add_expression(
                    compile_ast(
                        transition["rate_ast"],
                        variable_index=variable_index,
                        parameter_index=parameter_index,
                        helper_index=helper_index,
                        allow_state=True,
                    )
                )
            )
            for change_ast in transition["change_asts"]:
                change_refs.append(
                    add_expression(
                        compile_ast(
                            change_ast,
                            variable_index=variable_index,
                            parameter_index=parameter_index,
                            helper_index=helper_index,
                            allow_state=True,
                        )
                    )
                )

    if normalized_config["simulator_type"] == "sde":
        for component in normalized_config["components"]:
            drift_refs.append(
                add_expression(
                    compile_ast(
                        component["drift_ast"],
                        variable_index=variable_index,
                        parameter_index=parameter_index,
                        helper_index=helper_index,
                        allow_state=True,
                    )
                )
            )
            diffusion_refs.append(
                add_expression(
                    compile_ast(
                        component["diff_ast"],
                        variable_index=variable_index,
                        parameter_index=parameter_index,
                        helper_index=helper_index,
                        allow_state=True,
                    )
                )
            )

    return {
        "normalized": normalized_config,
        "tokens": all_tokens,
        "helper_refs": helper_refs,
        "rate_refs": rate_refs,
        "change_refs": change_refs,
        "drift_refs": drift_refs,
        "diffusion_refs": diffusion_refs,
    }


def pack_string(value: str):
    encoded = str(value).encode("utf-8")
    return struct.pack("<I", len(encoded)) + encoded


def pack_string_array(values):
    payload = [struct.pack("<I", len(values))]
    for value in values:
        payload.append(pack_string(value))
    return b"".join(payload)


def pack_double_array(values):
    payload = [struct.pack("<I", len(values))]
    for value in values:
        payload.append(struct.pack("<d", float(value)))
    return b"".join(payload)


def pack_token_array(tokens):
    payload = [struct.pack("<I", len(tokens))]
    for token in tokens:
        payload.append(
            struct.pack(
                "<iiid",
                int(token.kind),
                int(token.index),
                int(token.aux),
                float(token.value),
            )
        )
    return b"".join(payload)


def pack_expr_ref_array(refs):
    payload = [struct.pack("<I", len(refs))]
    for offset, count in refs:
        payload.append(struct.pack("<ii", int(offset), int(count)))
    return b"".join(payload)


def serialize_compiled_model(compiled_model):
    normalized = compiled_model["normalized"]
    variables = normalized["variables"]
    parameters = normalized["parameters"]
    run_config = normalized["run"]

    payload = [
        MODEL_DATA_MAGIC,
        struct.pack("<I", int(normalized["simulator_code"])),
        struct.pack("<?", bool(run_config["include_header"])),
        struct.pack("<d", float(normalized["t_max"])),
        struct.pack("<d", float(normalized["dt"] or 0.0)),
        pack_string_array([variable["name"] for variable in variables]),
        pack_double_array([variable["initial"] for variable in variables]),
        pack_double_array([parameter["value"] for parameter in parameters]),
        pack_token_array(compiled_model["tokens"]),
        pack_expr_ref_array(compiled_model["helper_refs"]),
        pack_expr_ref_array(compiled_model["rate_refs"]),
        pack_expr_ref_array(compiled_model["change_refs"]),
        pack_expr_ref_array(compiled_model["drift_refs"]),
        pack_expr_ref_array(compiled_model["diffusion_refs"]),
    ]
    return b"".join(payload)


def choose_compiler(requested: str | None):
    if requested:
        if shutil.which(requested):
            return requested
        raise ConfigError(f"Requested compiler '{requested}' was not found.")

    for compiler in ("clang++", "g++"):
        if shutil.which(compiler):
            return compiler

    raise ConfigError("No supported C++ compiler was found on PATH.")


def build_artifact_directory(compiler: str):
    cpp_source = (Path(__file__).resolve().parent / "markov_native_runner.cpp").read_text(
        encoding="utf-8"
    )
    fingerprint = hashlib.sha256()
    fingerprint.update(cpp_source.encode("utf-8"))
    fingerprint.update(compiler.encode("utf-8"))
    fingerprint.update(WRAPPER_VERSION.encode("utf-8"))
    artifact_name = fingerprint.hexdigest()[:16]
    cache_root = ensure_cache_subdirectory("build", "create the native build cache")
    artifact_dir = cache_root / artifact_name
    artifact_dir.mkdir(parents=True, exist_ok=True)
    return artifact_dir


def build_model_data_path(model_data_bytes: bytes):
    fingerprint = hashlib.sha256()
    fingerprint.update(model_data_bytes)
    fingerprint.update(WRAPPER_VERSION.encode("utf-8"))
    artifact_name = fingerprint.hexdigest()[:16]
    artifact_dir = ensure_cache_subdirectory("models", "create the compiled model cache")
    return artifact_dir / f"{artifact_name}.bin"


def ensure_model_data_file(model_data_bytes: bytes):
    model_data_path = build_model_data_path(model_data_bytes)
    if not model_data_path.exists():
        model_data_path.write_bytes(model_data_bytes)
    return model_data_path


def acquire_compile_lock(lock_path: Path, binary_path: Path):
    while True:
        try:
            handle = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(handle, str(os.getpid()).encode("utf-8"))
            os.close(handle)
            return True
        except FileExistsError:
            if binary_path.exists():
                return False
            time.sleep(0.2)


def ensure_compiled_binary(compiler: str):
    artifact_dir = build_artifact_directory(compiler)
    binary_name = "markov_native_runner.exe" if os.name == "nt" else "markov_native_runner"
    binary_path = artifact_dir / binary_name
    lock_path = artifact_dir / "compile.lock"

    if binary_path.exists():
        print(f"Using cached native runner binary: {binary_path}", flush=True)
        return binary_path

    should_compile = acquire_compile_lock(lock_path, binary_path)
    if not should_compile:
        print(f"Using cached native runner binary: {binary_path}", flush=True)
        return binary_path

    cpp_path = Path(__file__).resolve().parent / "markov_native_runner.cpp"
    compile_command = [
        compiler,
        "-std=c++17",
        "-O3",
        "-DNDEBUG",
        "-pthread",
        str(cpp_path),
        "-o",
        str(binary_path),
    ]

    print(f"Compiling native runner binary: {binary_path}", flush=True)

    try:
        subprocess.run(
            compile_command,
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as error:
        stderr = error.stderr.strip()
        stdout = error.stdout.strip()
        details = stderr or stdout or "Unknown compiler error."
        raise ConfigError(f"Native compilation failed.\n{details}") from error
    finally:
        try:
            lock_path.unlink(missing_ok=True)
        except OSError:
            pass

    print("Native runner compilation complete.", flush=True)
    return binary_path


def parse_recorded_runs_arg(value: str | None, total_runs: int):
    if value is None:
        return None

    text = str(value).strip()
    if not text:
        return []

    recorded_runs = []
    seen = set()
    for chunk in text.split(","):
        chunk = chunk.strip()
        if not chunk:
            raise ConfigError("--record-runs must be a comma-separated list of run indexes.")
        try:
            run_index = int(chunk)
        except ValueError as error:
            raise ConfigError("--record-runs must contain integers only.") from error
        if run_index < 0:
            raise ConfigError("--record-runs cannot contain negative indexes.")
        if run_index >= total_runs:
            raise ConfigError(
                f"--record-runs contains {run_index}, but runs are indexed from 0 to {total_runs - 1}."
            )
        if run_index not in seen:
            recorded_runs.append(run_index)
            seen.add(run_index)

    recorded_runs.sort()
    return recorded_runs


def run_native_binary(
    binary_path: Path,
    *,
    model_data_path: Path,
    output_path: Path,
    runs: int,
    seed: int,
    threads: int | None,
    recorded_runs: list[int] | None = None,
):
    command = [
        str(binary_path),
        "--model-data",
        str(model_data_path),
        "--output",
        str(output_path),
        "--runs",
        str(runs),
        "--seed",
        str(seed),
    ]
    if threads is not None:
        command.extend(["--threads", str(threads)])
    if recorded_runs is not None:
        command.extend(
            ["--record-runs", ",".join(str(run_index) for run_index in recorded_runs)]
        )

    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as error:
        stderr = error.stderr.strip()
        stdout = error.stdout.strip()
        details = stderr or stdout or "Unknown runtime error."
        raise ConfigError(f"Native execution failed.\n{details}") from error


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Compile and run the Markov Lab native runner."
    )
    parser.add_argument("--config", required=True, help="Path to exported model JSON.")
    parser.add_argument("--output", help="CSV output path.")
    parser.add_argument("--compiler", help="Compiler override, e.g. clang++ or g++.")
    parser.add_argument("--threads", type=int, help="Thread count override.")
    parser.add_argument("--seed", type=int, help="Seed override.")
    parser.add_argument("--runs", type=int, help="Simulation count override.")
    parser.add_argument(
        "--record-runs",
        help="Optional comma-separated run indexes to record to CSV, e.g. 0,1,2",
    )
    args = parser.parse_args(argv)

    try:
        started_at = time.perf_counter()
        config_path = Path(args.config).expanduser().resolve()
        try:
            config = json.loads(config_path.read_text(encoding="utf-8"))
        except PermissionError as error:
            raise ConfigError(
                format_permission_guidance(config_path, "read the JSON config")
            ) from error
        normalized = normalize_config(config)
        runtime_runs = args.runs if args.runs is not None else normalized["run"]["num_simulations"]
        runtime_seed = args.seed if args.seed is not None else normalized["run"]["seed"]
        recorded_runs = parse_recorded_runs_arg(args.record_runs, runtime_runs)

        if args.threads is not None and args.threads <= 0:
            raise ConfigError("--threads must be a positive integer.")
        runtime_seed = require_uint64(runtime_seed, "--seed")
        if runtime_runs <= 0:
            raise ConfigError("--runs must be a positive integer.")

        if args.output:
            output_path = Path(args.output).expanduser().resolve()
        else:
            output_path = (config_path.parent / normalized["run"]["csv_filename"]).resolve()
        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
        except PermissionError as error:
            raise ConfigError(
                format_permission_guidance(output_path.parent, "create the output folder")
            ) from error

        print("Preparing compiled model data...")
        compiled_model = build_compiled_model(normalized)
        model_data_bytes = serialize_compiled_model(compiled_model)
        model_data_path = ensure_model_data_file(model_data_bytes)
        compiler = choose_compiler(args.compiler)
        binary_path = ensure_compiled_binary(compiler)

        run_native_binary(
            binary_path,
            model_data_path=model_data_path,
            output_path=output_path,
            runs=runtime_runs,
            seed=runtime_seed,
            threads=args.threads,
            recorded_runs=recorded_runs,
        )

        print(f"CSV written to {output_path}")
        print(f"Native run completed in {time.perf_counter() - started_at:.2f}s")
    except ConfigError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    except FileNotFoundError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as error:
        print(f"Error: Invalid JSON config. {error}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
