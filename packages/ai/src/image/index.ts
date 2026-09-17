export {
  isFalConfigured,
  FAL_BACKGROUND_REMOVAL_ENDPOINT,
  BACKGROUND_REMOVAL_MODEL,
  RATIO_SIZES,
  removeBackground,
  generateImage as generateFalImage,
  placeholderImage,
  downloadImage,
  FalImageProvider,
  type GeneratedImage,
  type ReferenceImage,
  type FalImageRequest,
  type RemoveBackgroundResult,
} from "./fal";

export { generateOpenAIImage, isOpenAIConfigured, OPENAI_IMAGE_SIZES } from "./openai";
import { getModel } from "../models";
import { generateImage as falGenerate, type FalImageRequest } from "./fal";
import { generateOpenAIImage } from "./openai";
import { generateReplicateImage } from "../replicate";
import { generateRunwayImage } from "../runway";

/** Route by the spec's provider: a provider error never silently becomes a placeholder. */
export function generateImage(req: FalImageRequest) {
  const model = getModel(req.model);
  if (!model || model.kind !== "image") throw new Error("Unknown image model");
  switch (model.provider) {
    case "openai":
      return generateOpenAIImage(req);
    case "replicate":
      return generateReplicateImage(req);
    case "runway":
      return generateRunwayImage(req);
    default:
      return falGenerate(req);
  }
}
