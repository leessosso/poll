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


export const RESULT_TWO_COL_FROM = 7;

const VERDICT_LINE = 1.15;
const LABEL_LINE = 1.2;

const RESULT_MAX = {
  verdict: 128,
  label: 96,
  meta: 56,
  bar: 112,
  rowGap: 40,
  colGap: 48,
  verdictGap: 40,
  labelBarGap: 8,
};

const RESULT_MIN = {
  verdict: 22,
  label: 14,
  meta: 11,
  bar: 8,
  rowGap: 6,
  colGap: 12,
  verdictGap: 6,
  labelBarGap: 2,
};

export interface BoardResultFit {
  columns: 1 | 2;
  rows: number;
  verdictPx: number;
  labelPx: number;
  metaPx: number;
  barPx: number;
  rowGapPx: number;
  colGapPx: number;
  verdictGapPx: number;
  labelBarGapPx: number;
}

/** 선택지가 많으면 두 열로 나눠 한 화면에 넣는다. */
export function resultColumnCount(optionCount: number): 1 | 2 {
  return optionCount >= RESULT_TWO_COL_FROM ? 2 : 1;
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

function scaleResultFit(t: number, hasDecision: boolean, columns: 1 | 2, rows: number): BoardResultFit {
  const clampT = Math.min(1, Math.max(0, t));
  return {
    columns,
    rows,
    verdictPx: hasDecision ? Math.round(lerp(RESULT_MIN.verdict, RESULT_MAX.verdict, clampT)) : 0,
    labelPx: Math.round(lerp(RESULT_MIN.label, RESULT_MAX.label, clampT)),
    metaPx: Math.round(lerp(RESULT_MIN.meta, RESULT_MAX.meta, clampT)),
    barPx: Math.round(lerp(RESULT_MIN.bar, RESULT_MAX.bar, clampT)),
    rowGapPx: Math.round(lerp(RESULT_MIN.rowGap, RESULT_MAX.rowGap, clampT)),
    colGapPx: columns === 2 ? Math.round(lerp(RESULT_MIN.colGap, RESULT_MAX.colGap, clampT)) : 0,
    verdictGapPx: hasDecision ? Math.round(lerp(RESULT_MIN.verdictGap, RESULT_MAX.verdictGap, clampT)) : 0,
    labelBarGapPx: Math.round(lerp(RESULT_MIN.labelBarGap, RESULT_MAX.labelBarGap, clampT)),
  };
}

export function boardResultUsedHeight(fit: BoardResultFit, hasDecision: boolean): number {
  const verdict = hasDecision ? Math.round(fit.verdictPx * VERDICT_LINE) : 0;
  const verdictGap = hasDecision ? fit.verdictGapPx : 0;
  const row = Math.round(fit.labelPx * LABEL_LINE) + fit.labelBarGapPx + fit.barPx;
  return verdict + verdictGap + fit.rows * row + Math.max(0, fit.rows - 1) * fit.rowGapPx;
}

/**
 * 현황판 결과 영역의 글자·막대·간격을 뷰포트 높이와 선택지 수에 맞춰 줄인다.
 * 한 화면에 스크롤 없이 들어가도록 균일하게 축소한다.
 */
export function fitBoardResults(height: number, optionCount: number, hasDecision: boolean): BoardResultFit {
  const count = Math.max(0, optionCount);
  const columns = resultColumnCount(count);
  const rows = Math.max(1, Math.ceil((count || 1) / columns));
  if (height <= 0) return scaleResultFit(0, hasDecision, columns, rows);

  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    const candidate = scaleResultFit(mid, hasDecision, columns, rows);
    if (boardResultUsedHeight(candidate, hasDecision) <= height) lo = mid;
    else hi = mid;
  }
  return scaleResultFit(lo, hasDecision, columns, rows);
}
