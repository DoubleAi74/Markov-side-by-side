import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getSavedSimulationForUser,
  updateSavedSimulationPreviewForUser,
} from "@/lib/saved-simulations/service";
import {
  ValidationError,
  validateSavedSimulationPreviewUploadInput,
} from "@/lib/saved-simulations/validators";
import {
  buildSavedSimulationPreviewObjectKey,
  deleteSavedSimulationPreviewObject,
  getSavedSimulationPreviewPublicUrl,
  uploadSavedSimulationPreview,
} from "@/lib/storage/r2";

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

export async function PUT(request, { params }) {
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
      return NextResponse.json(
        { error: "Saved simulation not found." },
        { status: 404 },
      );
    }

    const body = await readJson(request);
    const previewUpload = validateSavedSimulationPreviewUploadInput(body);
    const objectKey = buildSavedSimulationPreviewObjectKey({
      userId: sessionUser.id,
      simulatorType: existing.simulatorType,
      savedSimulationId: existing.id,
      contentType: previewUpload.format,
    });

    await uploadSavedSimulationPreview({
      objectKey,
      body: previewUpload.image.buffer,
      contentType: previewUpload.format,
    });

    let updated;
    try {
      updated = await updateSavedSimulationPreviewForUser(id, sessionUser.id, {
        imageUrl: getSavedSimulationPreviewPublicUrl(objectKey),
        blurDataURL: previewUpload.blurDataURL,
        objectKey,
        width: previewUpload.width,
        height: previewUpload.height,
        format: previewUpload.format,
        fileSize: previewUpload.fileSize,
        generatedAt: new Date(),
      });
    } catch (error) {
      deleteSavedSimulationPreviewObject(objectKey).catch(() => {});
      throw error;
    }

    if (!updated) {
      deleteSavedSimulationPreviewObject(objectKey).catch(() => {});
      return NextResponse.json(
        { error: "Saved simulation not found." },
        { status: 404 },
      );
    }

    if (
      existing.preview?.objectKey &&
      existing.preview.objectKey !== objectKey
    ) {
      deleteSavedSimulationPreviewObject(existing.preview.objectKey).catch(
        () => {},
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: error.message || "Failed to upload saved simulation preview." },
      { status: 500 },
    );
  }
}
