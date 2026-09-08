import "server-only";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const globalForR2 = globalThis;
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
}

function getR2Endpoint() {
  if (process.env.R2_ENDPOINT) {
    return process.env.R2_ENDPOINT;
  }

  if (process.env.R2_ACCOUNT_ID) {
    return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  }

  throw new Error("Missing R2_ENDPOINT or R2_ACCOUNT_ID environment variable.");
}

function getR2PublicBaseUrl() {
  return getRequiredEnv("R2_PUBLIC_BASE_URL");
}

function getR2BucketName() {
  return getRequiredEnv("R2_BUCKET_NAME");
}

function getR2ProfilePrefix() {
  return (process.env.R2_PROFILE_PREFIX || "profile-images").replace(
    /^\/+|\/+$/g,
    "",
  );
}

function getR2PreviewPrefix() {
  return (process.env.R2_PREVIEW_PREFIX || "model-previews").replace(
    /^\/+|\/+$/g,
    "",
  );
}

function getR2Client() {
  if (!globalForR2.__r2Client) {
    globalForR2.__r2Client = new S3Client({
      region: "auto",
      endpoint: getR2Endpoint(),
      credentials: {
        accessKeyId: getRequiredEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: getRequiredEnv("R2_SECRET_ACCESS_KEY"),
      },
    });
  }

  return globalForR2.__r2Client;
}

function getFileExtension(contentType) {
  return contentType === "image/jpeg" ? "jpg" : "webp";
}

export function buildSavedSimulationPreviewObjectKey({
  userId,
  simulatorType,
  savedSimulationId,
  contentType,
}) {
  const extension = getFileExtension(contentType);
  return [
    getR2PreviewPrefix(),
    userId,
    simulatorType,
    savedSimulationId,
    `preview-${Date.now()}.${extension}`,
  ].join("/");
}

export function getSavedSimulationPreviewPublicUrl(objectKey) {
  return new URL(objectKey, `${getR2PublicBaseUrl().replace(/\/+$/, "")}/`).toString();
}

async function putPublicObject({ objectKey, body, contentType }) {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: objectKey,
      Body: body,
      ContentType: contentType,
      CacheControl: `public, max-age=${ONE_YEAR_IN_SECONDS}, immutable`,
    }),
  );
}

async function deletePublicObject(objectKey) {
  if (!objectKey) {
    return;
  }

  const client = getR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: getR2BucketName(),
      Key: objectKey,
    }),
  );
}

export async function uploadSavedSimulationPreview({
  objectKey,
  body,
  contentType,
}) {
  await putPublicObject({ objectKey, body, contentType });
}

export async function deleteSavedSimulationPreviewObject(objectKey) {
  await deletePublicObject(objectKey);
}

export function buildProfileImageObjectKey({ userId, contentType }) {
  const extension = getFileExtension(contentType);
  return [
    getR2ProfilePrefix(),
    userId,
    `avatar-${Date.now()}.${extension}`,
  ].join("/");
}

export function getProfileImagePublicUrl(objectKey) {
  return getSavedSimulationPreviewPublicUrl(objectKey);
}

export async function uploadProfileImage({ objectKey, body, contentType }) {
  await putPublicObject({ objectKey, body, contentType });
}

export async function deleteProfileImageObject(objectKey) {
  await deletePublicObject(objectKey);
}
