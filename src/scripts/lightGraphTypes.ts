export interface LightGraphParams {
  threshold: number; // 0–255, sensibilidad de luz
  minArea: number; // área mínima del blob (en píxeles^2)
  maxArea: number; // área máxima del blob
  maxSide: number; // ancho/alto máximo del recuadro (en píxeles)
  maxBlobs: number; // máximo blobs a mostrar
  neighbors: number; // conexiones por nodo en el grafo
  invertEnabled: boolean; // interior en negativo o no
  useHandsMask: boolean;
  showMask: boolean;
}

export interface LightBlob {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  intensity: number;
}
