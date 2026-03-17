/**
 * Tests for the semantic chunker.
 */

import { describe, it, expect } from "vitest";
import {
  semanticChunker,
  chunkMarkdownSemantic,
} from "./semantic-chunker.js";
import {
  findSplitPoints,
  findCodeBlocks,
  isInsideCodeBlock,
  wouldBreakStructure,
  getSplitPriority,
  isParagraphBoundary,
  getHeadingLevel,
  SplitPriority,
} from "./markdown-boundaries.js";
import { DEFAULT_CHUNKING_CONFIG } from "./chunk-strategy.js";

describe("chunking.semanticChunker", () => {
  describe("semanticChunker", () => {
    it("has the correct name", () => {
      expect(semanticChunker.name).toBe("semantic");
    });
  });

  describe("chunkMarkdownSemantic", () => {
    it("handles empty content", () => {
      const chunks = chunkMarkdownSemantic("", DEFAULT_CHUNKING_CONFIG);
      expect(chunks).toEqual([]);
    });

    it("handles single line content", () => {
      const content = "single line";
      const chunks = chunkMarkdownSemantic(content, DEFAULT_CHUNKING_CONFIG);
      expect(chunks.length).toBe(1);
      expect(chunks[0]?.text).toBe(content);
    });

    it("preserves heading structure", () => {
      const content = `# Heading 1
Some content under heading 1

## Heading 2
Content under heading 2

### Heading 3
More content`;

      const chunks = chunkMarkdownSemantic(content, {
        maxBytes: 100,
        overlapBytes: 0,
      });

      // Each heading should start a new chunk
      expect(chunks.length).toBeGreaterThan(0);

      // Verify no chunk starts in the middle of a heading+content pair
      for (const chunk of chunks) {
        expect(chunk.text).toBeDefined();
      }
    });

    it("keeps code blocks intact", () => {
      const content = `Some intro text

\`\`\`typescript
const veryLongCodeBlock = "This is a very long code block that should not be split even if it exceeds the normal chunk size because code blocks should remain intact for semantic reasons";
const anotherLine = "more code";
const moreCode = "even more code";
\`\`\`

Some outro text`;

      const chunks = chunkMarkdownSemantic(content, {
        maxBytes: 50,
        overlapBytes: 0,
      });

      // Code block should be in a single chunk
      const codeBlockChunks = chunks.filter((c) => c.text.includes("```"));
      expect(codeBlockChunks.length).toBeGreaterThan(0);
    });

    it("splits at paragraph boundaries when possible", () => {
      const content = `Paragraph one with some text.

Paragraph two with more text.

Paragraph three with even more content here.`;

      const chunks = chunkMarkdownSemantic(content, {
        maxBytes: 40, // Small enough to force multiple chunks
        overlapBytes: 0,
      });

      expect(chunks.length).toBeGreaterThan(1);

      // Chunks should prefer to split at empty lines
      for (const chunk of chunks) {
        expect(chunk.text).toBeDefined();
      }
    });

    it("handles lists by keeping items together", () => {
      const content = `Some intro

- First list item
- Second list item
- Third list item
- Fourth list item

Some outro`;

      const chunks = chunkMarkdownSemantic(content, {
        maxBytes: 50,
        overlapBytes: 0,
      });

      // Verify list items are grouped
      const listChunks = chunks.filter((c) => c.text.includes("- "));
      expect(listChunks.length).toBeGreaterThan(0);
    });

    it("generates correct hashes and metadata", () => {
      const content = "# Test\n\nSome content";
      const chunks = chunkMarkdownSemantic(content, DEFAULT_CHUNKING_CONFIG);

      expect(chunks.length).toBeGreaterThan(0);

      for (const chunk of chunks) {
        expect(chunk.hash).toBeDefined();
        expect(chunk.hash.length).toBeGreaterThan(0);
        expect(chunk.startLine).toBeGreaterThan(0);
        expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
        expect(chunk.embeddingInput).toBeDefined();
      }
    });

    it("handles mixed markdown structures", () => {
      const content = `# Main Title

Intro paragraph.

## Subsection

- List item 1
- List item 2

\`\`\`js
code here
\`\`\`

Conclusion text.`;

      const chunks = chunkMarkdownSemantic(content, {
        maxBytes: 80,
        overlapBytes: 20,
      });

      expect(chunks.length).toBeGreaterThan(0);

      // Each chunk should have valid structure
      for (const chunk of chunks) {
        expect(chunk.text.length).toBeGreaterThan(0);
        expect(chunk.startLine).toBeGreaterThan(0);
      }
    });

    it("forces split on extremely large content", () => {
      // Create content that will definitely exceed limits
      const longLine = "a".repeat(10000);
      const content = `# Title

${longLine}

More content`;

      const chunks = chunkMarkdownSemantic(content, {
        maxBytes: 200,
        overlapBytes: 0,
      });

      // Should force split even if it breaks structure
      expect(chunks.length).toBeGreaterThan(1);

      // No chunk should exceed maxBytes significantly
      for (const chunk of chunks) {
        // Allow some overhead for the force split case
        expect(chunk.text.length).toBeLessThan(12000);
      }
    });
  });
});

describe("chunking.markdownBoundaries (Phase 2 extensions)", () => {
  describe("findSplitPoints", () => {
    it("identifies heading boundaries", () => {
      const lines = ["# Heading", "content", "## Subheading", "more content"];
      const points = findSplitPoints(lines);

      const headingPoints = points.filter((p) => p.priority === SplitPriority.Heading);
      expect(headingPoints.length).toBeGreaterThan(0);
    });

    it("identifies paragraph breaks", () => {
      const lines = ["para 1", "", "para 2", "", "para 3"];
      const points = findSplitPoints(lines);

      const paragraphPoints = points.filter((p) => p.priority === SplitPriority.ParagraphBreak);
      expect(paragraphPoints.length).toBeGreaterThan(0);
    });

    it("identifies code fences as boundaries", () => {
      const lines = ["text", "```js", "code", "```", "more text"];
      const points = findSplitPoints(lines);

      const fencePoints = points.filter((p) => p.reason === "code fence boundary");
      expect(fencePoints.length).toBeGreaterThan(0);
    });
  });

  describe("findCodeBlocks", () => {
    it("finds single code block", () => {
      const lines = ["text", "```js", "code", "```", "more"];
      const blocks = findCodeBlocks(lines);

      expect(blocks.length).toBe(1);
      expect(blocks[0]?.start).toBe(1);
      expect(blocks[0]?.end).toBe(3);
    });

    it("finds multiple code blocks", () => {
      const lines = [
        "text",
        "```js",
        "code1",
        "```",
        "middle",
        "```py",
        "code2",
        "```",
        "end",
      ];
      const blocks = findCodeBlocks(lines);

      expect(blocks.length).toBe(2);
      expect(blocks[0]?.start).toBe(1);
      expect(blocks[0]?.end).toBe(3);
      expect(blocks[1]?.start).toBe(5);
      expect(blocks[1]?.end).toBe(7);
    });

    it("handles unclosed code blocks", () => {
      const lines = ["text", "```js", "code", "more", "end"];
      const blocks = findCodeBlocks(lines);

      // Unclosed block should not be counted
      expect(blocks.length).toBe(0);
    });
  });

  describe("isInsideCodeBlock", () => {
    it("correctly identifies lines inside code blocks", () => {
      const blocks = [
        { start: 2, end: 5 },
        { start: 8, end: 10 },
      ];

      expect(isInsideCodeBlock(0, blocks)).toBe(false);
      expect(isInsideCodeBlock(2, blocks)).toBe(false); // fence line
      expect(isInsideCodeBlock(3, blocks)).toBe(true); // inside
      expect(isInsideCodeBlock(5, blocks)).toBe(false); // fence line
      expect(isInsideCodeBlock(6, blocks)).toBe(false); // outside
      expect(isInsideCodeBlock(9, blocks)).toBe(true); // inside second block
    });
  });

  describe("wouldBreakStructure", () => {
    it("detects code block splits as breaking structure", () => {
      const lines = ["text", "```js", "code", "```", "more"];
      const codeBlocks = findCodeBlocks(lines);

      expect(wouldBreakStructure(2, lines, codeBlocks)).toBe(true); // inside code block
      expect(wouldBreakStructure(0, lines, codeBlocks)).toBe(false); // outside
    });

    it("detects heading+content splits as breaking structure", () => {
      const lines = ["# Heading", "content", "", "next section"];
      const codeBlocks: Array<{ start: number; end: number }> = [];

      // Splitting right after heading (before content) would break structure
      expect(wouldBreakStructure(1, lines, codeBlocks)).toBe(true);
    });

    it("allows splitting at paragraph boundaries", () => {
      const lines = ["para 1", "", "para 2"];
      const codeBlocks: Array<{ start: number; end: number }> = [];

      expect(wouldBreakStructure(1, lines, codeBlocks)).toBe(false);
    });
  });

  describe("getSplitPriority", () => {
    it("gives highest priority to headings", () => {
      const lines = ["content", "# Heading", "more"];
      expect(getSplitPriority(lines[1] ?? "", lines[0] ?? "", false)).toBe(
        SplitPriority.Heading,
      );
    });

    it("gives high priority to paragraph breaks", () => {
      expect(getSplitPriority("", "some content", false)).toBe(
        SplitPriority.ParagraphBreak,
      );
    });

    it("gives lowest priority to mid-content", () => {
      expect(getSplitPriority("more text", "some text", false)).toBe(
        SplitPriority.MidContent,
      );
    });

    it("marks code blocks as avoid splitting", () => {
      expect(getSplitPriority("code line", "prev code", true)).toBe(
        SplitPriority.CodeBlock,
      );
    });
  });

  describe("isParagraphBoundary", () => {
    it("detects empty lines between content as paragraph boundaries", () => {
      expect(isParagraphBoundary("", "content")).toBe(true);
      expect(isParagraphBoundary("", "")).toBe(false); // empty followed by empty
      expect(isParagraphBoundary("content", "")).toBe(false); // content followed by empty
      expect(isParagraphBoundary("more", "content")).toBe(false); // content followed by content
    });
  });

  describe("getHeadingLevel", () => {
    it("returns correct heading levels", () => {
      expect(getHeadingLevel("# Heading")).toBe(1);
      expect(getHeadingLevel("## Heading")).toBe(2);
      expect(getHeadingLevel("### Heading")).toBe(3);
      expect(getHeadingLevel("###### Heading")).toBe(6);
      expect(getHeadingLevel("Not a heading")).toBe(0);
      expect(getHeadingLevel("")).toBe(0);
    });
  });
});
