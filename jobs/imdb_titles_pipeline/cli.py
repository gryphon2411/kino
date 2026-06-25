import argparse
from pathlib import Path

from .capture import capture_raw_imdb
from .curation import build_curated_titles
from .commons import DEFAULT_MAX_REJECTED_ROWS, DEFAULT_MAX_REJECTION_RATE
from .mongo.restore import restore_mongo_seed
from .mongo.seed import build_mongo_seed


def main() -> None:
    parser = argparse.ArgumentParser(description="Run IMDb titles pipeline commands.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    capture_parser = subparsers.add_parser("capture-raw-imdb")
    capture_parser.add_argument("--output-dir", default=".artifacts/raw-imdb")

    curated_parser = subparsers.add_parser("build-curated-titles")
    curated_parser.add_argument("--raw-dir", default=".artifacts/raw-imdb")
    curated_parser.add_argument("--output-dir", default=".artifacts/curated-titles")
    curated_parser.add_argument("--max-rejected-rows", type=int, default=DEFAULT_MAX_REJECTED_ROWS)
    curated_parser.add_argument("--max-rejection-rate", type=float, default=DEFAULT_MAX_REJECTION_RATE)

    seed_parser = subparsers.add_parser("build-mongo-seed")
    seed_parser.add_argument("--curated-dir", default=".artifacts/curated-titles")
    seed_parser.add_argument("--output-dir", default=".artifacts/mongo-seed")

    restore_parser = subparsers.add_parser("restore-mongo-seed")
    restore_parser.add_argument("--seed-dir", default="/seed")
    restore_parser.add_argument("--workers", type=int, default=None)

    args = parser.parse_args()

    if args.command == "capture-raw-imdb":
        capture_raw_imdb(Path(args.output_dir))
        return

    if args.command == "build-curated-titles":
        build_curated_titles(
            Path(args.raw_dir),
            Path(args.output_dir),
            max_rejected_rows=args.max_rejected_rows,
            max_rejection_rate=args.max_rejection_rate,
        )
        return

    if args.command == "build-mongo-seed":
        build_mongo_seed(Path(args.curated_dir), Path(args.output_dir))
        return

    if args.command == "restore-mongo-seed":
        restore_mongo_seed(Path(args.seed_dir), workers=args.workers)
        return

    raise ValueError(f"Unsupported command: {args.command}")
