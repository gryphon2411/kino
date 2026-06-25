const fs = require("fs");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is missing.`);
  }
  return value;
}

const manifestPath = requireEnv("MONGO_SEED_MANIFEST_PATH");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const rawSha = manifest.source?.source?.artifact?.sha256;

if (!rawSha) {
  throw new Error("Seed manifest is missing the nested raw source artifact checksum.");
}

const expectedDatasetVersion = `imdb-title-basics-${rawSha.slice(0, 12)}-t${manifest.transformVersion}`;
if (manifest.datasetVersion !== expectedDatasetVersion) {
  throw new Error("Seed manifest datasetVersion does not match the raw source checksum.");
}

if (!manifest.source?.qualityGate?.passed) {
  throw new Error("Seed manifest source curated artifact did not pass the quality gate.");
}

print(manifest.artifacts["seed.archive.gz"].sha256);
