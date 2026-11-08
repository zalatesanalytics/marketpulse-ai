// Strict brand gate for scraped posts. A brand name is often an ordinary word or a
// famous person's name — "Jordan", "Dove", "Safari" — so the search carries the
// category, and this gate drops anything that never names the brand at all before the
// ranking happens, and marks the posts that name it without any of its own context.

const GENERIC = new Set([
  "brand",
  "brands",
  "company",
  "companies",
  "product",
  "products",
  "official",
  "store",
  "stores",
  "shop",
  "online",
  "site",
  "website",
  "inc",
  "ltd",
  "llc",
  "the",
  "and",
  "of",
  "for",
  "with",
]);

const LEADING = new Set(["the", "a", "an"]);

export function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const wordsOf = (value) => normalizeText(value).split(" ").filter(Boolean);

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Whole-word match: "Nike" must not fire on "Nikea", nor "Dove" on "Dover".
const hasPhrase = (haystack, phrase) => {
  if (!phrase) return false;
  return new RegExp(`(^| )${escape(phrase)}( |$)`).test(haystack);
};

// The brand as written, plus the forms people actually type: without a leading "the"
// ("The North Face" → "north face") and without a trailing generic word
// ("Jordan Brand" → "jordan"). Each is matched as a whole phrase, never as a fragment.
export function buildBrandKeywords({ brand = "", category = "", search = "" } = {}) {
  const name = normalizeText(brand);
  const nameWords = name.split(" ").filter(Boolean);
  const phrases = new Set();
  if (name) phrases.add(name);

  const trimmed = [...nameWords];
  while (trimmed.length > 1 && LEADING.has(trimmed[0])) trimmed.shift();
  if (trimmed.length) phrases.add(trimmed.join(" "));

  if (trimmed.length > 1 && GENERIC.has(trimmed[trimmed.length - 1])) {
    phrases.add(trimmed.slice(0, -1).join(" "));
  }

  const extra = [...new Set([...wordsOf(search), ...wordsOf(category)])].filter(
    (word) => word.length > 2 && !GENERIC.has(word) && !nameWords.includes(word)
  );
  return {
    name,
    phrases: [...phrases].filter(Boolean),
    qualifiers: extra.slice(0, 8),
    ambiguous: extra.length > 0,
  };
}

const textOf = (post) =>
  normalizeText([post.title, post.excerpt, post.community, post.author].filter(Boolean).join(" "));

export function brandSignal(post, keywords) {
  if (!keywords.name) return { mentions: true, qualified: true };
  const text = textOf(post);
  return {
    mentions: (keywords.phrases || []).some((phrase) => hasPhrase(text, phrase)),
    qualified: keywords.qualifiers.some((word) => hasPhrase(text, word)),
  };
}

// Splits a scraped batch into the posts that really name the brand and the rest.
export function gateByBrand(posts = [], keywords) {
  const kept = [];
  let dropped = 0;
  posts.forEach((post) => {
    if (brandSignal(post, keywords).mentions) kept.push(post);
    else dropped += 1;
  });
  return { kept, dropped };
}