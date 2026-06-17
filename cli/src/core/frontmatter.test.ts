import { describe, expect, it } from "vitest";
import { matter } from "@skillgate/ui";

describe("matter", () => {
  it("parses yaml frontmatter and body", () => {
    const raw = `---
name: demo-skill
description: A test skill
---
# Body
`;
    const { data, content } = matter(raw);
    expect(data.name).toBe("demo-skill");
    expect(data.description).toBe("A test skill");
    expect(content.trim()).toBe("# Body");
  });

  it("returns empty data when frontmatter is missing", () => {
    const { data, content } = matter("# Only body\n");
    expect(data).toEqual({});
    expect(content).toBe("# Only body\n");
  });
});