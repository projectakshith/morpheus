import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme";

export interface InputBoxProps {
  onSubmit: (value: string) => void;
  isDisabled?: boolean;
  history?: string[];
  width?: number;
}

export function InputBox({
  onSubmit,
  isDisabled = false,
  history = [],
  width: customWidth,
}: InputBoxProps) {
  const [value, setValue] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const width = customWidth ?? Math.max(40, process.stdout.columns ? process.stdout.columns : 80);

  useInput((input, key) => {
    if (isDisabled) return;

    if (
      (input.includes("<") && input.includes(";")) ||
      input.charCodeAt(0) === 27 ||
      input.includes("\x1b")
    ) {
      return;
    }

    if (key.return) {
      const trimmed = value.trim();
      if (!trimmed) return;
      if (
        trimmed === "exit" ||
        trimmed === "/exit" ||
        trimmed === ":q" ||
        trimmed === "quit"
      ) {
        process.exit(0);
      }
      setValue("");
      setCursorPos(0);
      setHistoryIndex(-1);
      onSubmit(trimmed);
      return;
    }

    if (key.ctrl && input === "a") {
      setCursorPos(0);
      return;
    }

    if (key.ctrl && input === "e") {
      setCursorPos(value.length);
      return;
    }

    if (key.ctrl && input === "u") {
      setValue("");
      setCursorPos(0);
      return;
    }

    if (key.ctrl && input === "w") {
      const before = value.slice(0, cursorPos);
      const trimmed = before.trimEnd();
      const lastSpace = trimmed.lastIndexOf(" ");
      const newPos = lastSpace === -1 ? 0 : lastSpace + 1;
      setValue(value.slice(0, newPos) + value.slice(cursorPos));
      setCursorPos(newPos);
      return;
    }

    if (key.upArrow && history.length > 0) {
      const nextIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      const histVal = history[nextIndex];
      setValue(histVal);
      setCursorPos(histVal.length);
      return;
    }

    if (key.downArrow && history.length > 0) {
      if (historyIndex >= 0 && historyIndex < history.length - 1) {
        const nextIndex = historyIndex + 1;
        setHistoryIndex(nextIndex);
        const histVal = history[nextIndex];
        setValue(histVal);
        setCursorPos(histVal.length);
      } else {
        setHistoryIndex(-1);
        setValue("");
        setCursorPos(0);
      }
      return;
    }

    if (key.leftArrow) {
      setCursorPos((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.rightArrow) {
      setCursorPos((prev) => Math.min(value.length, prev + 1));
      return;
    }

    if (key.backspace || key.delete) {
      if (cursorPos > 0) {
        setValue((prev) => prev.slice(0, cursorPos - 1) + prev.slice(cursorPos));
        setCursorPos((prev) => prev - 1);
      }
      return;
    }

    if (input.length === 1 && input.charCodeAt(0) >= 32) {
      setValue((prev) => prev.slice(0, cursorPos) + input + prev.slice(cursorPos));
      setCursorPos((prev) => prev + 1);
      return;
    }

    if (input.length > 1 && !input.includes("\x1b") && !input.includes("<")) {
      setValue((prev) => prev.slice(0, cursorPos) + input + prev.slice(cursorPos));
      setCursorPos((prev) => prev + input.length);
      return;
    }
  });

  const promptPrefix = "▲ > ";
  const availWidth = Math.max(10, width - promptPrefix.length - 2);

  if (isDisabled) {
    const disabledMsg = "processing task... (press [esc] to stop)";
    const pad = Math.max(0, width - promptPrefix.length - disabledMsg.length);
    return (
      <Box height={1} width={width} overflow="hidden">
        <Text backgroundColor={theme.bg} wrap="truncate-end">
          <Text color={theme.accent} bold>
            {promptPrefix.slice(0, 2)}
          </Text>
          <Text color={theme.muted}>{promptPrefix.slice(2)}</Text>
          <Text color={theme.muted}>{disabledMsg}</Text>
          {" ".repeat(pad)}
        </Text>
      </Box>
    );
  }

  if (value.length === 0) {
    const placeholder = " ask a question or describe a task...";
    const pad = Math.max(0, width - promptPrefix.length - 1 - placeholder.length);
    return (
      <Box height={1} width={width} overflow="hidden">
        <Text backgroundColor={theme.bg} wrap="truncate-end">
          <Text color={theme.accent} bold>
            {promptPrefix.slice(0, 2)}
          </Text>
          <Text color={theme.muted}>{promptPrefix.slice(2)}</Text>
          <Text backgroundColor={theme.text} color={theme.bg}>
            {" "}
          </Text>
          <Text color={theme.muted}>{placeholder}</Text>
          {" ".repeat(pad)}
        </Text>
      </Box>
    );
  }

  const viewStart = Math.max(0, cursorPos - availWidth + 1);
  const visibleText = value.slice(viewStart, viewStart + availWidth);
  const relCursor = cursorPos - viewStart;
  const beforeCursor = visibleText.slice(0, relCursor);
  const cursorChar = visibleText[relCursor] || " ";
  const afterCursor = visibleText.slice(relCursor + 1);

  const renderedLen = promptPrefix.length + beforeCursor.length + 1 + afterCursor.length;
  const pad = Math.max(0, width - renderedLen);

  return (
    <Box height={1} width={width} overflow="hidden">
      <Text backgroundColor={theme.bg} wrap="truncate-end">
        <Text color={theme.accent} bold>
          {promptPrefix.slice(0, 2)}
        </Text>
        <Text color={theme.muted}>{promptPrefix.slice(2)}</Text>
        <Text color={theme.text}>{beforeCursor}</Text>
        <Text backgroundColor={theme.text} color={theme.bg}>
          {cursorChar}
        </Text>
        <Text color={theme.text}>{afterCursor}</Text>
        {" ".repeat(pad)}
      </Text>
    </Box>
  );
}
