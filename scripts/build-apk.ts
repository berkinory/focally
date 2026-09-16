import { copyFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { version } from "../package.json";
import { apkTarget } from "./apk-options";

const root = fileURLToPath(new URL("../", import.meta.url));
async function run(label: string, command: string[], cwd = root) {
  const started = performance.now();
  const child = Bun.spawn(command, {
    cwd,
    env: { ...process.env, NODE_ENV: "production" },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await child.exited) !== 0) {
    throw new Error(`Failed: ${command.join(" ")}`);
  }
  console.log(
    `${label}: ${((performance.now() - started) / 1000).toFixed(1)}s`
  );
}
try {
  const target = apkTarget(Bun.argv.slice(2));
  await run("Prebuild", [process.execPath, "run", "prebuild"]);
  await run(
    "Release build",
    [
      "./gradlew",
      ":app:assembleRelease",
      `-PreactNativeArchitectures=${target.abis}`,
      "--no-daemon",
    ],
    join(root, "android")
  );
  const directory = join(root, "artifacts");
  await mkdir(directory, { recursive: true });
  const output = join(directory, `focally-${version}-${target.name}.apk`);
  await copyFile(
    join(root, "android/app/build/outputs/apk/release/app-release.apk"),
    output
  );
  const { size } = await stat(output);
  console.log(
    `\nFocally APK ready\n${output}\n${(size / 1_000_000).toFixed(1)} MB · ${target.name}\n`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
