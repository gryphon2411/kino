FROM mongo:8.0

ARG DATASET_VERSION=unknown
ARG MANIFEST_SHA256=unknown
ARG SOURCE_SHA256=unknown
ARG TRANSFORM_VERSION=unknown

LABEL org.opencontainers.image.title="Kino IMDb Titles Mongo Seed"
LABEL org.opencontainers.image.description="MongoDB seed artifact for the Kino IMDb titles projection"
LABEL io.kino.dataset.layer="serving"
LABEL io.kino.dataset.version="${DATASET_VERSION}"
LABEL io.kino.manifest.sha256="${MANIFEST_SHA256}"
LABEL io.kino.source.sha256="${SOURCE_SHA256}"
LABEL io.kino.transform.version="${TRANSFORM_VERSION}"

WORKDIR /seed

COPY .artifacts/mongo-seed/ /seed/
COPY images/mongo-seed/restore-mongo-seed.sh /usr/local/bin/restore-mongo-seed.sh
COPY images/mongo-seed/validate-mongo-seed-manifest.js /usr/local/share/kino/validate-mongo-seed-manifest.js
COPY images/mongo-seed/promote-mongo-seed.js /usr/local/share/kino/promote-mongo-seed.js

ENV MONGO_SEED_ARCHIVE_PATH=/seed/seed.archive.gz
ENV MONGO_SEED_MANIFEST_PATH=/seed/manifest.json
ENV MONGO_RESTORE_WORKERS=4

RUN chmod +x /usr/local/bin/restore-mongo-seed.sh

ENTRYPOINT ["/usr/local/bin/restore-mongo-seed.sh"]
