/* Listens for the Escape key on stdin to abort the current generation.
 * Returns a cleanup function that restores stdin to its previous state. */
export function setupEscapeListener(onAbort: () => void): () => void {
  if (!process.stdin.isTTY) {
    return () => {};
  }

  let wasRaw = false;
  try {
    wasRaw = process.stdin.isRaw ?? false;
  } catch {
  }

  const onData = (chunk: Buffer) => {
    if (chunk.length === 1 && chunk[0] === 27) {
      onAbort();
    } else if (chunk.length === 1 && chunk[0] === 3) {
      onAbort();
      process.exit(0);
    }
  };

  try {
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  } catch {
  }

  return () => {
    try {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode?.(wasRaw);
      process.stdin.pause();
    } catch {
    }
  };
}
