import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createModelExportConfig,
  getModelExportConfigFilename,
  stringifyModelExportConfig,
} from "@/lib/exports/config";
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

    const exportedConfig = createModelExportConfig(savedSimulation);
    return new NextResponse(stringifyModelExportConfig(exportedConfig), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${getModelExportConfigFilename(savedSimulation)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return internalErrorResponse(error, "Failed to export model config.");
  }
}
