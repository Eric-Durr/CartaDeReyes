// src/lib/cv/lightGraphCore.ts
import type { LightGraphParams, LightBlob } from "./lightGraphTypes";

// cv viene del script global de OpenCV.js
declare const cv: any;

/**
 * Procesa un frame:
 * - Detecta picos de luz
 * - Dibuja recuadros y grafo sobre dst
 *
 * Requisitos:
 * - src y dst son cv.Mat del mismo tamaño, tipo CV_8UC4 (RGBA)
 */
export function processLightGraphFrame(
  src: any,
  dst: any,
  params: LightGraphParams
): void {
  if (!src || !dst) return;

  // Matrices temporales locales
  const gray = new cv.Mat(src.rows, src.cols, cv.CV_8UC1);
  const mask = new cv.Mat(src.rows, src.cols, cv.CV_8UC1);

  try {
    // 1. Convertir a escala de grises
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // 2. Suavizado ligero para estabilizar ruido
    cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0);

    // 3. Threshold para zonas brillantes
    cv.threshold(gray, mask, params.threshold, 255, cv.THRESH_BINARY);

    // 4. Morfología suave (ligera dilatación)
    const kernel = cv.Mat.ones(2, 2, cv.CV_8U);
    cv.dilate(mask, mask, kernel);
    kernel.delete();

    // 5. Contornos
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(
      mask,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );

    // 6. Copiar frame original a dst
    src.copyTo(dst);

    // 7. Construir blobs filtrados
    const blobs: LightBlob[] = [];

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area: number = cv.contourArea(cnt);

      if (area < params.minArea || area > params.maxArea) {
        cnt.delete();
        continue;
      }

      const rect = cv.boundingRect(cnt);
      const maxSide = Math.max(rect.width, rect.height);
      if (maxSide > params.maxSide) {
        cnt.delete();
        continue;
      }

      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;

      // Intensidad media dentro del ROI (gris) usando cv.mean
      const roiGray = gray.roi(rect);
      const meanScalar = cv.mean(roiGray);
      const intensity = meanScalar[0] as number;
      roiGray.delete();

      blobs.push({
        x: rect.x,
        y: rect.y,
        w: rect.width,
        h: rect.height,
        cx,
        cy,
        intensity,
      });

      cnt.delete();
    }

    hierarchy.delete();
    contours.delete();

    // 8. Ordenar por intensidad y limitar número
    blobs.sort((a, b) => b.intensity - a.intensity);
    const selected = blobs.slice(0, params.maxBlobs);

    // 9. Dibujar recuadros + negativo opcional + intensidades
    for (const b of selected) {
      const rx = Math.max(0, b.x);
      const ry = Math.max(0, b.y);
      const rw = Math.min(dst.cols - rx, b.w);
      const rh = Math.min(dst.rows - ry, b.h);
      if (rw <= 0 || rh <= 0) continue;

      const rectCv = new cv.Rect(rx, ry, rw, rh);
      const roi = dst.roi(rectCv);

      if (params.invertEnabled) {
        // Invertimos solo RGB, mantenemos alfa
        const rgbaPlanes = new cv.MatVector();
        cv.split(roi, rgbaPlanes);

        const r = rgbaPlanes.get(0);
        const g = rgbaPlanes.get(1);
        const bChan = rgbaPlanes.get(2);
        const a = rgbaPlanes.get(3);

        cv.bitwise_not(r, r);
        cv.bitwise_not(g, g);
        cv.bitwise_not(bChan, bChan);

        const mergedPlanes = new cv.MatVector();
        mergedPlanes.push_back(r);
        mergedPlanes.push_back(g);
        mergedPlanes.push_back(bChan);
        mergedPlanes.push_back(a);

        cv.merge(mergedPlanes, roi);

        r.delete();
        g.delete();
        bChan.delete();
        a.delete();
        rgbaPlanes.delete();
        mergedPlanes.delete();
      }

      roi.delete();

      // Borde blanco
      cv.rectangle(
        dst,
        new cv.Point(rx, ry),
        new cv.Point(rx + rw, ry + rh),
        new cv.Scalar(255, 255, 255, 255),
        1
      );

      // Texto con intensidad
      const text = Math.round(b.intensity).toString();
      const fontScale = 0.45;
      const thickness = 1;
      const org = new cv.Point(rx, Math.max(10, ry - 4));

      cv.putText(
        dst,
        text,
        org,
        cv.FONT_HERSHEY_SIMPLEX,
        fontScale,
        new cv.Scalar(255, 255, 255, 255),
        thickness
      );
    }

    // 10. Grafo de conexiones entre blobs
    const K = Math.max(1, params.neighbors | 0);
    for (let i = 0; i < selected.length; i++) {
      const a = selected[i];

      const neighbors: { b: LightBlob; dist2: number }[] = [];
      for (let j = 0; j < selected.length; j++) {
        if (i === j) continue;
        const b = selected[j];
        const dx = a.cx - b.cx;
        const dy = a.cy - b.cy;
        const dist2 = dx * dx + dy * dy;
        neighbors.push({ b, dist2 });
      }

      neighbors.sort((u, v) => u.dist2 - v.dist2);
      const toConnect = neighbors.slice(0, K);

      for (const n of toConnect) {
        const b = n.b;
        cv.line(
          dst,
          new cv.Point(a.cx, a.cy),
          new cv.Point(b.cx, b.cy),
          new cv.Scalar(255, 255, 255, 255),
          1
        );
      }
    }
  } finally {
    // Limpieza de Mats temporales
    gray.delete();
    mask.delete();
  }
}
