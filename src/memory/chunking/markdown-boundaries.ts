/**
 * Utilities for detecting markdown structure and finding natural split points.
 *
 * These helpers identify safe places to split markdown content while
 * preserving semantic structure.
 */

/**
 * Check if a line is a markdown heading.
 */
export function isHeading(line: string): boolean {
  const trimmed = line.trimStart();
  return /^#{1,6}\s/.test(trimmed);
}

/**
 * Check if a line starts or ends a code block fence.
 */
export function isCodeBlockFence(line: string): boolean {
  const trimmed = line.trim();
  return /^```|^~~~/.test(trimmed);
}

/**
 * Check if a line is a list item.
 */
export function isListItem(line: string): boolean {
  const trimmed = line.trimStart();
  return /^[-*+]\s|^\d+\.\s/.test(trimmed);
}

/**
 * Check if a line is a blockquote.
 */
export function isBlockquote(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith(">");
}

/**
 * Check if a line is empty (whitespace only).
 */
export function isEmptyLine(line: string): boolean {
  return line.trim().length === 0;
}

/**
 * Check if a line is a thematic break (horizontal rule).
 */
export function isThematicBreak(line: string): boolean {
  const trimmed = line.trim();
  return /^[-*_]{3,}\s*$/.test(trimmed);
}

/**
 * Determine if a line is a structural boundary (good place to split).
 */
export function isStructuralBoundary(line: string): boolean {
  return (
    isEmptyLine(line) ||
    isHeading(line) ||
    isThematicBreak(line)
  );
}

/**
 * Find a safe split point within a long line.
 *
 * Looks for natural boundaries like spaces, punctuation, etc.
 * Returns the index where splitting should occur.
 *
 * @param line - The line to split
 * @param maxLength - Maximum length for the split
 * @returns Index to split at (always a valid index between 0 and maxLength inclusive)
 */
export function findSafeSplitPoint(line: string, maxLength: number): number {
  if (line.length <= maxLength) {
    return line.length;
  }

  // Search backwards from maxLength for a good split point
  const searchEnd = Math.min(maxLength, line.length);

  // Priority 1: Space followed by non-space (word boundary)
  for (let i = searchEnd; i > 0; i--) {
    if (line[i - 1] === " " && line[i] !== " ") {
      return i - 1;
    }
  }

  // Priority 2: Common punctuation that can end a segment
  // Single pass to find the rightmost punctuation of any type
  const punctSet = new Set([".", ",", ";", ":", "!", "?", ")", "]", "}"]);
  for (let i = searchEnd; i > 0; i--) {
    if (punctSet.has(line[i - 1]) && i < line.length && line[i] !== line[i - 1]) {
      return i;
    }
  }

  // Priority 3: Any whitespace character
  for (let i = searchEnd; i > 0; i--) {
    if (/\s/.test(line[i - 1]) && !/\s/.test(line[i])) {
      return i - 1;
    }
  }

  // Fallback: hard split at maxLength
  return maxLength;
}

/**
 * Split a long line at safe points.
 *
 * @param line - The line to split
 * @param maxLength - Maximum length per segment
 * @returns Array of line segments
 */
export function splitLongLine(line: string, maxLength: number): string[] {
  if (line.length <= maxLength) {
    return [line];
  }

  const segments: string[] = [];
  let remaining = line;

  while (remaining.length > maxLength) {
    const splitPoint = findSafeSplitPoint(remaining, maxLength);

    if (splitPoint <= 0) {
      // Can't find a good split, force it
      segments.push(remaining.slice(0, maxLength));
      remaining = remaining.slice(maxLength);
    } else {
      segments.push(remaining.slice(0, splitPoint).trimEnd());
      remaining = remaining.slice(splitPoint).trimStart();
    }
  }

  if (remaining.length > 0) {
    segments.push(remaining);
  }

  return segments;
}

/**
 * Calculate UTF-8 byte size of a string.
 * Re-exported from embedding-input-limits for convenience.
 */
function estimateUtf8Bytes(text: string): number {
  if (!text) {
    return 0;
  }
  return Buffer.byteLength(text, "utf8");
}

/**
 * Split a long line at safe points, respecting UTF-8 byte limits.
 *
 * This function is byte-aware and correctly handles multi-byte characters
 * (CJK, emoji, etc.) that would otherwise exceed byte limits when using
 * character-based splitting.
 *
 * @param line - The line to split
 * @param maxBytes - Maximum UTF-8 bytes per segment
 * @returns Array of line segments
 */
export function splitLongLineByBytes(line: string, maxBytes: number): string[] {
  const totalBytes = estimateUtf8Bytes(line);
  if (totalBytes <= maxBytes) {
    return [line];
  }

  const segments: string[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    const remainingBytes = estimateUtf8Bytes(remaining);
    if (remainingBytes <= maxBytes) {
      segments.push(remaining);
      break;
    }

    // Find the longest substring that fits within maxBytes
    // UTF-16 code units are always <= UTF-8 bytes, so we can use character count
    // as an upper bound for the binary search
    let high = Math.min(remaining.length, maxBytes);
    let low = 0;
    let bestEnd = 0;

    // Binary search for the split point
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = remaining.slice(0, mid);
      const bytes = estimateUtf8Bytes(candidate);

      if (bytes <= maxBytes) {
        bestEnd = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    // Now try to find a better split point within the safe range
    // Look for natural boundaries before bestEnd
    const searchEnd = Math.min(bestEnd, remaining.length);
    let splitPoint = bestEnd;

    // Priority 1: Space followed by non-space (word boundary)
    for (let i = searchEnd; i > 0; i--) {
      const testSegment = remaining.slice(0, i);
      if (estimateUtf8Bytes(testSegment) > maxBytes) {
        break;
      }
      if (remaining[i - 1] === " " && remaining[i] !== " ") {
        splitPoint = i - 1;
        break;
      }
    }

    // Priority 2: Common punctuation (only if space search didn't find a boundary)
    if (splitPoint === bestEnd) {
      const punctSet = new Set([".", ",", ";", ":", "!", "?", ")", "]", "}"]);
      for (let i = searchEnd; i > 0; i--) {
        const testSegment = remaining.slice(0, i);
        if (estimateUtf8Bytes(testSegment) > maxBytes) {
          break;
        }
        if (punctSet.has(remaining[i - 1]) && i < remaining.length && remaining[i] !== remaining[i - 1]) {
          splitPoint = i;
          break;
        }
      }
    }

    if (splitPoint <= 0) {
      // Can't find a good split, force at bestEnd
      splitPoint = Math.max(1, bestEnd);
    }

    segments.push(remaining.slice(0, splitPoint).trimEnd());
    remaining = remaining.slice(splitPoint).trimStart();
  }

  return segments;
}

/**
 * Analyze a line to determine its role in document structure.
 */
export type LineRole =
  | "empty"
  | "heading"
  | "code_fence"
  | "list_item"
  | "blockquote"
  | "thematic_break"
  | "content";

/**
 * Get the structural role of a line.
 */
export function getLineRole(line: string): LineRole {
  if (isEmptyLine(line)) return "empty";
  if (isHeading(line)) return "heading";
  if (isCodeBlockFence(line)) return "code_fence";
  if (isListItem(line)) return "list_item";
  if (isBlockquote(line)) return "blockquote";
  if (isThematicBreak(line)) return "thematic_break";
  return "content";
}

/**
 * Split point priority for semantic chunking.
 * Lower number = higher priority (better place to split).
 */
export enum SplitPriority {
  // Best split points - won't break any semantic structure
  Heading = 1,
  ThematicBreak = 1,
  ParagraphBreak = 2, // Empty line between paragraphs

  // Good split points - minor structural boundaries
  List = 3,
  Blockquote = 3,

  // Acceptable split points - within content but at sentence boundaries
  SentenceEnd = 4,
  ClauseEnd = 5,

  // Last resort - will break semantics
  MidContent = 6,
  CodeBlock = 7, // Avoid splitting code blocks if possible
}

/**
 * Analyze a line and its context to determine split priority.
 *
 * @param line - The line to analyze
 * @param prevLine - The previous line (for context)
 * @param inCodeBlock - Whether we're currently inside a code block
 * @returns The split priority at this position
 */
export function getSplitPriority(
  line: string,
  prevLine: string,
  inCodeBlock: boolean,
): SplitPriority {
  // Never split inside code blocks
  if (inCodeBlock) {
    return SplitPriority.CodeBlock;
  }

  // Best: before headings
  if (isHeading(line)) {
    return SplitPriority.Heading;
  }

  // Best: after headings (prev was heading, current is content or empty)
  if (isHeading(prevLine)) {
    return SplitPriority.Heading;
  }

  // Best: thematic breaks
  if (isThematicBreak(line)) {
    return SplitPriority.ThematicBreak;
  }

  // Very good: paragraph breaks (empty line surrounded by content)
  if (isEmptyLine(line) && prevLine.trim().length > 0) {
    return SplitPriority.ParagraphBreak;
  }

  // Good: list items (but prefer to keep list items together)
  if (isListItem(line)) {
    return SplitPriority.List;
  }

  // Good: blockquotes
  if (isBlockquote(line)) {
    return SplitPriority.Blockquote;
  }

  // Good: sentence endings
  if (prevLine.trim().length > 0 && /[.!?]\s*$/.test(prevLine.trim())) {
    return SplitPriority.SentenceEnd;
  }

  // Acceptable: clause endings (commas, semicolons, colons)
  if (prevLine.trim().length > 0 && /[;,:]\s*$/.test(prevLine.trim())) {
    return SplitPriority.ClauseEnd;
  }

  // Last resort: mid-content
  return SplitPriority.MidContent;
}

/**
 * Find all potential split points in a document with their priorities.
 *
 * @param lines - Array of lines to analyze
 * @returns Array of split points with line index and priority
 */
export function findSplitPoints(lines: string[]): Array<{
  lineIndex: number;
  priority: SplitPriority;
  reason: string;
}> {
  const splitPoints: Array<{ lineIndex: number; priority: SplitPriority; reason: string }> = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const prevLine = i > 0 ? (lines[i - 1] ?? "") : "";

    // Track code block state
    if (isCodeBlockFence(line)) {
      inCodeBlock = !inCodeBlock;
      // Code fence boundaries are also good split points
      splitPoints.push({
        lineIndex: i,
        priority: SplitPriority.ParagraphBreak,
        reason: "code fence boundary",
      });
      continue;
    }

    const priority = getSplitPriority(line, prevLine, inCodeBlock);
    if (priority < SplitPriority.MidContent) {
      let reason = "unknown";
      switch (priority) {
        case SplitPriority.Heading:
          reason = "heading boundary";
          break;
        case SplitPriority.ThematicBreak:
          reason = "thematic break";
          break;
        case SplitPriority.ParagraphBreak:
          reason = "paragraph break";
          break;
        case SplitPriority.List:
          reason = "list item";
          break;
        case SplitPriority.Blockquote:
          reason = "blockquote";
          break;
        case SplitPriority.SentenceEnd:
          reason = "sentence end";
          break;
        case SplitPriority.ClauseEnd:
          reason = "clause end";
          break;
      }
      splitPoints.push({ lineIndex: i, priority, reason });
    }
  }

  return splitPoints;
}

/**
 * Check if two consecutive lines form a paragraph boundary.
 * A paragraph boundary is an empty line between non-empty content.
 */
export function isParagraphBoundary(line: string, prevLine: string): boolean {
  return isEmptyLine(line) && !isEmptyLine(prevLine);
}

/**
 * Get the heading level (1-6) from a heading line.
 * Returns 0 if the line is not a heading.
 */
export function getHeadingLevel(line: string): number {
  const trimmed = line.trimStart();
  const match = trimmed.match(/^#{1,6}\s/);
  if (match) {
    return match[0].trim().length;
  }
  return 0;
}

/**
 * Check if a line is inside a code block.
 * Requires tracking code block state separately.
 */
export function isInsideCodeBlock(
  lineIndex: number,
  codeBlockFences: Array<{ start: number; end: number }>,
): boolean {
  for (const block of codeBlockFences) {
    if (lineIndex > block.start && lineIndex < block.end) {
      return true;
    }
  }
  return false;
}

/**
 * Find all code block ranges in a document.
 * Returns array of { start, end } line indices (inclusive).
 */
export function findCodeBlocks(lines: string[]): Array<{ start: number; end: number }> {
  const blocks: Array<{ start: number; end: number }> = [];
  let start = -1;

  for (let i = 0; i < lines.length; i += 1) {
    if (isCodeBlockFence(lines[i] ?? "")) {
      if (start === -1) {
        start = i;
      } else {
        blocks.push({ start, end: i });
        start = -1;
      }
    }
  }

  return blocks;
}

/**
 * Check if a split point would break a structural element.
 * Returns true if splitting at this point would break something important.
 */
export function wouldBreakStructure(
  lineIndex: number,
  lines: string[],
  codeBlocks: Array<{ start: number; end: number }>,
): boolean {
  // Don't split inside code blocks
  if (isInsideCodeBlock(lineIndex, codeBlocks)) {
    return true;
  }

  const line = lines[lineIndex] ?? "";
  const prevLine = lineIndex > 0 ? (lines[lineIndex - 1] ?? "") : "";

  // Don't split right after a heading (keep heading with its content)
  if (isHeading(prevLine) && !isEmptyLine(line)) {
    return true;
  }

  // Don't split in the middle of a list (keep list items together)
  if (isListItem(prevLine) && isListItem(line)) {
    return true;
  }

  return false;
}
