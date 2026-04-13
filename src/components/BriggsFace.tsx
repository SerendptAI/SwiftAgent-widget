import { Alignment, Fit, Layout, useRive } from "@rive-app/react-canvas";

import rivSrc from "../assets/5briggs_face_animations.riv";

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
    <button type="button" className={className} style={style} onClick={onClick}>
      <RiveComponent style={{ width: "100%", height: "100%" }} />
    </button>
  );
}
