// src/lib/cv/lightGraphProcessor.ts
import type { LightGraphParams } from "./lightGraphTypes";

type GetParamsFn = () => LightGraphParams;

export interface LightGraphProcessor {
  startCamera: () => Promise<void>;
  startVideoFile: (file: File) => Promise<void>;
  stop: () => void;
}

/**
 * Procesador basado en Web Worker:
 * - Main: cámara o vídeo + extracción de frames + pintado en canvas
 * - Worker: OpenCV + processLightGraphFrame
 */
export function createLightGraphProcessor(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  getParams: GetParamsFn,
  onStatus?: (msg: string) => void
): LightGraphProcessor {
  let stream: MediaStream | null = null;
  let running = false;

  let width = 0;
  let height = 0;

  let captureCanvas: HTMLCanvasElement | null = null;
  let captureCtx: CanvasRenderingContext2D | null = null;
  let displayCtx: CanvasRenderingContext2D | null = null;

  let worker: Worker | null = null;
  let workerReady = false;
  let waitingFrame = false;

  let sourceType: "none" | "camera" | "video" = "none";
  let videoBlobUrl: string | null = null;

  function createWorker(): Worker {
    // En Astro, /public se sirve desde la raíz "/"
    return new Worker("/lightGraphWorker.js");
  }

  function cleanupVideoSource() {
    // Limpia stream de cámara
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }

    // Limpia blob URL de vídeo si existe
    if (videoBlobUrl) {
      URL.revokeObjectURL(videoBlobUrl);
      videoBlobUrl = null;
    }

    // Limpia <video>
    if (video) {
      video.pause();
      video.srcObject = null;
      video.removeAttribute("src");
      video.load();
    }

    sourceType = "none";
  }

  function cleanupWorker() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    workerReady = false;
    waitingFrame = false;
  }

  function cleanupCanvasState() {
    captureCanvas = null;
    captureCtx = null;
    displayCtx = null;
  }

  function stop() {
    running = false;
    cleanupVideoSource();
    cleanupWorker();
    cleanupCanvasState();
    onStatus?.("Procesado detenido.");
  }

  async function prepareVideoElement(): Promise<void> {
    // Esperar metadata del <video> (sea cámara o archivo)
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

    width = video.videoWidth;
    height = video.videoHeight;

    video.width = width;
    video.height = height;
    canvas.width = width;
    canvas.height = height;

    // Canvas oculto para capturar frames del vídeo
    captureCanvas = document.createElement("canvas");
    captureCanvas.width = width;
    captureCanvas.height = height;
    captureCtx = captureCanvas.getContext("2d", {
      willReadFrequently: true,
    });

    displayCtx = canvas.getContext("2d");

    if (!captureCtx || !displayCtx) {
      throw new Error("No se pudo obtener contextos 2D de canvas.");
    }

    // Crear worker y configurarlo
    worker = createWorker();
    workerReady = false;
    waitingFrame = false;

    worker.onmessage = (event: MessageEvent) => {
      const data: any = event.data;
      const { type } = data;

      if (type === "ready") {
        workerReady = true;
        running = true;
        onStatus?.("OpenCV listo en el worker. Procesando frames…");
        requestAnimationFrame(loop);
        return;
      }

      if (type === "error") {
        console.error("[main] Mensaje de error desde worker:", data.detail);
        onStatus?.(`Worker: ${data.message || "Error desconocido"}`);
        return;
      }

      if (type === "frame") {
        const { imageData } = data as { imageData: ImageData };
        displayCtx!.putImageData(imageData, 0, 0);
        waitingFrame = false;
      }
    };

    worker.onerror = (e) => {
      console.error("[main] Error en worker:", e.message);
      onStatus?.(`Error en worker: ${e.message}`);
    };

    onStatus?.("Inicializando OpenCV en el worker…");
    worker.postMessage({ type: "init", w: width, h: height });

    if (sourceType === "video") {
      // Loop infinito, como stories / reels
      video.loop = true;
      // Nos aseguramos de no tener ningún handler que pare el procesado
      video.onended = null;
    } else {
      video.loop = false;
      video.onended = null;
    }
  }

  async function startCamera() {
    // Si ya hay algo corriendo, paramos antes
    if (running) stop();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("getUserMedia no está soportado en este navegador.");
      onStatus?.("getUserMedia no está soportado en este navegador.");
      return;
    }

    try {
      onStatus?.("Solicitando acceso a la cámara…");

      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      sourceType = "camera";
      video.srcObject = stream;
      videoBlobUrl = null;

      await prepareVideoElement();
    } catch (err: any) {
      console.error("Error al acceder a la cámara", err);
      alert("No se pudo acceder a la cámara. Revisa permisos.");
      onStatus?.(`Error al acceder a la cámara: ${err?.name || "desconocido"}`);
    }
  }

  async function startVideoFile(file: File) {
    // Si ya hay algo corriendo, paramos antes
    if (running) stop();

    try {
      onStatus?.(`Cargando vídeo: ${file.name}…`);

      const url = URL.createObjectURL(file);
      videoBlobUrl = url;
      sourceType = "video";

      video.srcObject = null;
      video.src = url;

      await prepareVideoElement();
      onStatus?.("Reproduciendo vídeo con efectos.");
    } catch (err: any) {
      console.error("Error al usar el archivo de vídeo", err);
      onStatus?.(`Error al usar el vídeo: ${err?.message || "desconocido"}`);
    }
  }

  function loop() {
    if (!running || !captureCtx || !worker || !workerReady) return;

    if (!waitingFrame) {
      captureCtx.drawImage(video, 0, 0, width, height);
      const imageData = captureCtx.getImageData(0, 0, width, height);

      // Enviamos el buffer SIN transferList para mejor compatibilidad móvil
      worker.postMessage({
        type: "frame",
        buffer: imageData.data.buffer,
        params: getParams(),
      });

      waitingFrame = true;
    }

    requestAnimationFrame(loop);
  }

  return { startCamera, startVideoFile, stop };
}
