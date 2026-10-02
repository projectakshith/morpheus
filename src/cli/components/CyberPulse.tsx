import React, { useState, useEffect } from "react";
import { Text } from "ink";
import { theme } from "../theme";

const FRAMES = [
  ["▰", "▱", "▱", "▱"],
  ["▱", "▰", "▱", "▱"],
  ["▱", "▱", "▰", "▱"],
  ["▱", "▱", "▱", "▰"],
  ["▱", "▱", "▰", "▱"],
  ["▱", "▰", "▱", "▱"],
];

export function CyberPulse() {
  const [frameIdx, setFrameIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIdx((prev) => (prev + 1) % FRAMES.length);
    }, 90);
    return () => clearInterval(timer);
  }, []);

  const current = FRAMES[frameIdx] || FRAMES[0];

  return (
    <Text>
      {current.map((char, i) => (
        <Text
          key={i}
          color={char === "▰" ? theme.accentBright : theme.border}
          bold={char === "▰"}
        >
          {char}
        </Text>
      ))}
      <Text> </Text>
    </Text>
  );
}
