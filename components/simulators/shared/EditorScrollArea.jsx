"use client";

export default function EditorScrollArea({ children }) {
  return (
    <div
      className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-none"
      style={{
        scrollPaddingBottom: "50vh",
        overflowAnchor: "none",
        overscrollBehavior: "none",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      <div style={{ paddingBottom: "80vh" }}>{children}</div>
    </div>
  );
}
