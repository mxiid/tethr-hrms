import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// PermissionsGuard is deny-by-default (see permissions.guard.ts): an operation
// without @Public or @RequirePermissions/@RequireAnyPermissions has no
// authorization policy and fails closed at runtime. This test walks every
// resolver source — operations AND field resolvers, with class-level
// decorators counted (getAllAndOverride reads handler first, then class) — so
// a forgotten decorator fails CI instead of shipping an open endpoint.
//
// It replaced the old PUBLIC_OPERATIONS/KNOWN_UNGUARDED allowlists: the
// decorators are now the single, explicit declaration of an operation's
// policy, and this list can no longer drift.

const SRC_ROOT = join(__dirname, '..', '..');

const POLICY_DECORATORS = ['@Public', '@RequirePermissions', '@RequireAnyPermissions'] as const;

const findResolverFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) return findResolverFiles(full);
    return entry.endsWith('.resolver.ts') ? [full] : [];
  });

// Built per call: a /g regex carries lastIndex between matchAll calls, so a
// shared instance would silently skip files after the first. Decorators are
// single-line in this codebase; the pattern captures the block immediately
// above an operation, plus the operation's name. Field resolvers end in `(`
// or `:` when they have no arguments.
const operationPattern = (): RegExp =>
  /@(?:Query|Mutation|ResolveField)\([^\r\n]*\)\r?\n((?:[ \t]*@[^\r\n]*\r?\n)*)[ \t]*(?:async[ \t]+)?([A-Za-z_]\w*)[ \t]*[(:]/g;

// The decorator block above `export class` (e.g. @Resolver + @UseGuards +
// @RequirePermissions). Operations inherit it via the guard's
// getAllAndOverride([handler, class]).
const classPattern = (): RegExp =>
  /@Resolver\([^\r\n]*\)\r?\n((?:[ \t]*@[^\r\n]*\r?\n)*)[ \t]*export class/g;

const hasPolicy = (decorators: string): boolean =>
  POLICY_DECORATORS.some((name) => decorators.includes(name));

const operationsMissingPolicy = (): string[] =>
  findResolverFiles(SRC_ROOT).flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    const key = relative(SRC_ROOT, file).split(sep).join('/');
    const classDecorators = [...source.matchAll(classPattern())].map((match) => ({
      index: match.index ?? 0,
      decorators: match[1],
    }));
    return [...source.matchAll(operationPattern())].flatMap((match) => {
      const index = match.index ?? 0;
      const inherited =
        classDecorators.filter((entry) => entry.index < index).at(-1)?.decorators ?? '';
      return hasPolicy(`${inherited}\n${match[1]}`) ? [] : [`${key}:${match[2]}`];
    });
  });

describe('resolver authorization', () => {
  it('declares @Public or required permissions on every operation and field resolver', () => {
    expect(operationsMissingPolicy()).toEqual([]);
  });

  it('does not rely on per-resolver @UseGuards(PermissionsGuard) — the guard is global', () => {
    const offenders = findResolverFiles(SRC_ROOT)
      .filter((file) => readFileSync(file, 'utf8').includes('@UseGuards(PermissionsGuard)'))
      .map((file) => relative(SRC_ROOT, file).split(sep).join('/'));
    expect(offenders).toEqual([]);
  });
});
