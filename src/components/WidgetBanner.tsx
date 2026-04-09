import { cn } from "../lib/cn";
import { Icons } from "./icons";

interface WidgetBannerProps {
  companyName?: string;
  callStatus: "idle" | "ongoing";
  elapsedTime: number;
  handleRequestCallClick: () => void;
}

export function WidgetBanner({
  companyName,
  callStatus,
  elapsedTime,
  handleRequestCallClick,
}: WidgetBannerProps) {
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div className="relative z-[100] flex w-full flex-row items-center justify-between overflow-hidden bg-[#F2B035] px-3 py-2 shadow-md sm:px-6 sm:py-3">
      <div className="font-dm-mono max-w-[70%] min-w-0 flex-1 overflow-hidden pr-2 text-[9px] font-normal tracking-tight text-black uppercase sm:max-w-[85%] sm:pr-4 sm:text-xs sm:tracking-wider md:text-sm">
        <span className="widget-marquee">
          If you have any questions or inquiries, please feel free to get on a
          call with our {companyName}.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;If you
          have any questions or inquiries, please feel free to get on a call
          with our {companyName}.
        </span>
      </div>

      <button
        type="button"
        onClick={handleRequestCallClick}
        className={cn(
          "relative z-[101] flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 shadow-[-4px_4px_0_0_#000000] transition-all hover:-translate-y-0.5 hover:shadow-md sm:gap-2 sm:px-6 sm:py-2 sm:shadow-[-6px_6px_0_0_#000000]",
          callStatus === "ongoing"
            ? "cursor-default border-transparent"
            : "cursor-pointer",
        )}
      >
        {callStatus === "idle" ? (
          <>
            <Icons.phoneIncoming className="h-3 w-3 text-black sm:h-4 sm:w-4" />
            <span className="font-dm-mono text-xs font-bold tracking-tight text-black sm:text-sm">
              REQUEST A CALL
            </span>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Icons.widgetphone className="h-6 w-6 animate-pulse text-gray-500 sm:h-4 sm:w-4" />
            </div>
            <span className="font-dm-mono text-xs font-bold tracking-tight text-black sm:text-sm">
              ONGOING..{" "}
              <span className="text-gray-500">{formatTime(elapsedTime)}</span>
            </span>
          </>
        )}
      </button>
    </div>
  );
}
