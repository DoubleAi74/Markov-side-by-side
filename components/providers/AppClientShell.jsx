"use client";

import { PreviewUploadProvider } from "@/components/providers/PreviewUploadProvider";
import { SimulatorTypeProvider } from "@/components/providers/SimulatorTypeProvider";

export default function AppClientShell({ children }) {
  return (
    <PreviewUploadProvider>
      <SimulatorTypeProvider>{children}</SimulatorTypeProvider>
    </PreviewUploadProvider>
  );
}
