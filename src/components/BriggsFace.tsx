import {
  Alignment,
  Fit,
  Layout,
  RuntimeLoader,
  useRive,
} from "@rive-app/react-canvas";
import { useEffect, useState } from "react";

import rivSrc from "../assets/5briggs_face_animations.riv";
import fallbackSrc from "../assets/allexpression.webp";
import { widgetAssetUrl } from "../lib/widget-asset-url";

// Rive's runtime is a 1.7MB WASM binary. Importing it with `?url` base64-inlined
// it into widget-ui.js, where it accounted for two thirds of the bundle every
// host page had to download and parse before the launcher could paint. It now
// ships as a sibling file (see the emit-rive-wasm plugin) and is fetched in
// parallel, off the critical path.
RuntimeLoader.setWasmUrl(widgetAssetUrl("rive.wasm"));

interface BriggsFaceProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel?: (e: React.PointerEvent<HTMLButtonElement>) => void;
}

export function BriggsFace({
  className,
  style,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: BriggsFaceProps) {
  const [riveFailed, setRiveFailed] = useState(false);
  const [isRuntimeReady, setIsRuntimeReady] = useState(false);

  // The webp is an animated fallback and is inlined in the bundle, so it paints
  // with no network at all; Rive takes over once its runtime lands. This also
  // covers the WASM never arriving — `awaitInstance` resolves on success but
  // never rejects (Rive only logs), so a hung load simply leaves the webp up
  // instead of the blank canvas an onLoadError-only path would leave behind.
  useEffect(() => {
    let cancelled = false;
    void RuntimeLoader.awaitInstance().then(() => {
      if (!cancelled) setIsRuntimeReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { RiveComponent } = useRive({
    src: rivSrc,
    artboard: "viewport 2",
    stateMachines: "State Machine 1",
    autoplay: true,
    layout: new Layout({
      fit: Fit.Contain,
      alignment: Alignment.Center,
    }),
    onLoadError: () => setRiveFailed(true),
  });

  return (
    <button
      type="button"
      className={className}
      style={{ ...style, filter: "none" }}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {isRuntimeReady && !riveFailed ? (
        <RiveComponent style={{ width: "100%", height: "100%" }} />
      ) : (
        <img
          src={fallbackSrc}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      )}
    </button>
  );
}
