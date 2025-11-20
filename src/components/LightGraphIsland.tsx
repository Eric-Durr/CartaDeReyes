/** @jsxImportSource react */
// src/components/LightGraphIsland.tsx

import React, { useEffect, useRef, useState } from "react";
import type { LightGraphParams } from "../scripts/lightGraphTypes";
import { createLightGraphProcessor } from "../scripts/lightGraphProcessor";

const defaultParams: LightGraphParams = {
    threshold: 200,
    minArea: 3,
    maxArea: 500,
    maxSide: 60,
    maxBlobs: 150,
    neighbors: 3,
    invertEnabled: true,
    useHandsMask: false,
    showMask: false,
};

type Mode = "camera" | "video";

const LightGraphIsland: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const processorRef =
        useRef<ReturnType<typeof createLightGraphProcessor> | null>(null);
    const paramsRef = useRef<LightGraphParams>(defaultParams);

    const [params, setParams] = useState<LightGraphParams>(defaultParams);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [status, setStatus] = useState("Cargando OpenCV.js…");
    const [mode, setMode] = useState<Mode>("camera");
    const [videoFileName, setVideoFileName] = useState<string>("");
    const videoFileRef = useRef<File | null>(null);

    // Grabación del canvas
    const recorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<BlobPart[]>([]);
    const [isRecording, setIsRecording] = useState(false);

    // Mantener params en un ref para el loop
    useEffect(() => {
        paramsRef.current = params;
    }, [params]);

    // Inicializar processor cuando existan video + canvas
    useEffect(() => {
        if (!videoRef.current || !canvasRef.current) return;

        processorRef.current = createLightGraphProcessor(
            videoRef.current,
            canvasRef.current,
            () => paramsRef.current,
            (msg) => setStatus(msg)
        );

        setStatus("Listo. Elige fuente y pulsa 'Iniciar'.");

        return () => {
            processorRef.current?.stop();
        };
    }, []);

    // Iniciar según modo
    const handleStart = async () => {
        if (!processorRef.current) return;

        try {
            if (mode === "camera") {
                setStatus("Iniciando cámara…");
                await processorRef.current.startCamera();
            } else {
                if (!videoFileRef.current) {
                    setStatus("Selecciona un vídeo antes de iniciar.");
                    return;
                }
                setStatus("Preparando vídeo…");
                await processorRef.current.startVideoFile(videoFileRef.current);
            }
        } catch (err) {
            console.error(err);
            setStatus("Error al iniciar el procesado.");
        }
    };

    const handleVideoFileChange = (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = e.target.files?.[0];
        if (!file) {
            videoFileRef.current = null;
            setVideoFileName("");
            return;
        }
        videoFileRef.current = file;
        setVideoFileName(file.name);
        setStatus(`Vídeo seleccionado: ${file.name}`);
    };

    const toggleFullscreen = () => {
        const wrapper = canvasRef.current?.parentElement;
        if (!wrapper) return;

        const anyWrapper = wrapper as any;
        const docAny = document as any;

        const supportsNative =
            !!anyWrapper.requestFullscreen ||
            !!anyWrapper.webkitRequestFullscreen ||
            !!anyWrapper.msRequestFullscreen;

        const isNativeFs =
            !!document.fullscreenElement ||
            !!docAny.webkitFullscreenElement ||
            !!docAny.msFullscreenElement;

        if (supportsNative) {
            if (!isNativeFs) {
                const fn =
                    anyWrapper.requestFullscreen ||
                    anyWrapper.webkitRequestFullscreen ||
                    anyWrapper.msRequestFullscreen;

                fn.call(wrapper);
                document.body.classList.add("is-fullscreen");
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (docAny.webkitExitFullscreen) {
                    docAny.webkitExitFullscreen();
                } else if (docAny.msExitFullscreen) {
                    docAny.msExitFullscreen();
                }
                document.body.classList.remove("is-fullscreen");
            }
        } else {
            const isFs = document.body.classList.toggle("is-fullscreen");
            if (!isFs) {
                document.body.classList.remove("is-fullscreen");
            }
        }
    };

    const exitFullscreen = () => {
        const docAny = document as any;
        const isNativeFs =
            !!document.fullscreenElement ||
            !!docAny.webkitFullscreenElement ||
            !!docAny.msFullscreenElement;

        if (isNativeFs) {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (docAny.webkitExitFullscreen) {
                docAny.webkitExitFullscreen();
            } else if (docAny.msExitFullscreen) {
                docAny.msExitFullscreen();
            }
        }
        document.body.classList.remove("is-fullscreen");
    };

    // Handlers sliders/toggles
    const updateParam =
        (key: keyof LightGraphParams) =>
            (e: React.ChangeEvent<HTMLInputElement>) => {
                const isBooleanKey =
                    key === "invertEnabled" || key === "useHandsMask" || key === "showMask";

                const value = isBooleanKey ? e.target.checked : Number(e.target.value);
                setParams((prev) => ({
                    ...prev,
                    [key]: value,
                }));
            };

    // Grabación del canvas -> WebM
    const startRecording = () => {
        const canvasEl = canvasRef.current as any;
        if (!canvasEl) {
            setStatus("No hay canvas para grabar.");
            return;
        }

        if (typeof MediaRecorder === "undefined") {
            setStatus("MediaRecorder no está soportado en este navegador.");
            return;
        }

        if (isRecording) {
            setStatus("Ya se está grabando.");
            return;
        }

        // Soporte para captureStream en distintos navegadores
        const capture =
            canvasEl.captureStream ||
            canvasEl.mozCaptureStream ||
            canvasEl.webkitCaptureStream;

        if (!capture) {
            setStatus("Tu navegador no permite grabar el canvas (sin captureStream).");
            return;
        }

        try {
            const stream: MediaStream = capture.call(canvasEl, 30); // 30 fps aprox

            // Elegir mimeType compatible
            let mimeType = "";
            if (
                typeof MediaRecorder.isTypeSupported === "function" &&
                MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
            ) {
                mimeType = "video/webm;codecs=vp9";
            } else if (
                typeof MediaRecorder.isTypeSupported === "function" &&
                MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
            ) {
                mimeType = "video/webm;codecs=vp8";
            } else if (
                typeof MediaRecorder.isTypeSupported === "function" &&
                MediaRecorder.isTypeSupported("video/webm")
            ) {
                mimeType = "video/webm";
            }

            const options: MediaRecorderOptions = mimeType
                ? { mimeType }
                : {};

            const recorder = new MediaRecorder(stream, options);
            recordedChunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    recordedChunksRef.current.push(e.data);
                }
            };

            recorder.onstop = () => {
                const blob = new Blob(recordedChunksRef.current, {
                    type: mimeType || "video/webm",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;

                // Nombre de archivo más descriptivo
                a.download = "light-graph-output.webm";
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                setStatus("Grabación finalizada. Vídeo descargado.");
            };

            recorder.start();
            recorderRef.current = recorder;
            setIsRecording(true);
            setStatus("Grabando desde el canvas…");
        } catch (err: any) {
            console.error("Error iniciando MediaRecorder", err);
            setStatus("No se pudo iniciar la grabación (quizá no soportado en este navegador).");
        }
    };


    const stopRecording = () => {
        if (!isRecording || !recorderRef.current) return;
        recorderRef.current.stop();
        recorderRef.current = null;
        setIsRecording(false);
        setStatus("Deteniendo grabación…");
    };

    return (
        <section className="blob-tracker">
            <h1>✨ Picos de luz conectados (tipo red)</h1>
            <p className="intro">
                Esta demo abre la cámara o un vídeo, detecta{" "}
                <strong>picos de luz</strong>, dibuja cuadros y los conecta como una
                red. Usa los sliders para cambiar la estética, como un filtro de
                stories.
            </p>

            <button
                id="toggleControlsButton"
                className="secondary-button small-toggle"
                onClick={() => setControlsVisible((v) => !v)}
            >
                {controlsVisible ? "Ocultar controles" : "Mostrar controles"}
            </button>

            <div
                className={
                    "controls" + (controlsVisible ? "" : " controls--hidden")
                }
            >
                {/* Fuente: cámara o vídeo */}
                <div className="controls-row">
                    <span>Fuente:</span>
                    <label className="toggle">
                        <input
                            type="radio"
                            name="mode"
                            value="camera"
                            checked={mode === "camera"}
                            onChange={() => setMode("camera")}
                        />
                        <span>Cámara</span>
                    </label>
                    <label className="toggle">
                        <input
                            type="radio"
                            name="mode"
                            value="video"
                            checked={mode === "video"}
                            onChange={() => setMode("video")}
                        />
                        <span>Vídeo subido</span>
                    </label>

                    {mode === "video" && (
                        <>
                            <input
                                type="file"
                                accept="video/*"
                                onChange={handleVideoFileChange}
                            />
                            {videoFileName && (
                                <span className="file-name">{videoFileName}</span>
                            )}
                        </>
                    )}
                </div>

                <div className="controls-row">
                    <button
                        id="startButton"
                        className="primary-button"
                        onClick={handleStart}
                    >
                        {mode === "camera" ? "Iniciar cámara" : "Iniciar vídeo"}
                    </button>

                    <button
                        id="fullscreenButton"
                        className="secondary-button"
                        onClick={toggleFullscreen}
                    >
                        Pantalla completa
                    </button>

                    <button
                        className="secondary-button"
                        onClick={isRecording ? stopRecording : startRecording}
                    >
                        {isRecording ? "Parar y descargar" : "Grabar & descargar"}
                    </button>

                    <label className="toggle">
                        <input
                            type="checkbox"
                            id="invertToggle"
                            checked={!!params.invertEnabled}
                            onChange={updateParam("invertEnabled")}
                        />
                        <span>Interior en negativo</span>
                    </label>

                    <label className="toggle">
                        <input
                            type="checkbox"
                            id="handsToggle"
                            checked={!!params.useHandsMask}
                            onChange={updateParam("useHandsMask")}
                        />
                        <span>Limitar a manos</span>
                    </label>

                    <label className="toggle">
                        <input
                            type="checkbox"
                            id="maskToggle"
                            checked={!!params.showMask}
                            onChange={updateParam("showMask")}
                        />
                        <span>Ver máscara</span>
                    </label>
                </div>

                <div className="sliders">
                    <div className="slider-group">
                        <label>
                            Sensibilidad (umbral luz)
                            <div className="slider-row">
                                <input
                                    type="range"
                                    min={0}
                                    max={255}
                                    value={params.threshold ?? defaultParams.threshold}
                                    onChange={updateParam("threshold")}
                                />
                                <span>{params.threshold}</span>
                            </div>
                        </label>
                    </div>

                    <div className="slider-group">
                        <label>
                            Área mínima blob
                            <div className="slider-row">
                                <input
                                    type="range"
                                    min={1}
                                    max={50}
                                    value={params.minArea ?? defaultParams.minArea}
                                    onChange={updateParam("minArea")}
                                />
                                <span>{params.minArea}</span>
                            </div>
                        </label>
                    </div>

                    <div className="slider-group">
                        <label>
                            Área máxima blob
                            <div className="slider-row">
                                <input
                                    type="range"
                                    min={20}
                                    max={2000}
                                    value={params.maxArea ?? defaultParams.maxArea}
                                    onChange={updateParam("maxArea")}
                                />
                                <span>{params.maxArea}</span>
                            </div>
                        </label>
                    </div>

                    <div className="slider-group">
                        <label>
                            Tamaño máximo lado (px)
                            <div className="slider-row">
                                <input
                                    type="range"
                                    min={10}
                                    max={200}
                                    value={params.maxSide ?? defaultParams.maxSide}
                                    onChange={updateParam("maxSide")}
                                />
                                <span>{params.maxSide}</span>
                            </div>
                        </label>
                    </div>

                    <div className="slider-group">
                        <label>
                            Máximo número de blobs
                            <div className="slider-row">
                                <input
                                    type="range"
                                    min={10}
                                    max={300}
                                    value={params.maxBlobs ?? defaultParams.maxBlobs}
                                    onChange={updateParam("maxBlobs")}
                                />
                                <span>{params.maxBlobs}</span>
                            </div>
                        </label>
                    </div>

                    <div className="slider-group">
                        <label>
                            Conexiones por nodo
                            <div className="slider-row">
                                <input
                                    type="range"
                                    min={1}
                                    max={8}
                                    value={params.neighbors ?? defaultParams.neighbors}
                                    onChange={updateParam("neighbors")}
                                />
                                <span>{params.neighbors}</span>
                            </div>
                        </label>
                    </div>
                </div>
            </div>

            <p id="status" className="status">
                {status}
            </p>

            <div id="videoWrapper" className="video-wrapper">
                {/* Botón flotante para salir de pantalla completa */}
                <button
                    id="exitFullscreenButton"
                    className="fullscreen-exit-button"
                    aria-label="Salir de pantalla completa"
                    onClick={exitFullscreen}
                >
                    ✕
                </button>

                {/* Vídeo oculto, solo fuente */}
                <video
                    id="videoInput"
                    ref={videoRef}
                    className="hidden"
                    autoPlay
                    playsInline
                    muted
                />

                {/* Canvas = resultado */}
                <canvas id="canvasOutput" ref={canvasRef} className="canvas" />
            </div>

            <section className="help">
                <h2>Cómo usarlo</h2>
                <ul>
                    <li>
                        Elige <strong>Cámara</strong> o <strong>Vídeo subido</strong>.
                    </li>
                    <li>
                        En modo vídeo, selecciona un archivo y pulsa{" "}
                        <strong>“Iniciar vídeo”</strong>.
                    </li>
                    <li>
                        Ajusta la <strong>sensibilidad</strong> y los tamaños para
                        controlar cuántos cuadros aparecen.
                    </li>
                    <li>
                        Usa <strong>“Interior en negativo”</strong>,{" "}
                        <strong>“Limitar a manos”</strong> y <strong>“Ver máscara”</strong>{" "}
                        para jugar con la estética.
                    </li>
                    <li>
                        Pulsa <strong>“Grabar & descargar”</strong> para capturar lo que se
                        ve en el canvas a un vídeo WebM.
                    </li>
                </ul>
            </section>
        </section>
    );
};

export default LightGraphIsland;
