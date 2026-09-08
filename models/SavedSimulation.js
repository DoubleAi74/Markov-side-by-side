import mongoose from "mongoose";
import { SIMULATOR_TYPES } from "@/lib/saved-simulations/types";

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
      enum: SIMULATOR_TYPES,
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
SavedSimulationSchema.index(
  { userId: 1, slug: 1 },
  {
    unique: true,
    partialFilterExpression: { slug: { $type: "string" } },
  },
);

const MODEL_NAME = "SavedSimulation";

function getSavedSimulationModel() {
  const existing = mongoose.models[MODEL_NAME];
  if (existing) {
    const currentEnum = existing.schema.path("simulatorType")?.enumValues ?? [];
    const enumIsCurrent =
      currentEnum.length === SIMULATOR_TYPES.length &&
      SIMULATOR_TYPES.every((type) => currentEnum.includes(type));
    if (enumIsCurrent) {
      return existing;
    }
    mongoose.deleteModel(MODEL_NAME);
  }

  return mongoose.model(MODEL_NAME, SavedSimulationSchema);
}

export default getSavedSimulationModel();
