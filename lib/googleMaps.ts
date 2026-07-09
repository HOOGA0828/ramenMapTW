export function getGoogleMapsSearchUrl(name: string, address?: string | null) {
  const query = `${name} ${address ?? ""}`.trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
