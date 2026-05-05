export function getClientId(): string {
  const key = 'church_vote_client_id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = `client_${crypto.randomUUID()}`;
  localStorage.setItem(key, id);
  return id;
}

export function getSessionId(): string {
  const key = 'church_vote_session_id';
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const id = `session_${crypto.randomUUID()}`;
  sessionStorage.setItem(key, id);
  return id;
}
