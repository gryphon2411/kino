import csv
import os
import sys
import time
from pathlib import Path

from commons import download_archive, extract_csv_from_archive, transform_csv_row_data, delete_data_dir, create_data_dir
from pymongo import MongoClient

from log import get_logger

logger = get_logger(Path(__file__).stem)


def read_csv_data_and_insert_to_database(csv_file_path):
    client = get_database_connection()
    db = client.kino
    write_command_batch_limit_size = 100000  # https://www.mongodb.com/docs/manual/reference/limits/#mongodb-limit-Write-Command-Batch-Limit-Size
    total_inserted_ids = 0
    total_rows_read = 0
    csv_data = []
    csv_data_size = 0
    csv_data_read_counter = 0

    logger.info(f"Reading {csv_file_path.name} and inserting in bulk to '{db.name}' database "
                f"('title_basics' collection) at {client.address} ...")
    with csv_file_path.open('r', newline='') as csv_file:
        reader = csv.DictReader(csv_file, delimiter='\t')

        for row in reader:
            if csv_data_read_counter >= write_command_batch_limit_size:
                total_inserted_ids += insert_csv_data_to_database(csv_data, db)
                csv_data_read_counter = 0

            transform_csv_row_data(row)

            csv_data.append(row)
            csv_data_size += sys.getsizeof(row)
            total_rows_read += 1
            csv_data_read_counter += 1

        total_inserted_ids += insert_csv_data_to_database(csv_data, db)

    logger.info(f"Read {total_rows_read:,} csv rows (data size {csv_data_size / 1000 / 1000 / 1000:.3f} gb).")
    logger.info(f'Inserted {total_inserted_ids:,} documents.')


def insert_csv_data_to_database(csv_data, db):
    total_inserted_ids = len(db.title_basics.insert_many(csv_data).inserted_ids)
    csv_data.clear()

    return total_inserted_ids


def get_database_connection():
    """Establish and return a database connection."""
    connection_uri = "{uri_format}://{username}:{password}@{host}".format(
        uri_format=os.getenv('MONGO_URI_FORMAT'),
        username=os.getenv('MONGO_USERNAME'),
        password=os.getenv('MONGO_PASSWORD'),
        host=os.getenv('MONGO_HOST')
    )
    client = MongoClient(connection_uri)
    client.server_info()  # Blocks until the connection is ready
    return client


def create_text_index(db):
    logger.info("Creating text index on primaryTitle and originalTitle fields...")
    result = db.title_basics.create_index([
        ("primaryTitle", "text"),
        ("originalTitle", "text")
    ], name="title_text_index", weights={"primaryTitle": 2, "originalTitle": 1})
    logger.info(f"Text index created: {result}")


def main():
    execution_start, process_start = time.perf_counter(), time.process_time()

    data_dir_ = create_data_dir()
    archive_file_path_ = data_dir_ / 'title.basics.tsv.gz'
    csv_file_path_ = data_dir_ / 'data.csv'

    download_archive(archive_file_path_)
    extract_csv_from_archive(archive_file_path_, csv_file_path_)
    read_csv_data_and_insert_to_database(csv_file_path_)
    
    # Create text index for search functionality
    client = get_database_connection()
    db = client.kino
    create_text_index(db)
    
    delete_data_dir(data_dir_)

    execution_end, process_end = time.perf_counter(), time.process_time()
    execution_duration = execution_end - execution_start
    process_duration = process_end - process_start
    execution_minutes, execution_seconds = divmod(execution_duration, 60)
    process_minutes, process_seconds = divmod(process_duration, 60)

    logger.info(f"Done. took {execution_minutes:0.0f}m {execution_seconds:0.0f}s "
                f"({process_minutes:0.0f}m {process_seconds:0.0f}s processing)")


if __name__ == '__main__':
    try:
        main()
    except Exception:
        logger.exception("Job failed.")
        exit(1)
