import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Modal } from "./ui/kit";
import { theme } from "../theme";
import { getLangFromPath, highlightCode } from "../highlight";
import { sanitizeOutputLine } from "../../display/cells";
import type { ThreadStep } from "../../core/thread";

export interface ToolOutputModalProps {
  step: ThreadStep;
  width: number;
  height: number;
  onClose: () => void;
}

function copyToClipboard(text: string): void {
  const encoded = Buffer.from(text, "utf8").toString("base64");
  process.stdout.write(`\x1b]52;c;${encoded}\x07`);
}

export function ToolOutputModal({ step, width, height, onClose }: ToolOutputModalProps) {
  const output = step.output ?? step.outputPreview?.join("\n") ?? "(no output)";
  const lines = useMemo(
    () => output.replace(/\r\n/g, "\n").split("\n").map(sanitizeOutputLine),
    [output],
  );
  const [offset, setOffset] = useState(0);
  const [copied, setCopied] = useState(false);
  const filePath = typeof step.args?.filePath === "string"
    ? step.args.filePath
    : typeof step.args?.path === "string" ? step.args.path : "";
  let language = filePath ? getLangFromPath(filePath) : "";
  if (!language) {
    try {
      JSON.parse(output);
      language = "json";
    } catch {
      // Most command output is plain text; only apply syntax colors when it is clearly code or JSON.
    }
  }

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onClose();
      return;
    }
    if (key.upArrow || input === "k") {
      setOffset((value) => Math.max(0, value - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setOffset((value) => Math.min(Math.max(0, lines.length - Math.max(1, height - 7)), value + 1));
      return;
    }
    if (key.pageUp) {
      setOffset((value) => Math.max(0, value - Math.max(1, height - 8)));
      return;
    }
    if (key.pageDown) {
      setOffset((value) => Math.min(Math.max(0, lines.length - Math.max(1, height - 7)), value + Math.max(1, height - 8)));
      return;
    }
    if (input.toLowerCase() === "c") {
      copyToClipboard(output);
      setCopied(true);
    }
  });

  return (
    <Modal
      title={`${step.isError ? "failed" : "tool output"} · ${step.name ?? "tool"}`}
      context={JSON.stringify(step.args ?? {})}
      hints={[
        { keys: "↑↓ / pgup pgdn", label: "scroll" },
        { keys: "c", label: copied ? "copied" : "copy all" },
        { keys: "esc", label: "close" },
      ]}
      width={width}
      height={height}
    >
      {({ width: innerWidth, height: innerHeight }) => {
        const visible = lines.slice(offset, offset + innerHeight);
        return (
          <Box flexDirection="column" width={innerWidth} height={innerHeight} overflow="hidden">
            {visible.map((line, index) => {
              const isError = Boolean(step.isError);
              const text = language ? highlightCode(line, language) : line;
              return (
                <Box key={`${offset + index}`} height={1} overflow="hidden">
                  <Text
                    wrap="truncate-end"
                    color={isError ? theme.error : language ? undefined : theme.secondary}
                  >
                    {text || " "}
                  </Text>
                </Box>
              );
            })}
            {Array.from({ length: Math.max(0, innerHeight - visible.length) }, (_, index) => (
              <Box key={`pad_${index}`} height={1}>
                <Text> </Text>
              </Box>
            ))}
          </Box>
        );
      }}
    </Modal>
  );
}
