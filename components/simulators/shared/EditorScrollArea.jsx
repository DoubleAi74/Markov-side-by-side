"use client";

export default function EditorScrollArea({ children }) {
  return (
    <div
      className="simulator-editor-scroll no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain"
      style={{
        scrollPaddingBlock: "1.5rem",
        overflowAnchor: "none",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      <div className="simulator-editor-content">{children}</div>
    </div>
  );
}
