/**
 * Static consistency check for the `onBeforeCompile` GLSL patch family
 * (`solarIrradiancePatch.ts`, `regolithPhotometryPatch.ts`,
 * `planetshinePatch.ts`, …): every `u_`-prefixed identifier REFERENCED
 * anywhere in a composed shader string must have a matching
 * `uniform <type> <name>;` DECLARATION somewhere in that same string.
 *
 * This is the check the family's tests were missing when
 * `planetshinePatch.ts` shipped (commit 26cb756): every patch test asserted
 * chunk PRESENCE (`toContain("IncidentLight shineLight;")`) but never that a
 * uniform referenced by name was actually DECLARED, so a patch that read
 * `u_shineDir` / `u_shineRadiance` without declaring either compiled the
 * test suite green and only failed at the real GPU compile step:
 *
 *   ERROR: 0:1908: 'u_shineDir' : undeclared identifier
 *   ERROR: 0:1909: 'u_shineRadiance' : undeclared identifier
 *
 * `shader.uniforms[name] = { value }` (the JS-side registration every patch
 * in this family does) proves nothing about this — it is a plain JS object
 * assignment, independent of whatever GLSL text the same patch also
 * happens to emit.
 *
 * GLSL comments are stripped before scanning so a doc comment that merely
 * MENTIONS another patch's uniform name (as `planetshinePatch.ts`'s own
 * injected `//` comment does for `u_solarIrradiance`) is never mistaken for
 * a real reference — checking `buildPlanetshinePatch()`'s output in
 * isolation would otherwise false-positive on exactly that comment.
 */

const stripGlslComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");

/**
 * Returns every `u_`-prefixed identifier referenced in `shaderText` that
 * has no matching `uniform` declaration in the same text. Empty array means
 * the text is internally consistent — it says nothing about whether the
 * text is a COMPLETE shader program (a patch fragment composed in
 * isolation, before the pars-level anchor that declares its uniforms has
 * been applied, is expected to fail this until composed with its sibling
 * patch — see `planetshinePatch.test.ts` for that composition).
 */
export const findUndeclaredUniforms = (shaderText: string): string[] => {
  const code = stripGlslComments(shaderText);

  const referenced = new Set(
    Array.from(code.matchAll(/\bu_[A-Za-z0-9_]*\b/g), (m) => m[0])
  );
  const declared = new Set(
    Array.from(
      code.matchAll(
        /\buniform\s+\S+\s+(u_[A-Za-z0-9_]*)\s*(?:\[[^\]]*\])?\s*;/g
      ),
      (m) => m[1]
    )
  );

  return Array.from(referenced).filter((name) => !declared.has(name));
};

/**
 * Vitest-friendly assertion: throws naming exactly which identifier(s) are
 * referenced but never declared, rather than a bare boolean/array — a
 * failing CI log should not require re-deriving the diff by hand.
 */
export const assertAllUniformsDeclared = (shaderText: string): void => {
  const undeclared = findUndeclaredUniforms(shaderText);
  if (undeclared.length > 0) {
    throw new Error(
      `Referenced but never declared as a GLSL uniform (undeclared identifier ` +
        `at actual shader compile time): ${undeclared.join(", ")}`
    );
  }
};
