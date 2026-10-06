export const normalize = (s) =>
  s
    .toLocaleLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, " ");
export function findTargets(targets, name, category) {
  const query = normalize(name),
    matches = [];
  const rank = { place: 0, landmark: 1, street: 2, address: 3 };
  for (const target of targets) {
    const lucAlias = query === "luc" && target.name === "Brunel House";
    if (
      category &&
      target.category !== category &&
      !(category === "place" && lucAlias)
    )
      continue;
    const n = normalize(target.name),
      cy = normalize(target.cy);
    const score =
      lucAlias || n === query || cy === query
        ? 0
        : n === "cardiff " + query
          ? 0.5
          : n.startsWith(query) || cy.startsWith(query)
            ? 1
            : n.split(" ").some((word) => word.startsWith(query)) ||
                cy.split(" ").some((word) => word.startsWith(query))
              ? 2
              : n.includes(query) || cy.includes(query)
                ? 3
                : 99;
    if (score < 99) matches.push({ target, score });
  }
  matches.sort(
    (a, b) =>
      a.score - b.score ||
      rank[a.target.category] - rank[b.target.category] ||
      a.target.name.length - b.target.name.length ||
      a.target.name.localeCompare(b.target.name),
  );
  const seen = new Set();
  return matches.filter(({ target }) => {
    const key = target.category + ":" + normalize(target.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
