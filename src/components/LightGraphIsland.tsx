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
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

    // � nuevo: ancho ajustable del panel de preview (en px)
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
        const wrapper = canvasRef.current?.parentElement?.parentElement; // el que tiene id="videoWrapper"
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

    // ====== RENDER ======

    return (
        <section className="min-h-screen bg-slate-950 text-slate-100">
            <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:py-8">
                <HeaderBar
                    controlsVisible={controlsVisible}
                    onToggleControls={() => setControlsVisible((v) => !v)}
                />

                <div className="lg-layout-main">
                    <PreviewArea
                        videoRef={videoRef}
                        canvasRef={canvasRef}
                        mode={mode}
                        status={status}
                        isRecording={isRecording}
                        isFullscreen={isFullscreen}
                        panelOpen={panelOpen}
                        previewWidth={previewWidth}
                        onResizeWidth={setPreviewWidth}
                        onExitFullscreen={exitFullscreen}
                        onToggleFullscreen={toggleFullscreen}
                        onStartRecording={startRecording}
                        onStopRecording={stopRecording}
                        onTogglePanel={togglePanel}
                    />

                    <DesktopControlsPanel
                        visible={controlsVisible}
                        mode={mode}
                        onModeChange={setMode}
                        videoFileName={videoFileName}
                        onVideoFileChange={handleVideoFileChange}
                        onStart={handleStart}
                        onRecordClick={() =>
                            isRecording ? stopRecording() : startRecording()
                        }
                        isRecording={isRecording}
                        params={params}
                        updateParam={updateParam}
                    />
                </div>

                <HelpSection />
            </div>

            <FullscreenBottomSheet
                isFullscreen={isFullscreen}
                panelOpen={panelOpen}
                params={params}
                updateParam={updateParam}
            />
        </section>
    );
};

// ====== SUBCOMPONENTES ======

interface HeaderBarProps {
    controlsVisible: boolean;
    onToggleControls: () => void;
}

const HeaderBar: React.FC<HeaderBarProps> = ({
    controlsVisible,
    onToggleControls,
}) => (
    <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
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

        <button
            className="mt-2 inline-flex w-max items-center justify-center rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500 hover:bg-slate-800 md:mt-0"
            onClick={onToggleControls}
        >
            {controlsVisible ? "Ocultar panel" : "Mostrar panel"}
        </button>
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
    previewWidth: number | null;
    onResizeWidth: (w: number | null) => void;
    onExitFullscreen: () => void;
    onToggleFullscreen: () => void;
    onStartRecording: () => void;
    onStopRecording: () => void;
    onTogglePanel: () => void;
}

const PreviewArea: React.FC<PreviewAreaProps> = ({
    videoRef,
    canvasRef,
    mode,
    status,
    isRecording,
    isFullscreen,
    panelOpen,
    previewWidth,
    onResizeWidth,
    onExitFullscreen,
    onToggleFullscreen,
    onStartRecording,
    onStopRecording,
    onTogglePanel,
}) => {
    const wrapperRef = useRef<HTMLDivElement | null>(null);

    const handleResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isFullscreen) return; // nada de redimensionar en fullscreen
        e.preventDefault();
        e.stopPropagation();

        if (!wrapperRef.current) return;
        const startX = e.clientX;
        const rect = wrapperRef.current.getBoundingClientRect();
        const startWidth = rect.width;

        const onMove = (ev: MouseEvent) => {
            const delta = ev.clientX - startX;
            let newWidth = startWidth + delta;
            const min = 320;
            const max = Math.min(window.innerWidth - 32, 1200);
            if (newWidth < min) newWidth = min;
            if (newWidth > max) newWidth = max;
            onResizeWidth(newWidth);
        };

        const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    };

    const wrapperStyle: React.CSSProperties =
        !isFullscreen && previewWidth
            ? { width: `${previewWidth}px` }
            : { width: "100%" };

    return (
        <div className="flex flex-1 flex-col items-center gap-3">
            {/* Status linea */}
            <p className="w-full rounded-full bg-slate-900/80 px-4 py-2 text-xs text-slate-300 shadow-sm ring-1 ring-slate-800 md:text-sm">
                {status}
            </p>

            <div
                id="videoWrapper"
                ref={wrapperRef}
                style={wrapperStyle}
                className="relative max-w-full overflow-hidden rounded-xl bg-black shadow-xl ring-1 ring-slate-800"
            >
                <div className="relative w-full pb-[56.25%]">
                    <video
                        id="videoInput"
                        ref={videoRef}
                        className="hidden"
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
                        className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-xs text-slate-100 backdrop-blur hover:bg-black/80"
                        aria-label="Salir de pantalla completa"
                        onClick={onExitFullscreen}
                    >
                        ✕
                    </button>
                )}

                {/* Chip de estado */}
                <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-black/60 px-3 py-1 text-[11px] text-slate-100 backdrop-blur sm:text-xs">
                    Live • {mode === "camera" ? "Cámara" : "Vídeo"}
                </div>

                {/* Botón circular de grabar */}
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

                {/* Botón fullscreen en esquina inferior derecha */}
                <button
                    type="button"
                    className="absolute bottom-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-lg text-slate-100 backdrop-blur hover:bg-black/80"
                    onClick={onToggleFullscreen}
                    aria-label="Pantalla completa"
                >
                    ⤢
                </button>

                {/* Botón para abrir/cerrar panel en móvil (solo fullscreen) */}
                {isFullscreen && (
                    <button
                        type="button"
                        className="absolute bottom-4 right-16 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-lg text-slate-100 backdrop-blur hover:bg-black/80 lg:hidden"
                        onClick={onTogglePanel}
                        aria-label={panelOpen ? "Ocultar ajustes" : "Mostrar ajustes"}
                    >
                        <span>{panelOpen ? "▾" : "▴"}</span>
                    </button>
                )}

                {/* � Handle de resize en la esquina inferior derecha (solo fuera de fullscreen) */}
                {!isFullscreen && (
                    <div
                        className="absolute bottom-1 right-1 z-10 flex h-4 w-4 cursor-se-resize items-end justify-end rounded bg-slate-700/80 hover:bg-slate-500/90"
                        onMouseDown={handleResizeMouseDown}
                        title="Arrastra para ajustar el tamaño"
                    >
                        <div className="h-3 w-3 border-b border-r border-slate-300/80" />
                    </div>
                )}
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
    params: LightGraphParams;
    updateParam: (
        key: keyof LightGraphParams
    ) => (e: React.ChangeEvent<HTMLInputElement>) => void;
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
    params,
    updateParam,
}) => (
    <aside
        className={`w-full max-w-md space-y-4 rounded-2xl bg-slate-900/80 p-4 shadow-lg ring-1 ring-slate-800 backdrop-blur lg:w-80 ${visible ? "block" : "hidden lg:block"
            }`}
    >
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
                        <p className="truncate text-xs text-slate-400">
                            {videoFileName}
                        </p>
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

            <button
                className="inline-flex flex-none items-center justify-center rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500 hover:bg-slate-800"
                onClick={onRecordClick}
            >
                {isRecording ? "Parar & descargar" : "Grabar"}
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
}

const FullscreenBottomSheet: React.FC<FullscreenBottomSheetProps> = ({
    isFullscreen,
    panelOpen,
    params,
    updateParam,
}) =>
    !isFullscreen ? null : (
        <section
            className={
                "fixed inset-x-0 bottom-0 z-40 max-h-[55vh] transform bg-slate-900/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_rgba(0,0,0,0.7)] backdrop-blur transition-transform duration-300 lg:hidden " +
                (panelOpen ? "translate-y-0" : "translate-y-full")
            }
        >
            <div className="mx-auto flex max-w-lg flex-col gap-4 overflow-y-auto px-4 pt-3 pb-4">
                <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-600" />
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-100">
                        Ajustes en directo
                    </h3>
                    <span className="text-[11px] text-slate-400">Fullscreen</span>
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

const HelpSection: React.FC = () => (
    <section className="mt-4 rounded-2xl bg-slate-900/60 p-4 text-sm text-slate-300 ring-1 ring-slate-800">
        <h2 className="mb-2 text-sm font-semibold text-slate-100 md:text-base">
            Cómo usarlo
        </h2>
        <ul className="list-disc space-y-1 pl-5">
            <li>
                Elige <strong>Cámara</strong> o <strong>Vídeo subido</strong>.
            </li>
            <li>
                En modo vídeo, selecciona un archivo y pulsa{" "}
                <strong>“Iniciar vídeo”</strong>.
            </li>
            <li>
                Ajusta <strong>umbral</strong>, tamaños y número de blobs para controlar
                la densidad de la red.
            </li>
            <li>
                Usa <strong>Negativo</strong>, <strong>Solo manos</strong> y{" "}
                <strong>Ver máscara</strong> para cambiar el carácter del efecto.
            </li>
            <li>
                En móvil, entra en <strong>Pantalla completa</strong> y abre el panel
                inferior con la flecha para manipular parámetros en directo.
            </li>
            <li>
                En escritorio, puedes ajustar el tamaño del panel arrastrando la esquina
                inferior derecha del preview.
            </li>
        </ul>
    </section>
);

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
