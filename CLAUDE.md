<coding-rules>

type Point = { x: number; y: number; };
export function distance(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
```

- As much as possible, avoid the use of classes and use function-based implementations.
- Use src/lib/result.ts to handle results.
</coding-rules>

<testing>
Unit test must be written after each implement using vitest.
The purpose is ensure the code works properly.

You must run `npm run check` before completing your task.
This command that runs all quality checks: formatting, linting, type checking, and tests.
</testing>

<workfiles>
At the end of each task, your works must be documented in ./works directory.
The work files name should follow the format below to clarify the order of files.
`<index>-<description>.md`
e.g.: 0-implementation-intent.md
If you want to know the reason of implements, you can check past work files.
<workfiles>

@/Users/jo/.ccmm/projects/3c6ac3e255e73ab6/merged-preset-HEAD.md