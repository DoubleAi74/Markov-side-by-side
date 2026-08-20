/** Delete preview objects first, then dependent run records and models. */
export async function purgeExpiredDocuments({ SavedSimulation, SimulationRun, deletePreviewObject, before = new Date(), limit = 100 }) {
  const docs = await SavedSimulation.find({ deletedAt: { $ne: null }, purgeAfter: { $lte: before } }).select("_id preview.objectKey").limit(Math.min(1000, Math.max(1, limit))).lean();
  const previewDeleteFailures = [], purgeable = [];
  for (const doc of docs) {
    try { if (doc.preview?.objectKey) await deletePreviewObject(doc.preview.objectKey); purgeable.push(doc); }
    catch (error) { previewDeleteFailures.push({ id: String(doc._id), message: error.message }); }
  }
  const ids = purgeable.map((doc) => doc._id);
  if (ids.length) { await SimulationRun.deleteMany({ modelId: { $in: ids } }); await SavedSimulation.deleteMany({ _id: { $in: ids } }); }
  return { count: ids.length, previewObjectsDeleted: purgeable.filter((doc) => doc.preview?.objectKey).length, previewDeleteFailures };
}
