export type CleanInput = { uri: string; base64?: string | null };

export type CleanResult = {
  uri: string;
  base64: string | null;
  faceCount: number;
  ok: boolean;
};

export type FaceBox = { x: number; y: number; width: number; height: number };

// faceMode picks HOW a face is hidden when blurFace is true:
//  - 'blur' (default): gaussian-blur the whole face region (Sell listing default)
//  - 'eyes': draw a solid black censor bar across just the eyes (Wardrobe)
export type CleanOptions = {
  blurFace?: boolean;
  removeBackground?: boolean;
  faceMode?: 'blur' | 'eyes';
};
