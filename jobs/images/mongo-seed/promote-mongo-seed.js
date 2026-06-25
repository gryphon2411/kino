const fs = require("fs");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is missing.`);
  }
  return value;
}

const manifestPath = requireEnv("KINO_MANIFEST_PATH");
const databaseName = requireEnv("KINO_DATABASE_NAME");
const stagingName = requireEnv("KINO_STAGING_COLLECTION");
const activeName = requireEnv("KINO_ACTIVE_COLLECTION");
const backupName = requireEnv("KINO_BACKUP_COLLECTION");
const metadataCollection = requireEnv("KINO_METADATA_COLLECTION");
const historyCollection = requireEnv("KINO_HISTORY_COLLECTION");
const activeDocumentId = requireEnv("KINO_METADATA_DOCUMENT_ID");
const promotedAt = process.env.KINO_PROMOTED_AT || new Date().toISOString();
const seedImageRef = process.env.MONGO_SEED_IMAGE_REF || "";
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const database = db.getSiblingDB(databaseName);
const expectedDocuments = Number(manifest.stats.documents);
const actualDocuments = database.getCollection(stagingName).countDocuments();
const previousMetadata = database.getCollection(metadataCollection).findOne({ _id: activeDocumentId });
const previousCollectionNames = database.getCollectionNames();
const hadActiveCollection = previousCollectionNames.includes(activeName);
const failedCollectionName = `${stagingName}_failed`;

if (actualDocuments !== expectedDocuments) {
  throw new Error(`Restored document count ${actualDocuments} did not match expected ${expectedDocuments}.`);
}

const historyRecord = {
  _id: `${manifest.datasetVersion}:${promotedAt}`,
  datasetVersion: manifest.datasetVersion,
  schemaVersion: manifest.schemaVersion,
  transformVersion: manifest.transformVersion,
  restoredAt: promotedAt,
  seedImageRef,
  manifest,
  previousDatasetVersion: previousMetadata ? previousMetadata.datasetVersion : null,
};

const metadata = {
  _id: activeDocumentId,
  datasetVersion: manifest.datasetVersion,
  schemaVersion: manifest.schemaVersion,
  transformVersion: manifest.transformVersion,
  restoredAt: promotedAt,
  seedImageRef,
  manifest,
};

try {
  if (database.getCollectionNames().includes(backupName)) {
    database.getCollection(backupName).drop();
  }
  if (hadActiveCollection) {
    database.getCollection(activeName).renameCollection(backupName, true);
  }
  database.getCollection(stagingName).renameCollection(activeName, true);
  database.getCollection(metadataCollection).replaceOne({ _id: activeDocumentId }, metadata, { upsert: true });
  database.getCollection(historyCollection).insertOne(historyRecord);
  if (database.getCollectionNames().includes(backupName)) {
    database.getCollection(backupName).drop();
  }
} catch (error) {
  const currentNames = database.getCollectionNames();
  if (hadActiveCollection && currentNames.includes(backupName)) {
    if (currentNames.includes(activeName)) {
      if (currentNames.includes(failedCollectionName)) {
        database.getCollection(failedCollectionName).drop();
      }
      database.getCollection(activeName).renameCollection(failedCollectionName, true);
    }
    database.getCollection(backupName).renameCollection(activeName, true);
  } else if (!hadActiveCollection && currentNames.includes(activeName)) {
    if (currentNames.includes(failedCollectionName)) {
      database.getCollection(failedCollectionName).drop();
    }
    database.getCollection(activeName).renameCollection(failedCollectionName, true);
  }
  if (previousMetadata) {
    database.getCollection(metadataCollection).replaceOne({ _id: activeDocumentId }, previousMetadata, { upsert: true });
  } else {
    database.getCollection(metadataCollection).deleteOne({ _id: activeDocumentId });
  }
  throw error;
}
