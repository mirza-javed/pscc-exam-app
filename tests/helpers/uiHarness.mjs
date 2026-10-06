import { build } from "esbuild";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  existsSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  rmdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import React from "react";
import TestRenderer from "react-test-renderer";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../", import.meta.url));
export const { act } = TestRenderer;
export { React };

// Bundle the actual client component/hook; replace only external action adapters.
export async function loadClient(relativePath, sourceOverrides = {}) {
  const result = await build({
    entryPoints: [path.join(root, relativePath)],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    loader: { ".js": "jsx" },
    banner: {
      js: `import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(${JSON.stringify(pathToFileURL(path.join(root, "package.json")).href)});`,
    },
    logLevel: "silent",
    plugins: [
      {
        name: "ui-test-adapters",
        setup(build) {
          build.onLoad({ filter: /\.(jsx|js)$/ }, (args) => {
            const relative = path
              .relative(root, args.path)
              .replaceAll("\\", "/");
            if (sourceOverrides[relative])
              return { contents: sourceOverrides[relative], loader: "jsx" };
          });
          build.onResolve({ filter: /^recharts$/ }, () => ({
            path: "recharts",
            namespace: "charts",
          }));
          build.onLoad({ filter: /.*/, namespace: "charts" }, () => ({
            contents: `import {createElement} from 'react'; ${["BarChart", "Bar", "XAxis", "YAxis", "Tooltip", "ResponsiveContainer", "Cell", "CartesianGrid", "LabelList", "ReferenceLine"].map((name) => `export function ${name}(props) { return createElement('chart-${name}', props, props.children); }`).join("\n")}`,
          }));
          build.onResolve(
            { filter: /pdfGenerator|excelResultGenerator/ },
            (args) => ({ path: args.path, namespace: "actions" }),
          );
          build.onLoad({ filter: /.*/, namespace: "actions" }, () => ({
            contents: [
              "downloadMeritMasterSheetPDF",
              "downloadCombinedResultWorkbook",
              "downloadIndividualResultWorkbook",
              "downloadCadetResultCardPDF",
              "downloadBatchResultCardsPDF",
              "generateCadetResultCardPDFBlob",
            ]
              .map(
                (name) =>
                  `export async function ${name}(input) { globalThis.__uiActions.push({name: '${name}', input}); return new Blob(['pdf']); }`,
              )
              .join("\n"),
          }));
          build.onResolve({ filter: /^@\// }, (args) => {
            const base = path.join(root, args.path.slice(2));
            return {
              path: [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`].find(
                existsSync,
              ),
            };
          });
          build.onResolve({ filter: /^[^./]|^node:/ }, (args) => {
            if (path.isAbsolute(args.path)) return;
            if (args.path.startsWith("node:"))
              return { path: args.path, external: true };
            if (!/^react($|\/)|^react-dom($|\/)/.test(args.path)) return;
            return {
              path:
                args.kind === "require-call"
                  ? require.resolve(args.path)
                  : pathToFileURL(require.resolve(args.path)).href,
              external: true,
            };
          });
        },
      },
    ],
  });
  const directory = mkdtempSync(path.join(tmpdir(), "pscc-ui-test-"));
  const file = path.join(directory, "client.mjs");
  writeFileSync(file, result.outputFiles[0].text);
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    rmSync(file);
    rmdirSync(directory);
  }
}

export function installBrowser() {
  const values = new Map();
  const classes = new Set();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  globalThis.document = {
    documentElement: {
      classList: {
        add: (value) => classes.add(value),
        remove: (value) => classes.delete(value),
      },
    },
    querySelectorAll: () => [],
  };
  globalThis.window = {
    print: () => {},
    open: () => {},
    prompt: () => "Synthetic revision",
    setTimeout,
  };
  globalThis.alert = () => {};
  globalThis.__uiActions = [];
  globalThis.__uiFocus = [];
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  return { values, classes };
}

export function render(Component, props = {}) {
  let renderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Component, props), {
      createNodeMock: (element) => ({
        getBoundingClientRect: () => ({ width: 640, height: 300 }),
        focus() {
          globalThis.__uiFocus.push(element.props.value);
        },
      }),
    });
  });
  return renderer;
}

export function textOf(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node) return "";
  return (node.children || []).map(textOf).join(" ");
}

// Prettier may split one JSX text run into adjacent React text nodes. Compare
// rendered text runs rather than source-dependent text-node segmentation.
export function normalizeDom(node) {
  if (!node) return node;
  if (Array.isArray(node)) return node.map(normalizeDom);
  if (typeof node !== "object") return node;
  const children = [];
  let text = "";
  const flush = () => {
    if (text.trim()) children.push(text.replace(/\s+/g, " ").trim());
    text = "";
  };
  for (const child of node.children || []) {
    if (typeof child === "string" || typeof child === "number") text += child;
    else {
      flush();
      children.push(normalizeDom(child));
    }
  }
  flush();
  return { ...node, children: children.length ? children : null };
}

export function button(renderer, label) {
  return renderer.root
    .findAllByType("button")
    .find((node) => textOf(node).includes(label));
}

export function syntheticDatabase() {
  const Students = [
    {
      Kit_No: "100",
      Name: "Synthetic Alpha",
      Grade: "9",
      Section: "A",
      Group: "Science",
    },
    {
      Kit_No: "101",
      Name: "Synthetic Beta",
      Grade: "9",
      Section: "A",
      Group: "Science",
    },
    {
      Kit_No: "200",
      Name: "Synthetic Gamma",
      Grade: "9",
      Section: "B",
      Group: "Science",
    },
    {
      Kit_No: "300",
      Name: "Synthetic Delta",
      Grade: "9",
      Section: "C",
      Group: "Science",
    },
  ];
  return {
    Students,
    exam_scheme: ["E1", "E2"].map((Exam_ID, i) => ({
      Exam_ID,
      Grade: "9",
      Subject: "English",
      Max_Marks: 100,
      Academic_Session: "2026-27",
      Exam_Order: i + 1,
    })),
    Marks_Log: Students.flatMap((student, i) =>
      ["E1", "E2"].map((Exam_ID) => ({
        Kit_No: student.Kit_No,
        Exam_ID,
        Subject: "English",
        Marks_Obtained: i === 1 ? 0 : 90 - i * 10,
        Submission_ID: `${Exam_ID}-${student.Kit_No}`,
      })),
    ),
    Grading_System: [],
    Authorization_Scope: { fullGradeRead: { 9: true } },
    Authorization_Issues: { duplicateKitNos: [] },
  };
}
