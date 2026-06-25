FROM scratch

ARG DATASET_VERSION=unknown
ARG MANIFEST_SHA256=unknown
ARG SOURCE_SHA256=unknown
ARG TRANSFORM_VERSION=unknown

LABEL org.opencontainers.image.title="Kino IMDb Titles Curated Dataset"
LABEL org.opencontainers.image.description="Curated IMDb titles Parquet artifact for Kino"
LABEL io.kino.dataset.layer="curated"
LABEL io.kino.dataset.version="${DATASET_VERSION}"
LABEL io.kino.manifest.sha256="${MANIFEST_SHA256}"
LABEL io.kino.source.sha256="${SOURCE_SHA256}"
LABEL io.kino.transform.version="${TRANSFORM_VERSION}"

COPY .artifacts/curated-titles/ /artifacts/curated-titles/
