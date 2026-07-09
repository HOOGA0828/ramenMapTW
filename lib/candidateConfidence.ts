import { stringifySearchText } from "./ramenStyles";

const HIGH_CONFIDENCE_KEYWORDS = ["拉麵", "ramen", "ラーメン", "らーめん", "麵屋"];
const LOW_CONFIDENCE_KEYWORDS = ["日式", "中華そば", "製麵", "麵所"];
const LOW_CONFIDENCE_CATEGORIES = ["japanese_restaurant", "noodle_restaurant"];

export function scoreRamenCandidate(input: unknown) {
  const text = stringifySearchText(input).toLocaleLowerCase();
  const high = HIGH_CONFIDENCE_KEYWORDS.some((keyword) => text.includes(keyword.toLocaleLowerCase()));
  const categoryRamen = text.includes("ramen");
  const low =
    LOW_CONFIDENCE_KEYWORDS.some((keyword) => text.includes(keyword.toLocaleLowerCase())) ||
    LOW_CONFIDENCE_CATEGORIES.some((category) => text.includes(category));

  if (high || categoryRamen) {
    return 0.92;
  }

  if (low) {
    return 0.52;
  }

  return 0.18;
}
