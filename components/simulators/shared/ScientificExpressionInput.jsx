"use client";

import { useId, useMemo } from "react";

const BUILT_INS = [
  "t", "PI", "E", "abs", "sqrt", "exp", "log", "sin", "cos", "tan",
  "asin", "acos", "atan", "sinh", "cosh", "tanh", "floor", "ceil",
  "round", "min", "max", "pow",
];

function equationText(value) {
  return String(value || "")
    .replace(/\*/g, " × ")
    .replace(/\//g, " ÷ ")
    .replace(/\s+/g, " ")
    .trim();
}
/** Safe expression input with discoverable symbols and a text equation preview. */
export default function ScientificExpressionInput({
  value,
  onChange,
  symbols = [],
  label,
  placeholder,
  className = "",
  showPreview = false,
}) {
  const generatedId = useId();
  const listId = `expression-symbols-${generatedId.replace(/:/g, "")}`;
  const suggestions = useMemo(
    () => [...new Set([...symbols, ...BUILT_INS].map(String).filter(Boolean))],
    [symbols],
  );
  const preview = equationText(value);

  return (
    <div className="scientific-expression-field">
      <label className="sr-only" htmlFor={`${listId}-input`}>{label}</label>
      <input
        id={`${listId}-input`}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        list={listId}
        autoComplete="off"
        spellCheck={false}
        className={className}
        placeholder={placeholder}
        aria-describedby={showPreview && preview ? `${listId}-preview` : undefined}
      />
      <datalist id={listId}>
        {suggestions.map((symbol) => <option key={symbol} value={symbol} />)}
      </datalist>
      {showPreview && preview && (
        <output id={`${listId}-preview`} className="equation-preview" aria-label={`${label} equation preview`}>
          <span aria-hidden="true">ƒ</span> {preview}
        </output>
      )}
    </div>
  );
}
