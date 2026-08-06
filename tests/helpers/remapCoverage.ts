// QTRACE_PLAYWRIGHT_HELPER
import path from 'path';
import {
  TraceMap,
  originalPositionFor,
  type SourceMapInput,
} from '@jridgewell/trace-mapping';

type Pos = { line: number; column: number };
type Loc = { start: Pos; end: Pos };

type FileCoverage = {
  path?: string;
  statementMap?: Record<string, Loc>;
  fnMap?: Record<string, any>;
  branchMap?: Record<string, any>;
  s?: Record<string, number>;
  f?: Record<string, number>;
  b?: Record<string, number[]>;
  l?: Record<string, number>;
  inputSourceMap?: unknown;
  [key: string]: unknown;
};

export function getMapForFileCoverage(
  fileCoverage: FileCoverage,
  jsFilePath: string
): TraceMap | null {
  if (!fileCoverage.inputSourceMap) {
    return null;
  }

  try {
    return new TraceMap(fileCoverage.inputSourceMap as SourceMapInput);
  } catch (err) {
    console.warn(`[remap] Invalid inputSourceMap for ${jsFilePath}:`, err);
    return null;
  }
}

export function mapPosition(
  map: TraceMap,
  pos: Pos | undefined | null
): { source: string; line: number; column: number } | null {
  if (!pos || typeof pos.line !== 'number' || typeof pos.column !== 'number') {
    return null;
  }

  const out = originalPositionFor(map, {
    line: pos.line,
    column: pos.column,
  });

  if (
    out == null ||
    out.line == null ||
    out.column == null ||
    !out.source ||
    out.source === ''
  ) {
    return null;
  }

  return {
    source: out.source,
    line: out.line,
    column: out.column,
  };
}

function resolveOriginalPath(jsFilePath: string, sourceFromMap: string): string {
  if (path.isAbsolute(sourceFromMap)) {
    return path.normalize(sourceFromMap);
  }
  return path.normalize(path.resolve(path.dirname(jsFilePath), sourceFromMap));
}

function emptyFileCoverage(originalPath: string): FileCoverage {
  return {
    path: originalPath,
    statementMap: {},
    fnMap: {},
    branchMap: {},
    s: {},
    f: {},
    b: {},
    l: {},
  };
}

function mapLoc(
  map: TraceMap,
  loc: Loc | undefined | null
): { source: string; loc: Loc } | null {
  if (!loc?.start || !loc?.end) return null;
  const start = mapPosition(map, loc.start);
  const end = mapPosition(map, loc.end);
  if (!start || !end) return null;

  return {
    source: start.source,
    loc: {
      start: { line: start.line, column: start.column },
      end: { line: end.line, column: end.column },
    },
  };
}

function buildHitLines(fileCoverage: FileCoverage): Record<string, number> {
  const l: Record<string, number> = {};

  const markSingleLine = (line: number | undefined | null, hits: number) => {
    if (hits > 0 && line != null) {
      l[String(line)] = 1;
    }
  };

  const markRange = (loc: Loc | undefined | null, hits: number) => {
    if (hits <= 0 || !loc?.start?.line || !loc?.end?.line) return;
    for (let line = loc.start.line; line <= loc.end.line; line++) {
      l[String(line)] = 1;
    }
  };

  for (const [id, fn] of Object.entries(fileCoverage.fnMap || {})) {
    const hits = fileCoverage.f?.[id] ?? 0;
    const declLine = fn?.decl?.start?.line ?? fn?.line;
    markSingleLine(declLine, hits);
  }

  for (const [id, br] of Object.entries(fileCoverage.branchMap || {})) {
    const hitCounts = fileCoverage.b?.[id] ?? [];
    (br?.locations || []).forEach((loc: Loc, idx: number) => {
      markRange(loc, hitCounts[idx] ?? 0);
    });
  }

  for (const [id, loc] of Object.entries(fileCoverage.statementMap || {})) {
    const hits = fileCoverage.s?.[id] ?? 0;
    markSingleLine(loc?.start?.line, hits);
  }

  return l;
}

function withLineHits(fileCoverage: FileCoverage): FileCoverage {
  return {
    ...fileCoverage,
    l: buildHitLines(fileCoverage),
  };
}

export function remapFileCoverage(
  fileCoverage: FileCoverage,
  coverageKey: string
): Record<string, FileCoverage> {
  const jsPath = path.normalize(fileCoverage.path || coverageKey);
  const map = getMapForFileCoverage(fileCoverage, jsPath);

  if (!map) {
    return {
      [jsPath]: withLineHits({
        ...fileCoverage,
        path: jsPath,
      }),
    };
  }

  const out: Record<string, FileCoverage> = {};

  const ensure = (originalPath: string) => {
    if (!out[originalPath]) out[originalPath] = emptyFileCoverage(originalPath);
    return out[originalPath];
  };

  for (const [id, loc] of Object.entries(fileCoverage.statementMap || {})) {
    const mapped = mapLoc(map, loc);
    if (!mapped) continue;

    const originalPath = resolveOriginalPath(jsPath, mapped.source);
    const fc = ensure(originalPath);
    const newId = String(Object.keys(fc.statementMap!).length);

    fc.statementMap![newId] = mapped.loc;
    fc.s![newId] = fileCoverage.s?.[id] ?? 0;
  }

  for (const [id, fn] of Object.entries(fileCoverage.fnMap || {})) {
    const decl = mapLoc(map, fn?.decl);
    const body = mapLoc(map, fn?.loc);
    if (!decl || !body) continue;

    const originalPath = resolveOriginalPath(jsPath, decl.source);
    const fc = ensure(originalPath);
    const newId = String(Object.keys(fc.fnMap!).length);

    fc.fnMap![newId] = {
      name: fn.name,
      decl: decl.loc,
      loc: body.loc,
      line: decl.loc.start.line,
    };
    fc.f![newId] = fileCoverage.f?.[id] ?? 0;
  }

  for (const [id, br] of Object.entries(fileCoverage.branchMap || {})) {
    const main = mapLoc(map, br?.loc);
    if (!main) continue;

    const locations: Loc[] = [];
    let locationsOk = true;

    for (const loc of br.locations || []) {
      const mapped = mapLoc(map, loc);
      if (!mapped) {
        locationsOk = false;
        break;
      }
      locations.push(mapped.loc);
    }
    if (!locationsOk) continue;

    const originalPath = resolveOriginalPath(jsPath, main.source);
    const fc = ensure(originalPath);
    const newId = String(Object.keys(fc.branchMap!).length);

    fc.branchMap![newId] = {
      loc: main.loc,
      type: br.type,
      locations,
    };
    fc.b![newId] = fileCoverage.b?.[id] ?? locations.map(() => 0);
  }

  if (Object.keys(out).length === 0) {
    return {
      [jsPath]: withLineHits({
        ...fileCoverage,
        path: jsPath,
      }),
    };
  }

  for (const originalPath of Object.keys(out)) {
    out[originalPath] = withLineHits(out[originalPath]);
  }

  return out;
}

function mergeFileCoverage(target: FileCoverage, incoming: FileCoverage) {
  for (const [id, loc] of Object.entries(incoming.statementMap || {})) {
    const newId = String(Object.keys(target.statementMap || {}).length);
    target.statementMap![newId] = loc;
    target.s![newId] = incoming.s?.[id] ?? 0;
  }

  for (const [id, fn] of Object.entries(incoming.fnMap || {})) {
    const newId = String(Object.keys(target.fnMap || {}).length);
    target.fnMap![newId] = fn;
    target.f![newId] = incoming.f?.[id] ?? 0;
  }

  for (const [id, br] of Object.entries(incoming.branchMap || {})) {
    const newId = String(Object.keys(target.branchMap || {}).length);
    target.branchMap![newId] = br;
    target.b![newId] = incoming.b?.[id] ?? [];
  }
}

export function remapCoverage(
  coverage: Record<string, FileCoverage> | null | undefined
): Record<string, FileCoverage> {
  if (!coverage || typeof coverage !== 'object') return {};

  const merged: Record<string, FileCoverage> = {};

  for (const [key, fileCoverage] of Object.entries(coverage)) {
    if (!fileCoverage || typeof fileCoverage !== 'object') continue;

    const remapped = remapFileCoverage(fileCoverage, key);

    for (const [originalPath, next] of Object.entries(remapped)) {
      if (!merged[originalPath]) {
        merged[originalPath] = next;
      } else {
        mergeFileCoverage(merged[originalPath], next);
      }
    }
  }

  for (const originalPath of Object.keys(merged)) {
    merged[originalPath] = withLineHits(merged[originalPath]);
  }

  return merged;
}
