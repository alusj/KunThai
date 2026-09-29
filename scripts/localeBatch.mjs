
// Numeric KTSAFE markers are preserved by the translator across scripts;
// alphabetic KTSEP markers can be transliterated (notably in Russian).
export function joinTranslationBatch(maskedSources) {
  return maskedSources.map((source, index) => (
    index ? `\n__KTSAFE${999900 + index}__\n${source}` : source
  )).join("");
}

export function splitTranslationBatch(result) {
  return result.split(/\s*__\s*KTSAFE9999\d+\s*__\s*/g);
}
