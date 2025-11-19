// public/lightGraphWorker.js

// Cargar OpenCV dentro del worker (desde /public/opencv.js)
self.importScripts("/opencv.js");

let width = 0;
let height = 0;
let dst = null;
let cvReady = false;

function waitForOpenCVInWorker() {
  return new Promise((resolve) => {
    const check = () => {
      const g = self;

      // OpenCV todavía no ha enganchado nada
      if (typeof g.cv === "undefined") {
        setTimeout(check, 50);
        return;
      }

      // Si cv es una Promesa (algunas builds modernas lo hacen)
      if (g.cv instanceof Promise) {
        g.cv
          .then((mod) => {
            g.cv = mod; // guardamos el módulo real
            // cuando el runtime está listo, Mat ya debería existir
            if (typeof g.cv.Mat === "function") {
              cvReady = true;
              resolve();
            } else {
              // si por lo que sea aún no, reintenta
              setTimeout(check, 50);
            }
          })
          .catch((err) => {
            console.error("[worker] Error resolviendo cv Promise:", err);
          });
        return;
      }

      // cv YA es el módulo real: esperamos a que Mat exista
      if (typeof g.cv.Mat === "function") {
        cvReady = true;
        resolve();
      } else {
        setTimeout(check, 50);
      }
    };

    check();
  });
}

// --- Núcleo de procesado: versión JS de processLightGraphFrame ---

function processLightGraphFrame(src, dst, params) {
  if (!src || !dst) return;

  const gray = new cv.Mat(src.rows, src.cols, cv.CV_8UC1);
  let mask = new cv.Mat(src.rows, src.cols, cv.CV_8UC1);

  try {
    // 1. Gris
    const COLOR_RGBA2GRAY =
      typeof cv.COLOR_RGBA2GRAY !== "undefined" ? cv.COLOR_RGBA2GRAY : 11; // fallback

    cv.cvtColor(src, gray, COLOR_RGBA2GRAY);

    // 2. Suavizado
    cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0);

    // 3. Threshold de brillo
    cv.threshold(gray, mask, params.threshold, 255, cv.THRESH_BINARY);

    // 4. Morfología suave sobre brillo
    let kernel = cv.Mat.ones(2, 2, cv.CV_8U);
    cv.dilate(mask, mask, kernel);
    kernel.delete();

    // --- MODO MANOS: intersección con máscara de piel ---
    if (params && params.useHandsMask) {
      const ycrcb = new cv.Mat();
      const COLOR_RGBA2YCrCb =
        typeof cv.COLOR_RGBA2YCrCb !== "undefined" ? cv.COLOR_RGBA2YCrCb : 37; // fallback aproximado

      cv.cvtColor(src, ycrcb, COLOR_RGBA2YCrCb);

      // Rango típico de piel en YCrCb
      const lowerScalar = new cv.Scalar(0, 140, 100, 0);
      const upperScalar = new cv.Scalar(255, 170, 120, 255);

      // Esta build de OpenCV.js espera Mats, no Scalars, en inRange

      const lowerMat = new cv.Mat(
        ycrcb.rows,
        ycrcb.cols,
        ycrcb.type(),
        lowerScalar
      );
      const upperMat = new cv.Mat(
        ycrcb.rows,
        ycrcb.cols,
        ycrcb.type(),
        upperScalar
      );

      const skinMask = new cv.Mat();
      cv.inRange(ycrcb, lowerMat, upperMat, skinMask);
      const kBig = cv.Mat.ones(5, 5, cv.CV_8U);
      cv.erode(skinMask, skinMask, kBig);
      cv.dilate(skinMask, skinMask, kBig);
      kBig.delete();
      // Limpieza ligera
      const k2 = cv.Mat.ones(3, 3, cv.CV_8U);
      cv.morphologyEx(skinMask, skinMask, cv.MORPH_CLOSE, k2);
      k2.delete();

      // mask = brillo ∧ piel
      const combined = new cv.Mat();
      cv.bitwise_and(mask, skinMask, combined);

      mask.delete();
      mask = combined;

      ycrcb.delete();
      skinMask.delete();
      lowerMat.delete();
      upperMat.delete();
    }

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

    // 6. Copiar original
    src.copyTo(dst);

    const blobs = [];

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);

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

      const roiGray = gray.roi(rect);
      const meanScalar = cv.mean(roiGray);
      const intensity = meanScalar[0];
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

    // 8. Dibujar cuadros + negativo opcional
    for (const b of selected) {
      const rx = Math.max(0, b.x);
      const ry = Math.max(0, b.y);
      const rw = Math.min(dst.cols - rx, b.w);
      const rh = Math.min(dst.rows - ry, b.h);
      if (rw <= 0 || rh <= 0) continue;

      const rectCv = new cv.Rect(rx, ry, rw, rh);
      const roi = dst.roi(rectCv);

      if (params.invertEnabled) {
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

      cv.rectangle(
        dst,
        new cv.Point(rx, ry),
        new cv.Point(rx + rw, ry + rh),
        new cv.Scalar(255, 255, 255, 255),
        1
      );

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

    // 9. Grafo
    const K = Math.max(1, params.neighbors | 0);
    for (let i = 0; i < selected.length; i++) {
      const a = selected[i];

      const neighbors = [];
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
    gray.delete();
    mask.delete();
  }
}

// --- Mensajes worker <-> main ---

self.addEventListener("message", async (event) => {
  const data = event.data;
  const type = data.type;

  if (type === "init") {
    width = data.w;
    height = data.h;

    await waitForOpenCVInWorker();

    // � En este punto cv y cv.Mat deberían estar listos
    dst = new cv.Mat(height, width, cv.CV_8UC4);

    self.postMessage({ type: "ready" });
    return;
  }

  if (type === "frame") {
    if (!cvReady || !dst) return;

    const buffer = data.buffer;
    const params = data.params;

    const u8 = new Uint8ClampedArray(buffer);
    const imageData = new ImageData(u8, width, height);

    const src = cv.matFromImageData(imageData);

    processLightGraphFrame(src, dst, params);

    src.delete();

    // Mat -> ImageData
    const out = new Uint8ClampedArray(dst.data);
    const outImageData = new ImageData(out, width, height);

    self.postMessage({ type: "frame", imageData: outImageData }, [
      outImageData.data.buffer,
    ]);
  }
});
