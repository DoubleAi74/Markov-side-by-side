import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  deleteSavedSimulationForUser,
  getSavedSimulationForUser,
  updateSavedSimulationForUser,
} from "@/lib/saved-simulations/service";
import {
  ValidationError,
  validateUpdateSavedSimulationInput,
} from "@/lib/saved-simulations/validators";

export const runtime = "nodejs";

function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function getSessionUser() {
  const session = await auth();
  return session?.user?.id ? session.user : null;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
}

export async function GET(_request, { params }) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;
    const savedSimulation = await getSavedSimulationForUser(id, sessionUser.id);

    if (!savedSimulation) {
      return NextResponse.json({ error: "Saved simulation not found." }, { status: 404 });
    }

    return NextResponse.json(savedSimulation);
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch saved simulation." },
      { status: 500 },
    );
  }
}

export async function PATCH(request, { params }) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;
    const existing = await getSavedSimulationForUser(id, sessionUser.id);
    if (!existing) {
      return NextResponse.json({ error: "Saved simulation not found." }, { status: 404 });
    }

    const body = await readJson(request);
    const input = validateUpdateSavedSimulationInput({
      ...body,
      currentSimulatorType: existing.simulatorType,
    });
    const updated = await updateSavedSimulationForUser(id, sessionUser.id, input);

    if (!updated) {
      return NextResponse.json({ error: "Saved simulation not found." }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: error.message || "Failed to update saved simulation." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request, { params }) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;
    const deleted = await deleteSavedSimulationForUser(id, sessionUser.id);
    if (!deleted) {
      return NextResponse.json({ error: "Saved simulation not found." }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to delete saved simulation." },
      { status: 500 },
    );
  }
}
