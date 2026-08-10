export async function refreshAfterWriteFailure(error, fallbackMessage, setError, loadSeats) {
  setError(error instanceof Error ? error.message : fallbackMessage);
  await loadSeats({ preserveError: true });
}
