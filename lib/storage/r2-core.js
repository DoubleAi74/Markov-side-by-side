import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const globalForR2 = globalThis;
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;
const required = (name) => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name} environment variable.`); return value; };
const endpoint = () => process.env.R2_ENDPOINT || (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : (() => { throw new Error("Missing R2_ENDPOINT or R2_ACCOUNT_ID environment variable."); })());
const prefix = () => (process.env.R2_PREVIEW_PREFIX || "model-previews").replace(/^\/+|\/+$/g, "");
const client = () => globalForR2.__r2Client ??= new S3Client({ region: "auto", endpoint: endpoint(), credentials: { accessKeyId: required("R2_ACCESS_KEY_ID"), secretAccessKey: required("R2_SECRET_ACCESS_KEY") } });

export function buildSavedSimulationPreviewObjectKey({ userId, simulatorType, savedSimulationId, contentType }) {
  const extension = contentType === "image/jpeg" ? "jpg" : "webp";
  return [prefix(), userId, simulatorType, savedSimulationId, `preview-${Date.now()}.${extension}`].join("/");
}

export function getSavedSimulationPreviewPublicUrl(objectKey) {
  return new URL(objectKey, `${required("R2_PUBLIC_BASE_URL").replace(/\/+$/, "")}/`).toString();
}

export async function uploadSavedSimulationPreview({ objectKey, body, contentType }) {
  await client().send(new PutObjectCommand({ Bucket: required("R2_BUCKET_NAME"), Key: objectKey, Body: body, ContentType: contentType, CacheControl: `public, max-age=${ONE_YEAR_IN_SECONDS}, immutable` }));
}

export async function deleteSavedSimulationPreviewObject(objectKey) {
  if (objectKey) await client().send(new DeleteObjectCommand({ Bucket: required("R2_BUCKET_NAME"), Key: objectKey }));
}
