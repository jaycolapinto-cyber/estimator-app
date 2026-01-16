// brace-find.js
// Usage: node brace-find.js src/App.tsx

const fs = require("fs");

const file = process.argv[2];
if (!file) {
  console.error("Usage: node brace-find.js src/App.tsx");
  process.exit(1);
}

const src = fs.readFileSync(file, "utf8");

let line = 1;
let col = 0;

const stack = [];

let inSQuote = false;
let inDQuote = false;
let inTemplate = false;
let inLineComment = false;
let inBlockComment = false;
let escaped = false;

function push(pos) {
  stack.push(pos);
}

function pop() {
  return stack.pop();
}

for (let i = 0; i < src.length; i++) {
  const ch = src[i];
  const next = src[i + 1];

  // track line/col
  if (ch === "\n") {
    line++;
    col = 0;
    inLineComment = false;
    continue;
  } else {
    col++;
  }

  // handle escaping in strings/templates
  if (
    (inSQuote || inDQuote || inTemplate) &&
    !inLineComment &&
    !inBlockComment
  ) {
    if (!escaped && ch === "\\") {
      escaped = true;
      continue;
    }
  }

  // comments start/end (only if not inside strings/templates)
  if (!inSQuote && !inDQuote && !inTemplate) {
    if (!inBlockComment && !inLineComment && ch === "/" && next === "/") {
      inLineComment = true;
      i++;
      col++;
      continue;
    }
    if (!inBlockComment && !inLineComment && ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
      col++;
      continue;
    }
    if (inBlockComment && ch === "*" && next === "/") {
      inBlockComment = false;
      i++;
      col++;
      continue;
    }
  }

  if (inLineComment || inBlockComment) continue;

  // toggle strings/templates
  if (!inDQuote && !inTemplate && ch === "'" && !escaped) {
    inSQuote = !inSQuote;
    continue;
  }
  if (!inSQuote && !inTemplate && ch === `"` && !escaped) {
    inDQuote = !inDQuote;
    continue;
  }
  if (!inSQuote && !inDQuote && ch === "`" && !escaped) {
    inTemplate = !inTemplate;
    continue;
  }

  // reset escape
  escaped = false;

  // only count braces when not inside strings/templates
  if (inSQuote || inDQuote || inTemplate) continue;

  if (ch === "{") {
    push({ line, col, i });
  } else if (ch === "}") {
    if (stack.length === 0) {
      console.log("Extra closing brace '}' at", { line, col });
      process.exit(0);
    }
    pop();
  }
}

if (stack.length > 0) {
  const last = stack[stack.length - 1];
  console.log("Missing '}' for an opening '{' near:");
  console.log("Line:", last.line, "Col:", last.col);
  const start = Math.max(0, last.i - 120);
  const end = Math.min(src.length, last.i + 120);
  console.log("\n--- Context ---\n");
  console.log(src.slice(start, end));
  console.log("\n--- End Context ---\n");
  process.exit(0);
}

console.log(
  "No brace imbalance detected ({}). If you still get errors, it's likely parentheses or JSX."
);
