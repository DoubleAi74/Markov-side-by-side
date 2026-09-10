"use client";

export default function VariableColorInput({ label, color, onChange, className = "" }) {
  return (
    <label
      className={`variable-color-input absolute left-1 top-1/2 h-6 -translate-y-1/2 cursor-pointer rounded-sm outline-offset-2 focus-within:outline-1 focus-within:outline-slate-400 ${className}`}
      style={{ backgroundColor: color }}
      title={`Change colour for ${label}`}
    >
      <input
        type="color"
        aria-label={`Change colour for ${label}`}
        value={color}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}
