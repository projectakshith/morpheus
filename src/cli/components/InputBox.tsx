import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

export interface InputBoxProps {
  onSubmit: (value: string) => void;
  isDisabled?: boolean;
  history?: string[];
}

/* Custom interactive prompt input with escape code filtering and history navigation */
export function InputBox({ onSubmit, isDisabled = false, history = [] }: InputBoxProps) {
  const [value, setValue] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useInput((input, key) => {
    if (isDisabled) return;

    /* Completely ignore mouse escape sequences and ANSI control codes */
    if (
      (input.includes("<") && input.includes(";")) ||
      input.charCodeAt(0) === 27 ||
      input.includes("\x1b")
    ) {
      return;
    }

    /* Submit on Enter */
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

    /* History navigation: Up Arrow */
    if (key.upArrow && history.length > 0) {
      const nextIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      const histVal = history[nextIndex];
      setValue(histVal);
      setCursorPos(histVal.length);
      return;
    }

    /* History navigation: Down Arrow */
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

    /* Cursor navigation: Left / Right arrows */
    if (key.leftArrow) {
      setCursorPos((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.rightArrow) {
      setCursorPos((prev) => Math.min(value.length, prev + 1));
      return;
    }

    /* Backspace / Delete */
    if (key.backspace || key.delete) {
      if (cursorPos > 0) {
        setValue((prev) => prev.slice(0, cursorPos - 1) + prev.slice(cursorPos));
        setCursorPos((prev) => prev - 1);
      }
      return;
    }

    /* Standard character input: only accept printable text */
    if (input.length === 1 && input.charCodeAt(0) >= 32) {
      setValue((prev) => prev.slice(0, cursorPos) + input + prev.slice(cursorPos));
      setCursorPos((prev) => prev + 1);
      return;
    }

    /* Multicharacter paste input */
    if (input.length > 1 && !input.includes("\x1b") && !input.includes("<")) {
      setValue((prev) => prev.slice(0, cursorPos) + input + prev.slice(cursorPos));
      setCursorPos((prev) => prev + input.length);
      return;
    }
  });

  return (
    <Box marginY={0}>
      <Text color="greenBright" bold>
        ▲{" "}
      </Text>
      <Text color="gray">&gt; </Text>
      {isDisabled ? (
        <Text color="gray">processing task... (press [esc] to stop)</Text>
      ) : value.length === 0 ? (
        <Box>
          <Text inverse> </Text>
          <Text color="gray">ask a question or describe a task...</Text>
        </Box>
      ) : (
        <Box>
          <Text>{value.slice(0, cursorPos)}</Text>
          <Text inverse>{value[cursorPos] || " "}</Text>
          <Text>{value.slice(cursorPos + 1)}</Text>
        </Box>
      )}
    </Box>
  );
}
