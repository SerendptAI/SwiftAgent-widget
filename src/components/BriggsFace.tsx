import riveWasmUrl from "@rive-app/canvas/rive.wasm?url";
import {
  Alignment,
  Fit,
  Layout,
  RuntimeLoader,
  useRive,
} from "@rive-app/react-canvas";
import { useState } from "react";

import rivSrc from "../assets/5briggs_face_animations.riv";
import fallbackSrc from "../assets/allexpression.webp";

RuntimeLoader.setWasmUrl(riveWasmUrl);

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
      {riveFailed ? (
        <img
          src={fallbackSrc}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      ) : (
        <RiveComponent style={{ width: "100%", height: "100%" }} />
      )}
    </button>
  );
}
