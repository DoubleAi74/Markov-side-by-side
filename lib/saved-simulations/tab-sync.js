const CHANNEL_NAME = "saved-simulations-tab-sync";
const STORAGE_KEY = "saved-simulations-tab-sync";

export const SAVED_SIMULATION_TAB_EVENT = {
  UPSERTED: "upserted",
  DELETED: "deleted",
};

function toDashboardItem(savedSimulation) {
  if (!savedSimulation || typeof savedSimulation !== "object") {
    return null;
  }

  const id = savedSimulation.id;
  if (!id) {
    return null;
  }

  return {
    id: String(id),
    userId: savedSimulation.userId ? String(savedSimulation.userId) : null,
    simulatorType: savedSimulation.simulatorType,
    name: savedSimulation.name,
    slug: savedSimulation.slug ?? null,
    description: savedSimulation.description ?? "",
    payloadVersion: savedSimulation.payloadVersion,
    preview: savedSimulation.preview ?? null,
    lastOpenedAt: savedSimulation.lastOpenedAt ?? null,
    createdAt: savedSimulation.createdAt ?? null,
    updatedAt: savedSimulation.updatedAt ?? null,
  };
}

function normalizeEvent(event) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const type = event.type;
  const userId = event.userId ? String(event.userId) : "";
  if (
    (type !== SAVED_SIMULATION_TAB_EVENT.UPSERTED &&
      type !== SAVED_SIMULATION_TAB_EVENT.DELETED) ||
    !userId
  ) {
    return null;
  }

  const savedSimulation = toDashboardItem(event.savedSimulation);
  const id = event.id ? String(event.id) : savedSimulation?.id ?? null;
  if (type === SAVED_SIMULATION_TAB_EVENT.DELETED && !id) {
    return null;
  }
  if (type === SAVED_SIMULATION_TAB_EVENT.UPSERTED && !savedSimulation) {
    return null;
  }

  return {
    type,
    userId,
    id,
    savedSimulation,
  };
}

function writeStorageFallback(payload) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...payload, ts: Date.now() }),
    );
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode and quota errors should not break save.
  }
}

let publishChannel = null;

function getPublishChannel() {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  if (!publishChannel) {
    publishChannel = new BroadcastChannel(CHANNEL_NAME);
  }
  return publishChannel;
}

export function publishSavedSimulationTabEvent(event) {
  if (typeof window === "undefined") {
    return;
  }

  const payload = normalizeEvent(event);
  if (!payload) {
    return;
  }

  getPublishChannel()?.postMessage(payload);
  writeStorageFallback(payload);
}

export function publishSavedSimulationUpserted({ userId, savedSimulation }) {
  publishSavedSimulationTabEvent({
    type: SAVED_SIMULATION_TAB_EVENT.UPSERTED,
    userId,
    savedSimulation,
  });
}

export function publishSavedSimulationDeleted({ userId, id }) {
  publishSavedSimulationTabEvent({
    type: SAVED_SIMULATION_TAB_EVENT.DELETED,
    userId,
    id,
  });
}

export function subscribeSavedSimulationTabEvents(onEvent) {
  if (typeof window === "undefined" || typeof onEvent !== "function") {
    return () => {};
  }

  const handle = (rawEvent) => {
    const event = normalizeEvent(rawEvent);
    if (event) {
      onEvent(event);
    }
  };

  let channel = null;
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (messageEvent) => handle(messageEvent.data);
  }

  const handleStorage = (storageEvent) => {
    if (storageEvent.key !== STORAGE_KEY || !storageEvent.newValue) {
      return;
    }

    try {
      handle(JSON.parse(storageEvent.newValue));
    } catch {
      // Ignore malformed fallback payloads.
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    channel?.close();
    window.removeEventListener("storage", handleStorage);
  };
}
