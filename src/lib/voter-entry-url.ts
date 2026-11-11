/** 투표 입장 페이지 주소. 입장 코드는 넣지 않는다. */
export function voterEntryUrl(origin: string, baseUrl: string): string {
  const path = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`;
  const withSlash = path.endsWith('/') ? path : `${path}/`;
  return `${origin.replace(/\/$/, '')}${withSlash}`;
}
