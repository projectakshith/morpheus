import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

export interface InputBoxProps {
  onSubmit: (value: string) => void;
  isDisabled?: boolean;
  history?: string[];
}

/* Minimalist prompt input with command history navigation */
export function InputBox({ onSubmit, isDisabled = false, history = [] }: InputBoxProps) {
  const [value, setValue] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);

  useInput((input, key) => {
    if (isDisabled) return;

    if (key.upArrow && history.length > 0) {
      const nextIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setValue(history[nextIndex]);
    } else if (key.downArrow && history.length > 0) {
      if (historyIndex >= 0 && historyIndex < history.length - 1) {
        const nextIndex = historyIndex + 1;
        setHistoryIndex(nextIndex);
        setValue(history[nextIndex]);
      } else {
        setHistoryIndex(-1);
        setValue("");
      }
    }
  });

  const handleSubmit = (submitted: string) => {
    const trimmed = submitted.trim();
    if (!trimmed || isDisabled) return;
    setValue("");
    setHistoryIndex(-1);
    onSubmit(trimmed);
  };

  return (
    <Box marginTop={1}>
      <Text color="greenBright" bold>
        ▲{" "}
      </Text>
      <Text color="gray">&gt; </Text>
      {isDisabled ? (
        <Text color="gray">processing task... (press [esc] to stop)</Text>
      ) : (
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="ask a question or describe a task..."
        />
      )}
    </Box>
  );
}
