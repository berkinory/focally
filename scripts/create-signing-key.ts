import { randomBytes } from "node:crypto";
import { chmod, mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(
  new URL("../credentials/android/", import.meta.url)
);
const keyPath = `${directory}release.keystore`;
const propertiesPath = `${directory}keystore.properties`;

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function createKey() {
  if ((await exists(keyPath)) || (await exists(propertiesPath))) {
    throw new Error("Signing files already exist. They were left unchanged.");
  }
  const keytool = Bun.which("keytool");
  if (keytool === null) {
    throw new Error("keytool is missing. Install JDK 17 and add it to PATH.");
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const password = randomBytes(32).toString("base64url");
  const child = Bun.spawn(
    [
      keytool,
      "-genkeypair",
      "-keystore",
      keyPath,
      "-storetype",
      "PKCS12",
      "-alias",
      "focally",
      "-keyalg",
      "RSA",
      "-keysize",
      "3072",
      "-validity",
      "10000",
      "-dname",
      "CN=Focally",
      "-storepass:env",
      "FOCALLY_STORE_PASSWORD",
      "-keypass:env",
      "FOCALLY_KEY_PASSWORD",
    ],
    {
      env: {
        ...process.env,
        FOCALLY_STORE_PASSWORD: password,
        FOCALLY_KEY_PASSWORD: password,
      },
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
    }
  );
  const diagnostic = await new Response(child.stderr).text();
  if ((await child.exited) !== 0) {
    throw new Error(`keytool could not create the signing key: ${diagnostic}`);
  }
  try {
    await chmod(keyPath, 0o600);
    await writeFile(
      propertiesPath,
      `storeFile=../credentials/android/release.keystore\nstorePassword=${password}\nkeyAlias=focally\nkeyPassword=${password}\n`,
      { flag: "wx", mode: 0o600 }
    );
  } catch (error) {
    await unlink(keyPath);
    throw error;
  }
  console.log(
    "Created local Focally signing files in credentials/android/. Back up both files securely. Passwords were not printed."
  );
}

try {
  await createKey();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
