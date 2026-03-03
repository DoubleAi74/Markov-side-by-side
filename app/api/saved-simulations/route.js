import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createSavedSimulationForUser,
  listSavedSimulationsForUser,
} from "@/lib/saved-simulations/service";
import {
  SIMULATOR_TYPES,
  ValidationError,
  validateCreateSavedSimulationInput,
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

  try {
    const items = await listSavedSimulationsForUser(sessionUser.id, {
      simulatorType: simulatorType || undefined,
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to list saved simulations." },
      { status: 500 },
    );
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

    return NextResponse.json(
      { error: error.message || "Failed to create saved simulation." },
      { status: 500 },
    );
  }
}
