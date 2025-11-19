// src/lib/cv/lightGraphProcessor.ts
import type { LightGraphParams, LightBlob } from "./lightGraphTypes";

type GetParamsFn = () => LightGraphParams;

export interface LightGraphProcessor {
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * Crea un procesador que:
 * - Abre la cámara
 * - Detecta picos de luz
 * - Dibuja recuadros + grafo sobre el canvas
 * - Lee parámetros en cada frame mediante getParams()
 */
export function createLightGraphProcessor(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  getParams: GetParamsFn
): LightGraphProcessor {
  let stream: MediaStream | null = null;
  let running = false;

  let cap: any;
  let src: any;
  let dst: any;
  let gray: any;
  let mask: any;

  async function waitForOpenCV() {
    const w = window as any;

    if (typeof w.cv === "undefined") {
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (typeof w.cv !== "undefined") {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });
    }

    if (w.cv instanceof Promise) {
      w.cv = await w.cv;
    }
  }

  async function start() {
    if (running) return;

    await waitForOpenCV();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("getUserMedia no está soportado en este navegador.");
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 60 },
        },
        audio: false,
      });

      video.srcObject = stream;

      await new Promise<void>((resolve) => {
        if (video.readyState >= 1 && video.videoWidth > 0) {
          resolve();
        } else {
          video.addEventListener("loadedmetadata", () => resolve(), {
            once: true,
          });
        }
      });

      await video.play();

      const width = video.videoWidth;
      const height = video.videoHeight;

      video.width = width;
      video.height = height;
      canvas.width = width;
      canvas.height = height;

      // Inicializar OpenCV Mats
      // @ts-ignore
      cap = new cv.VideoCapture(video);
      // @ts-ignore
      src = new cv.Mat(height, width, cv.CV_8UC4);
      // @ts-ignore
      dst = new cv.Mat(height, width, cv.CV_8UC4);
      // @ts-ignore
      gray = new cv.Mat(height, width, cv.CV_8UC1);
      // @ts-ignore
      mask = new cv.Mat(height, width, cv.CV_8UC1);

      running = true;
      requestAnimationFrame(processFrame);
    } catch (err) {
      console.error("Error al acceder a la cámara", err);
      alert("No se pudo acceder a la cámara. Revisa permisos.");
    }
  }

  function stop() {
    running = false;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    if (src) src.delete();
    if (dst) dst.delete();
    if (gray) gray.delete();
    if (mask) mask.delete();
  }

  function processFrame() {
    if (!running) return;

    const begin = performance.now();

    const params = getParams();

    // Leer frame
    // @ts-ignore
    cap.read(src);

    // Escala de grises
    // @ts-ignore
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    // Suavizado ligero
    // @ts-ignore
    cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0);

    // Threshold para zonas brillantes
    // @ts-ignore
    cv.threshold(gray, mask, params.threshold, 255, cv.THRESH_BINARY);

    // Morfología suave
    // @ts-ignore
    const kernel = cv.Mat.ones(2, 2, cv.CV_8U);
    // @ts-ignore
    cv.dilate(mask, mask, kernel);
    kernel.delete();

    // Contornos
    // @ts-ignore
    const contours = new cv.MatVector();
    // @ts-ignore
    const hierarchy = new cv.Mat();
    // @ts-ignore
    cv.findContours(
      mask,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );

    // Copiar frame original
    // @ts-ignore
    src.copyTo(dst);

    const blobs: LightBlob[] = [];

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      // @ts-ignore
      const area: number = cv.contourArea(cnt);

      if (area < params.minArea || area > params.maxArea) {
        cnt.delete();
        continue;
      }

      // @ts-ignore
      const rect = cv.boundingRect(cnt);
      const maxSide = Math.max(rect.width, rect.height);
      if (maxSide > params.maxSide) {
        cnt.delete();
        continue;
      }

      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;

      const roiGray = gray.roi(rect);
      // @ts-ignore
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

    blobs.sort((a, b) => b.intensity - a.intensity);
    const selected = blobs.slice(0, params.maxBlobs);

    // Dibujar cuadros y (opcionalmente) negativo interior
    for (const b of selected) {
      const rx = Math.max(0, b.x);
      const ry = Math.max(0, b.y);
      const rw = Math.min(dst.cols - rx, b.w);
      const rh = Math.min(dst.rows - ry, b.h);
      if (rw <= 0 || rh <= 0) continue;

      // @ts-ignore
      const rectCv = new cv.Rect(rx, ry, rw, rh);
      // @ts-ignore
      const roi = dst.roi(rectCv);

      if (params.invertEnabled) {
        const rgbaPlanes = new cv.MatVector();
        // @ts-ignore
        cv.split(roi, rgbaPlanes);

        const r = rgbaPlanes.get(0);
        const g = rgbaPlanes.get(1);
        const bChan = rgbaPlanes.get(2);
        const a = rgbaPlanes.get(3);

        // @ts-ignore
        cv.bitwise_not(r, r);
        // @ts-ignore
        cv.bitwise_not(g, g);
        // @ts-ignore
        cv.bitwise_not(bChan, bChan);

        const mergedPlanes = new cv.MatVector();
        mergedPlanes.push_back(r);
        mergedPlanes.push_back(g);
        mergedPlanes.push_back(bChan);
        mergedPlanes.push_back(a);

        // @ts-ignore
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
      // @ts-ignore
      cv.rectangle(
        dst,
        new cv.Point(rx, ry),
        new cv.Point(rx + rw, ry + rh),
        new cv.Scalar(255, 255, 255, 255),
        1
      );

      // Texto de intensidad
      const text = Math.round(b.intensity).toString();
      const fontScale = 0.45;
      const thickness = 1;
      const org = new cv.Point(rx, Math.max(10, ry - 4));

      // @ts-ignore
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

    // Grafo de conexiones
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
        // @ts-ignore
        cv.line(
          dst,
          new cv.Point(a.cx, a.cy),
          new cv.Point(b.cx, b.cy),
          new cv.Scalar(255, 255, 255, 255),
          1
        );
      }
    }

    // Pintar en canvas
    // @ts-ignore
    cv.imshow(canvas, dst);

    const elapsed = performance.now() - begin;
    const targetFps = 24;
    const delay = 1000 / targetFps - elapsed;

    setTimeout(
      () => requestAnimationFrame(processFrame),
      delay > 0 ? delay : 0
    );
  }

  return { start, stop };
}
