// Public surface of the CSS analysis used by `tempest doctor` and `tempest fix`.
export { analyzeCss, applyCssFixes } from "./analyze.mjs";
export { collectStylesheets, customPropertiesInSources, looksMinified } from "./collect.mjs";
export { countBySeverity, finding, SEVERITY, sortFindings } from "./findings.mjs";
export { fixCss } from "./fix.mjs";
export {
    applyExtraction,
    classNamesIn,
    findGlobalSheet,
    kebab,
    loneClass,
    planExtraction,
    renderRule,
} from "./extract.mjs";
export { collectSources, findClassUses, indexClassUses, resolveSpecifier } from "./references.mjs";
export { maskValue, normalizeSelectors, parseCss, stripComments } from "./parse.mjs";
export { distance, KNOWN_AT_RULES, KNOWN_PROPERTIES, nearest } from "./properties.mjs";
export { matchUtility, repetitionFindings } from "./repetition.mjs";
export {
    analyzeParsed,
    declSignature,
    definedCustomProperties,
    missingSemicolons,
    ruleKey,
} from "./semantic.mjs";
export { loadTokens, tokenForValue } from "./tokens.mjs";
