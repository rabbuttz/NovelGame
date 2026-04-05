import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const publicDir = path.join(rootDir, "public");
const assetsDir = path.join(publicDir, "assets");
const backgroundsDir = path.join(assetsDir, "backgrounds");
const charactersDir = path.join(assetsDir, "characters");
const outputFile = path.join(assetsDir, "manifest.json");
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".svg"]);

const manifest = {
  generatedAt: new Date().toISOString(),
  backgrounds: {},
  characters: {}
};

await mkdir(assetsDir, { recursive: true });
await collectBackgrounds();
await collectCharacters();
await writeFile(outputFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

async function collectBackgrounds() {
  const files = await listImageFiles(backgroundsDir);

  for (const file of files) {
    const id = normalizePath(path.relative(backgroundsDir, file).slice(0, -path.extname(file).length));
    manifest.backgrounds[id] = toPublicUrl(file);
  }
}

async function collectCharacters() {
  const files = await listImageFiles(charactersDir);

  for (const file of files) {
    const relativePath = normalizePath(path.relative(charactersDir, file));
    const extension = path.extname(relativePath);
    const withoutExtension = relativePath.slice(0, -extension.length);
    const nestedMatch = withoutExtension.match(/^([^/]+)\/([^/]+)$/);
    const flatMatch = withoutExtension.match(/^([^-/]+)-([^-/]+)$/);
    const match = nestedMatch ?? flatMatch;

    if (!match) {
      continue;
    }

    const [, characterId, expression] = match;
    manifest.characters[characterId] ??= {};
    manifest.characters[characterId][expression] = toPublicUrl(file);
  }
}

async function listImageFiles(directory) {
  const entries = await safeReadDir(directory);
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listImageFiles(fullPath)));
      continue;
    }

    if (imageExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

async function safeReadDir(directory) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function toPublicUrl(filePath) {
  return normalizePath(path.relative(publicDir, filePath));
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}
