FROM scratch

ARG DATASET_VERSION=unknown
ARG MANIFEST_SHA256=unknown
ARG SOURCE_SHA256=unknown

LABEL org.opencontainers.image.title="Kino IMDb Titles Raw Snapshot"
LABEL org.opencontainers.image.description="Raw IMDb titles snapshot artifact for Kino"
LABEL io.kino.dataset.layer="raw"
LABEL io.kino.dataset.version="${DATASET_VERSION}"
LABEL io.kino.manifest.sha256="${MANIFEST_SHA256}"
LABEL io.kino.source.sha256="${SOURCE_SHA256}"

COPY .artifacts/raw-imdb/ /artifacts/raw-imdb/
