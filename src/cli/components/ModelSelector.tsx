import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import pc from "picocolors";

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  category: "antigravity" | "local" | "cloud";
}

export const AVAILABLE_MODELS: ModelOption[] = [
  /* Antigravity (Google Cloud Code) */
  {
    id: "flash",
    name: "flash (gemini-3.8-flash)",
    description: "Gemini 3.8 Flash (Fast & Smart)",
    category: "antigravity",
  },
  {
    id: "claude-opus-4-6-thinking",
    name: "claude-opus-4-6-thinking",
    description: "Claude Opus 4.6 (Deep Reasoning)",
    category: "antigravity",
  },
  {
    id: "claude-sonnet-4-6",
    name: "claude-sonnet-4-6",
    description: "Claude Sonnet 4.6 (Thinking)",
    category: "antigravity",
  },
  {
    id: "gemini-3.1-pro-high",
    name: "gemini-3.1-pro-high",
    description: "Gemini 3.1 Pro (High Effort)",
    category: "antigravity",
  },
  {
    id: "gemini-3.6-flash-high",
    name: "gemini-3.6-flash-high",
    description: "Gemini 3.6 Flash (High)",
    category: "antigravity",
  },
  {
    id: "gpt-oss-120b-medium",
    name: "gpt-oss-120b-medium",
    description: "GPT-OSS 120B (Medium)",
    category: "antigravity",
  },

  /* Local (Ollama) */
  {
    id: "local/qwen2.5-coder:7b",
    name: "local/qwen2.5-coder:7b",
    description: "Qwen 2.5 Coder 7B",
    category: "local",
  },
  {
    id: "local/llama3.3",
    name: "local/llama3.3",
    description: "Llama 3.3",
    category: "local",
  },

  /* Cloud (OpenRouter) */
  {
    id: "cloud/stealth/space-bunny-alpha",
    name: "cloud/stealth/space-bunny-alpha",
    description: "Space Bunny Alpha (1M Context)",
    category: "cloud",
  },
];

export interface ModelSelectorProps {
  currentModel: string;
  onSelect: (modelId: string) => void;
  onClose: () => void;
  width?: number;
}

export function ModelSelector({
  currentModel,
  onSelect,
  onClose,
  width = 72,
}: ModelSelectorProps) {
  /* Find index of active model in flat list or default to 0 */
  const initialIndex = Math.max(
    0,
    AVAILABLE_MODELS.findIndex(
      (m) =>
        m.id === currentModel ||
        (m.id === "flash" && currentModel.includes("flash"))
    )
  );

  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (key.return) {
      const selected = AVAILABLE_MODELS[selectedIndex];
      if (selected) {
        onSelect(selected.id);
      }
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) =>
        prev > 0 ? prev - 1 : AVAILABLE_MODELS.length - 1
      );
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex((prev) =>
        prev < AVAILABLE_MODELS.length - 1 ? prev + 1 : 0
      );
      return;
    }
  });

  const categories: Array<{
    key: "antigravity" | "local" | "cloud";
    label: string;
    color: (s: string) => string;
  }> = [
    { key: "antigravity", label: "● ANTIGRAVITY (Google Cloud Code)", color: pc.green },
    { key: "local", label: "● LOCAL (Ollama 127.0.0.1:11434)", color: pc.yellow },
    { key: "cloud", label: "● CLOUD (OpenRouter)", color: pc.blue },
  ];

  const boxWidth = Math.min(width - 4, 76);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      paddingX={1}
      paddingY={1}
      width={boxWidth}
    >
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="green">
          SWITCH MODEL
        </Text>
        <Text dimColor>
          [↑/↓ navigate · Enter select · Esc close]
        </Text>
      </Box>

      {categories.map((cat) => {
        const catModels = AVAILABLE_MODELS.filter((m) => m.category === cat.key);
        if (catModels.length === 0) return null;

        return (
          <Box key={cat.key} flexDirection="column" marginBottom={1}>
            <Box marginBottom={0}>
              <Text bold color={cat.key === "antigravity" ? "green" : cat.key === "local" ? "yellow" : "cyan"}>
                {cat.label}
              </Text>
            </Box>

            {catModels.map((m) => {
              const globalIdx = AVAILABLE_MODELS.findIndex((item) => item.id === m.id);
              const isHighlighted = globalIdx === selectedIndex;
              const isActive =
                m.id === currentModel ||
                (m.id === "flash" && currentModel === "gemini-3.8-flash");

              return (
                <Box
                  key={m.id}
                  flexDirection="row"
                  justifyContent="space-between"
                  paddingLeft={1}
                >
                  <Box flexDirection="row">
                    <Text color={isHighlighted ? "cyan" : "gray"}>
                      {isHighlighted ? "> " : "  "}
                    </Text>
                    <Text
                      bold={isHighlighted}
                      color={isHighlighted ? "cyan" : undefined}
                      dimColor={!isHighlighted && !isActive}
                    >
                      {isActive ? "● " : "○ "}
                      {m.name}
                    </Text>
                    {isActive && (
                      <Text color="green" bold>
                        {" "}[ACTIVE]
                      </Text>
                    )}
                  </Box>
                  <Text dimColor>{m.description}</Text>
                </Box>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
}
