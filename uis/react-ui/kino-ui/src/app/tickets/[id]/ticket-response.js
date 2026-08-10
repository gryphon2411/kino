export async function ticketResponseBody(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
