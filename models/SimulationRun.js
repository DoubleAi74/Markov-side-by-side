import mongoose from "mongoose";

const SimulationRunSchema = new mongoose.Schema(
  {
    modelId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: "SavedSimulation",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    modelRevision: { type: Number, required: true, min: 1 },
    definitionHash: { type: String, required: true, trim: true },
    inputSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    seed: { type: String, required: true, trim: true },
    solver: { type: mongoose.Schema.Types.Mixed, required: true },
    backend: { type: mongoose.Schema.Types.Mixed, required: true },
    warnings: { type: [mongoose.Schema.Types.Mixed], default: [] },
    summary: { type: mongoose.Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ["complete", "failed", "cancelled", "truncated"],
      required: true,
    },
    preserved: { type: Boolean, default: false, index: true },
    label: { type: String, default: "", trim: true, maxlength: 120 },
    notes: { type: String, default: "", trim: true, maxlength: 1000 },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

SimulationRunSchema.index({ modelId: 1, createdAt: -1 });
SimulationRunSchema.index({ modelId: 1, preserved: 1, createdAt: -1 });
SimulationRunSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.SimulationRun ||
  mongoose.model("SimulationRun", SimulationRunSchema);
