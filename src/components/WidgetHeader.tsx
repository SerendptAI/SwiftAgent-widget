import { WidgetTab } from "./types";

interface WidgetHeaderProps {
  activeWidgetTab: WidgetTab;
  setActiveWidgetTab: (tab: WidgetTab) => void;
}

export function WidgetHeader({
  activeWidgetTab,
  setActiveWidgetTab,
}: WidgetHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-1 py-3">
      <div className="flex items-center gap-1 rounded-md bg-[#EDEDED] p-1">
        <button
          onClick={() => setActiveWidgetTab("call")}
          className={`flex items-center gap-1.5 rounded-md px-5 py-1.5 text-xs font-semibold transition-all duration-200 ${
            activeWidgetTab === "call"
              ? "bg-gray-900 text-white shadow"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          CALL
        </button>
        <button
          onClick={() => setActiveWidgetTab("chat")}
          className={`flex items-center gap-1.5 rounded-md px-5 py-1.5 text-xs font-semibold transition-all duration-200 ${
            activeWidgetTab === "chat"
              ? "bg-gray-900 text-white shadow"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Chat
        </button>
      </div>
    </div>
  );
}
