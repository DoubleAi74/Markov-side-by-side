import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createSavedSimulationForUser,
  listSavedSimulationsForUser,
} from "@/lib/saved-simulations/service";
import {
  SIMULATOR_TYPES,
  VISIBILITY_VALUES,
  ValidationError,
  validateCreateSavedSimulationInput,
} from "@/lib/saved-simulations/validators";
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

export async function GET(request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const simulatorType = searchParams.get("simulatorType");
  if (simulatorType && !SIMULATOR_TYPES.includes(simulatorType)) {
    return NextResponse.json(
      { error: "Invalid simulatorType filter." },
      { status: 400 },
    );
  }
  const visibility = searchParams.get("visibility");
  if (visibility && !VISIBILITY_VALUES.includes(visibility)) {
    return NextResponse.json({ error: "Invalid visibility filter." }, { status: 400 });
  }

  try {
    const items = await listSavedSimulationsForUser(sessionUser.id, {
      simulatorType: simulatorType || undefined,
      visibility: visibility || undefined,
      search: searchParams.get("search")?.trim() || undefined,
      tags: searchParams.getAll("tag").filter(Boolean),
      sort: searchParams.get("sort") || undefined,
      cursor: searchParams.get("cursor") || undefined,
      limit: searchParams.get("limit") || undefined,
      deleted: searchParams.get("deleted") || undefined,
    });
    return NextResponse.json(items);
  } catch (error) {
    return internalErrorResponse(error, "Failed to list saved simulations.");
  }
}

export async function POST(request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return unauthorizedResponse();
  }

  try {
    const body = await readJson(request);
    const input = validateCreateSavedSimulationInput(body);
    const created = await createSavedSimulationForUser(sessionUser.id, input);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return internalErrorResponse(error, "Failed to create saved simulation.");
  }
}
