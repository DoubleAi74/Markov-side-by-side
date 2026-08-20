import mongoose from "mongoose";

const SavedSimulationPreviewSchema = new mongoose.Schema(
  {
    imageUrl: {
      type: String,
      default: null,
      trim: true,
    },
    blurDataURL: {
      type: String,
      default: null,
    },
    objectKey: {
      type: String,
      default: null,
      trim: true,
    },
    width: {
      type: Number,
      default: null,
    },
    height: {
      type: Number,
      default: null,
    },
    format: {
      type: String,
      default: null,
      enum: [null, "image/webp", "image/jpeg"],
    },
    fileSize: {
      type: Number,
      default: null,
    },
    generatedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const SavedSimulationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    simulatorType: {
      type: String,
      required: true,
      enum: ["gillespie", "ctmp-inhomo", "sde"],
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    slug: {
      type: String,
      default: null,
      trim: true,
      maxlength: 80,
      immutable: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    payloadVersion: {
      type: Number,
      required: true,
      default: 1,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "public",
      required: true,
      index: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    revision: {
      type: Number,
      default: 1,
      min: 1,
      required: true,
    },
    definitionHash: {
      type: String,
      default: null,
      trim: true,
    },
    validationStatus: {
      type: String,
      enum: ["valid", "needsRepair", "invalid"],
      default: "valid",
      required: true,
    },
    provenance: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    purgeAfter: {
      type: Date,
      default: null,
      index: true,
    },
    runCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    preservedRunCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastOpenedAt: {
      type: Date,
      default: null,
    },
    preview: {
      type: SavedSimulationPreviewSchema,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

SavedSimulationSchema.index({ userId: 1, updatedAt: -1 });
SavedSimulationSchema.index({ userId: 1, simulatorType: 1, updatedAt: -1 });
SavedSimulationSchema.index({ userId: 1, deletedAt: 1, updatedAt: -1 });
SavedSimulationSchema.index({ userId: 1, visibility: 1, deletedAt: 1 });
SavedSimulationSchema.index(
  { userId: 1, slug: 1 },
  {
    unique: true,
    partialFilterExpression: { slug: { $type: "string" } },
  },
);

export default mongoose.models.SavedSimulation ||
  mongoose.model("SavedSimulation", SavedSimulationSchema);
