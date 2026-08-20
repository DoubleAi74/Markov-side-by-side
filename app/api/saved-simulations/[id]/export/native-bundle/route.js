import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getNativeBundleFilename } from "@/lib/exports/config";
import { createNativeBundle } from "@/lib/exports/native-bundle";
import { getSavedSimulationForUser } from "@/lib/saved-simulations/service";
import { internalErrorResponse } from "@/lib/http/internal-error";

export const runtime = "nodejs";

function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function getSessionUser() {
  const session = await auth();
  return session?.user?.id ? session.user : null;
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
      return NextResponse.json(
        { error: "Saved simulation not found." },
        { status: 404 },
      );
    }

    const bundle = await createNativeBundle(savedSimulation);
    return new NextResponse(bundle, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${getNativeBundleFilename(savedSimulation)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return internalErrorResponse(error, "Failed to export native bundle.");
  }
}
