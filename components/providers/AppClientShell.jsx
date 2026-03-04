"use client";

import { PreviewUploadProvider } from "@/components/providers/PreviewUploadProvider";

export default function AppClientShell({ children }) {
  return <PreviewUploadProvider>{children}</PreviewUploadProvider>;
}
