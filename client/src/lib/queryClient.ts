import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { isNativeApp } from "./platform";

function getApiBaseUrl(): string {
  if (isNativeApp()) {
    return import.meta.env.VITE_API_BASE_URL || window.location.origin;
  }
  return '';
}

function resolveApiUrl(path: string): string {
  const baseUrl = getApiBaseUrl();
  return path.startsWith('/') ? baseUrl + path : path;
}

export async function apiFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  const url = resolveApiUrl(path);
  const res = await fetch(url, {
    ...options,
    credentials: "include",
  });

  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }

  return res;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const resolvedUrl = resolveApiUrl(url);
  const res = await fetch(resolvedUrl, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = resolveApiUrl(queryKey[0] as string);
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
