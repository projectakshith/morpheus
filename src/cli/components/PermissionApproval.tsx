import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

export interface PendingPermission {
  requestId: string;
  tool: string;
  args: Record<string, unknown>;
  reason: string;
}

function describeArgs(args: Record<string, unknown>): string {
  const summary = Object.fromEntries(
    Object.entries(args).map(([key, value]) => [
      key,
      typeof value === "string" && value.length > 160 ? `${value.slice(0, 157)}…` : value,
    ])
  );
  return JSON.stringify(summary).slice(0, 360);
}

export function PermissionApproval({ request }: { request: PendingPermission }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.warning} paddingX={1}>
      <Text bold color={theme.warning}>Approval required · {request.tool}</Text>
      <Text>{request.reason}</Text>
      <Text color={theme.muted}>{describeArgs(request.args)}</Text>
      <Text color={theme.accentBright}>[ctrl+y] approve once  [ctrl+n] deny · `/new` starts another session</Text>
    </Box>
  );
}
