"use client";

import { useRegisterPublicOwner } from "@/components/providers/SimulatorTypeProvider";

export default function PublicOwnerRegistrar({ username, children }) {
  useRegisterPublicOwner(username);
  return children;
}
