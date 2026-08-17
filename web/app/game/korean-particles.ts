const PARTICLE_PAIRS = [
  { consonant: "으로", vowel: "로", rieulUsesVowel: true },
  { consonant: "이라", vowel: "라" },
  { consonant: "이랑", vowel: "랑" },
  { consonant: "이나", vowel: "나" },
  { consonant: "이", vowel: "가" },
  { consonant: "은", vowel: "는" },
  { consonant: "을", vowel: "를" },
  { consonant: "과", vowel: "와" },
] as const;

type KoreanParticlePair =
  | "이/가"
  | "은/는"
  | "을/를"
  | "과/와"
  | "으로/로"
  | "이라/라"
  | "이랑/랑"
  | "이나/나";

const PARTICLE_PAIR_BY_FORM: Readonly<Record<string, KoreanParticlePair>> = {
  이: "이/가",
  가: "이/가",
  은: "은/는",
  는: "은/는",
  을: "을/를",
  를: "을/를",
  과: "과/와",
  와: "과/와",
  으로: "으로/로",
  로: "으로/로",
  이라: "이라/라",
  라: "이라/라",
  이랑: "이랑/랑",
  랑: "이랑/랑",
  이나: "이나/나",
  나: "이나/나",
};

const PARTICLE_VALUE_KEYS = new Set([
  "theme",
  "other",
  "part",
  "newCard",
  "oldCard",
  "ignoredTheme",
  "ignoredPart",
  "relatedPart",
]);

function finalConsonantIndex(value: string): number {
  const characters = Array.from(value.trimEnd());
  const codePoint = characters.at(-1)?.codePointAt(0) ?? 0;
  if (codePoint < 0xac00 || codePoint > 0xd7a3) return 0;
  return (codePoint - 0xac00) % 28;
}

export function withKoreanParticle(
  value: string,
  pair: KoreanParticlePair,
): string {
  const rule = PARTICLE_PAIRS.find(
    (candidate) => `${candidate.consonant}/${candidate.vowel}` === pair,
  );
  if (!rule) return value;
  const consonantIndex = finalConsonantIndex(value);
  const useVowel = consonantIndex === 0 ||
    ("rieulUsesVowel" in rule && rule.rieulUsesVowel && consonantIndex === 8);
  return `${value}${useVowel ? rule.vowel : rule.consonant}`;
}

export function interpolateKorean(
  template: string,
  values: Readonly<Record<string, string>>,
): string {
  const withParticles = template.replace(
    /\{([A-Za-z][A-Za-z0-9]*)\}(으로|이라|이랑|이나|이|가|은|는|을|를|과|와|로|라|랑|나)/g,
    (match, key: string, particle: string) => {
      if (!PARTICLE_VALUE_KEYS.has(key)) return match;
      const value = values[key];
      const pair = PARTICLE_PAIR_BY_FORM[particle];
      return value === undefined || pair === undefined
        ? match
        : withKoreanParticle(value, pair);
    },
  );

  let output = withParticles;
  for (const [key, value] of Object.entries(values)) {
    output = output.replaceAll(`{${key}}`, value);
  }
  return output;
}

/**
 * Repairs particles that immediately follow interpolated Korean names.
 * Templates stay readable while names with and without a final consonant can
 * share the same copy pool.
 */
export function correctKoreanParticles(
  text: string,
  values: readonly string[],
): string {
  let output = text;
  const nouns = [...new Set(values.filter(Boolean))].sort(
    (left, right) => right.length - left.length,
  );
  for (const noun of nouns) {
    for (const rule of PARTICLE_PAIRS) {
      const consonantIndex = finalConsonantIndex(noun);
      const useVowel = consonantIndex === 0 ||
        ("rieulUsesVowel" in rule && rule.rieulUsesVowel && consonantIndex === 8);
      const particle = useVowel ? rule.vowel : rule.consonant;
      output = output
        .replaceAll(`${noun}${rule.consonant}`, `${noun}${particle}`)
        .replaceAll(`${noun}${rule.vowel}`, `${noun}${particle}`);
    }
  }
  return output;
}
