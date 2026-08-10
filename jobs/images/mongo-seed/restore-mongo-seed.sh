#!/bin/sh
set -eu

archive_path="${MONGO_SEED_ARCHIVE_PATH:-/seed/seed.archive.gz}"
manifest_path="${MONGO_SEED_MANIFEST_PATH:-/seed/manifest.json}"
validation_script_path="${MONGO_VALIDATION_SCRIPT_PATH:-/usr/local/share/kino/validate-mongo-seed-manifest.js}"
promotion_script_path="${MONGO_PROMOTION_SCRIPT_PATH:-/usr/local/share/kino/promote-mongo-seed.js}"
mongo_uri_format="${MONGO_URI_FORMAT:-mongodb}"
mongo_host="${MONGO_HOST:-localhost:27017}"
mongo_auth_db="${MONGO_AUTH_DB:-admin}"
restore_workers="${MONGO_RESTORE_WORKERS:-4}"
wait_timeout_seconds="${MONGO_WAIT_TIMEOUT_SECONDS:-300}"
mongo_seed_image_ref="${MONGO_SEED_IMAGE_REF:-}"
active_collection="title_basics"
staging_collection="title_basics_staging"
backup_collection="title_basics_backup"
metadata_collection="title_dataset_metadata"
history_collection="title_dataset_restore_history"
metadata_document_id="active"

if [ ! -f "$archive_path" ]; then
  echo "Mongo seed archive not found: $archive_path" >&2
  exit 1
fi

if [ ! -f "$manifest_path" ]; then
  echo "Mongo seed manifest not found: $manifest_path" >&2
  exit 1
fi

if [ ! -f "$validation_script_path" ]; then
  echo "Mongo seed validation script not found: $validation_script_path" >&2
  exit 1
fi

if [ ! -f "$promotion_script_path" ]; then
  echo "Mongo promotion script not found: $promotion_script_path" >&2
  exit 1
fi

if [ -n "${MONGO_USERNAME:-}" ] && [ -n "${MONGO_PASSWORD:-}" ]; then
  mongo_uri="${mongo_uri_format}://${MONGO_USERNAME}:${MONGO_PASSWORD}@${mongo_host}/${mongo_auth_db}?authSource=${mongo_auth_db}"
else
  mongo_uri="${mongo_uri_format}://${mongo_host}/"
fi

manifest_validation="$(MONGO_SEED_MANIFEST_PATH="${manifest_path}" mongosh --nodb --quiet --file "${validation_script_path}")"
expected_archive_sha="$(printf '%s\n' "${manifest_validation}" | sed -n '1p')"
expected_mongo_image="$(printf '%s\n' "${manifest_validation}" | sed -n '2p')"
expected_mongo_version="${expected_mongo_image#mongo:}"

if [ "${expected_mongo_image}" = "${expected_mongo_version}" ] || [ -z "${expected_mongo_version}" ]; then
  echo "Mongo seed manifest did not provide an exact mongo image version." >&2
  exit 1
fi

actual_archive_sha="$(sha256sum "${archive_path}" | awk '{print $1}')"
if [ "${expected_archive_sha}" != "${actual_archive_sha}" ]; then
  echo "Mongo seed archive checksum mismatch: expected ${expected_archive_sha}, got ${actual_archive_sha}" >&2
  exit 1
fi

wait_for_mongo() {
  phase="$1"
  start_time="$(date +%s)"
  while [ "$(mongosh "${mongo_uri}" --quiet --eval 'db.adminCommand({ ping: 1 }).ok' 2>/dev/null || echo 0)" != "1" ]; do
    now="$(date +%s)"
    if [ $((now - start_time)) -ge "${wait_timeout_seconds}" ]; then
      echo "Timed out waiting for Mongo ${phase} after ${wait_timeout_seconds} seconds." >&2
      exit 1
    fi
    sleep 1
  done
}

wait_for_mongo "before restore"

target_mongo_version="$(mongosh "${mongo_uri}" --quiet --eval 'db.version()')"
if [ "${target_mongo_version}" != "${expected_mongo_version}" ]; then
  echo "Mongo seed archive requires ${expected_mongo_image}, but the target server is ${target_mongo_version}. Rebuild the seed with the server's exact MongoDB version." >&2
  exit 1
fi

mongorestore \
  --uri="${mongo_uri}" \
  --archive="${archive_path}" \
  --gzip \
  --drop \
  --stopOnError \
  --nsInclude="kino.${active_collection}" \
  --nsFrom="kino.${active_collection}" \
  --nsTo="kino.${staging_collection}" \
  --numInsertionWorkersPerCollection="${restore_workers}"

# `mongorestore` returns only after requesting index restoration. A large text
# index can briefly make Mongo's readiness probe fail, which removes its
# ClusterIP Service endpoint. Wait again before the promotion connection rather
# than treating that transient endpoint loss as a failed dataset release.
wait_for_mongo "after restore"

export MONGO_SEED_MANIFEST_PATH="${manifest_path}"
export MONGO_SEED_IMAGE_REF="${mongo_seed_image_ref}"
export KINO_MANIFEST_PATH="${manifest_path}"
export KINO_DATABASE_NAME="kino"
export KINO_ACTIVE_COLLECTION="${active_collection}"
export KINO_STAGING_COLLECTION="${staging_collection}"
export KINO_BACKUP_COLLECTION="${backup_collection}"
export KINO_METADATA_COLLECTION="${metadata_collection}"
export KINO_HISTORY_COLLECTION="${history_collection}"
export KINO_METADATA_DOCUMENT_ID="${metadata_document_id}"

mongosh "${mongo_uri}" --quiet --file "${promotion_script_path}"
