import React, { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme.js";
import { computeAutocomplete, applySuggestion } from "../autocomplete/engine.js";
import { AutocompletePopup, POPUP_TOTAL_HEIGHT } from "./AutocompletePopup.js";
import { glyphs } from "../glyphs.js";

export { POPUP_TOTAL_HEIGHT };

export interface InputBoxProps {
  onSubmit: (value: string) => void;
  isDisabled?: boolean;
  disabledMessage?: string;
  placeholder?: string;
  history?: string[];
  width?: number;
  availableModels?: string[];
  cwd?: string;
  onPopupOpenChange?: (isOpen: boolean) => void;
  isThinking?: boolean;
  thinkingText?: string;
}

export function InputBox({
  onSubmit,
  isDisabled = false,
  disabledMessage,
  placeholder: customPlaceholder,
  history = [],
  width: customWidth,
  availableModels = [],
  cwd,
  onPopupOpenChange,
  isThinking = false,
  thinkingText,
}: InputBoxProps) {
  const [value, setValue] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPopupDismissed, setIsPopupDismissed] = useState(false);

  const width = Math.max(40, customWidth ?? (process.stdout.columns ? process.stdout.columns : 80));

  /* Compute suggestions and dim inline ghost text based on active input */
  const autoResult = useMemo(() => {
    if (isPopupDismissed || !value.trim() || isDisabled) {
      return { suggestions: [], selectedIndex: 0, ghostText: undefined };
    }
    return computeAutocomplete(
      {
        input: value,
        cursorPos,
        history,
        cwd,
        availableModels,
      },
      selectedIndex
    );
  }, [value, cursorPos, history, cwd, availableModels, selectedIndex, isPopupDismissed, isDisabled]);

  const { suggestions, ghostText } = autoResult;

  /* The suggestion popup is active for slash commands and file mentions */
  const isCommandOrMention = Boolean(
    (value.startsWith("/") || value.includes("@")) &&
      !isPopupDismissed &&
      !isDisabled
  );

  /* Notify parent container of stable open/closed state (never fluctuates per letter) */
  useEffect(() => {
    onPopupOpenChange?.(isCommandOrMention);
  }, [isCommandOrMention, onPopupOpenChange]);

  useInput((input, key) => {
    if (isDisabled) return;

    /* Ignore terminal mouse tracking SGR escape sequences */
    if (input.includes("<") && (input.includes(";") || input.includes("M") || input.includes("m"))) {
      return;
    }

    /* Escape: dismiss suggestion popup and ghost text */
    if (key.escape) {
      if (isCommandOrMention) {
        setIsPopupDismissed(true);
        return;
      }
    }

    /* Tab: accept highlighted suggestion or inline ghost text */
    if (key.tab || input === "\t") {
      if (isCommandOrMention && suggestions.length > 0) {
        const activeItem = suggestions[autoResult.selectedIndex];
        if (activeItem) {
          const applied = applySuggestion(value, cursorPos, activeItem);
          setValue(applied.newValue);
          setCursorPos(applied.newCursorPos);
          setSelectedIndex(0);
          return;
        }
      } else if (ghostText && cursorPos === value.length) {
        setValue((prev) => prev + ghostText);
        setCursorPos((prev) => prev + ghostText.length);
        return;
      }
    }

    if (key.return) {
      let submitVal = value;
      // If user is typing a command or mention with active autocomplete suggestions,
      // Enter auto-completes the selected suggestion before executing!
      if (isCommandOrMention && !isPopupDismissed && suggestions.length > 0) {
        const activeItem = suggestions[autoResult.selectedIndex] || suggestions[0];
        if (activeItem) {
          const applied = applySuggestion(value, cursorPos, activeItem);
          submitVal = applied.newValue;
        }
      } else if (value.startsWith("/") && ghostText && cursorPos === value.length) {
        submitVal = value + ghostText;
      }

      const trimmed = submitVal.trim();
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
      setSelectedIndex(0);
      setIsPopupDismissed(false);
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
      setSelectedIndex(0);
      return;
    }

    if (key.ctrl && input === "w") {
      const before = value.slice(0, cursorPos);
      const trimmed = before.trimEnd();
      const lastSpace = trimmed.lastIndexOf(" ");
      const newPos = lastSpace === -1 ? 0 : lastSpace + 1;
      setValue(value.slice(0, newPos) + value.slice(cursorPos));
      setCursorPos(newPos);
      setSelectedIndex(0);
      setIsPopupDismissed(false);
      return;
    }

    /* Up Arrow: scroll suggestions if in command/mention mode, otherwise history */
    if (key.upArrow) {
      if (isCommandOrMention && suggestions.length > 0) {
        setSelectedIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
        return;
      }

      if (history.length > 0) {
        const nextIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(nextIndex);
        const histVal = history[nextIndex];
        setValue(histVal);
        setCursorPos(histVal.length);
        setIsPopupDismissed(true);
        return;
      }
    }

    /* Down Arrow: scroll suggestions if in command/mention mode, otherwise history */
    if (key.downArrow) {
      if (isCommandOrMention && suggestions.length > 0) {
        setSelectedIndex((prev) => (prev >= suggestions.length - 1 ? 0 : prev + 1));
        return;
      }

      if (history.length > 0) {
        if (historyIndex >= 0 && historyIndex < history.length - 1) {
          const nextIndex = historyIndex + 1;
          setHistoryIndex(nextIndex);
          const histVal = history[nextIndex];
          setValue(histVal);
          setCursorPos(histVal.length);
          setIsPopupDismissed(true);
        } else {
          setHistoryIndex(-1);
          setValue("");
          setCursorPos(0);
          setIsPopupDismissed(false);
        }
        return;
      }
    }

    if (key.leftArrow) {
      setCursorPos((prev) => Math.max(0, prev - 1));
      return;
    }

    /* Right Arrow: if at end of input and ghost text exists, accept ghost text */
    if (key.rightArrow) {
      if (cursorPos === value.length && ghostText) {
        setValue((prev) => prev + ghostText);
        setCursorPos((prev) => prev + ghostText.length);
        return;
      }
      setCursorPos((prev) => Math.min(value.length, prev + 1));
      return;
    }

    if (key.backspace || key.delete) {
      if (cursorPos > 0) {
        setValue((prev) => prev.slice(0, cursorPos - 1) + prev.slice(cursorPos));
        setCursorPos((prev) => prev - 1);
        setSelectedIndex(0);
        setIsPopupDismissed(false);
      }
      return;
    }

    /* Regular character typing */
    if (input.length === 1 && input.charCodeAt(0) >= 32) {
      setValue((prev) => prev.slice(0, cursorPos) + input + prev.slice(cursorPos));
      setCursorPos((prev) => prev + 1);
      setSelectedIndex(0);
      setIsPopupDismissed(false);
      return;
    }

    /* Multi-character paste */
    if (input.length > 1 && !input.includes("\x1b") && !input.includes("<")) {
      setValue((prev) => prev.slice(0, cursorPos) + input + prev.slice(cursorPos));
      setCursorPos((prev) => prev + input.length);
      setSelectedIndex(0);
      setIsPopupDismissed(false);
      return;
    }
  });

  const promptPrefix = `${glyphs.prompt} `;
  const innerWidth = Math.max(10, width - 4);
  const availWidth = Math.max(10, innerWidth - promptPrefix.length);

  const boxBorderColor = isDisabled
    ? theme.borderSubtle
    : value.length > 0
    ? theme.accentBright
    : theme.border;

  if (isDisabled) {
    const disabledMsg = disabledMessage || "processing task... [esc] to stop";
    return (
      <Box
        height={3}
        width={width}
        borderStyle="round"
        borderColor={theme.borderSubtle}
        paddingX={1}
        overflow="hidden"
      >
        <Text backgroundColor={theme.bg} wrap="truncate-end">
          <Text color={theme.muted} bold>
            {promptPrefix}
          </Text>
          <Text color={theme.muted}>{disabledMsg}</Text>
        </Text>
      </Box>
    );
  }

  let contentNode: React.ReactNode;

  if (value.length === 0) {
    const placeholder = customPlaceholder ?? "ask a question or describe a task...";
    const cleanPlaceholder = placeholder.trimStart();
    contentNode = (
      <Text backgroundColor={theme.bg} wrap="truncate-end">
        <Text color={theme.accentBright} bold>
          {promptPrefix}
        </Text>
        <Text backgroundColor={theme.text} color={theme.bg}>
          {" "}
        </Text>
        <Text color={theme.muted}> {cleanPlaceholder}</Text>
      </Text>
    );
  } else {
    const viewStart = Math.max(0, cursorPos - availWidth + 1);
    const visibleText = value.slice(viewStart, viewStart + availWidth);
    const relCursor = cursorPos - viewStart;
    const beforeCursor = visibleText.slice(0, relCursor);
    const cursorChar = visibleText[relCursor] || " ";
    const afterCursor = visibleText.slice(relCursor + 1);

    const showGhostText = Boolean(ghostText && cursorPos === value.length);

    contentNode = (
      <Text backgroundColor={theme.bg} wrap="truncate-end">
        <Text color={theme.accentBright} bold>
          {promptPrefix}
        </Text>
        <Text color={theme.text}>{beforeCursor}</Text>
        <Text backgroundColor={theme.text} color={theme.bg}>
          {cursorChar}
        </Text>
        {showGhostText && ghostText ? (
          <Text color={theme.muted}>{ghostText}</Text>
        ) : (
          <Text color={theme.text}>{afterCursor}</Text>
        )}
      </Text>
    );
  }

  return (
    <Box flexDirection="column" width={width}>
      {isCommandOrMention && (
        <AutocompletePopup
          suggestions={suggestions}
          selectedIndex={autoResult.selectedIndex}
          width={width}
        />
      )}

      <Box
        height={3}
        width={width}
        borderStyle="round"
        borderColor={boxBorderColor}
        paddingX={1}
        overflow="hidden"
      >
        {contentNode}
      </Box>
    </Box>
  );
}
