/**
 * `tempest-react-sdk/vision` — browser computer-vision inference with ONNX
 * Runtime Web (classification, detection, segmentation).
 *
 * Vendored from `@mauriciobenjamin700/ort-vision-sdk-web@0.2.1` (MIT, same
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
    DetectionResults,
    Masks,
    Probs,
    SegmentationResults,
} from "./results";

export { COCO_CLASSES, type LabelSpec, type ResolveLabelsOptions, resolveLabels } from "./labels";

export {
    ImageLoadError,
    InferenceError,
    LabelMapError,
    ModelLoadError,
    OrtVisionError,
    ProviderNotAvailableError,
} from "./core/exceptions";

export { type ModelSource, type OrtSessionOptions, OrtSession } from "./core/session";
export { DEFAULT_PROVIDERS, resolveProviders } from "./core/providers";

export { type ImageInput, loadImage } from "./io/image";

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

export { type TopKResult, softmax, topK } from "./postprocess/classification";

export {
    type DecodeYoloAnchorsOptions,
    type DecodeYoloOptions,
    type DecodeYoloV8AnchorsOptions,
    type DecodeYoloV8Options,
    type DecodedAnchors,
    type DecodedDetection,
    batchedNms,
    decodeYolo,
    decodeYoloAnchors,
    decodeYoloV8,
    decodeYoloV8Anchors,
    nms,
} from "./postprocess/detection";

export {
    type DecodeYoloSegOptions,
    type DecodeYoloV8SegOptions,
    type DecodedSegmentation,
    decodeYoloSeg,
    decodeYoloV8Seg,
} from "./postprocess/segmentation";

export { VisionTask } from "./tasks/base";
export {
    type ClassifierOptions,
    type ClassifierPredictOptions,
    Classifier,
} from "./tasks/classifier";
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

export const VERSION: string = "0.2.1";
