import {
  CAMPAIGN_POLICY_IDS,
  runCampaignPolicyMatrix,
} from "../tests/helpers/campaign-policy-bots.ts";

const countArgument = process.argv.find((argument) => argument.startsWith("--seeds="));
const seedCount = Math.max(1, Number.parseInt(countArgument?.split("=")[1] ?? "100", 10));
const seeds = Array.from({ length: seedCount }, (_, index) => index + 1);
const results = runCampaignPolicyMatrix(seeds);

const report = CAMPAIGN_POLICY_IDS.map((policy) => {
  const rows = results.filter((result) => result.policy === policy);
  const average = (read: (row: (typeof rows)[number]) => number) =>
    rows.reduce((sum, row) => sum + read(row), 0) / rows.length;
  const endings = Object.entries(
    rows.reduce<Record<string, number>>((counts, row) => {
      counts[row.endingTitle] = (counts[row.endingTitle] ?? 0) + 1;
      return counts;
    }, {}),
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([title, count]) => `${title} ${count}`)
    .join(" · ");
  return {
    policy,
    campaigns: rows.length,
    bestEndingRate: Number(
      (rows.filter((row) => row.qualifiedForBestEnding).length / rows.length)
        .toFixed(3),
    ),
    averageCash: Number(average((row) => row.cash).toFixed(2)),
    averageEnvironment: Number(average((row) => row.environmentHealth).toFixed(2)),
    averageTrust: Number(average((row) => row.purchaseTrust).toFixed(2)),
    averageUserRatio: Number(average((row) => row.userRatio).toFixed(3)),
    endings,
  };
});

console.table(report);
console.log(JSON.stringify({ seedCount, report }, null, 2));
