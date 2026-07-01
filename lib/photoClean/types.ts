export type CleanInput = { uri: string; base64?: string | null };

export type CleanResult = {
  uri: string;
  base64: string | null;
  faceCount: number;
  ok: boolean;
};

export type FaceBox = { x: number; y: number; width: number; height: number };
