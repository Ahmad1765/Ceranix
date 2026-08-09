// lib/photoClean/engine.web.ts
//
// Types are imported type-only so they are erased at compile time and
// @mediapipe/tasks-vision is NEVER pulled into the Metro bundle. This is
// deliberate: the package's vision_bundle.mjs contains a dynamic
// `import(t.toString())` that Metro's transformer rejects ("Invalid call"),
// which breaks the entire web build. Instead we load the module from a CDN at
// runtime via the browser's native dynamic import (see loadVision), which never
// passes through Metro. MediaPipe already fetches its WASM/model assets from a
// CDN at runtime, so this keeps the whole dependency out of the app bundle.
import type {
  FilesetResolver as FilesetResolverClass,
  ImageSegmenter as ImageSegmenterClass,
  FaceDetector as FaceDetectorClass,
} from '@mediapipe/tasks-vision';

// Pin the CDN version to the installed one so the JS glue, WASM, and model
// loader stay in lockstep (a version skew between the ESM and the WASM root
// fails at runtime).
const VERSION = '0.10.35';
const VISION_ESM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/vision_bundle.mjs`;
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const SELFIE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite';

type VisionModule = {
  FilesetResolver: typeof FilesetResolverClass;
  ImageSegmenter: typeof ImageSegmenterClass;
  FaceDetector: typeof FaceDetectorClass;
};

// Load the MediaPipe ESM from the CDN using the browser's native dynamic import.
// `new Function` hides the `import()` from Metro's static analyzer so Metro never
// tries (and fails) to transform the CDN module. Cached; resets on failure so a
// later call can retry.
let visionPromise: Promise<VisionModule> | null = null;
function loadVision(): Promise<VisionModule> {
  if (!visionPromise) {
    const nativeImport = new Function('u', 'return import(u);') as (
      u: string,
    ) => Promise<VisionModule>;
    visionPromise = nativeImport(VISION_ESM).catch((e) => {
      visionPromise = null;
      throw e;
    });
  }
  return visionPromise;
}

let segmenterPromise: Promise<ImageSegmenterClass> | null = null;
let facePromise: Promise<FaceDetectorClass> | null = null;

export function getSegmenter(): Promise<ImageSegmenterClass> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { FilesetResolver, ImageSegmenter } = await loadVision();
      const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
      return ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: SELFIE_MODEL },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    })().catch((e) => {
      segmenterPromise = null; // allow retry on next attempt
      throw e;
    });
  }
  return segmenterPromise;
}

export function getFaceDetector(): Promise<FaceDetectorClass> {
  if (!facePromise) {
    facePromise = (async () => {
      const { FilesetResolver, FaceDetector } = await loadVision();
      const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
      return FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL },
        runningMode: 'IMAGE',
      });
    })().catch((e) => {
      facePromise = null;
      throw e;
    });
  }
  return facePromise;
}
