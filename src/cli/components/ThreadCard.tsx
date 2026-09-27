import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { Thinking } from "./Thinking";
import { ToolCard } from "./ToolCard";
import { MessageCard } from "./MessageCard";

export interface ThreadStep {
  id: string;
  type: "thinking" | "tool";
  content?: string;
  name?: string;
  args?: Record<string, unknown>;
  isRunning?: boolean;
  isError?: boolean;
  durationMs?: number;
  outputSummary?: string;
  outputPreview?: string[];
}

export interface Thread {
  id: string;
  index: number;
  prompt: string;
  response: string;
  isStreaming?: boolean;
  steps: ThreadStep[];
  isExpanded: boolean;
  status: "running" | "completed" | "aborted" | "error";
  stepCount: number;
  startTime: number;
  durationMs?: number;
}

export interface ThreadCardProps {
  thread: Thread;
  isThinkingExpanded?: boolean;
}

/* Helper to summarize tool steps into a compact readable string */
function summarizeStepTools(steps: ThreadStep[]): string {
  const toolCounts = new Map<string, number>();
  for (const step of steps) {
    if (step.type === "tool" && step.name) {
      toolCounts.set(step.name, (toolCounts.get(step.name) || 0) + 1);
    }
  }

  if (toolCounts.size === 0) {
    return "reasoning only";
  }

  const parts: string[] = [];
  for (const [name, count] of toolCounts.entries()) {
    parts.push(count > 1 ? `${name} x${count}` : name);
  }
  return parts.join(", ");
}

/* Trinity-inspired expandable conversation thread card with Vercel minimalist styling */
export function ThreadCard({ thread, isThinkingExpanded = false }: ThreadCardProps) {
  const seconds = thread.durationMs
    ? (thread.durationMs / 1000).toFixed(1)
    : ((Date.now() - thread.startTime) / 1000).toFixed(1);

  return (
    <Box flexDirection="column" marginY={1}>
      {/* Thread Header */}
      <Box justifyContent="space-between">
        <Box>
          <Text color="greenBright" bold>
            ▲ [Thread #{thread.index}]
          </Text>
          <Text color="white"> "{thread.prompt}"</Text>
        </Box>
        <Box>
          {thread.status === "running" ? (
            <Text color="yellow">
              <Spinner type="dots" /> running ({seconds}s)
            </Text>
          ) : thread.status === "completed" ? (
            <Text color="gray">
              {thread.stepCount} {thread.stepCount === 1 ? "step" : "steps"} · {seconds}s ·{" "}
              <Text color="cyan">{thread.isExpanded ? "▲ expanded" : "▼ collapsed"}</Text>
            </Text>
          ) : thread.status === "aborted" ? (
            <Text color="yellow">● stopped ({seconds}s)</Text>
          ) : (
            <Text color="red">● error ({seconds}s)</Text>
          )}
        </Box>
      </Box>

      {/* Internal steps: active live execution or folded/expanded history */}
      {thread.status === "running" ? (
        <Box flexDirection="column" marginLeft={1} marginY={0}>
          {thread.steps.map((step) => {
            if (step.type === "thinking") {
              return (
                <Thinking
                  key={step.id}
                  content={step.content || ""}
                  isStreaming={step.isRunning}
                  isExpanded={isThinkingExpanded}
                  durationMs={step.durationMs}
                />
              );
            }
            if (step.type === "tool") {
              return (
                <ToolCard
                  key={step.id}
                  name={step.name || "tool"}
                  args={step.args || {}}
                  isRunning={step.isRunning}
                  isError={step.isError}
                  outputSummary={step.outputSummary}
                  outputPreview={step.outputPreview}
                />
              );
            }
            return null;
          })}
        </Box>
      ) : (
        <Box flexDirection="column" marginLeft={1}>
          {thread.steps.length > 0 && !thread.isExpanded && (
            <Box marginY={0}>
              <Text color="gray">
                │ ↳ {thread.stepCount} steps ({summarizeStepTools(thread.steps)}) · [tab to expand]
              </Text>
            </Box>
          )}

          {thread.steps.length > 0 && thread.isExpanded && (
            <Box flexDirection="column" marginY={0}>
              {thread.steps.map((step) => {
                if (step.type === "thinking") {
                  return (
                    <Thinking
                      key={step.id}
                      content={step.content || ""}
                      isStreaming={false}
                      isExpanded={true}
                      durationMs={step.durationMs}
                    />
                  );
                }
                if (step.type === "tool") {
                  return (
                    <ToolCard
                      key={step.id}
                      name={step.name || "tool"}
                      args={step.args || {}}
                      isRunning={false}
                      isError={step.isError}
                      outputSummary={step.outputSummary}
                      outputPreview={step.outputPreview}
                    />
                  );
                }
                return null;
              })}
            </Box>
          )}
        </Box>
      )}

      {/* Assistant final markdown answer */}
      {Boolean(thread.response || thread.isStreaming) && (
        <Box marginLeft={1}>
          <MessageCard
            role="assistant"
            content={thread.response}
            isStreaming={thread.isStreaming}
          />
        </Box>
      )}
    </Box>
  );
}
