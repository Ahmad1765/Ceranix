// lib/photoClean/engine.web.ts
import {
  FilesetResolver,
  ImageSegmenter,
  FaceDetector,
} from '@mediapipe/tasks-vision';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm';
const SELFIE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite';

let segmenterPromise: Promise<ImageSegmenter> | null = null;
let facePromise: Promise<FaceDetector> | null = null;

export function getSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
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

export function getFaceDetector(): Promise<FaceDetector> {
  if (!facePromise) {
    facePromise = (async () => {
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
