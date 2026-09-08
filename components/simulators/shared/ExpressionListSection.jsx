"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import NumericSlider from "./NumericSlider";
import VariableColorInput from "./VariableColorInput";
import {
  defaultSliderConfig,
  parseNumericAssignment,
  replaceAssignmentValue,
} from "@/lib/numeric-sliders";

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
  allowSliders = false,
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
      onUpdateRow(id, "", {
        noteEnabled: false,
        noteLabel: "",
        slider: undefined,
      });
      return;
    }

    const prevId = index > 0 ? rows[index - 1].id : rows[1]?.id;
    onRemoveRow(id);
    focusRow(prevId);
  };

  return (
    <section className="border-b border-slate-400">
      <div className="px-3 py-2 bg-slate-200 border-b border-slate-400">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-800">
          {title}
        </div>
        {helperText && (
          <p className="text-[11px] text-slate-600 mt-0.5">{helperText}</p>
        )}
        {extraHint}
      </div>

      <div className="bg-slate-100">
        {rows.map((row, index) => {
          const active = focusedId === row.id;
          const rowNoteEnabled = Boolean(row.noteEnabled);
          const rowNoteLabel = row.noteLabel ?? "";
          const assignment = allowSliders
            ? parseNumericAssignment(row.text)
            : null;
          const sliderEnabled = Boolean(row.slider?.enabled);

          const toggleRowLabel = () => {
            onUpdateRow(row.id, row.text, { noteEnabled: !rowNoteEnabled });
          };

          return (
            <div
              key={row.id}
              className={`grid grid-cols-[48px_minmax(0,1fr)_36px] items-stretch border-b border-slate-400 ${
                active ? "bg-white" : "bg-slate-100"
              }`}
            >
              <div className="relative border-r border-slate-400">
                {showRowColor && (
                  <VariableColorInput
                    className="w-[10px]"
                    label={row.text.split("=")[0].trim() || `variable ${index + 1}`}
                    color={row.color ?? colorForRow?.(index) ?? "#64748b"}
                    onChange={(color) => onUpdateRow(row.id, row.text, { color })}
                  />
                )}
                <button
                  type="button"
                  onClick={toggleRowLabel}
                  aria-label="Toggle row label"
                  aria-pressed={rowNoteEnabled}
                  className={`absolute right-1 top-1 p-0.5 rounded transition ${
                    rowNoteEnabled
                      ? "text-slate-700"
                      : "text-slate-400 hover:text-slate-600"
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
                {allowSliders && (
                  <button
                    type="button"
                    aria-label={`Toggle slider for ${assignment?.name ?? `${title} row ${index + 1}`}`}
                    aria-pressed={sliderEnabled}
                    title={
                      !assignment && !sliderEnabled
                        ? "Enter name = number to use a slider"
                        : sliderEnabled
                          ? "Hide slider"
                          : "Show slider"
                    }
                    disabled={!assignment && !sliderEnabled}
                    onClick={() =>
                      onUpdateRow(row.id, row.text, {
                        slider: {
                          ...(row.slider ??
                            defaultSliderConfig(assignment?.value ?? 0)),
                          enabled: !sliderEnabled,
                        },
                      })
                    }
                    className={`absolute right-1 top-6 rounded p-0.5 transition focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-40 ${sliderEnabled ? "bg-blue-100 text-blue-700" : "text-slate-400 hover:text-slate-600"}`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="size-4"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" d="M3 7h18M3 17h18" />
                      <circle
                        cx={sliderEnabled ? 16 : 8}
                        cy="7"
                        r="3"
                        fill={sliderEnabled ? "#dbeafe" : "#f1f5f9"}
                      />
                      <circle
                        cx={sliderEnabled ? 8 : 16}
                        cy="17"
                        r="3"
                        fill={sliderEnabled ? "#dbeafe" : "#f1f5f9"}
                      />
                    </svg>
                  </button>
                )}
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

                <input
                  ref={(node) => {
                    inputRefs.current[row.id] = node;
                  }}
                  type="text"
                  value={row.text}
                  aria-label={`${title} row ${index + 1}`}
                  placeholder={index === 0 ? placeholder : ""}
                  spellCheck={false}
                  onFocus={(event) => {
                    setFocusedId(row.id);
                    event.target.scrollIntoView({
                      block: "center",
                      inline: "nearest",
                    });
                  }}
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
                  className="w-full px-1 py-1.5   text-[15px] text-slate-950 outline-none focus:outline-none placeholder:text-slate-500"
                />
                {allowSliders && sliderEnabled && (
                  <NumericSlider
                    label={assignment?.name ?? `${title} row ${index + 1}`}
                    value={assignment?.value}
                    config={row.slider}
                    onConfigChange={(slider) =>
                      onUpdateRow(row.id, row.text, { slider })
                    }
                    onChange={(value) =>
                      onUpdateRow(
                        row.id,
                        replaceAssignmentValue(row.text, value),
                      )
                    }
                  />
                )}
              </div>

              <button
                type="button"
                onClick={() => remove(row.id, index)}
                className="text-slate-500 hover:text-red-500 text-sm border-l border-slate-400 justify-center items-center flex "
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
