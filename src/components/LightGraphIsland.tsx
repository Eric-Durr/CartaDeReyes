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

// ====== COMPONENTE PRINCIPAL ======

const LightGraphIsland: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const processorRef =
        useRef<ReturnType<typeof createLightGraphProcessor> | null>(null);
    const paramsRef = useRef<LightGraphParams>(defaultParams);

    const [params, setParams] = useState<LightGraphParams>(defaultParams);
    const [status, setStatus] = useState("Cargando OpenCV.js…");
    const [mode, setMode] = useState<Mode>("camera");
    const [videoFileName, setVideoFileName] = useState<string>("");
    const videoFileRef = useRef<File | null>(null);

    const [controlsVisible, setControlsVisible] = useState(true);

    const [isFullscreen, setIsFullscreen] = useState(false);
    const [panelOpen, setPanelOpen] = useState(false);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<BlobPart[]>([]);
    const [isRecording, setIsRecording] = useState(false);

    // fuente activa (cámara o vídeo ya iniciado)
    const [isLive, setIsLive] = useState(false);

    // ancho ajustable del panel de preview (solo escritorio)
    const [previewWidth, setPreviewWidth] = useState<number | null>(null);

    // Mantener params en ref
    useEffect(() => {
        paramsRef.current = params;
    }, [params]);

    // Inicializar processor
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
            setIsLive(false);
        };
    }, []);

    // Listener de fullscreen (por si el navegador sale solo)
    useEffect(() => {
        const docAny = document as any;

        const onFsChange = () => {
            const fsEl =
                document.fullscreenElement ||
                docAny.webkitFullscreenElement ||
                docAny.msFullscreenElement;

            const nowFs = !!fsEl;
            setIsFullscreen(nowFs);
            if (!nowFs) {
                setPanelOpen(false);
                document.body.classList.remove("is-fullscreen");
            }
        };

        document.addEventListener("fullscreenchange", onFsChange);
        document.addEventListener("webkitfullscreenchange", onFsChange as any);
        document.addEventListener("msfullscreenchange", onFsChange as any);

        return () => {
            document.removeEventListener("fullscreenchange", onFsChange);
            document.removeEventListener("webkitfullscreenchange", onFsChange as any);
            document.removeEventListener("msfullscreenchange", onFsChange as any);
        };
    }, []);

    // ---- Handlers de lógica ----

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

            // ✅ Cámara o vídeo activos
            setIsLive(true);
        } catch (err) {
            console.error(err);
            setStatus("Error al iniciar el procesado.");
            setIsLive(false);
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
        // canvas -> ratio-wrapper -> videoWrapper
        const wrapper = canvasRef.current?.parentElement?.parentElement;
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
                setIsFullscreen(true);
                setPanelOpen(false);
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (docAny.webkitExitFullscreen) {
                    docAny.webkitExitFullscreen();
                } else if (docAny.msExitFullscreen) {
                    docAny.msExitFullscreen();
                }
                document.body.classList.remove("is-fullscreen");
                setIsFullscreen(false);
                setPanelOpen(false);
            }
        } else {
            const toggle = document.body.classList.toggle("is-fullscreen");
            setIsFullscreen(toggle);
            if (!toggle) setPanelOpen(false);
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
        setIsFullscreen(false);
        setPanelOpen(false);
    };

    const updateParam =
        (key: keyof LightGraphParams) =>
            (e: React.ChangeEvent<HTMLInputElement>) => {
                const isBooleanKey =
                    key === "invertEnabled" ||
                    key === "useHandsMask" ||
                    key === "showMask";

                const value = isBooleanKey ? e.target.checked : Number(e.target.value);
                setParams((prev) => ({
                    ...prev,
                    [key]: value,
                }));
            };

    const startRecording = () => {
        if (!isLive) {
            setStatus("Activa primero la cámara o el vídeo antes de grabar.");
            return;
        }

        const canvasEl = canvasRef.current as any;
        const videoEl = videoRef.current as any;

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

        const canvasCapture =
            canvasEl.captureStream ||
            canvasEl.mozCaptureStream ||
            canvasEl.webkitCaptureStream;

        if (!canvasCapture) {
            setStatus(
                "Tu navegador no permite grabar el canvas (no soporta captureStream)."
            );
            return;
        }

        try {
            const canvasStream: MediaStream = canvasCapture.call(canvasEl, 30);
            let finalStream: MediaStream = canvasStream;

            if (mode === "video" && videoEl) {
                const videoCapture =
                    videoEl.captureStream ||
                    videoEl.mozCaptureStream ||
                    videoEl.webkitCaptureStream;

                if (videoCapture) {
                    const videoStream: MediaStream = videoCapture.call(videoEl);
                    const audioTracks = videoStream.getAudioTracks();

                    if (audioTracks.length > 0) {
                        const mixed = new MediaStream();
                        canvasStream.getVideoTracks().forEach((t: MediaStreamTrack) =>
                            mixed.addTrack(t)
                        );
                        audioTracks.forEach((t: MediaStreamTrack) =>
                            mixed.addTrack(t)
                        );
                        finalStream = mixed;
                    }
                }
            }

            let mimeType = "";
            if (
                typeof MediaRecorder.isTypeSupported === "function" &&
                MediaRecorder.isTypeSupported("video/mp4;codecs=avc1")
            ) {
                mimeType = "video/mp4;codecs=avc1";
            } else if (
                typeof MediaRecorder.isTypeSupported === "function" &&
                MediaRecorder.isTypeSupported("video/mp4")
            ) {
                mimeType = "video/mp4";
            } else if (
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

            const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
            const recorder = new MediaRecorder(finalStream, options);
            recordedChunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    recordedChunksRef.current.push(e.data);
                }
            };

            recorder.onstop = () => {
                const isMp4 = mimeType.includes("mp4");
                const blob = new Blob(recordedChunksRef.current, {
                    type: mimeType || (isMp4 ? "video/mp4" : "video/webm"),
                });

                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;

                const ext = isMp4 ? "mp4" : "webm";
                a.download = `light-graph-output.${ext}`;

                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);

                setStatus(
                    `Grabación finalizada. Vídeo descargado en ${ext.toUpperCase()} ${isMp4 ? "" : "(o WebM si MP4 no está soportado)"
                    }.`
                );
            };

            recorder.start();
            recorderRef.current = recorder;
            setIsRecording(true);
            setStatus("Grabando desde el canvas (con audio si está disponible)...");
        } catch (err: any) {
            console.error("Error iniciando MediaRecorder", err);
            setStatus(
                "No se pudo iniciar la grabación (quizá este navegador no soporta el formato elegido)."
            );
        }
    };

    const stopRecording = () => {
        if (!isRecording || !recorderRef.current) return;
        recorderRef.current.stop();
        recorderRef.current = null;
        setIsRecording(false);
        setStatus("Deteniendo grabación…");
    };

    const togglePanel = () => setPanelOpen((v) => !v);

    const handleModeChange = (newMode: Mode) => {
        setMode(newMode);
        setIsLive(false); // cambiamos de fuente => reset live
    };

    // ====== RENDER ======

    return (
        <section className="min-h-screen bg-slate-950 text-slate-100">
            <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:py-8">
                <HeaderBar />

                <div className="lg-layout-main">
                    <div className="flex flex-1 flex-col gap-3">
                        <PreviewArea
                            // @ts-ignore
                            videoRef={videoRef}
                            // @ts-ignore
                            canvasRef={canvasRef}
                            mode={mode}
                            status={status}
                            isRecording={isRecording}
                            isFullscreen={isFullscreen}
                            panelOpen={panelOpen}
                            isLive={isLive}
                            previewWidth={previewWidth}
                            onResizeWidth={setPreviewWidth}
                            onExitFullscreen={exitFullscreen}
                            onToggleFullscreen={toggleFullscreen}
                            onStartRecording={startRecording}
                            onStopRecording={stopRecording}
                            onTogglePanel={togglePanel}
                            params={params}
                            updateParam={updateParam}
                        />

                        {!controlsVisible && (
                            <div className="flex w-full justify-end">
                                <button
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500 hover:bg-slate-800"
                                    onClick={() => setControlsVisible(true)}
                                >
                                    Mostrar panel de controles
                                </button>
                            </div>
                        )}
                    </div>

                    <DesktopControlsPanel
                        visible={controlsVisible}
                        mode={mode}
                        onModeChange={handleModeChange}
                        videoFileName={videoFileName}
                        onVideoFileChange={handleVideoFileChange}
                        onStart={handleStart}
                        onRecordClick={() =>
                            isRecording ? stopRecording() : startRecording()
                        }
                        isRecording={isRecording}
                        isLive={isLive}
                        params={params}
                        updateParam={updateParam}
                        onToggleVisible={() => setControlsVisible((v) => !v)}
                    />
                </div>

                <HelpSection />
            </div>
        </section>
    );
};

// ====== SUBCOMPONENTES ======

const HeaderBar: React.FC = () => (
    <header className="mb-3 flex flex-col gap-2 md:mb-4 md:flex-row md:items-end md:justify-between">
        <div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl text-white">
                ✨ Light Graph Tracker
            </h1>
            <p className="mt-1 max-w-xl text-sm text-slate-300 md:text-base">
                Cámara o vídeo + detección de <strong>picos de luz</strong> que se
                conectan como una red. Ajusta los controles para esculpir la estética
                en tiempo real.
            </p>
        </div>
    </header>
);

interface PreviewAreaProps {
    videoRef: React.RefObject<HTMLVideoElement>;
    canvasRef: React.RefObject<HTMLCanvasElement>;
    mode: Mode;
    status: string;
    isRecording: boolean;
    isFullscreen: boolean;
    panelOpen: boolean;
    isLive: boolean;
    previewWidth: number | null;
    onResizeWidth: (w: number | null) => void;
    onExitFullscreen: () => void;
    onToggleFullscreen: () => void;
    onStartRecording: () => void;
    onStopRecording: () => void;
    onTogglePanel: () => void;
    params: LightGraphParams;
    updateParam: (
        key: keyof LightGraphParams
    ) => (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const PreviewArea: React.FC<PreviewAreaProps> = ({
    videoRef,
    canvasRef,
    mode,
    status,
    isRecording,
    isFullscreen,
    panelOpen,
    isLive,
    previewWidth,
    onResizeWidth,
    onExitFullscreen,
    onToggleFullscreen,
    onStartRecording,
    onStopRecording,
    onTogglePanel,
    params,
    updateParam,
}) => {
    const wrapperRef = useRef<HTMLDivElement | null>(null);

    type Edge = "left" | "right";

    const startResize = (startClientX: number, edge: Edge) => {
        // Sin resize en móvil
        if (window.innerWidth < 768) return;
        if (isFullscreen) return;
        if (!wrapperRef.current) return;

        const rect = wrapperRef.current.getBoundingClientRect();
        const startWidth = rect.width;
        const direction = edge === "right" ? 1 : -1;

        const min = 360;
        const rawMax = Math.min(window.innerWidth - 320, 1200);
        const max = Math.max(min, rawMax);

        const getClientX = (ev: MouseEvent | TouchEvent): number => {
            if ("touches" in ev && ev.touches.length > 0) {
                return ev.touches[0].clientX;
            }
            if ("clientX" in ev) {
                return (ev as MouseEvent).clientX;
            }
            return startClientX;
        };

        const onMove = (ev: MouseEvent | TouchEvent) => {
            const clientX = getClientX(ev);
            const delta = (clientX - startClientX) * direction;
            let newWidth = startWidth + delta;

            if (newWidth < min) newWidth = min;
            if (newWidth > max) newWidth = max;

            onResizeWidth(newWidth);
        };

        const onUp = () => {
            window.removeEventListener("mousemove", onMove as any);
            window.removeEventListener("mouseup", onUp);
            window.removeEventListener("touchmove", onMove as any);
            window.removeEventListener("touchend", onUp);
            window.removeEventListener("touchcancel", onUp);
        };

        window.addEventListener("mousemove", onMove as any);
        window.addEventListener("mouseup", onUp);
        window.addEventListener("touchmove", onMove as any, { passive: false });
        window.addEventListener("touchend", onUp);
        window.addEventListener("touchcancel", onUp);
    };

    const makeCornerHandlers = (edge: Edge) => ({
        onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            startResize(e.clientX, edge);
        },
        onTouchStart: (e: React.TouchEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            const touch = e.touches[0];
            startResize(touch.clientX, edge);
        },
    });

    const wrapperStyle: React.CSSProperties =
        !isFullscreen && previewWidth
            ? { width: `${previewWidth}px` }
            : { width: "100%" };

    return (
        <div className="flex flex-1 flex-col items-center gap-3">
            <p className="w-full rounded-full bg-slate-900/80 px-4 py-2 text-xs text-slate-300 shadow-sm ring-1 ring-slate-800 md:text-sm">
                {status}
            </p>

            <div
                id="videoWrapper"
                ref={wrapperRef}
                style={wrapperStyle}
                className={
                    "relative max-w-full overflow-visible rounded-xl bg-black shadow-xl ring-1 ring-slate-800" +
                    (isFullscreen
                        ? " h-screen w-screen max-w-none rounded-none ring-0 shadow-none"
                        : "")
                }
            >
                {/* Contenedor: 16:9 en modo normal, pantalla completa ocupa todo */}
                <div
                    className={
                        isFullscreen
                            ? "relative w-full h-full"
                            : "relative w-full pb-[56.25%]"
                    }
                >
                    {/* En mobile evitamos display:none para no romper autoplay */}
                    <video
                        id="videoInput"
                        ref={videoRef}
                        className="absolute inset-0 h-full w-full opacity-0 pointer-events-none"
                        autoPlay
                        playsInline
                        muted
                    />
                    <canvas
                        id="canvasOutput"
                        ref={canvasRef}
                        className="absolute inset-0 h-full w-full bg-black object-contain"
                    />
                </div>

                {/* Botón salir fullscreen */}
                {isFullscreen && (
                    <button
                        id="exitFullscreenButton"
                        className="absolute right-3 top-3 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-xs text-slate-100 backdrop-blur hover:bg-black/80"
                        aria-label="Salir de pantalla completa"
                        onClick={onExitFullscreen}
                    >
                        ✕
                    </button>
                )}

                {/* Chip de estado */}
                <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-full bg-black/60 px-3 py-1 text-[11px] text-slate-100 backdrop-blur sm:text-xs">
                    Live • {mode === "camera" ? "Cámara" : "Vídeo"}
                </div>

                {/* Botón circular de grabar: solo si hay fuente activa */}
                {isLive && (
                    <button
                        type="button"
                        className="absolute bottom-4 left-1/2 z-20 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full border-[3px] border-slate-100/80 bg-black/20 backdrop-blur hover:bg-black/40"
                        onClick={isRecording ? onStopRecording : onStartRecording}
                        aria-label={isRecording ? "Parar grabación" : "Iniciar grabación"}
                    >
                        <div
                            className={
                                "transition-all duration-200 " +
                                (isRecording
                                    ? "h-6 w-6 rounded-lg bg-red-500"
                                    : "h-8 w-8 rounded-full bg-red-500")
                            }
                        />
                    </button>
                )}

                {/* Botón fullscreen esquina inferior derecha */}
                <button
                    type="button"
                    className="absolute bottom-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-lg text-slate-100 backdrop-blur hover:bg-black/80"
                    onClick={onToggleFullscreen}
                    aria-label="Pantalla completa"
                >
                    ⤢
                </button>

                {/* Botón para abrir/cerrar panel en fullscreen */}
                {isFullscreen && (
                    <button
                        type="button"
                        className="absolute bottom-4 right-16 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-lg text-slate-100 backdrop-blur hover:bg-black/80"
                        onClick={onTogglePanel}
                        aria-label={panelOpen ? "Ocultar ajustes" : "Mostrar ajustes"}
                    >
                        <span>{panelOpen ? "▾" : "▴"}</span>
                    </button>
                )}

                {/* Handle de resize (solo escritorio, casi invisible) */}
                {!isFullscreen && (
                    <div
                        className="pointer-events-auto absolute -bottom-1 -right-1 z-30 h-6 w-6 cursor-se-resize md:flex opacity-0"
                        {...makeCornerHandlers("right")}
                    >
                        <div className="m-auto h-3 w-3 border-b border-r border-slate-400/60" />
                    </div>
                )}

                {/* Bottom sheet dentro del wrapper para que funcione en fullscreen nativo */}
                <FullscreenBottomSheet
                    isFullscreen={isFullscreen}
                    panelOpen={panelOpen}
                    params={params}
                    updateParam={updateParam}
                    onTogglePanel={onTogglePanel}
                />
            </div>
        </div>
    );
};

interface DesktopControlsPanelProps {
    visible: boolean;
    mode: Mode;
    onModeChange: (mode: Mode) => void;
    videoFileName: string;
    onVideoFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onStart: () => void;
    onRecordClick: () => void;
    isRecording: boolean;
    isLive: boolean;
    params: LightGraphParams;
    updateParam: (
        key: keyof LightGraphParams
    ) => (e: React.ChangeEvent<HTMLInputElement>) => void;
    onToggleVisible: () => void;
}

const DesktopControlsPanel: React.FC<DesktopControlsPanelProps> = ({
    visible,
    mode,
    onModeChange,
    videoFileName,
    onVideoFileChange,
    onStart,
    onRecordClick,
    isRecording,
    isLive,
    params,
    updateParam,
    onToggleVisible,
}) => (
    <aside
        className={`w-full max-w-md space-y-4 rounded-2xl bg-slate-900/80 p-4 shadow-lg ring-1 ring-slate-800 backdrop-blur lg:w-80 ${visible ? "block" : "hidden lg:block"
            }`}
    >
        <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Controles
            </span>
            <button
                type="button"
                className="text-[11px] text-slate-400 hover:text-slate-200"
                onClick={onToggleVisible}
            >
                Ocultar panel
            </button>
        </div>

        <div className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Fuente
            </span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-200">
                    <input
                        type="radio"
                        name="mode"
                        value="camera"
                        checked={mode === "camera"}
                        onChange={() => onModeChange("camera")}
                        className="h-4 w-4 border-slate-500 text-sky-400 focus:ring-sky-500"
                    />
                    <span>Cámara</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-200">
                    <input
                        type="radio"
                        name="mode"
                        value="video"
                        checked={mode === "video"}
                        onChange={() => onModeChange("video")}
                        className="h-4 w-4 border-slate-500 text-sky-400 focus:ring-sky-500"
                    />
                    <span>Vídeo subido</span>
                </label>
            </div>

            {mode === "video" && (
                <div className="mt-2 space-y-1">
                    <input
                        title="video input"
                        type="file"
                        accept="video/*"
                        onChange={onVideoFileChange}
                        className="block w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-950/60 text-xs text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-100 hover:file:bg-slate-700"
                    />
                    {videoFileName && (
                        <p className="truncate text-xs text-slate-400">{videoFileName}</p>
                    )}
                </div>
            )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
            <button
                id="startButton"
                className="inline-flex flex-1 items-center justify-center rounded-full bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 shadow hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-900/40"
                onClick={onStart}
            >
                {mode === "camera" ? "Iniciar cámara" : "Iniciar vídeo"}
            </button>

            {/* Botón de grabar solo cuando hay fuente activa */}
            {isLive && (
                <button
                    className="inline-flex flex-none items-center justify-center rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500 hover:bg-slate-800"
                    onClick={onRecordClick}
                >
                    {isRecording ? "Parar & descargar" : "Grabar"}
                </button>
            )}
        </div>

        <div className="flex flex-wrap gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-slate-200">
                <input
                    type="checkbox"
                    checked={!!params.invertEnabled}
                    onChange={updateParam("invertEnabled")}
                    className="h-4 w-4 rounded border-slate-500 text-sky-400 focus:ring-sky-500"
                />
                <span>Negativo</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-200">
                <input
                    type="checkbox"
                    checked={!!params.useHandsMask}
                    onChange={updateParam("useHandsMask")}
                    className="h-4 w-4 rounded border-slate-500 text-sky-400 focus:ring-sky-500"
                />
                <span>Solo manos</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-200">
                <input
                    type="checkbox"
                    checked={!!params.showMask}
                    onChange={updateParam("showMask")}
                    className="h-4 w-4 rounded border-slate-500 text-sky-400 focus:ring-sky-500"
                />
                <span>Ver máscara</span>
            </label>
        </div>

        <div className="mt-2 space-y-3">
            <SliderControl
                label="Umbral luz"
                min={0}
                max={255}
                value={params.threshold ?? defaultParams.threshold}
                onChange={updateParam("threshold")}
            />
            <SliderControl
                label="Área mínima"
                min={1}
                max={50}
                value={params.minArea ?? defaultParams.minArea}
                onChange={updateParam("minArea")}
            />
            <SliderControl
                label="Área máxima"
                min={20}
                max={2000}
                value={params.maxArea ?? defaultParams.maxArea}
                onChange={updateParam("maxArea")}
            />
            <SliderControl
                label="Tamaño máx. lado"
                min={10}
                max={200}
                value={params.maxSide ?? defaultParams.maxSide}
                onChange={updateParam("maxSide")}
            />
            <SliderControl
                label="Nº de blobs"
                min={10}
                max={300}
                value={params.maxBlobs ?? defaultParams.maxBlobs}
                onChange={updateParam("maxBlobs")}
            />
            <SliderControl
                label="Conexiones / nodo"
                min={1}
                max={8}
                value={params.neighbors ?? defaultParams.neighbors}
                onChange={updateParam("neighbors")}
            />
        </div>
    </aside>
);

interface FullscreenBottomSheetProps {
    isFullscreen: boolean;
    panelOpen: boolean;
    params: LightGraphParams;
    updateParam: (
        key: keyof LightGraphParams
    ) => (e: React.ChangeEvent<HTMLInputElement>) => void;
    onTogglePanel: () => void;
}

/**
 * Bottom sheet deslizable en fullscreen:
 * - Se renderiza dentro de `videoWrapper`
 * - Sigue al dedo mientras arrastras la barra superior
 * - Al soltar, encaja arriba (abierto) o abajo (cerrado)
 */
const FullscreenBottomSheet: React.FC<FullscreenBottomSheetProps> = ({
    isFullscreen,
    panelOpen,
    params,
    updateParam,
    onTogglePanel,
}) => {
    const [dragOffset, setDragOffset] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        // Si se cierra desde fuera, reseteamos drag
        if (!panelOpen) {
            setDragOffset(0);
            setIsDragging(false);
        }
    }, [panelOpen]);

    if (!isFullscreen) return null;

    const startDrag = (startY: number) => {
        if (!panelOpen) return; // solo arrastramos cuando está abierto
        setIsDragging(true);
        let currentOffset = 0;
        const MAX_OFFSET = window.innerHeight * 0.55; // coincide con max-h ~55vh
        const THRESHOLD = 72; // píxeles para decidir si cerramos

        const getClientY = (ev: MouseEvent | TouchEvent): number => {
            if ("touches" in ev && ev.touches.length > 0) {
                return ev.touches[0].clientY;
            }
            if ("clientY" in ev) {
                return (ev as MouseEvent).clientY;
            }
            return startY;
        };

        const onMove = (ev: MouseEvent | TouchEvent) => {
            const y = getClientY(ev);
            const delta = y - startY;
            const clamped = Math.max(0, Math.min(delta, MAX_OFFSET));
            currentOffset = clamped;
            setDragOffset(clamped);
        };

        const onUp = () => {
            window.removeEventListener("mousemove", onMove as any);
            window.removeEventListener("mouseup", onUp);
            window.removeEventListener("touchmove", onMove as any);
            window.removeEventListener("touchend", onUp);
            window.removeEventListener("touchcancel", onUp);

            setIsDragging(false);

            if (currentOffset > THRESHOLD) {
                // cerrar
                setDragOffset(0);
                onTogglePanel();
            } else {
                // volver suavemente a posición abierta
                setDragOffset(0);
            }
        };

        window.addEventListener("mousemove", onMove as any);
        window.addEventListener("mouseup", onUp);
        window.addEventListener("touchmove", onMove as any, { passive: false });
        window.addEventListener("touchend", onUp);
        window.addEventListener("touchcancel", onUp);
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        startDrag(e.clientY);
    };

    const handleTouchStart = (e: React.TouchEvent<HTMLButtonElement>) => {
        if (e.touches.length === 0) return;
        e.preventDefault();
        startDrag(e.touches[0].clientY);
    };

    const sheetStyle: React.CSSProperties = {
        transform: !panelOpen
            ? "translateY(100%)"
            : isDragging
                ? `translateY(${dragOffset}px)`
                : "translateY(0)",
        transition: isDragging ? "none" : "transform 0.25s ease-out",
        willChange: "transform",
    };

    return (
        <section
            className="fixed inset-x-0 bottom-0 z-40 max-h-[55vh] bg-slate-900/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_rgba(0,0,0,0.7)] backdrop-blur"
            style={sheetStyle}
        >
            <div className="mx-auto flex max-w-3xl flex-col gap-4 overflow-y-auto px-4 pt-3 pb-4">
                {/* Barra tipo iOS: deslizar hacia abajo para cerrar */}
                <button
                    type="button"
                    className="mx-auto h-1.5 w-12 rounded-full bg-slate-600"
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleTouchStart}
                    aria-label="Desliza hacia abajo para cerrar el panel"
                />

                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-100">
                        Ajustes en directo
                    </h3>
                    {/* Botón interno para colapsar */}
                    <button
                        type="button"
                        onClick={onTogglePanel}
                        className="rounded-full border border-slate-600 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-800"
                    >
                        Cerrar
                    </button>
                </div>

                <div className="flex flex-wrap gap-3">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-200">
                        <input
                            type="checkbox"
                            checked={!!params.invertEnabled}
                            onChange={updateParam("invertEnabled")}
                            className="h-4 w-4 rounded border-slate-500 text-sky-400 focus:ring-sky-500"
                        />
                        <span>Negativo</span>
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-slate-200">
                        <input
                            type="checkbox"
                            checked={!!params.useHandsMask}
                            onChange={updateParam("useHandsMask")}
                            className="h-4 w-4 rounded border-slate-500 text-sky-400 focus:ring-sky-500"
                        />
                        <span>Solo manos</span>
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-slate-200">
                        <input
                            type="checkbox"
                            checked={!!params.showMask}
                            onChange={updateParam("showMask")}
                            className="h-4 w-4 rounded border-slate-500 text-sky-400 focus:ring-sky-500"
                        />
                        <span>Ver máscara</span>
                    </label>
                </div>

                <div className="space-y-3 pb-2">
                    <SliderControl
                        label="Umbral luz"
                        min={0}
                        max={255}
                        value={params.threshold ?? defaultParams.threshold}
                        onChange={updateParam("threshold")}
                    />
                    <SliderControl
                        label="Área mínima"
                        min={1}
                        max={50}
                        value={params.minArea ?? defaultParams.minArea}
                        onChange={updateParam("minArea")}
                    />
                    <SliderControl
                        label="Área máxima"
                        min={20}
                        max={2000}
                        value={params.maxArea ?? defaultParams.maxArea}
                        onChange={updateParam("maxArea")}
                    />
                    <SliderControl
                        label="Tamaño máx. lado"
                        min={10}
                        max={200}
                        value={params.maxSide ?? defaultParams.maxSide}
                        onChange={updateParam("maxSide")}
                    />
                    <SliderControl
                        label="Nº de blobs"
                        min={10}
                        max={300}
                        value={params.maxBlobs ?? defaultParams.maxBlobs}
                        onChange={updateParam("maxBlobs")}
                    />
                    <SliderControl
                        label="Conexiones / nodo"
                        min={1}
                        max={8}
                        value={params.neighbors ?? defaultParams.neighbors}
                        onChange={updateParam("neighbors")}
                    />
                </div>
            </div>
        </section>
    );
};

const HelpSection: React.FC = () => {
    const [open, setOpen] = useState(true);

    return (
        <section className="mt-4 rounded-2xl bg-slate-900/60 p-4 text-sm text-slate-300 ring-1 ring-slate-800">
            <button
                type="button"
                className="flex w-full items-center justify-between text-left"
                onClick={() => setOpen((v) => !v)}
            >
                <h2 className="text-sm font-semibold text-slate-100 md:text-base">
                    Cómo usarlo
                </h2>
                <span className="text-xs text-slate-400">
                    {open ? "Ocultar" : "Mostrar"}
                </span>
            </button>

            {open && (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>
                        Elige <strong>Cámara</strong> o <strong>Vídeo subido</strong>.
                    </li>
                    <li>
                        En modo vídeo, selecciona un archivo y pulsa{" "}
                        <strong>“Iniciar vídeo”</strong>.
                    </li>
                    <li>
                        Ajusta <strong>umbral</strong>, tamaños y número de blobs para
                        controlar la densidad de la red.
                    </li>
                    <li>
                        Usa <strong>Negativo</strong>, <strong>Solo manos</strong> y{" "}
                        <strong>Ver máscara</strong> para cambiar el carácter del efecto.
                    </li>
                    <li>
                        En móvil, entra en <strong>Pantalla completa</strong> y abre el
                        panel inferior con la flecha para manipular parámetros en directo.
                    </li>
                    <li>
                        En escritorio, puedes ajustar el ancho del panel arrastrando la
                        esquina inferior derecha del preview.
                    </li>
                </ul>
            )}
        </section>
    );
};

interface SliderProps {
    label: string;
    min: number;
    max: number;
    value: number;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const SliderControl: React.FC<SliderProps> = ({
    label,
    min,
    max,
    value,
    onChange,
}) => (
    <label className="block text-xs text-slate-200">
        <div className="mb-1 flex items-center justify-between">
            <span>{label}</span>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-100">
                {value}
            </span>
        </div>
        <input
            type="range"
            min={min}
            max={max}
            value={value}
            onChange={onChange}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-sky-400"
        />
    </label>
);

export default LightGraphIsland;
