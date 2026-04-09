import { MoreHorizontal } from "lucide-react";

import { cn } from "../lib/cn";
import { Icons } from "./icons";

interface WidgetMinimizedControlsProps {
  isMuted: boolean;
  handleEndCall: () => void;
  playTouchSound: () => void;
  toggleMute: () => void;
  setIsMinimized: (val: boolean) => void;
}

export function WidgetMinimizedControls({
  isMuted,
  handleEndCall,
  playTouchSound,
  toggleMute,
  setIsMinimized,
}: WidgetMinimizedControlsProps) {
  return (
    <div className="pointer-events-none fixed right-0 bottom-0 z-50 h-full w-full">
      {/* Main Restore Button - Bottom Right */}
      <button
        onClick={() => setIsMinimized(false)}
        className="widget-animate-float-in pointer-events-auto absolute z-30 flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_8px_24px_rgba(0,0,0,0.15)] transition-transform hover:scale-105 hover:shadow-[0_12px_28px_rgba(0,0,0,0.2)] sm:h-[72px] sm:w-[72px]"
        style={{ bottom: "30px", right: "30px" }}
        title="Expand Call"
      >
        <Icons.phoneIncoming className="h-7 w-7 animate-pulse text-black sm:h-8 sm:w-8" />
      </button>

      {/* End Call */}
      <button
        onClick={handleEndCall}
        className="widget-animate-control-1 pointer-events-auto absolute z-20 flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-[#f25430] text-white shadow-lg transition hover:scale-105 hover:bg-red-600 hover:shadow-xl sm:h-[56px] sm:w-[56px]"
        style={{ bottom: "145px", right: "15px" }}
        title="End Call"
      >
        <Icons.phonedown className="h-6 w-6" />
      </button>

      {/* Mute */}
      <button
        onClick={() => {
          playTouchSound();
          toggleMute();
        }}
        className={cn(
          "widget-animate-control-2 pointer-events-auto absolute z-20 flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full shadow-lg transition hover:scale-105 hover:shadow-xl sm:h-[56px] sm:w-[56px]",
          isMuted
            ? "bg-[#FBCDC3] text-red-600 hover:bg-red-200"
            : "bg-[#fce5e1] text-gray-700 hover:bg-[#faccd0]",
        )}
        style={{ bottom: "136px", right: "83px" }}
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? (
          <Icons.micoff className="h-5 w-5 sm:h-6 sm:w-6" />
        ) : (
          <Icons.mic className="h-5 w-5 sm:h-6 sm:w-6" />
        )}
      </button>

      {/* Speaker */}
      <button
        onClick={playTouchSound}
        className="widget-animate-control-3 pointer-events-auto absolute z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg transition hover:scale-105 hover:bg-gray-50 hover:shadow-xl sm:h-12 sm:w-12"
        style={{ bottom: "85px", right: "129px" }}
        title="Speaker"
      >
        <Icons.Speaker className="h-5 w-5" />
      </button>

      {/* More */}
      <button
        onClick={playTouchSound}
        className="widget-animate-control-4 pointer-events-auto absolute z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-gray-700 shadow-md transition hover:scale-105 hover:bg-gray-200 sm:h-12 sm:w-12"
        style={{ bottom: "17px", right: "120px" }}
        title="More Options"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
    </div>
  );
}
