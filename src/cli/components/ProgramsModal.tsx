import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme";
import { getAllPrograms, programTelemetry, type ProgramRunRecord } from "../../core/programs";
import { loadSubagentModels } from "../../core/userSettings";
import {
  Modal,
  Split,
  Section,
  ListRow,
  KeyValue,
  StatusValue,
  fit,
} from "./ui/kit";

export interface ProgramsModalProps {
  currentModel: string;
  width?: number;
  height?: number;
  onClose: () => void;
}

export function ProgramsModal({
  currentModel,
  width = 80,
  height = 24,
  onClose,
}: ProgramsModalProps) {
  const programs = getAllPrograms();
  const [tab, setTab] = useState<"roster" | "telemetry">("roster");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const models = loadSubagentModels();
  const stats = programTelemetry.getStats();
  const runs = programTelemetry.getRuns();

  const activePrograms = programTelemetry.getActiveRuns().map((r) => r.programId);

  useInput((input, key) => {
    if (key.escape || input === "q" || (key.ctrl && input === "c")) {
      onClose();
      return;
    }

    if (key.tab || input === "t") {
      setTab((prev) => (prev === "roster" ? "telemetry" : "roster"));
      setSelectedIndex(0);
      return;
    }

    const maxItems = tab === "roster" ? programs.length : Math.max(1, runs.length);

    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : maxItems - 1));
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => (prev < maxItems - 1 ? prev + 1 : 0));
      return;
    }

    if (key.return) {
      onClose();
    }
  });

  const active = programs[selectedIndex] || programs[0];
  const activeStats = stats[active.id];
  const assignedModel =
    models[active.id] || models[active.role] || `${currentModel} (inherited)`;

  const selectedRun: ProgramRunRecord | undefined =
    tab === "telemetry" && runs.length > 0 ? runs[selectedIndex] : undefined;

  return (
    <Modal
      title="◈ MATRIX WORKER PROGRAMS"
      context={tab === "roster" ? "Operative Roster & Contracts" : "Live Subagent Telemetry"}
      hints={[
        { keys: "tab", label: tab === "roster" ? "view telemetry" : "view roster" },
        { keys: "↑/↓", label: "navigate" },
        { keys: "enter/esc", label: "close" },
      ]}
      width={width}
      height={height}
    >
      {({ width: innerW, height: innerH }) => (
        <Split
          width={innerW}
          height={innerH}
          ratio={0.42}
          minLeft={28}
          left={(w, h) => (
            <Box flexDirection="column" width={w} height={h} overflow="hidden">
              <Section label={tab === "roster" ? "OPERATIVES" : "RECENT RUNS"} width={w} />
              <Box height={1} />
              {tab === "roster" ? (
                programs.map((p, idx) => {
                  const isSelected = idx === selectedIndex;
                  const isActive = activePrograms.includes(p.id);
                  const pStats = stats[p.id];
                  const value = isActive
                    ? "● active"
                    : pStats && pStats.totalRuns > 0
                    ? `${pStats.totalRuns} runs`
                    : p.role;
                  return (
                    <ListRow
                      key={p.id}
                      selected={isSelected}
                      label={`${p.icon} ${p.callsign}`}
                      value={value}
                      width={w}
                      dim={!isSelected && !isActive}
                    />
                  );
                })
              ) : runs.length === 0 ? (
                <Box flexDirection="column" paddingX={1}>
                  <Text color={theme.muted}>No program executions recorded in this session.</Text>
                  <Text color={theme.borderSubtle}>Deploy workers via coordinator to stream live activity.</Text>
                </Box>
              ) : (
                runs.slice(0, 10).map((run, idx) => {
                  const isSelected = idx === selectedIndex;
                  const glyph = run.status === "running" ? "◌" : run.status === "failed" ? "×" : "✓";
                  return (
                    <ListRow
                      key={run.runId}
                      selected={isSelected}
                      label={`${run.icon} ${run.callsign}`}
                      value={`${glyph} ${run.status}`}
                      width={w}
                      dim={!isSelected}
                    />
                  );
                })
              )}
            </Box>
          )}
          right={(w, h) =>
            tab === "roster" ? (
              <Box flexDirection="column" width={w} height={h} overflow="hidden">
                <Box height={1} justifyContent="space-between">
                  <Box>
                    <Text bold color={theme.accentBright}>
                      {`${active.icon} ${active.name} `}
                    </Text>
                    <Text color={theme.muted}>({active.role})</Text>
                  </Box>
                  <Text color={activePrograms.includes(active.id) ? theme.accentBright : theme.muted}>
                    {activePrograms.includes(active.id) ? "● active" : "○ idle"}
                  </Text>
                </Box>

                <Box height={1} marginTop={1}>
                  <Text italic color={theme.secondary}>
                    "{active.lore}"
                  </Text>
                </Box>

                <Box height={1} marginTop={1}>
                  <Text color={theme.text}>{fit(active.description, w)}</Text>
                </Box>

                <Box flexDirection="column" marginTop={1}>
                  <KeyValue k="assigned model" v={assignedModel} width={w} />
                  <KeyValue k="base role" v={active.role} width={w} />
                  <KeyValue k="model tier" v={active.defaultModelTier ?? "reasoning"} width={w} />
                  {activeStats && activeStats.totalRuns > 0 ? (
                    <KeyValue
                      k="session telemetry"
                      v={`${activeStats.totalRuns} runs · ${activeStats.totalTokens} tokens · ${Math.round(activeStats.totalDurationMs / 1000)}s`}
                      width={w}
                    />
                  ) : null}
                </Box>

                <Box flexDirection="column" marginTop={1}>
                  <Text bold color={theme.accent}>
                    DIRECTIVES:
                  </Text>
                  {active.operationalRules.slice(0, 3).map((rule, idx) => (
                    <Text key={idx} color={theme.muted} wrap="truncate-end">
                      {` • ${rule}`}
                    </Text>
                  ))}
                </Box>

                <Box flexDirection="column" marginTop={1}>
                  <Text bold color={theme.accent}>
                    DELIVERABLE SCHEMA:
                  </Text>
                  {active.outputRequirements.slice(0, 2).map((req, idx) => (
                    <Text key={idx} color={theme.muted} wrap="truncate-end">
                      {` ❯ ${req}`}
                    </Text>
                  ))}
                </Box>
              </Box>
            ) : (
              <Box flexDirection="column" width={w} height={h} overflow="hidden">
                {selectedRun ? (
                  <>
                    <Box height={1}>
                      <Text bold color={theme.accentBright}>
                        {`${selectedRun.icon} ${selectedRun.callsign} `}
                      </Text>
                      <Text color={selectedRun.status === "running" ? theme.accentBright : theme.muted}>
                        [{selectedRun.status.toUpperCase()}]
                      </Text>
                    </Box>

                    <Box flexDirection="column" marginTop={1}>
                      <KeyValue k="assigned model" v={selectedRun.model} width={w} />
                      <KeyValue k="role" v={selectedRun.role} width={w} />
                      <KeyValue
                        k="duration"
                        v={
                          selectedRun.durationMs !== undefined
                            ? `${(selectedRun.durationMs / 1000).toFixed(1)}s`
                            : "in progress…"
                        }
                        width={w}
                      />
                      <KeyValue
                        k="tokens used"
                        v={selectedRun.tokensUsed !== undefined ? `${selectedRun.tokensUsed}` : "measuring…"}
                        width={w}
                      />
                    </Box>

                    <Box flexDirection="column" marginTop={1}>
                      <Text bold color={theme.accent}>
                        ASSIGNED TASK:
                      </Text>
                      <Text color={theme.text} wrap="wrap">
                        {fit(selectedRun.task, w * 2)}
                      </Text>
                    </Box>

                    {selectedRun.error ? (
                      <Box flexDirection="column" marginTop={1}>
                        <Text bold color={theme.error}>
                          ERROR:
                        </Text>
                        <Text color={theme.error} wrap="wrap">
                          {selectedRun.error}
                        </Text>
                      </Box>
                    ) : selectedRun.outputPreview ? (
                      <Box flexDirection="column" marginTop={1}>
                        <Text bold color={theme.accent}>
                          OUTPUT PREVIEW:
                        </Text>
                        <Text color={theme.muted} wrap="wrap">
                          {selectedRun.outputPreview}
                        </Text>
                      </Box>
                    ) : null}
                  </>
                ) : (
                  <Box flexDirection="column" justifyContent="center" height={h}>
                    <Text color={theme.muted}>No telemetry run selected.</Text>
                  </Box>
                )}
              </Box>
            )
          }
        />
      )}
    </Modal>
  );
}
