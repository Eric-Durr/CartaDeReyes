/** @jsxImportSource react */
import React from "react";

const LightGraphHelp: React.FC = () => (
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
                Pulsa <strong>“Grabar & descargar”</strong> o el círculo en
                fullscreen para capturar lo que se ve en el canvas.
            </li>
        </ul>
    </section>
);

export default LightGraphHelp;
