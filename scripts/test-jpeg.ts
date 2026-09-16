import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
let output: string | undefined;
async function run(args: string[]) {
  const child = Bun.spawn(args, {
    cwd: root,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) {
    throw new Error(`${args[0]} failed.\n${stdout}\n${stderr}`);
  }
  return stdout;
}
try {
  const cmake = Bun.which("cmake");
  if (cmake === null) {
    throw new Error(
      "CMake 3.22+ and a C/C++ compiler are required. Add CMake to PATH."
    );
  }
  output = await mkdtemp(join(tmpdir(), "focally-jpeg-tests-"));
  await run([
    cmake,
    "-S",
    join(root, "modules/focally-camera/android"),
    "-B",
    output,
    "-DCMAKE_BUILD_TYPE=Release",
    "-DWITH_SIMD=OFF",
  ]);
  await run([
    cmake,
    "--build",
    output,
    "--target",
    "jpeg-transform-test",
    "--parallel",
    "2",
  ]);
  const result = await run([join(output, "jpeg-transform-test")]);
  console.log(result.trim());
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (output !== undefined) {
    await rm(output, { recursive: true, force: true });
  }
}
