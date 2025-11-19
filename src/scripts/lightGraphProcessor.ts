// src/lib/cv/lightGraphProcessor.ts
import type { LightGraphParams } from "./lightGraphTypes";

type GetParamsFn = () => LightGraphParams;

export interface LightGraphProcessor {
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * Procesador basado en Web Worker:
 * - Main: cámara + extracción de frames + pintado en canvas
 * - Worker: OpenCV + processLightGraphFrame
 */
export function createLightGraphProcessor(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  getParams: GetParamsFn
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

  function createWorker(): Worker {
    // Worker clásico, cargado desde /public
    return new Worker("../../public/lightGraphWorker.js");
  }

  async function start() {
    if (running) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("getUserMedia no está soportado en este navegador.");
      return;
    }

    try {
      // Abrir cámara
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
        const { type } = event.data;

        if (type === "ready") {
          workerReady = true;
          // Empezamos el loop de frames
          running = true;
          requestAnimationFrame(loop);
          return;
        }

        if (type === "frame") {
          const { imageData } = event.data as { imageData: ImageData };
          // Pintamos el frame procesado en el canvas visible
          displayCtx!.putImageData(imageData, 0, 0);
          waitingFrame = false;
        }
      };

      // Inicializamos el worker con las dimensiones
      worker.postMessage({ type: "init", w: width, h: height });
    } catch (err) {
      console.error("Error al acceder a la cámara", err);
      alert("No se pudo acceder a la cámara. Revisa permisos.");
    }
  }

  function loop() {
    if (!running || !captureCtx || !worker || !workerReady) return;

    // Evitamos saturar el worker si aún no ha respondido al frame anterior
    if (!waitingFrame) {
      captureCtx.drawImage(video, 0, 0, width, height);
      const imageData = captureCtx.getImageData(0, 0, width, height);

      // Enviamos solo el buffer como transferable
      worker.postMessage(
        {
          type: "frame",
          buffer: imageData.data.buffer,
          params: getParams(),
        },
        [imageData.data.buffer]
      );

      waitingFrame = true;
    }

    requestAnimationFrame(loop);
  }

  function stop() {
    running = false;

    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }

    if (worker) {
      worker.terminate();
      worker = null;
    }

    workerReady = false;
    waitingFrame = false;

    captureCanvas = null;
    captureCtx = null;
    displayCtx = null;
  }

  return { start, stop };
}
