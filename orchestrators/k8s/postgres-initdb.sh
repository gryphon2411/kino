set -e

database_name="kino-data"

echo -n "Waiting for server readiness..."
while ! pg_isready; do
  echo -n "."
  sleep 1
done
echo

is_database_exists=$(psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$database_name'")

if [[ $is_database_exists = '1' ]]; then
    echo "Database $database_name already exists. Skipping creation."
else
    createdb -U postgres $database_name
    echo "Database $database_name created successfully."
fi