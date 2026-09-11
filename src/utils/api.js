function getAuthHeaders(customHeaders = {}) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('smarttoken_token') : null;
  const headers = { ...customHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function get(url) {
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders({
      'Accept': 'application/json',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${url} failed: ${res.status} ${text}`);
  }
  return await res.json();
}

export async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${url} failed: ${res.status} ${text}`);
  }
  return await res.json();
}

export async function patch(url, body) {
  const res = await fetch(url, {
    method: 'PATCH',
    credentials: 'include',
    headers: getAuthHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH ${url} failed: ${res.status} ${text}`);
  }
  return await res.json();
}

export async function del(url) {
  const res = await fetch(url, {
    method: 'DELETE',
    credentials: 'include',
    headers: getAuthHeaders({
      'Accept': 'application/json',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DELETE ${url} failed: ${res.status} ${text}`);
  }
  return await res.json();
}
