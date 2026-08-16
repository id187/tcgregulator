import assert from "node:assert/strict";
import test from "node:test";

import {
  interpolateKorean,
  withKoreanParticle,
} from "../app/game/korean-particles.ts";

test("selects Korean particles from the final consonant", () => {
  assert.equal(withKoreanParticle("경면검단", "이/가"), "경면검단이");
  assert.equal(withKoreanParticle("경면검단", "은/는"), "경면검단은");
  assert.equal(withKoreanParticle("경면검단", "을/를"), "경면검단을");
  assert.equal(withKoreanParticle("경면검단", "과/와"), "경면검단과");
  assert.equal(withKoreanParticle("경면검단", "으로/로"), "경면검단으로");

  assert.equal(withKoreanParticle("몽접학파", "이/가"), "몽접학파가");
  assert.equal(withKoreanParticle("몽접학파", "은/는"), "몽접학파는");
  assert.equal(withKoreanParticle("몽접학파", "을/를"), "몽접학파를");
  assert.equal(withKoreanParticle("몽접학파", "과/와"), "몽접학파와");
  assert.equal(withKoreanParticle("몽접학파", "으로/로"), "몽접학파로");
  assert.equal(withKoreanParticle("사이클", "으로/로"), "사이클로");
});

test("interpolates names before correcting adjacent particles", () => {
  assert.equal(
    interpolateKorean("{theme}이 1위고 {other}가 추격 중", {
      theme: "설화함대",
      other: "경면검단",
    }),
    "설화함대가 1위고 경면검단이 추격 중",
  );
  assert.equal(
    interpolateKorean("{newCard}를 넣고 {oldCard}와 비교함", {
      newCard: "몽접학파의 새벽 나비",
      oldCard: "경면검단의 은빛 칼날",
    }),
    "몽접학파의 새벽 나비를 넣고 경면검단의 은빛 칼날과 비교함",
  );
  assert.equal(
    interpolateKorean("{theme}라 부르고 {part}로 마무리", {
      theme: "홍련왕조",
      part: "사이클",
    }),
    "홍련왕조라 부르고 사이클로 마무리",
  );
  assert.equal(
    interpolateKorean("제한 뒤 {days}일", { days: "15" }),
    "제한 뒤 15일",
  );
});
