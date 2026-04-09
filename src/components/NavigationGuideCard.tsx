import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { NavigationGuide } from "./types";

interface NavigationGuideCardProps {
  guide: NavigationGuide;
  compact?: boolean;
}

export function NavigationGuideCard({
  guide,
  compact,
}: NavigationGuideCardProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [imgNatural, setImgNatural] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const steps = guide.steps;

  const handleImgLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
    },
    [],
  );

  // Lock body scroll when lightbox is open
  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  if (!steps.length) return null;

  const current = steps[activeStep];
  const hasMultiple = steps.length > 1;

  // Convert pixel coords to percentages relative to the image's natural size
  const h = current.highlight;
  const pct =
    imgNatural && h
      ? {
          left: (h.x / imgNatural.w) * 100,
          top: (h.y / imgNatural.h) * 100,
          width: (h.w / imgNatural.w) * 100,
          height: (h.h / imgNatural.h) * 100,
          cx: ((h.x + h.w / 2) / imgNatural.w) * 100,
          cy: ((h.y + h.h / 2) / imgNatural.h) * 100,
        }
      : null;

  const screenshotWithHighlight = (full?: boolean) => (
    <div className="relative">
      <img
        src={current.screenshot_url}
        alt={current.page_title}
        className="block w-full"
        draggable={false}
        onLoad={handleImgLoad}
      />
      {pct && (
        <>
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `rgba(0,0,0,0.35)`,
              maskImage: `radial-gradient(ellipse ${pct.width + 3}% ${pct.height + 6}% at ${pct.cx}% ${pct.cy}%, transparent 50%, black 51%)`,
              WebkitMaskImage: `radial-gradient(ellipse ${pct.width + 3}% ${pct.height + 6}% at ${pct.cx}% ${pct.cy}%, transparent 50%, black 51%)`,
            }}
          />
          <div
            className={`pointer-events-none absolute rounded-lg border-2 border-[#1a73e8] ${full ? "shadow-[0_0_0_4px_rgba(26,115,232,0.3)]" : "shadow-[0_0_0_3px_rgba(26,115,232,0.3)]"}`}
            style={{
              left: `calc(${pct.left}% - 4px)`,
              top: `calc(${pct.top}% - 4px)`,
              width: `calc(${pct.width}% + 8px)`,
              height: `calc(${pct.height}% + 8px)`,
            }}
          />
        </>
      )}
    </div>
  );

  return (
    <div className={`${compact ? "mt-2 max-w-[200px]" : "mt-3 max-w-[260px]"}`}>
      {/* Thumbnail — click to expand */}
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="relative block w-full cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
      >
        {screenshotWithHighlight()}
        <div className="absolute right-1.5 bottom-1.5 rounded-md bg-black/50 px-2 py-0.5 text-[10px] text-white">
          Click to view
        </div>
      </button>

      {/* Lightbox — portaled to body to escape stacking contexts */}
      {expanded &&
        createPortal(
          <div
            role="button"
            tabIndex={0}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 sm:p-8"
            onClick={() => setExpanded(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setExpanded(false);
            }}
          >
            <div
              role="presentation"
              className="relative flex max-h-[90vh] w-full max-w-[700px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setExpanded(false)}
                className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="min-h-0 flex-1 overflow-auto">
                <div className="overflow-hidden">
                  {screenshotWithHighlight(true)}
                </div>
              </div>
              <div className="shrink-0 border-t border-gray-100 px-5 py-4">
                <div className="flex items-start gap-2 text-[14px]">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1a73e8] text-[12px] font-bold text-white">
                    {current.step}
                  </span>
                  <p className="leading-relaxed text-gray-700">
                    {current.instruction}
                  </p>
                </div>
                {hasMultiple && (
                  <div className="mt-3 flex items-center justify-between">
                    <button
                      onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
                      disabled={activeStep === 0}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 disabled:opacity-30"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-[12px] text-gray-400">
                      Step {activeStep + 1} of {steps.length}
                    </span>
                    <button
                      onClick={() =>
                        setActiveStep((s) => Math.min(steps.length - 1, s + 1))
                      }
                      disabled={activeStep === steps.length - 1}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 disabled:opacity-30"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
