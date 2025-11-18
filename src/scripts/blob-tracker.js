// src/scripts/blob-tracker.js

function initBlobTracker() {
  const startButton = document.getElementById("startButton");
  const fullscreenButton = document.getElementById("fullscreenButton");
  const status = document.getElementById("status");
  const video = document.getElementById("videoInput");
  const canvas = document.getElementById("canvasOutput");
  const wrapper = document.getElementById("videoWrapper");

  if (
    !startButton ||
    !status ||
    !video ||
    !canvas ||
    !wrapper ||
    !fullscreenButton
  ) {
    console.warn("BlobTracker: elementos del DOM no encontrados");
    return;
  }

  /** @type {MediaStream | null} */
  let stream = null;
  let streaming = false;

  // Matrices de OpenCV
  let src, dst, gray, mask, cap;

  async function waitForOpenCV() {
    if (typeof window.cv === "undefined") {
      status.textContent = "Cargando OpenCV.js…";
      await new Promise((resolve) => {
        const interval = setInterval(() => {
          if (typeof window.cv !== "undefined") {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });
    }

    if (window.cv instanceof Promise) {
      // eslint-disable-next-line no-global-assign
      window.cv = await window.cv;
    }
  }

  async function startCamera() {
    if (streaming) return;

    await waitForOpenCV();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      status.textContent = "getUserMedia no soportado en este navegador.";
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      video.srcObject = stream;

      // Esperar a que el vídeo tenga tamaño real
      await new Promise((resolve) => {
        if (video.readyState >= 1 && video.videoWidth > 0) {
          resolve();
        } else {
          video.addEventListener(
            "loadedmetadata",
            () => {
              resolve();
            },
            { once: true }
          );
        }
      });

      await video.play();

      const width = video.videoWidth;
      const height = video.videoHeight;

      // Resolución interna del vídeo y canvas = resolución real
      video.width = width;
      video.height = height;
      canvas.width = width;
      canvas.height = height;

      // Inicializar OpenCV
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

      streaming = true;
      status.textContent =
        "Cámara en marcha �. Detectando muchos picos de luz y conectándolos como una red.";

      // El vídeo permanece oculto SIEMPRE (solo fuente interna)
      // video.classList.remove("hidden");

      // Solo mostramos el canvas procesado
      canvas.classList.remove("hidden");

      console.log(
        "[BlobTracker] Video size:",
        width,
        "x",
        height,
        "- Mats inicializados con el mismo tamaño."
      );

      requestAnimationFrame(processVideo);
    } catch (err) {
      console.error("Error al acceder a la cámara", err);
      status.textContent =
        "No se pudo acceder a la cámara. Revisa los permisos del navegador.";
    }
  }

  function processVideo() {
    if (!streaming) return;

    const begin = performance.now();

    // Leer frame actual
    // @ts-ignore
    cap.read(src);

    // Convertir a escala de grises (luminosidad)
    // @ts-ignore
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Suavizado muy ligero para mantener detalles pequeños
    // @ts-ignore
    cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0);

    // Threshold para quedarnos con zonas brillantes
    const THRESH = 200; // un poco más bajo → más puntos
    // @ts-ignore
    cv.threshold(gray, mask, THRESH, 255, cv.THRESH_BINARY);

    // Morfología suave: solo una pequeña dilatación para agrupar un poco
    // @ts-ignore
    const kernel = cv.Mat.ones(2, 2, cv.CV_8U);
    // @ts-ignore
    cv.dilate(mask, mask, kernel);
    kernel.delete();

    // Buscar contornos
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

    // Copiamos frame original para dibujar encima
    // @ts-ignore
    src.copyTo(dst);

    const blobs = [];
    const MIN_AREA = 3; // más pequeño -> cuadros más pequeños
    const MAX_BLOBS = 150; // más alto -> más cuadros

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      // @ts-ignore
      const area = cv.contourArea(cnt);
      if (area < MIN_AREA) {
        cnt.delete();
        continue;
      }

      // @ts-ignore
      const rect = cv.boundingRect(cnt);
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;

      // Intensidad media dentro del rectángulo
      let sum = 0;
      let count = 0;
      for (let y = rect.y; y < rect.y + rect.height; y++) {
        for (let x = rect.x; x < rect.x + rect.width; x++) {
          if (x < 0 || x >= gray.cols || y < 0 || y >= gray.rows) continue;
          // @ts-ignore
          const val = gray.ucharPtr(y, x)[0];
          sum += val;
          count++;
        }
      }
      const intensity = count > 0 ? sum / count : 0;

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

    // Nos quedamos con los más brillantes
    blobs.sort((a, b) => b.intensity - a.intensity);
    const selected = blobs.slice(0, MAX_BLOBS);

    // Dibujar rectángulos, NEGATIVO dentro, y número
    for (const b of selected) {
      // Proteger límites
      const rx = Math.max(0, b.x);
      const ry = Math.max(0, b.y);
      const rw = Math.min(dst.cols - rx, b.w);
      const rh = Math.min(dst.rows - ry, b.h);
      if (rw <= 0 || rh <= 0) continue;

      // ROI del rectángulo dentro de dst
      // @ts-ignore
      const rectCv = new cv.Rect(rx, ry, rw, rh);
      // @ts-ignore
      const roi = dst.roi(rectCv);

      // � Invertimos SOLO RGB, manteniendo alfa
      const rgbaPlanes = new cv.MatVector();
      // @ts-ignore
      cv.split(roi, rgbaPlanes);

      const r = rgbaPlanes.get(0);
      const g = rgbaPlanes.get(1);
      const bChan = rgbaPlanes.get(2);
      const a = rgbaPlanes.get(3); // la dejamos igual

      // invertimos solo R, G, B
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

      // Limpiar memoria de canales
      r.delete();
      g.delete();
      bChan.delete();
      a.delete();
      rgbaPlanes.delete();
      mergedPlanes.delete();
      roi.delete();
      // rectCv es solo un descriptor, no necesita delete en OpenCV.js

      // Rectángulo blanco alrededor del pico de luz
      // @ts-ignore
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

    // Conectar blobs (grafo) con LÍNEAS BLANCAS
    const K = 3;
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
        // � líneas BLANCAS
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

    // Mostrar resultado
    // @ts-ignore
    cv.imshow("canvasOutput", dst);

    const delay = 1000 / 30 - (performance.now() - begin);
    setTimeout(
      () => requestAnimationFrame(processVideo),
      delay > 0 ? delay : 0
    );
  }

  function cleanup() {
    streaming = false;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    if (src) src.delete();
    if (dst) dst.delete();
    if (gray) gray.delete();
    if (mask) mask.delete();
  }

  // --- LÓGICA DE PANTALLA COMPLETA ---

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      if (wrapper.requestFullscreen) {
        wrapper.requestFullscreen();
      } else if (canvas.requestFullscreen) {
        canvas.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  startButton.addEventListener("click", () => {
    startCamera().catch((err) => console.error(err));
  });

  fullscreenButton.addEventListener("click", () => {
    toggleFullscreen();
  });

  window.addEventListener("beforeunload", cleanup);
}

// Evitar inicializar dos veces si el script se carga más de una vez
if (!window.__blobTrackerInitialized) {
  window.__blobTrackerInitialized = true;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initBlobTracker);
  } else {
    initBlobTracker();
  }
}
