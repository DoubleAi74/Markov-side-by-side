"use client";

import { useRef, useState } from "react";

export default function ExpressionListSection({
  title,
  helperText,
  rows,
  onUpdateRow,
  onInsertRowAfter,
  onRemoveRow,
  extraHint,
  placeholder = "",
  minRows = 1,
  showRowColor = false,
  colorForRow = null,
}) {
  const [focusedId, setFocusedId] = useState(null);
  const inputRefs = useRef({});

  const focusRow = (id) => {
    if (!id) return;
    requestAnimationFrame(() => {
      inputRefs.current[id]?.focus();
    });
  };

  const insertAfter = (id) => {
    const nextId = onInsertRowAfter(id);
    focusRow(nextId);
  };

  const remove = (id, index) => {
    if (rows.length <= minRows) {
      onUpdateRow(id, "");
      return;
    }

    const prevId = index > 0 ? rows[index - 1].id : rows[1]?.id;
    onRemoveRow(id);
    focusRow(prevId);
  };

  return (
    <section className="border-b border-slate-300">
      <div className="px-3 py-2 bg-slate-200 border-b border-slate-300">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
          {title}
        </div>
        {helperText && <p className="text-[11px] text-slate-500 mt-0.5">{helperText}</p>}
        {extraHint}
      </div>

      <div className="bg-slate-100">
        {rows.map((row, index) => {
          const active = focusedId === row.id;
          return (
            <div
              key={row.id}
              className={`grid grid-cols-[48px_1fr_36px] items-stretch border-b border-slate-300 ${
                active ? "bg-white" : "bg-slate-100"
              }`}
            >
              <div className="relative flex items-center justify-center border-r border-slate-300">
                {showRowColor && (
                  <span
                    className="absolute left-1 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full"
                    style={{ backgroundColor: colorForRow ? colorForRow(index) : "#64748b" }}
                  />
                )}
                <span className="text-xs text-slate-500">{index + 1}</span>
              </div>

              <input
                ref={(node) => {
                  inputRefs.current[row.id] = node;
                }}
                type="text"
                value={row.text}
                placeholder={index === 0 ? placeholder : ""}
                spellCheck={false}
                onFocus={() => setFocusedId(row.id)}
                onBlur={() => setFocusedId((current) => (current === row.id ? null : current))}
                onChange={(event) => onUpdateRow(row.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    insertAfter(row.id);
                    return;
                  }

                  if (event.key === "Backspace" && row.text.length === 0) {
                    event.preventDefault();
                    remove(row.id, index);
                  }
                }}
                className={`w-full px-3 py-2 bg-transparent code-input text-[15px] text-slate-800 outline-none ${
                  active ? "ring-1 ring-inset ring-blue-500" : ""
                }`}
              />

              <button
                type="button"
                onClick={() => remove(row.id, index)}
                className="text-slate-400 hover:text-red-500 text-sm border-l border-slate-300"
                aria-label="Delete row"
              >
                x
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => insertAfter(rows[rows.length - 1]?.id)}
          className="w-full text-left px-4 py-2 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition"
        >
          + Add row
        </button>
      </div>
    </section>
  );
}
