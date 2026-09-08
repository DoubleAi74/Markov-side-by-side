"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export const SIMULATOR_NAV_LABELS = {
  gillespie: "CTMC (homogeneous)",
  "ctmp-inhomo": "CTMC (inhomogeneous)",
  sde: "SDEs",
  "discrete-time": "Discrete-time",
};

const SimulatorTypeContext = createContext({
  simulatorType: null,
  setSimulatorType: () => {},
});

export function SimulatorTypeProvider({ children }) {
  const [simulatorType, setSimulatorType] = useState(null);
  const value = useMemo(
    () => ({ simulatorType, setSimulatorType }),
    [simulatorType],
  );

  return (
    <SimulatorTypeContext.Provider value={value}>
      {children}
    </SimulatorTypeContext.Provider>
  );
}

export function useSimulatorTypeLabel() {
  const { simulatorType } = useContext(SimulatorTypeContext);
  if (!simulatorType) return null;
  return SIMULATOR_NAV_LABELS[simulatorType] ?? null;
}

export function useRegisterSimulatorType(type) {
  const { setSimulatorType } = useContext(SimulatorTypeContext);

  useEffect(() => {
    setSimulatorType(type);
    return () => setSimulatorType(null);
  }, [type, setSimulatorType]);
}
