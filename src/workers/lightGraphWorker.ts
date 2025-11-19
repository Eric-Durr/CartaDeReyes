// src/workers/lightGraphWorker.ts
/// <reference lib="webworker" />

import { processLightGraphFrame } from "../scripts/lightGraphCore";
import type { LightGraphParams } from "../scripts/lightGraphTypes";

// Cargamos OpenCV.js dentro del worker (sirviéndolo desde /public/opencv.js)
declare function importScripts(...urls: string[]): void;
// @ts-ignore
importScripts("../../public/opencv.js");

declare const cv: any;

let width = 0;
let height = 0;
let dst: any | null = null;
let cvReady = false;

async function waitForOpenCVInWorker() {
  const g = self as any;

  if (typeof g.cv === "undefined") {
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (typeof g.cv !== "undefined") {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });
  }

  if (g.cv instanceof Promise) {
    g.cv = await g.cv;
  }

  cvReady = true;
}

// Inicializamos OpenCV en cuanto se carga el script
waitForOpenCVInWorker().catch((e) => {
  console.error("[worker] Error inicializando OpenCV:", e);
});

self.addEventListener("message", async (event: MessageEvent) => {
  const { type } = event.data;

  if (type === "init") {
    const { w, h } = event.data as { w: number; h: number };

    await waitForOpenCVInWorker();

    width = w;
    height = h;

    dst = new cv.Mat(height, width, cv.CV_8UC4);

    (self as any).postMessage({ type: "ready" });
    return;
  }

  if (type === "frame") {
    if (!cvReady || !dst) return;

    const { buffer, params } = event.data as {
      buffer: ArrayBuffer;
      params: LightGraphParams;
    };

    // Reconstruimos ImageData con la info del main thread
    const data = new Uint8ClampedArray(buffer);
    const imageData = new ImageData(data, width, height);

    // Pasamos ImageData a Mat
    const src = cv.matFromImageData(imageData);

    // Procesamos un frame (núcleo OpenCV)
    processLightGraphFrame(src, dst, params);

    src.delete();

    // Convertimos el Mat dst a ImageData
    const outData = new Uint8ClampedArray(dst.data);
    const outImageData = new ImageData(outData, width, height);

    // Enviamos el frame procesado de vuelta
    (self as any).postMessage(
      { type: "frame", imageData: outImageData },
      [outImageData.data.buffer] // transferimos el buffer para eficiencia
    );
  }
});
