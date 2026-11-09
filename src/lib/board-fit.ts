export const TILE_GAP_RATIO = 0.14;
export const TILE_MAX_PX = 150;

/**
 * 인원 수에 맞춰 번호 칸 크기를 정해 한 화면에 모두 들어가게 한다.
 * 열 수를 하나씩 늘려 보며 가로·세로 모두 들어가는 가장 큰 칸을 고른다.
 */
export function fitTiles(count: number, width: number, height: number): { size: number; cols: number } {
  if (count <= 0 || width <= 0 || height <= 0) return { size: 0, cols: 1 };
  let best = { size: 0, cols: 1 };
  for (let cols = 1; cols <= count; cols += 1) {
    const rows = Math.ceil(count / cols);
    const byWidth = width / (cols + TILE_GAP_RATIO * (cols - 1));
    const byHeight = height / (rows + TILE_GAP_RATIO * (rows - 1));
    const size = Math.min(byWidth, byHeight, TILE_MAX_PX);
    if (size > best.size) best = { size, cols };
  }
  return { size: Math.floor(best.size), cols: best.cols };
}

