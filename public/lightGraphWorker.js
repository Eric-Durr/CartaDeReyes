// public/lightGraphWorker.js

// Cargar OpenCV dentro del worker (desde /public/opencv.js)
self.importScripts("/opencv.js");

let width = 0;
let height = 0;

// Mats reutilizables
let dst = null;
let gray = null;
let mask = null;

// Para modo manos
let ycrcb = null;
let skinMask = null;
let skinLowerMat = null;
let skinUpperMat = null;

// Kernels reutilizables
let kernel2x2 = null;
let kernel3x3 = null;

let cvReady = false;

function waitForOpenCVInWorker() {
  return new Promise((resolve) => {
    const check = () => {
      const g = self;

      if (typeof g.cv === "undefined") {
        setTimeout(check, 50);
        return;
      }

      if (g.cv instanceof Promise) {
        g.cv
          .then((mod) => {
            g.cv = mod;
            if (typeof g.cv.Mat === "function") {
              cvReady = true;
              resolve();
            } else {
              setTimeout(check, 50);
            }
          })
          .catch((err) => {
            console.error("[worker] Error resolviendo cv Promise:", err);
            self.postMessage({
              type: "error",
              message: "Error inicializando OpenCV en el worker",
              detail: String(err),
            });
          });
        return;
      }

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

function releaseAllMats() {
  const mats = [
    dst,
    gray,
    mask,
    ycrcb,
    skinMask,
    skinLowerMat,
    skinUpperMat,
    kernel2x2,
    kernel3x3,
  ];

  for (const m of mats) {
    if (m) m.delete();
  }

  dst = gray = mask = null;
  ycrcb = skinMask = skinLowerMat = skinUpperMat = null;
  kernel2x2 = kernel3x3 = null;
}

function initMatsForSize(w, h) {
  width = w;
  height = h;

  // Mats base
  dst = new cv.Mat(height, width, cv.CV_8UC4);
  gray = new cv.Mat(height, width, cv.CV_8UC1);
  mask = new cv.Mat(height, width, cv.CV_8UC1);

  // Kernels de morfología
  kernel2x2 = cv.Mat.ones(2, 2, cv.CV_8U);
  kernel3x3 = cv.Mat.ones(3, 3, cv.CV_8U);

  // El resto se crea lazy cuando haga falta (useHandsMask)
}

// --- Núcleo de procesado ---

function processLightGraphFrame(src, dst, params) {
  if (!src || !dst || !gray || !mask) return;

  // 1. Gris
  const COLOR_RGBA2GRAY =
    typeof cv.COLOR_RGBA2GRAY !== "undefined" ? cv.COLOR_RGBA2GRAY : 11;
  cv.cvtColor(src, gray, COLOR_RGBA2GRAY);

  // 2. Suavizado
  cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0);

  // 3. Threshold de brillo
  const thr = typeof params.threshold === "number" ? params.threshold : 200;
  cv.threshold(gray, mask, thr, 255, cv.THRESH_BINARY);

  // 4. Morfología suave sobre brillo (usa kernel reutilizable)
  cv.dilate(mask, mask, kernel2x2);

  // --- MODO MANOS: intersección con máscara de piel ---
  if (params && params.useHandsMask) {
    const COLOR_RGBA2YCrCb =
      typeof cv.COLOR_RGBA2YCrCb !== "undefined" ? cv.COLOR_RGBA2YCrCb : 37;

    // Crear mats necesarios una sola vez
    if (!ycrcb) {
      ycrcb = new cv.Mat(height, width, cv.CV_8UC3);
    }
    if (!skinMask) {
      skinMask = new cv.Mat(height, width, cv.CV_8UC1);
    }
    if (!skinLowerMat || !skinUpperMat) {
      const lowerScalar = new cv.Scalar(0, 140, 100, 0);
      const upperScalar = new cv.Scalar(255, 170, 120, 255);

      skinLowerMat = new cv.Mat(height, width, ycrcb.type(), lowerScalar);
      skinUpperMat = new cv.Mat(height, width, ycrcb.type(), upperScalar);
    }

    cv.cvtColor(src, ycrcb, COLOR_RGBA2YCrCb);

    // mask piel
    cv.inRange(ycrcb, skinLowerMat, skinUpperMat, skinMask);

    // Limpieza ligera (quita manchas pequeñas)
    cv.morphologyEx(skinMask, skinMask, cv.MORPH_OPEN, kernel3x3);

    // mask = brillo ∧ piel
    cv.bitwise_and(mask, skinMask, mask);
  }

  // --- Mostrar máscara en lugar de visual completa (modo debug) ---
  const showMask = params && params.showMask;
  if (showMask) {
    try {
      if (typeof cv.COLOR_GRAY2RGBA !== "undefined") {
        cv.cvtColor(mask, dst, cv.COLOR_GRAY2RGBA);
      } else if (typeof cv.COLOR_GRAY2BGRA !== "undefined") {
        cv.cvtColor(mask, dst, cv.COLOR_GRAY2BGRA);
      } else {
        const rows = mask.rows;
        const cols = mask.cols;
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const v = mask.ucharPtr(y, x)[0];
            const px = dst.ucharPtr(y, x);
            px[0] = v; // R
            px[1] = v; // G
            px[2] = v; // B
            px[3] = 255; // A
          }
        }
      }
    } catch (e) {
      console.error("[worker] Error mostrando máscara:", e);
      self.postMessage({
        type: "error",
        message: "Error mostrando máscara en el worker",
        detail: String(e),
      });
    }
    return;
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
  const minArea = typeof params.minArea === "number" ? params.minArea : 3;
  const maxArea = typeof params.maxArea === "number" ? params.maxArea : 2000;
  const maxSide = typeof params.maxSide === "number" ? params.maxSide : 60;

  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);

    if (area < minArea || area > maxArea) {
      cnt.delete();
      continue;
    }

    const rect = cv.boundingRect(cnt);
    const maxSideRect = Math.max(rect.width, rect.height);

    if (maxSideRect > maxSide) {
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

  const maxBlobs = typeof params.maxBlobs === "number" ? params.maxBlobs : 150;
  const selected = blobs.slice(0, maxBlobs);

  // 8. Dibujar cuadros + negativo opcional
  const invertEnabled = !!(params && params.invertEnabled);

  for (const b of selected) {
    const rx = Math.max(0, b.x);
    const ry = Math.max(0, b.y);
    const rw = Math.min(dst.cols - rx, b.w);
    const rh = Math.min(dst.rows - ry, b.h);
    if (rw <= 0 || rh <= 0) continue;

    const rectCv = new cv.Rect(rx, ry, rw, rh);
    const roi = dst.roi(rectCv);

    if (invertEnabled) {
      // Invertimos directamente todo el ROI (RGBA)
      cv.bitwise_not(roi, roi);
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
  const neigh = typeof params.neighbors === "number" ? params.neighbors : 3;
  const K = Math.max(1, neigh | 0);

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
}

// --- Mensajes worker <-> main ---

self.addEventListener("message", async (event) => {
  const data = event.data;
  const type = data.type;

  if (type === "init") {
    const w = data.w;
    const h = data.h;

    try {
      await waitForOpenCVInWorker();

      // Si ya había mats de otro tamaño, los liberamos
      releaseAllMats();
      initMatsForSize(w, h);

      self.postMessage({ type: "ready" });
    } catch (err) {
      console.error("[worker] Error en init:", err);
      self.postMessage({
        type: "error",
        message: "Error inicializando el worker",
        detail: String(err),
      });
    }
    return;
  }

  if (type === "frame") {
    if (!cvReady || !dst) return;

    const buffer = data.buffer;
    const params = data.params;

    try {
      const u8 = new Uint8ClampedArray(buffer);
      const imageData = new ImageData(u8, width, height);

      const src = cv.matFromImageData(imageData);

      try {
        processLightGraphFrame(src, dst, params);
      } catch (err) {
        console.error("[worker] Error en processLightGraphFrame:", err);
        self.postMessage({
          type: "error",
          message: "Error procesando frame en el worker",
          detail: String(err),
        });
      } finally {
        src.delete();
      }

      // Copiamos del buffer interno de OpenCV a un buffer propio transferible
      const out = new Uint8ClampedArray(dst.data);
      const outImageData = new ImageData(out, width, height);

      // Intentamos usar transferList para ahorrar copia host->thread
      try {
        self.postMessage({ type: "frame", imageData: outImageData }, [
          out.buffer,
        ]);
      } catch (e) {
        // Fallback ultra compatible
        self.postMessage({ type: "frame", imageData: outImageData });
      }
    } catch (e) {
      console.error("[worker] Error preparando frame:", e);
      self.postMessage({
        type: "error",
        message: "Error preparando frame en el worker",
        detail: String(e),
      });
    }
  }
});
