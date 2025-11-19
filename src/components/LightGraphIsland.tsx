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
    useHandMask: false,
};

const LightGraphIsland: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const processorRef = useRef<ReturnType<typeof createLightGraphProcessor> | null>(null);
    const paramsRef = useRef<LightGraphParams>(defaultParams);

    const [params, setParams] = useState<LightGraphParams>(defaultParams);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [status, setStatus] = useState("Cargando OpenCV.js…");

    // Inicializar processor cuando existan video + canvas

    useEffect(() => {
        paramsRef.current = params;
    }, [params]);
    useEffect(() => {
        if (!videoRef.current || !canvasRef.current) return;

        processorRef.current = createLightGraphProcessor(
            videoRef.current,
            canvasRef.current,
            () => paramsRef.current   // � siempre lee los últimos params
        );

        setStatus("Listo. Pulsa 'Iniciar cámara'.");

        return () => {
            processorRef.current?.stop();
        };
    }, []);

    const startCamera = async () => {
        try {
            setStatus("Iniciando cámara…");
            await processorRef.current?.start();
            setStatus("Cámara en marcha �. Ajusta los sliders para moldear la visual.");
        } catch (err) {
            console.error(err);
            setStatus("Error al iniciar la cámara.");
        }
    };

    const toggleFullscreen = () => {
        const wrapper = canvasRef.current?.parentElement;
        if (!wrapper) return;

        // Casteamos a any para poder usar las variantes vendor
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
            // Fallback CSS
            const isFs = document.body.classList.toggle("is-fullscreen");
            if (!isFs) {
                document.body.classList.remove("is-fullscreen");
            }
        }
    };

    const exitFullscreen = () => {
        const isNativeFs =
            !!document.fullscreenElement ||
            // @ts-ignore
            !!document.webkitFullscreenElement ||
            // @ts-ignore
            !!document.msFullscreenElement;

        if (isNativeFs) {
            if (document.exitFullscreen) {
                document.exitFullscreen();
                // @ts-ignore
            } else if (document.webkitExitFullscreen) {
                // @ts-ignore
                document.webkitExitFullscreen();
                // @ts-ignore
            } else if (document.msExitFullscreen) {
                // @ts-ignore
                document.msExitFullscreen();
            }
        }
        document.body.classList.remove("is-fullscreen");
    };

    // Handlers sliders/toggles
    const updateParam =
        (key: keyof LightGraphParams) =>
            (e: React.ChangeEvent<HTMLInputElement>) => {
                const isBooleanKey =
                    key === "invertEnabled" || key === "useHandsMask";

                const value = isBooleanKey ? e.target.checked : Number(e.target.value);
                setParams((prev) => ({
                    ...prev,
                    [key]: value,
                }));
            };

    return (
        <section className="blob-tracker">
            <h1>✨ Picos de luz conectados (tipo red)</h1>
            <p className="intro">
                Esta demo abre la cámara, detecta <strong>picos de luz</strong>, dibuja
                cuadros y los conecta como una red. Usa los sliders para cambiar la
                estética.
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
                <div className="controls-row">
                    <button
                        id="startButton"
                        className="primary-button"
                        onClick={startCamera}
                    >
                        Iniciar cámara
                    </button>

                    <button
                        id="fullscreenButton"
                        className="secondary-button"
                        onClick={toggleFullscreen}
                    >
                        Pantalla completa
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
                                    value={params.minArea ?? defaultParams.minArea}
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
                    <li>Pulsa <strong>“Iniciar cámara”</strong> y acepta el permiso.</li>
                    <li>
                        Ajusta la <strong>sensibilidad</strong> y los tamaños para controlar
                        cuántos cuadros aparecen.
                    </li>
                    <li>
                        Usa <strong>“Interior en negativo”</strong> y las conexiones para
                        jugar con la estética.
                    </li>
                    <li>
                        Usa <strong>“Pantalla completa”</strong> para modo performance
                        (aparece una ✕ arriba para salir).
                    </li>
                </ul>
            </section>
        </section>
    );
};

export default LightGraphIsland;
