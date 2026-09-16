export const architectures = [
  "arm64-v8a",
  "armeabi-v7a",
  "x86",
  "x86_64",
] as const;
export type Architecture = (typeof architectures)[number];
export function apkTarget(args: string[]) {
  const target = args[0] ?? "arm64-v8a";
  if (
    args.length > 1 ||
    (target !== "universal" && !architectures.some((abi) => abi === target))
  ) {
    throw new Error(
      `Choose one target: ${architectures.join(", ")}, universal.`
    );
  }
  return {
    name: target,
    abis: target === "universal" ? architectures.join(",") : target,
  };
}
