// brace-audit.js
// Usage: node brace-audit.js src/App.tsx
// Purpose: Finds where you fall OUT of AppShell scope before the render return.

const fs = require("fs");

const file = process.argv[2];
if (!file) {
  console.error("Usage: node brace-audit.js <path-to-App.tsx>");
  process.exit(1);
}

const src = fs.readFileSync(file, "utf8");

// --- helpers
function lcFromIndex(s, idx) {
  let line = 1,
    col = 1;
  for (let i = 0; i < idx; i++) {
    const ch = s[i];
    if (ch === "\n") {
      line++;
      col = 1;
    } else col++;
  }
  return { line, col };
}

function getLine(s, lineNo) {
  const lines = s.split("\n");
  return lines[lineNo - 1] ?? "";
}

function sliceAround(s, idx, radius = 120) {
  const a = Math.max(0, idx - radius);
  const b = Math.min(s.length, idx + radius);
  return s.slice(a, b).replace(/\n/g, "\\n");
}

// --- very small tokenizer that ignores strings + comments
let i = 0;
let state = "code"; // code | linecomment | blockcomment | s1 | s2 | tpl
let tplDepth = 0;

const stack = []; // {ch, line, col, note}
let lastNonWs = "";
let appShellStart = null; // { idx, line, col }
let renderIdx = null;

function push(ch, note) {
  const { line, col } = lcFromIndex(src, i);
  stack.push({ ch, line, col, note });
}
function pop(expected) {
  const top = stack[stack.length - 1];
  if (!top || top.ch !== expected) return null;
  return stack.pop();
}

// detect AppShell start heuristically (works for: function AppShell(...) { OR const AppShell = (...) => {)
function detectAppShellStartWindow(windowText) {
  // function AppShell(
  if (/function\s+AppShell\s*\(/.test(windowText)) return true;
  // const AppShell = (...) => {
  if (/(const|let|var)\s+AppShell\s*=\s*\([^)]*\)\s*=>/.test(windowText))
    return true;
  if (/(const|let|var)\s+AppShell\s*=\s*\w+\s*=>/.test(windowText)) return true;
  return false;
}

while (i < src.length) {
  const ch = src[i];
  const next = src[i + 1] || "";

  // track render marker
  if (renderIdx == null && src.slice(i, i + 15).includes("// RENDER")) {
    renderIdx = i;
  }

  // state transitions
  if (state === "code") {
    // start comments
    if (ch === "/" && next === "/") {
      state = "linecomment";
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      state = "blockcomment";
      i += 2;
      continue;
    }

    // start strings
    if (ch === "'") {
      state = "s1";
      i++;
      continue;
    }
    if (ch === '"') {
      state = "s2";
      i++;
      continue;
    }
    if (ch === "`") {
      state = "tpl";
      tplDepth = 0;
      i++;
      continue;
    }

    // detect AppShell "header" in a sliding window
    if (appShellStart == null) {
      const windowText = src.slice(Math.max(0, i - 120), i + 120);
      if (detectAppShellStartWindow(windowText)) {
        // record when we hit the first { after the header
        // We'll set appShellStart when we push that { with note "AppShell"
      }
    }

    // push/pop braces/parens/brackets
    if (ch === "{") {
      // decide if this "{" begins AppShell
      if (appShellStart == null) {
        const windowText = src.slice(Math.max(0, i - 160), i);
        if (detectAppShellStartWindow(windowText)) {
          const { line, col } = lcFromIndex(src, i);
          appShellStart = { idx: i, line, col };
          push("{", "AppShell {");
          i++;
          continue;
        }
      }
      push("{");
      i++;
      continue;
    }
    if (ch === "}") {
      const popped = pop("{");
      const { line, col } = lcFromIndex(src, i);

      // If we just closed AppShell AND we haven't reached // RENDER yet => that's the bug zone.
      if (
        popped &&
        popped.note === "AppShell {" &&
        renderIdx != null &&
        i < renderIdx
      ) {
        console.log("\n🚨 AppShell closes BEFORE // RENDER");
        console.log(
          `AppShell opened at line ${popped.line}, col ${popped.col}`
        );
        console.log(`Closed by '}' at line ${line}, col ${col}`);
        console.log("Line text:", getLine(src, line));
        console.log("Context:", sliceAround(src, i, 180));
        console.log(
          "\n✅ This closing '}' (or the block immediately above it) is the one to fix."
        );
        process.exit(0);
      }

      i++;
      continue;
    }

    if (ch === "(") {
      push("(");
      i++;
      continue;
    }
    if (ch === ")") {
      pop("(");
      i++;
      continue;
    }
    if (ch === "[") {
      push("[");
      i++;
      continue;
    }
    if (ch === "]") {
      pop("[");
      i++;
      continue;
    }

    if (!/\s/.test(ch)) lastNonWs = ch;
    i++;
    continue;
  }

  if (state === "linecomment") {
    if (ch === "\n") state = "code";
    i++;
    continue;
  }

  if (state === "blockcomment") {
    if (ch === "*" && next === "/") {
      state = "code";
      i += 2;
      continue;
    }
    i++;
    continue;
  }

  if (state === "s1") {
    if (ch === "\\" && next) {
      i += 2;
      continue;
    }
    if (ch === "'") {
      state = "code";
      i++;
      continue;
    }
    i++;
    continue;
  }

  if (state === "s2") {
    if (ch === "\\" && next) {
      i += 2;
      continue;
    }
    if (ch === '"') {
      state = "code";
      i++;
      continue;
    }
    i++;
    continue;
  }

  if (state === "tpl") {
    if (ch === "\\" && next) {
      i += 2;
      continue;
    }
    // handle ${ ... } blocks inside template literals
    if (ch === "$" && next === "{") {
      tplDepth++;
      i += 2;
      continue;
    }
    if (ch === "}" && tplDepth > 0) {
      tplDepth--;
      i++;
      continue;
    }
    if (ch === "`" && tplDepth === 0) {
      state = "code";
      i++;
      continue;
    }
    i++;
    continue;
  }
}

// If we get here, we didn't find "AppShell closes before render" trigger.
// Still useful info:
console.log("\nNo early AppShell close detected before // RENDER.");
console.log("This usually means either:");
console.log(
  "1) The render return is not inside AppShell at all (moved outside), OR"
);
console.log("2) AppShell is defined differently than expected, OR");
console.log("3) The marker '// RENDER' is missing/changed.");
process.exit(0);
