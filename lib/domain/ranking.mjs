/** Kit number orders tied rows; it does not break shared academic ranks. */
export function compareRankedResults(left, right, ascending = false) {
  const direction = ascending ? 1 : -1;
  if (left.aggregatePct !== right.aggregatePct) return direction * (left.aggregatePct - right.aggregatePct);
  if (left.totalObtained !== right.totalObtained) return direction * (left.totalObtained - right.totalObtained);
  return left.Kit_No.localeCompare(right.Kit_No);
}
export function sharesRank(left, right) {
  return Boolean(left) && left.aggregatePct === right.aggregatePct && left.totalObtained === right.totalObtained;
}
