import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  deleteSavedSimulationForUser,
  getSavedSimulationForUser,
  updateSavedSimulationForUser,
  RevisionConflictError,
} from "@/lib/saved-simulations/service";
import {
  ValidationError,
  validateUpdateSavedSimulationInput,
} from "@/lib/saved-simulations/validators";
import { deleteSavedSimulationPreviewObject } from "@/lib/storage/r2";
import { internalErrorResponse } from "@/lib/http/internal-error";

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
    const savedSimulation = await getSavedSimulationForUser(id, sessionUser.id, {
      includePayload: true,
    });

    if (!savedSimulation) {
      return NextResponse.json({ error: "Saved simulation not found." }, { status: 404 });
    }

    return NextResponse.json(savedSimulation);
  } catch (error) {
    return internalErrorResponse(error, "Failed to fetch saved simulation.");
  }
}

export async function PATCH(request, { params }) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;
    const existing = await getSavedSimulationForUser(id, sessionUser.id, {
      includePayload: false,
    });
    if (!existing) {
      return NextResponse.json({ error: "Saved simulation not found." }, { status: 404 });
    }

    const body = await readJson(request);
    const input = validateUpdateSavedSimulationInput({
      ...body,
      currentSimulatorType: existing.simulatorType,
      currentPayloadVersion: existing.payloadVersion,
    });
    const updated = await updateSavedSimulationForUser(id, sessionUser.id, input);

    if (!updated) {
      return NextResponse.json({ error: "Saved simulation not found." }, { status: 404 });
    }

    const definitionChanged = existing.definitionHash !== updated.definitionHash;
    if ((definitionChanged || input.visibility === "private") && existing.preview?.objectKey) {
      deleteSavedSimulationPreviewObject(existing.preview.objectKey).catch(() => {});
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "REVISION_CONFLICT",
          currentRevision: error.currentRevision,
        },
        { status: 409 },
      );
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return internalErrorResponse(error, "Failed to update saved simulation.");
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
    return internalErrorResponse(error, "Failed to delete saved simulation.");
  }
}
