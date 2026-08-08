/**
 * `tempest-react-sdk/vision` — browser computer-vision inference with ONNX
 * Runtime Web (classification, detection, segmentation).
 *
 * Vendored from `@mauriciobenjamin700/ort-vision-sdk-web@0.6.1` (MIT, same
 * author) so it ships inside this SDK without an extra package install.
 * `onnxruntime-web` stays an optional peer dependency — install it (and ship
 * the matching `.wasm` files) only when you use this subpath.
 *
 * Do not hand-edit — regenerate with `npm run vendor:vision`.
 */

export {
    BoundingBox,
    Mask,
    RGBImage,
    type ClassProbability,
    type ClassificationResult,
    type DetectionResult,
    type SegmentationResult,
} from "./types";

export {
    Boxes,
    ClassificationResults,
    DetectClassifyResults,
    DetectionResults,
    Masks,
    Probs,
    SegmentationResults,
} from "./results";

export {
    COCO_CLASSES,
    type LabelSpec,
    type ResolveLabelsOptions,
    defaultLabels,
    resolveLabels,
} from "./labels";

export {
    FusionError,
    ImageLoadError,
    InferenceError,
    LabelMapError,
    ModelLoadError,
    NoDetectionsError,
    OrtVisionError,
    ProviderNotAvailableError,
} from "./core/exceptions";

export { type ModelSource, type OrtSessionOptions, OrtSession } from "./core/session";
export {
    type DeclaredDim,
    type DeclaredShape,
    type ResolveInputSizeOptions,
    classificationNumClasses,
    declaredShapesFrom,
    detectionNumClasses,
    resolveInputSize,
    spatialInputSize,
} from "./core/graph";
export { modelNames, parseNames, readModelMetadata } from "./core/metadata";
export { DEFAULT_PROVIDERS, resolveProviders } from "./core/providers";
export { type Speed, SpeedTimer } from "./core/timing";

export { type ImageInput, loadImage } from "./io/image";

export {
    FUSION_KIND_DETECT_CLASSIFY,
    INPUT_IMAGE,
    INPUT_PAD,
    INPUT_SCALE,
    INPUT_SOURCE,
    METADATA_PREFIX,
    OUTPUT_BOXES,
    OUTPUT_CLASSES,
    OUTPUT_NUM_DETECTIONS,
    OUTPUT_PROBS,
    OUTPUT_SCORES,
    type CropSource,
    type FusionSpec,
    readFusionSpec,
} from "./fusion";

export {
    type LetterboxResult,
    fromCv2,
    letterbox,
    normalize,
    resize,
    toCHW,
    toCv2,
    toFloat32,
    toFloat32Tensor,
    toTensor,
} from "./preprocess/image";

export {
    type FusedLetterboxResult,
    LetterboxPipeline,
    letterboxToTensorData,
    zeroTensorData,
} from "./preprocess/pipeline";

export { type TopKResult, softmax, topK } from "./postprocess/classification";

export {
    type DecodeYoloAnchorsOptions,
    type DecodeYoloOptions,
    type DecodedAnchors,
    type DecodedDetection,
    batchedNms,
    decodeYolo,
    decodeYoloAnchors,
    nms,
} from "./postprocess/detection";

export {
    type DecodeYoloSegOptions,
    type DecodedSegmentation,
    decodeYoloSeg,
} from "./postprocess/segmentation";

export { VisionTask, requireDetections } from "./tasks/base";
export {
    type ClassifierOptions,
    type ClassifierPredictOptions,
    Classifier,
} from "./tasks/classifier";
export {
    type DetectClassifyOptions,
    type DetectClassifyPredictOptions,
    DetectClassify,
} from "./tasks/detectClassify";
export {
    type DetectorHead,
    type DetectorOptions,
    type DetectorPredictOptions,
    Detector,
} from "./tasks/detector";
export {
    type SegmenterHead,
    type SegmenterOptions,
    type SegmenterPredictOptions,
    Segmenter,
} from "./tasks/segmenter";

export const VERSION: string = "0.6.1";
