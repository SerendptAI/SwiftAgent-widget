import {
  Alignment,
  Fit,
  Layout,
  RuntimeLoader,
  useRive,
} from "@rive-app/react-canvas";

import riveWasmUrl from "@rive-app/canvas/rive.wasm?url";
import rivSrc from "../assets/5briggs_face_animations.riv";

// Rive fetches its WebAssembly runtime from unpkg.com by default. Host sites
// with a strict Content Security Policy block that cross-origin request, so the
// mascot never initializes and renders blank. Point Rive at the WASM bundled
// into the widget (inlined as a data URI) so it loads from the same
// self-contained asset on every host page, regardless of their CSP.
RuntimeLoader.setWasmUrl(riveWasmUrl);

interface BriggsFaceProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export function BriggsFace({ className, style, onClick }: BriggsFaceProps) {
  const { RiveComponent } = useRive({
    src: rivSrc,
    artboard: "viewport 2",
    stateMachines: "State Machine 1",
    autoplay: true,
    layout: new Layout({
      fit: Fit.Contain,
      alignment: Alignment.Center,
    }),
  });

  return (
    <button
      type="button"
      className={className}
      style={{ ...style, filter: "none" }}
      onClick={onClick}
    >
      <RiveComponent style={{ width: "100%", height: "100%" }} />
    </button>
  );
}
