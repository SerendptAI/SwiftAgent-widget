import { useLayoutEffect, useRef } from "react";

import { Icons } from "./icons";
import { type ChatAttachment } from "./types";
import { cn } from "../lib/cn";

interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  selectedFiles?: ChatAttachment[];
  onFilesSelected?: (files: FileList) => void;
  onRemoveSelectedFile?: (id: string) => void;
  isLoading?: boolean;
  compact?: boolean;
}

function fileLabel(file: ChatAttachment) {
  if (file.kind === "pdf") return "PDF";

  const extension = file.name.split(".").pop()?.slice(0, 3).toUpperCase();
  return extension || "IMG";
}

export function ChatInput({
  value,
  onChange,
  onSend,
  selectedFiles = [],
  onFilesSelected,
  onRemoveSelectedFile,
  isLoading,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend =
    (value.trim().length > 0 || selectedFiles.length > 0) && !isLoading;

  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (canSend) onSend();
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) {
            onFilesSelected?.(event.target.files);
          }
          event.target.value = "";
        }}
      />

      {selectedFiles.length > 0 && (
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
          {selectedFiles.map((file) => (
            <div
              key={file.id}
              className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-visible rounded bg-gray-100"
              title={file.name}
            >
              {file.kind === "image" ? (
                <img
                  src={file.url}
                  alt={file.name}
                  className="h-full w-full rounded object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center rounded bg-[#E93333] font-sans text-xs font-bold text-white">
                  {fileLabel(file)}
                </span>
              )}
              <button
                type="button"
                onClick={() => onRemoveSelectedFile?.(file.id)}
                className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-gray-200 bg-white text-[10px] leading-none text-gray-500 shadow-sm"
                aria-label={`Remove ${file.name}`}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      <div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question"
          rows={1}
          className="block w-full resize-none bg-transparent font-sans text-base text-gray-800 outline-none placeholder-gray-400 sm:text-sm"
        />
      </div>

      {/* Bottom row: paperclip + send */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center text-gray-700 transition-colors hover:text-gray-900"
          aria-label="Upload PDF or image"
        >
          <Icons.paperclip className="h-5 w-5" />
        </button>

        <button
          onClick={onSend}
          disabled={!canSend}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            canSend
              ? "bg-[#006BE5] text-white hover:bg-[#005FCA]"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300",
          )}
        >
          <Icons.sendIconUp
            className={cn(
              "h-6 w-6",
              canSend ? "text-white" : "text-gray-700",
            )}
          />
        </button>
      </div>
    </div>
  );
}
