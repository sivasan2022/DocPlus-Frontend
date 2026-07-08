export const DEFAULT_API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export function joinUrl(baseUrl, path) {
  if (!path) return baseUrl;
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl.replace(/\/$/, "")}/${String(path).replace(/^\//, "")}`;
}

export async function apiRequest(baseUrl, path, options = {}) {
  const { body, headers, raw = false, ...rest } = options;
  const response = await fetch(joinUrl(baseUrl, path), {
    ...rest,
    headers: {
      ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body instanceof FormData || typeof body === "string" ? body : body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let detail = "";
    try {
      const errorPayload = await response.json();
      detail = errorPayload.detail || errorPayload.message || JSON.stringify(errorPayload);
    } catch {
      detail = await response.text();
    }
    throw new Error(detail || `Request failed with ${response.status}`);
  }

  if (raw) return response;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  return response.text();
}

export function getJson(baseUrl, path, options = {}) {
  return apiRequest(baseUrl, path, options);
}

export function postJson(baseUrl, path, body, options = {}) {
  return apiRequest(baseUrl, path, { method: "POST", body, ...options });
}

export function deleteJson(baseUrl, path, options = {}) {
  return apiRequest(baseUrl, path, { method: "DELETE", ...options });
}
