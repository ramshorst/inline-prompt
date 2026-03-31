export interface DiffToken {
  text: string;
  added: boolean;
}

/** Split text into word + whitespace tokens, preserving all characters. */
function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter(Boolean);
}

/**
 * LCS-based word diff.
 * Returns tokens from `newText` tagged as added (true) or unchanged (false).
 * Deleted tokens from `oldText` are simply omitted.
 */
export function computeDiff(oldText: string, newText: string): DiffToken[] {
  const a = tokenize(oldText);
  const b = tokenize(newText);
  const m = a.length;
  const n = b.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to build diff
  const result: DiffToken[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ text: b[j - 1], added: false });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ text: b[j - 1], added: true });
      j--;
    } else {
      i--; // token removed from old — skip
    }
  }
  return result;
}

/**
 * Animation duration in seconds, proportional to the amount of changed content.
 * Range: 3 s (tiny edits) → 30 s (large rewrites).
 */
export function diffAnimDuration(changedChars: number): number {
  return 3 + Math.min(changedChars / 400, 1) * 27;
}
