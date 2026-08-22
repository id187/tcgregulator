import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const overlaySource = readFileSync(
  fileURLToPath(
    new URL("../app/components/ReportArrivalOverlay.tsx", import.meta.url),
  ),
  "utf8",
);
const decisionEventStyles = readFileSync(
  fileURLToPath(
    new URL("../app/styles/decision-events.css", import.meta.url),
  ),
  "utf8",
);
const pageSource = readFileSync(
  fileURLToPath(new URL("../app/page.tsx", import.meta.url)),
  "utf8",
);
const restrictionConfirmationSource = readFileSync(
  fileURLToPath(
    new URL(
      "../app/components/RestrictionConfirmationSeal.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);
const decisionOutcomeSource = readFileSync(
  fileURLToPath(
    new URL("../app/components/DecisionOutcomeOverlay.tsx", import.meta.url),
  ),
  "utf8",
);
const releasePublicationSource = readFileSync(
  fileURLToPath(
    new URL(
      "../app/components/ReleasePublicationSequence.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);

test("business project reports stamp the persisted outcome as SUCCESS or FAIL", () => {
  assert.match(
    overlaySource,
    /const succeeded = record\.outcome === "success";/,
  );
  assert.match(
    overlaySource,
    /const resultStamp = succeeded \? "SUCCESS" : "FAIL";/,
  );
  assert.match(overlaySource, /aria-label=\{resultStampLabel\}/);
  assert.match(overlaySource, /className="business-result-stamp-stage"/);
  assert.match(
    overlaySource,
    /is-\$\{succeeded \? "success" : "fail"\}/,
  );
});

test("business result stamps slam into place and settle immediately for reduced motion", () => {
  assert.match(decisionEventStyles, /@keyframes business-result-stamp-slam \{/);
  assert.match(
    decisionEventStyles,
    /@keyframes business-result-stamp-slam-fail \{/,
  );
  assert.match(
    decisionEventStyles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.business-result-stamp \{[\s\S]*?animation: none;/,
  );
  assert.match(
    decisionEventStyles,
    /\.business-result-stamp \{\s*opacity: 0\.94;\s*filter: none;\s*transform: rotate\(-5deg\) scale\(1\);/,
  );
});

test("impact audio is a low hit synchronized to every stamp contact", () => {
  assert.match(pageSource, /if \(kind === "impact"\) \{/);
  assert.match(pageSource, /frequency\.setValueAtTime\(145, now\)/);
  assert.match(pageSource, /createBiquadFilter\(\)/);
  assert.match(pageSource, /emitGameSound\("message"\)/);
  assert.match(overlaySource, /emitGameSound\("impact"\)[\s\S]*?580/);
  assert.match(
    restrictionConfirmationSource,
    /emitGameSound\("impact"\)[\s\S]*?710/,
  );
  assert.match(decisionOutcomeSource, /duration \* 0\.64/);
  assert.match(decisionOutcomeSource, /emitGameSound\("impact"\)/);
});

test("release publication swooshes once per card as pack intake begins", () => {
  assert.match(pageSource, /if \(kind === "swoosh"\) \{/);
  assert.match(pageSource, /frequency\.setValueAtTime\(3_200, now\)/);
  assert.match(
    releasePublicationSource,
    /batch\.products\.map[\s\S]*?emitGameSound\("swoosh"\)[\s\S]*?1_050 \+ index \* 180/,
  );
  assert.match(releasePublicationSource, /cardTimers\.forEach/);
});
