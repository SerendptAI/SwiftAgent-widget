import { MoreHorizontal } from "lucide-react";

import { cn } from "../lib/cn";
import { BriggsFace } from "./BriggsFace";
import { Icons } from "./icons";
import { getFriendlyStatus } from "./utils";

interface WidgetCallTabProps {
  companyName?: string;
  isMuted: boolean;
  statusText: string;
  errorMessage: string | null;
  showHashInput: boolean;
  setShowHashInput: React.Dispatch<React.SetStateAction<boolean>>;
  hashValue: string;
  setHashValue: (val: string) => void;
  handleHashSubmit: () => void;
  playTouchSound: () => void;
  toggleMute: () => void;
  handleEndCall: () => void;
}

export function WidgetCallTab({
  companyName,
  isMuted,
  statusText,
  errorMessage,
  showHashInput,
  setShowHashInput,
  hashValue,
  setHashValue,
  handleHashSubmit,
  playTouchSound,
  toggleMute,
  handleEndCall,
}: WidgetCallTabProps) {
  return (
    <div className="relative flex h-full max-h-[calc(100vh-130px)] w-full flex-col items-center justify-between overflow-y-auto py-4 text-center sm:px-8 sm:py-14">
      <div className="flex w-full flex-col items-center gap-4 sm:gap-8">
        <div className="widget-animate-float-in flex flex-col items-center gap-2">
          <div className="text-xl font-semibold text-gray-400 uppercase sm:text-sm">
            {companyName ? `${companyName}  ` : ""}
          </div>
          <div
            className={cn(
              "text-xs font-semibold uppercase sm:text-sm",
              isMuted ? "text-red-500" : "text-gray-400",
            )}
          >
            {isMuted ? "Muted" : getFriendlyStatus(statusText)}
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="pointer-events-none absolute inset-x-0 top-20 z-10 w-full px-4 sm:top-28 sm:px-12">
          <div className="mx-auto max-w-lg">
            <p className="pointer-events-auto rounded-lg bg-red-50 px-3 py-2 font-mono text-xs text-red-700 sm:text-sm">
              {errorMessage}
            </p>
          </div>
        </div>
      )}

      <div className="widget-animate-scale-in flex items-center justify-center py-6">
        <BriggsFace
          className="flex h-48 w-48 items-center justify-center overflow-hidden rounded-full"
        />
      </div>

      {showHashInput && (
        <div className="animate-in slide-in-from-bottom-4 font-dm-mono w-full max-w-lg px-4 pb-2 duration-200">
          <div className="relative mb-3">
            <div className="flex items-center gap-3 rounded-md bg-gray-100 py-2 pr-2 pl-5">
              <input
                type="text"
                value={hashValue}
                onChange={(e) => setHashValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleHashSubmit()}
                placeholder="WRITE YOUR HASHCODE OR TRANSACTION ID OR TICKET ID"
                className="flex-1 bg-transparent text-xs text-gray-600 placeholder-gray-400 outline-none sm:text-sm"
              />
              <button
                onClick={handleHashSubmit}
                disabled={!hashValue.trim()}
                className="flex shrink-0 items-center gap-1.5 rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-opacity hover:bg-blue-600 disabled:opacity-40"
              >
                Send
                <Icons.sendIcon className="h-3.5 w-3.5 fill-white text-white" />
              </button>
            </div>
            <div
              className="absolute -bottom-4 left-10 h-0 w-0"
              style={{
                borderLeft: "12px solid transparent",
                borderRight: "12px solid transparent",
                borderTop: "18px solid #f3f4f6",
              }}
            />
          </div>
        </div>
      )}

      <div className="flex w-full shrink-0 items-center justify-center gap-6 pb-4 sm:gap-16 sm:pb-0">
        <div className="group relative flex flex-col items-center">
          <button
            onClick={() => setShowHashInput((prev) => !prev)}
            className={cn(
              "widget-animate-control-1 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full transition sm:h-16 sm:w-16",
              showHashInput
                ? "bg-gray-200 text-gray-800"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200",
            )}
          >
            <MoreHorizontal className="h-6 w-6 rotate-90 sm:h-7 sm:w-7" />
          </button>
        </div>
        <button
          onClick={playTouchSound}
          className="widget-animate-control-2 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-gray-100 text-gray-600 transition hover:bg-gray-200 sm:h-16 sm:w-16"
        >
          <Icons.Speaker className="h-6 w-6 sm:h-7 sm:w-7" />
        </button>
        <button
          onClick={() => {
            playTouchSound();
            toggleMute();
          }}
          className={cn(
            "widget-animate-control-3 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full transition sm:h-16 sm:w-16",
            isMuted
              ? "bg-[#FBCDC3] text-red-600 hover:bg-red-200"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200",
          )}
        >
          {isMuted ? (
            <Icons.micoff className="h-6 w-6 sm:h-7 sm:w-7" />
          ) : (
            <Icons.mic className="h-6 w-6 sm:h-7 sm:w-7" />
          )}
        </button>

        <button
          onClick={handleEndCall}
          className="widget-animate-control-4 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-[#f25430] text-white shadow-lg transition hover:scale-105 hover:bg-red-600 hover:shadow-xl sm:h-16 sm:w-16"
        >
          <Icons.phonedown className="h-6 w-6 sm:h-7 sm:w-7" />
        </button>
      </div>
    </div>
  );
}
