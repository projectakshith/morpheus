import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme";
import { getAllPrograms, type ProgramContract } from "../../core/programs";
import { loadSubagentModels } from "../../core/userSettings";
import {
  Modal,
  Split,
  Section,
  ListRow,
  KeyValue,
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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const models = loadSubagentModels();

  useInput((input, key) => {
    if (key.escape || input === "q" || (key.ctrl && input === "c")) {
      onClose();
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : programs.length - 1));
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => (prev < programs.length - 1 ? prev + 1 : 0));
      return;
    }

    if (key.return) {
      onClose();
    }
  });

  const active = programs[selectedIndex] || programs[0];
  const assignedModel =
    models[active.id] || models[active.role] || `${currentModel} (inherited)`;

  return (
    <Modal
      title="◈ MATRIX WORKER PROGRAMS"
      context="Subagent Operative Team"
      hints={[
        { keys: "↑/↓", label: "navigate" },
        { keys: "enter", label: "select" },
        { keys: "esc", label: "close" },
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
              <Section label="OPERATIVES" width={w} />
              <Box height={1} />
              {programs.map((p, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <ListRow
                    key={p.id}
                    selected={isSelected}
                    label={`${p.icon} ${p.callsign}`}
                    value={p.role}
                    width={w}
                    dim={!isSelected}
                  />
                );
              })}
            </Box>
          )}
          right={(w, h) => (
            <Box flexDirection="column" width={w} height={h} overflow="hidden">
              <Box height={1}>
                <Text bold color={theme.accentBright}>
                  {`${active.icon} ${active.name} `}
                </Text>
                <Text color={theme.muted}>({active.role})</Text>
              </Box>

              <Box height={1} marginTop={1}>
                <Text italic color={theme.secondary}>
                  "{active.lore}"
                </Text>
              </Box>

              <Box height={1} marginTop={1}>
                <Text color={theme.text}>
                  {fit(active.description, w)}
                </Text>
              </Box>

              <Box flexDirection="column" marginTop={1}>
                <KeyValue k="assigned model" v={assignedModel} width={w} />
                <KeyValue k="base role" v={active.role} width={w} />
                <KeyValue k="model tier" v={active.defaultModelTier ?? "reasoning"} width={w} />
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
          )}
        />
      )}
    </Modal>
  );
}
