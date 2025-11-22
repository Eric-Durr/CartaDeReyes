/** @jsxImportSource react */
import React from "react";
import type { LightGraphParams } from "../scripts/lightGraphTypes";

type Mode = "camera" | "video";

interface DesktopControlsProps {
    controlsVisible: boolean;
    onToggleControls: () => void;

    mode: Mode;
    onModeChange: (mode: Mode) => void;

    videoFileName: string;
    onVideoFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;

    onStart: () => void;
    onFullscreen: () => void;

    isRecording: boolean;
    onToggleRecording: () => void;

    params: LightGraphParams;
    defaultParams: LightGraphParams;
    updateParam: (
        key: keyof LightGraphParams
    ) => (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const DesktopControls: React.FC<DesktopControlsProps> = ({
    controlsVisible,
    onToggleControls,
    mode,
    onModeChange,
    videoFileName,
    onVideoFileChange,
    onStart,
    onFullscreen,
    isRecording,
    onToggleRecording,
    params,
    defaultParams,
    updateParam,
}) => {
    return (
        <>
            <button
                id="toggleControlsButton"
                className="secondary-button small-toggle"
                onClick={onToggleControls}
            >
                {controlsVisible ? "Ocultar controles" : "Mostrar controles"}
            </button>

            {/* Controles “de escritorio” (fuera de fullscreen) */}
            <div
                className={
                    "controls" + (controlsVisible ? "" : " controls--hidden")
                }
            >
                <div className="controls-row">
                    <span>Fuente:</span>
                    <label className="toggle">
                        <input
                            type="radio"
                            name="mode"
                            value="camera"
                            checked={mode === "camera"}
                            onChange={() => onModeChange("camera")}
                        />
                        <span>Cámara</span>
                    </label>
                    <label className="toggle">
                        <input
                            type="radio"
                            name="mode"
                            value="video"
                            checked={mode === "video"}
                            onChange={() => onModeChange("video")}
                        />
                        <span>Vídeo subido</span>
                    </label>

                    {mode === "video" && (
                        <>
                            <input
                                title="video input"
                                type="file"
                                accept="video/*"
                                onChange={onVideoFileChange}
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
                        onClick={onStart}
                    >
                        {mode === "camera" ? "Iniciar cámara" : "Iniciar vídeo"}
                    </button>

                    <button
                        id="fullscreenButton"
                        className="secondary-button"
                        onClick={onFullscreen}
                    >
                        Pantalla completa
                    </button>

                    <button
                        className="secondary-button"
                        onClick={onToggleRecording}
                    >
                        {isRecording ? "Parar y descargar" : "Grabar & descargar"}
                    </button>

                    {/* Toggles estilizados */}
                    <label className="toggle">
                        <input
                            type="checkbox"
                            id="invertToggle"
                            checked={!!params.invertEnabled}
                            onChange={updateParam("invertEnabled")}
                            className="sr-only peer"
                        />
                        <div
                            className={
                                "relative w-9 h-5 bg-neutral-quaternary " +
                                "peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-soft " +
                                "rounded-full peer " +
                                "peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full " +
                                "after:content-[''] after:absolute after:top-[2px] after:start-[2px] " +
                                "after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all " +
                                "peer-checked:bg-green-400"
                            }
                        ></div>
                        <span className="select-none ms-3 text-sm font-medium text-heading">
                            Interior en negativo
                        </span>
                    </label>

                    <label className="toggle">
                        <input
                            type="checkbox"
                            id="handsToggle"
                            checked={!!params.useHandsMask}
                            onChange={updateParam("useHandsMask")}
                            className="sr-only peer"
                        />
                        <div
                            className={
                                "relative w-9 h-5 bg-neutral-quaternary " +
                                "peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-soft " +
                                "rounded-full peer " +
                                "peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full " +
                                "after:content-[''] after:absolute after:top-[2px] after:start-[2px] " +
                                "after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all " +
                                "peer-checked:bg-green-400"
                            }
                        ></div>
                        <span className="select-none ms-3 text-sm font-medium text-heading">
                            Limitar a manos
                        </span>
                    </label>

                    <label className="toggle">
                        <input
                            type="checkbox"
                            id="maskToggle"
                            checked={!!params.showMask}
                            onChange={updateParam("showMask")}
                            className="sr-only peer"
                        />
                        <div
                            className={
                                "relative w-9 h-5 bg-neutral-quaternary " +
                                "peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-soft " +
                                "rounded-full peer " +
                                "peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full " +
                                "after:content-[''] after:absolute after:top-[2px] after:start-[2px] " +
                                "after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all " +
                                "peer-checked:bg-green-400"
                            }
                        ></div>
                        <span className="select-none ms-3 text-sm font-medium text-heading">
                            Ver máscara
                        </span>
                    </label>
                </div>

                {/* Sliders */}
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
        </>
    );
};

export default DesktopControls;
