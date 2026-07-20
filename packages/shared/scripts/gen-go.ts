/**
 * Generates Go structs from the wire contract in src/index.ts.
 *
 * The contract stays the single source of truth (CLAUDE.md); the Go client just
 * mirrors it. CI regenerates and fails on any diff, so the two cannot drift.
 *
 *   bun run gen:go
 *
 * Uses the TypeScript compiler's own parser rather than regex: the contract has
 * unions, intersections, inline object types and nullable arrays, and a regex
 * that handles all of those is a parser with worse error messages.
 */
import ts from "typescript";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SRC = join(import.meta.dir, "..", "src", "index.ts");
const OUT = join(import.meta.dir, "..", "..", "..", "apps", "tui", "internal", "api", "types.go");

/**
 * TypeScript has one `number`; Go has to pick. Everything is an int unless
 * named here — getting this wrong makes json.Unmarshal fail at runtime on a
 * fractional value, so the list is explicit rather than guessed, and
 * types_test.go decodes real API payloads to prove it.
 */
const FLOAT_FIELDS = new Set([
  "LineupPlayer.rating",
  "TeamStats.xg",
  "TeamStats.goalsPrevented",
  "MatchMotm.rating",
]);

const src = ts.createSourceFile(SRC, await Bun.file(SRC).text(), ts.ScriptTarget.Latest, true);

function pascal(name: string): string {
  const s = name.replace(/[^A-Za-z0-9]/g, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Go initialisms, so generated names read as Go rather than as transliterated TS. */
function goName(field: string): string {
  const p = pascal(field);
  return p.replace(/Id$/, "ID").replace(/Url$/, "URL").replace(/^Xg$/, "XG");
}

function isNullLiteral(n: ts.TypeNode): boolean {
  return (
    n.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isLiteralTypeNode(n) && n.literal.kind === ts.SyntaxKind.NullKeyword)
  );
}

/** String-literal unions become a named Go string type plus constants. */
function stringUnionMembers(n: ts.TypeNode): string[] | null {
  if (!ts.isUnionTypeNode(n)) return null;
  const out: string[] = [];
  for (const m of n.types) {
    if (ts.isLiteralTypeNode(m) && ts.isStringLiteral(m.literal)) out.push(m.literal.text);
    else if (!isNullLiteral(m)) return null;
  }
  return out.length > 0 ? out : null;
}

type Ctx = { owner: string; field: string; indent: string };

function goType(n: ts.TypeNode, ctx: Ctx): { type: string; nullable: boolean } {
  if (ts.isUnionTypeNode(n)) {
    const nonNull = n.types.filter((t) => !isNullLiteral(t));
    const nullable = nonNull.length !== n.types.length;
    if (nonNull.length === 1) {
      const inner = goType(nonNull[0]!, ctx);
      return { type: inner.type, nullable: nullable || inner.nullable };
    }
    // A string-literal union at field position: the enum type is emitted
    // separately when it is a top-level alias, so fall back to string here.
    if (stringUnionMembers(n)) return { type: "string", nullable };
  }

  if (ts.isArrayTypeNode(n)) {
    const el = goType(n.elementType, { ...ctx, indent: ctx.indent });
    // A nil slice already models "absent", so nullable arrays need no pointer.
    return { type: `[]${el.nullable && el.type !== "string" ? "*" : ""}${el.type}`, nullable: false };
  }

  if (ts.isTypeLiteralNode(n)) {
    return { type: structBody(n, ctx.indent, ctx.owner), nullable: false };
  }

  if (ts.isTypeReferenceNode(n)) {
    const name = n.typeName.getText(src);
    if (name === "Record") return { type: "map[string]any", nullable: false };
    return { type: name, nullable: false };
  }

  switch (n.kind) {
    case ts.SyntaxKind.StringKeyword:
      return { type: "string", nullable: false };
    case ts.SyntaxKind.BooleanKeyword:
      return { type: "bool", nullable: false };
    case ts.SyntaxKind.NumberKeyword:
      return {
        type: FLOAT_FIELDS.has(`${ctx.owner}.${ctx.field}`) ? "float64" : "int",
        nullable: false,
      };
    default:
      return { type: "any", nullable: false };
  }
}

function comment(node: ts.Node, indent: string): string {
  const full = node.getFullText(src);
  const ranges = ts.getLeadingCommentRanges(full, 0) ?? [];
  const lines: string[] = [];
  for (const r of ranges) {
    // A comment with no newline before it is the *previous* member's trailing
    // comment, which TypeScript also reports as this one's leading comment.
    // Attaching it here would document the wrong field.
    if (!full.slice(0, r.pos).includes("\n")) continue;
    const raw = full.slice(r.pos, r.end);
    for (const line of raw.split("\n")) {
      const clean = line
        .replace(/^\s*\/\*\*?/, "")
        .replace(/\*\/\s*$/, "")
        .replace(/^\s*\*ial?/, "")
        .replace(/^\s*\*\s?/, "")
        .replace(/^\s*\/\/\s?/, "")
        .trim();
      if (clean) lines.push(`${indent}// ${clean}`);
    }
  }
  return lines.length ? lines.join("\n") + "\n" : "";
}

function structBody(lit: ts.TypeLiteralNode, indent: string, owner: string): string {
  const inner = indent + "\t";
  let out = "struct {\n";
  for (const member of lit.members) {
    if (!ts.isPropertySignature(member) || !member.type) continue;
    const jsonName = member.name.getText(src).replace(/["']/g, "");
    const { type, nullable } = goType(member.type, { owner, field: jsonName, indent: inner });
    const optional = nullable || member.questionToken !== undefined;
    const ptr = optional && !type.startsWith("[]") && !type.startsWith("map[") ? "*" : "";
    out += comment(member, inner);
    out += `${inner}${goName(jsonName)} ${ptr}${type} \`json:"${jsonName}"\`\n`;
  }
  return out + indent + "}";
}

const header = `// Code generated by packages/shared/scripts/gen-go.ts. DO NOT EDIT.
//
// Mirrors the wire contract in packages/shared/src/index.ts, which is the single
// source of truth. Run \`bun run gen:go\` from packages/shared after changing it;
// CI fails if the two are out of step.

package api
`;

const parts: string[] = [header];

for (const stmt of src.statements) {
  if (!ts.isTypeAliasDeclaration(stmt)) continue;
  const name = stmt.name.text;
  const doc = comment(stmt, "");

  const members = stringUnionMembers(stmt.type);
  if (members) {
    parts.push(
      `${doc}type ${name} string\n\nconst (\n` +
        members.map((m) => `\t${name}${pascal(m)} ${name} = ${JSON.stringify(m)}`).join("\n") +
        "\n)\n",
    );
    continue;
  }

  if (ts.isTypeLiteralNode(stmt.type)) {
    parts.push(`${doc}type ${name} ${structBody(stmt.type, "", name)}\n`);
    continue;
  }

  // `MatchDetail = Match & { … }` — embed the base struct, then the extras.
  if (ts.isIntersectionTypeNode(stmt.type)) {
    const bases = stmt.type.types.filter(ts.isTypeReferenceNode).map((t) => t.typeName.getText(src));
    const extra = stmt.type.types.find(ts.isTypeLiteralNode);
    let body = "struct {\n";
    for (const b of bases) body += `\t${b}\n`;
    if (extra) body += structBody(extra, "", name).replace(/^struct \{\n/, "").replace(/\n\}$/, "\n");
    body += "}";
    parts.push(`${doc}type ${name} ${body}\n`);
    continue;
  }

  const { type } = goType(stmt.type, { owner: name, field: "", indent: "" });
  parts.push(`${doc}type ${name} ${type}\n`);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, parts.join("\n"));

// gofmt here, not by hand afterwards. Emitting unaligned Go and formatting it
// separately makes the output differ from the committed file on every run,
// which would make the CI drift check fail permanently and for the wrong reason.
const fmt = Bun.spawnSync(["gofmt", "-w", OUT]);
if (!fmt.success) {
  console.error(new TextDecoder().decode(fmt.stderr));
  throw new Error("gofmt failed on the generated file");
}

console.log(`wrote ${OUT}`);
