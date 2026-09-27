import React from "react";
import { Box, Text } from "ink";
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
  output?: string;
  isOutputExpanded?: boolean;
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

export function ThreadCard({ thread, isThinkingExpanded = false }: ThreadCardProps) {
  const seconds = thread.durationMs
    ? (thread.durationMs / 1000).toFixed(1)
    : ((Date.now() - thread.startTime) / 1000).toFixed(1);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="column">
        <Text color="white" bold>
          ▲ you
        </Text>
        <Box marginLeft={2}>
          <Text color="white">{thread.prompt}</Text>
        </Box>
      </Box>

      {thread.status === "running" ? (
        <Box flexDirection="column" marginLeft={2} marginY={0}>
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
        <Box flexDirection="column" marginLeft={2}>
          {thread.steps.length > 0 && !thread.isExpanded && (
            <Box marginY={0}>
              <Text color="gray">
                │ <Text color="cyan">↳ {thread.stepCount} {thread.stepCount === 1 ? "step" : "steps"}</Text> ({summarizeStepTools(thread.steps)}) · {seconds}s ·{" "}
                <Text color="cyan">[tab to expand]</Text>
              </Text>
            </Box>
          )}

          {thread.steps.length > 0 && thread.isExpanded && (
            <Box flexDirection="column" marginY={0}>
              <Box>
                <Text color="gray">┌ </Text>
                <Text color="cyan" bold>
                  {thread.stepCount} {thread.stepCount === 1 ? "step" : "steps"}
                </Text>
                <Text color="gray"> ({summarizeStepTools(thread.steps)}) · {seconds}s · </Text>
                <Text color="cyan">[tab to collapse]</Text>
              </Box>
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
                      outputPreview={
                        step.output
                          ? step.output.trim().split("\n").slice(0, 8)
                          : step.outputPreview
                      }
                    />
                  );
                }
                return null;
              })}
              <Text color="gray">└</Text>
            </Box>
          )}
        </Box>
      )}

      {Boolean(thread.response || thread.isStreaming) && (
        <Box flexDirection="column" marginTop={0}>
          <Box>
            <Text color="greenBright" bold>
              ▲ morpheus
            </Text>
          </Box>
          <Box marginLeft={2}>
            <MessageCard
              role="assistant"
              content={thread.response}
              isStreaming={thread.isStreaming}
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}
