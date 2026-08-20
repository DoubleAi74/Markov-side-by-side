"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";

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
  mode = "expert",
  metadataEnabled = false,
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
      onUpdateRow(id, "", { noteEnabled: false, noteLabel: "" });
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
        {helperText && (
          <p className="text-[11px] text-slate-500 mt-0.5">{helperText}</p>
        )}
        {extraHint}
      </div>

      <div className="bg-slate-100">
        {rows.map((row, index) => {
          const active = focusedId === row.id;
          const rowNoteEnabled = Boolean(row.noteEnabled);
          const rowNoteLabel = row.noteLabel ?? "";
          const equalsIndex = row.text.indexOf("=");
          const guidedName = (equalsIndex >= 0 ? row.text.slice(0, equalsIndex) : row.text).trim();
          const guidedValue = (equalsIndex >= 0 ? row.text.slice(equalsIndex + 1) : "").trim();
          const updateGuidedPart = (part, value) => {
            const nextName = part === "name" ? value : guidedName;
            const nextValue = part === "value" ? value : guidedValue;
            onUpdateRow(row.id, `${nextName} = ${nextValue}`);
          };

          const toggleRowLabel = () => {
            onUpdateRow(row.id, row.text, { noteEnabled: !rowNoteEnabled });
          };

          return (
            <div
              key={row.id}
              className={`grid grid-cols-[48px_1fr_36px] items-stretch border-b border-slate-300 ${
                active ? "bg-white" : "bg-slate-100"
              }`}
            >
              <div className="relative border-r border-slate-300">
                {showRowColor && (
                  <span
                    className="absolute left-1 top-1/2 -translate-y-1/2 h-6 w-[10px] rounded-[4px]"
                    style={{
                      backgroundColor: colorForRow
                        ? colorForRow(index)
                        : "#64748b",
                    }}
                  />
                )}
                <button
                  type="button"
                  onClick={toggleRowLabel}
                  aria-label="Toggle row label"
                  aria-pressed={rowNoteEnabled}
                  className={`absolute right-1 top-1 p-0.5 rounded transition ${
                    rowNoteEnabled
                      ? "text-slate-600"
                      : "text-slate-300 hover:text-slate-500"
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="size-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                    />
                  </svg>
                </button>
              </div>

              <div
                className={`relative w-full px-2.5 py-1.5 overflow-hidden flex flex-col ${
                  active ? "bg-white" : "bg-slate-50"
                }`}
              >
                {rowNoteEnabled && (
                  <div className="absolute right-2 top-1 z-10 flex justify-end pointer-events-auto">
                    <input
                      type="text"
                      value={rowNoteLabel}
                      size={Math.max(rowNoteLabel.length * 1.5, 10)}
                      onChange={(event) =>
                        onUpdateRow(row.id, row.text, {
                          noteLabel: event.target.value,
                        })
                      }
                      spellCheck={false}
                      className="
                        max-w-full
                        px-1 py-0
                        text-[13px]
                        text-slate-500
                        border-none
                        focus:outline-none
                        placeholder:text-[13px]
                        placeholder:text-slate-400
                        placeholder:bg-zinc-100
                        placeholder:italic
                        text-right
                        font-semibold
                        bg-transparent
                      "
                      placeholder="Add Label &nbsp;"
                    />
                  </div>
                )}

                {mode === "guided" ? (
                  <div className="guided-editor">
                  <div className="guided-fields">
                    <label>
                      <span>Name</span>
                      <input
                        ref={(node) => { inputRefs.current[row.id] = node; }}
                        type="text"
                        value={guidedName}
                        placeholder={index === 0 ? placeholder.split("=")[0]?.trim() : ""}
                        spellCheck={false}
                        onFocus={() => setFocusedId(row.id)}
                        onChange={(event) => updateGuidedPart("name", event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Value</span>
                      <input
                        type="text"
                        value={guidedValue}
                        placeholder={index === 0 ? placeholder.split("=")[1]?.trim() : ""}
                        inputMode="decimal"
                        spellCheck={false}
                        onFocus={() => setFocusedId(row.id)}
                        onBlur={() => setFocusedId(null)}
                        onChange={(event) => updateGuidedPart("value", event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            insertAfter(row.id);
                          }
                        }}
                      />
                    </label>
                  </div>
                  {metadataEnabled && (
                    <details className="guided-metadata">
                      <summary>Metadata and manual control</summary>
                      <div>
                        <label><span>Unit</span><input type="text" value={row.unit ?? ""} onChange={(event) => onUpdateRow(row.id, row.text, { unit: event.target.value })} placeholder="e.g. cells" /></label>
                        <label><span>Description</span><input type="text" value={row.description ?? ""} onChange={(event) => onUpdateRow(row.id, row.text, { description: event.target.value })} placeholder="Scientific meaning" /></label>
                      </div>
                      <label className="slider-toggle"><input type="checkbox" checked={Boolean(row.slider)} onChange={(event) => onUpdateRow(row.id, row.text, { slider: event.target.checked ? { min: 0, max: Math.max(1, Number(guidedValue) * 2 || 1), step: 0.1 } : null })} /> Enable manual slider (does not autorun)</label>
                      {row.slider && <div className="slider-settings"><label><span>Min</span><input type="number" value={row.slider.min} onChange={(event) => onUpdateRow(row.id, row.text, { slider: { ...row.slider, min: Number(event.target.value) } })} /></label><input aria-label={`Manual value for ${guidedName || `row ${index + 1}`}`} type="range" min={row.slider.min} max={row.slider.max} step={row.slider.step} value={Number(guidedValue) || 0} onChange={(event) => updateGuidedPart("value", event.target.value)} /><label><span>Max</span><input type="number" value={row.slider.max} onChange={(event) => onUpdateRow(row.id, row.text, { slider: { ...row.slider, max: Number(event.target.value) } })} /></label><label><span>Step</span><input type="number" min="0" value={row.slider.step} onChange={(event) => onUpdateRow(row.id, row.text, { slider: { ...row.slider, step: Number(event.target.value) } })} /></label></div>}
                    </details>
                  )}
                  </div>
                ) : (
                <input
                  ref={(node) => {
                    inputRefs.current[row.id] = node;
                  }}
                  type="text"
                  value={row.text}
                  placeholder={index === 0 ? placeholder : ""}
                  spellCheck={false}
                  onFocus={() => setFocusedId(row.id)}
                  onBlur={() =>
                    setFocusedId((current) =>
                      current === row.id ? null : current,
                    )
                  }
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
                  className="w-full px-1 py-1.5   text-[15px] text-slate-900 outline-none focus:outline-none placeholder:text-slate-400"
                />
                )}
              </div>

              <button
                type="button"
                onClick={() => remove(row.id, index)}
                className="text-slate-400 hover:text-red-500 text-sm border-l border-slate-300 justify-center items-center flex "
                aria-label="Delete row"
              >
                <X className="h-4 w-4" />
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
