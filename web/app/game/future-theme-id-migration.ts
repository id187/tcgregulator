/**
 * Stable identifiers for the 140 authored post-launch themes.
 *
 * `legacyId` is kept only as a save-compatibility key for builds through
 * v0.1.5. Runtime content uses `id`, whose slug describes the theme itself
 * rather than the retired root/order construction matrix.
 */
export const FUTURE_THEME_ID_MIGRATIONS = [
  { number: 1, name: "성흔검무", legacyId: "future-001-moonshade-blade-order", id: "future-001-stigma-sword-dance" },
  { number: 2, name: "폐성천문관", legacyId: "future-002-moonshade-constellation", id: "future-002-ruined-star-observatory" },
  { number: 3, name: "유리도깨비", legacyId: "future-003-moonshade-strange-tales", id: "future-003-glass-goblin" },
  { number: 4, name: "태엽온실", legacyId: "future-004-moonshade-workshop", id: "future-004-clockwork-greenhouse" },
  { number: 5, name: "심해순례단", legacyId: "future-005-moonshade-apostles", id: "future-005-abyss-pilgrims" },
  { number: 6, name: "잿빛오페라", legacyId: "future-006-moonshade-ensemble", id: "future-006-ash-opera" },
  { number: 7, name: "황혼우체국", legacyId: "future-007-moonshade-dynasty", id: "future-007-twilight-post-office" },
  { number: 8, name: "용골서고", legacyId: "future-008-moonshade-academy", id: "future-008-dragonbone-library" },
  { number: 9, name: "구름밀수선", legacyId: "future-009-moonshade-fleet", id: "future-009-cloud-smuggler" },
  { number: 10, name: "망루수인", legacyId: "future-010-moonshade-guard", id: "future-010-watchtower-beastfolk" },
  { number: 11, name: "비단폭뢰", legacyId: "future-011-thunderbloom-blade-order", id: "future-011-silk-thunder" },
  { number: 12, name: "북극성장례단", legacyId: "future-012-thunderbloom-constellation", id: "future-012-polaris-funeral-procession" },
  { number: 13, name: "골목연금술", legacyId: "future-013-thunderbloom-strange-tales", id: "future-013-alley-alchemy" },
  { number: 14, name: "도화선공방", legacyId: "future-014-thunderbloom-workshop", id: "future-014-fuse-workshop" },
  { number: 15, name: "밀랍성자", legacyId: "future-015-thunderbloom-apostles", id: "future-015-wax-saint" },
  { number: 16, name: "전파악귀", legacyId: "future-016-thunderbloom-ensemble", id: "future-016-radio-demon" },
  { number: 17, name: "모래왕조", legacyId: "future-017-thunderbloom-dynasty", id: "future-017-sand-dynasty" },
  { number: 18, name: "균사학회", legacyId: "future-018-thunderbloom-academy", id: "future-018-mycelium-society" },
  { number: 19, name: "유령포경선", legacyId: "future-019-thunderbloom-fleet", id: "future-019-ghost-whaler" },
  { number: 20, name: "백철성채", legacyId: "future-020-thunderbloom-guard", id: "future-020-white-iron-citadel" },
  { number: 21, name: "청동매사냥", legacyId: "future-021-azure-scale-blade-order", id: "future-021-bronze-falconry" },
  { number: 22, name: "조개달력", legacyId: "future-022-azure-scale-constellation", id: "future-022-shell-calendar" },
  { number: 23, name: "검은비단극", legacyId: "future-023-azure-scale-strange-tales", id: "future-023-black-silk-theater" },
  { number: 24, name: "홍차연금회", legacyId: "future-024-azure-scale-workshop", id: "future-024-tea-alchemy" },
  { number: 25, name: "무명용병단", legacyId: "future-025-azure-scale-apostles", id: "future-025-nameless-mercenaries" },
  { number: 26, name: "자석서커스", legacyId: "future-026-azure-scale-ensemble", id: "future-026-magnet-circus" },
  { number: 27, name: "종이궁정", legacyId: "future-027-azure-scale-dynasty", id: "future-027-paper-court" },
  { number: 28, name: "꿈해부실", legacyId: "future-028-azure-scale-academy", id: "future-028-dream-dissection" },
  { number: 29, name: "산호열차", legacyId: "future-029-azure-scale-fleet", id: "future-029-coral-train" },
  { number: 30, name: "서리양봉장", legacyId: "future-030-azure-scale-guard", id: "future-030-frost-apiary" },
  { number: 31, name: "먹구름검객", legacyId: "future-031-ink-spirit-blade-order", id: "future-031-inkcloud-swordsman" },
  { number: 32, name: "백지예언서", legacyId: "future-032-ink-spirit-constellation", id: "future-032-blank-prophecy" },
  { number: 33, name: "달팽이도시", legacyId: "future-033-ink-spirit-strange-tales", id: "future-033-snail-city" },
  { number: 34, name: "유리대장간", legacyId: "future-034-ink-spirit-workshop", id: "future-034-glass-forge" },
  { number: 35, name: "까마귀법정", legacyId: "future-035-ink-spirit-apostles", id: "future-035-raven-court" },
  { number: 36, name: "해시계악단", legacyId: "future-036-ink-spirit-ensemble", id: "future-036-sundial-ensemble" },
  { number: 37, name: "거울장례", legacyId: "future-037-ink-spirit-dynasty", id: "future-037-mirror-funeral" },
  { number: 38, name: "향신료길드", legacyId: "future-038-ink-spirit-academy", id: "future-038-spice-guild" },
  { number: 39, name: "달무리잠수정", legacyId: "future-039-ink-spirit-fleet", id: "future-039-moonhalo-submarine" },
  { number: 40, name: "녹슨수호령", legacyId: "future-040-ink-spirit-guard", id: "future-040-rusted-guardian" },
  { number: 41, name: "화산우편마차", legacyId: "future-041-crimson-lotus-blade-order", id: "future-041-volcano-mailcoach" },
  { number: 42, name: "고래별점술", legacyId: "future-042-crimson-lotus-constellation", id: "future-042-whale-astrology" },
  { number: 43, name: "촛농탐정단", legacyId: "future-043-crimson-lotus-strange-tales", id: "future-043-candlewax-detectives" },
  { number: 44, name: "설탕갑옷", legacyId: "future-044-crimson-lotus-workshop", id: "future-044-sugar-armor" },
  { number: 45, name: "해골정원사", legacyId: "future-045-crimson-lotus-apostles", id: "future-045-skeleton-gardener" },
  { number: 46, name: "유성합창단", legacyId: "future-046-crimson-lotus-ensemble", id: "future-046-meteor-choir" },
  { number: 47, name: "잉크왕좌", legacyId: "future-047-crimson-lotus-dynasty", id: "future-047-ink-throne" },
  { number: 48, name: "바람도서관", legacyId: "future-048-crimson-lotus-academy", id: "future-048-wind-library" },
  { number: 49, name: "적운해적선", legacyId: "future-049-crimson-lotus-fleet", id: "future-049-redcloud-pirates" },
  { number: 50, name: "자정문지기", legacyId: "future-050-crimson-lotus-guard", id: "future-050-midnight-gatekeeper" },
  { number: 51, name: "유리사막기병", legacyId: "future-051-wind-fang-blade-order", id: "future-051-glass-desert-cavalry" },
  { number: 52, name: "파도천문대", legacyId: "future-052-wind-fang-constellation", id: "future-052-wave-observatory" },
  { number: 53, name: "소금인형극", legacyId: "future-053-wind-fang-strange-tales", id: "future-053-salt-puppet-theater" },
  { number: 54, name: "깃털인쇄소", legacyId: "future-054-wind-fang-workshop", id: "future-054-feather-printworks" },
  { number: 55, name: "종소리수도회", legacyId: "future-055-wind-fang-apostles", id: "future-055-bell-monastery" },
  { number: 56, name: "그림자관현악", legacyId: "future-056-wind-fang-ensemble", id: "future-056-shadow-orchestra" },
  { number: 57, name: "산맥상속자", legacyId: "future-057-wind-fang-dynasty", id: "future-057-mountain-heirs" },
  { number: 58, name: "번개언어원", legacyId: "future-058-wind-fang-academy", id: "future-058-lightning-linguistics" },
  { number: 59, name: "물안개수송단", legacyId: "future-059-wind-fang-fleet", id: "future-059-mist-transport" },
  { number: 60, name: "늑대등대", legacyId: "future-060-wind-fang-guard", id: "future-060-wolf-lighthouse" },
  { number: 61, name: "빙하우체기병", legacyId: "future-061-snowblossom-blade-order", id: "future-061-glacier-mail-cavalry" },
  { number: 62, name: "오로라재판소", legacyId: "future-062-snowblossom-constellation", id: "future-062-aurora-court" },
  { number: 63, name: "눈사람밀수단", legacyId: "future-063-snowblossom-strange-tales", id: "future-063-snowman-smugglers" },
  { number: 64, name: "서리도예방", legacyId: "future-064-snowblossom-workshop", id: "future-064-frost-pottery" },
  { number: 65, name: "동면성가대", legacyId: "future-065-snowblossom-apostles", id: "future-065-hibernation-choir" },
  { number: 66, name: "얼음종악단", legacyId: "future-066-snowblossom-ensemble", id: "future-066-icebell-ensemble" },
  { number: 67, name: "겨울과수왕국", legacyId: "future-067-snowblossom-dynasty", id: "future-067-winter-orchard-kingdom" },
  { number: 68, name: "결정암호원", legacyId: "future-068-snowblossom-academy", id: "future-068-crystal-cipher-bureau" },
  { number: 69, name: "북해부유항", legacyId: "future-069-snowblossom-fleet", id: "future-069-north-sea-floating-port" },
  { number: 70, name: "설표국경대", legacyId: "future-070-snowblossom-guard", id: "future-070-snow-leopard-borderguard" },
  { number: 71, name: "태양연극단", legacyId: "future-071-golden-crow-blade-order", id: "future-071-sun-theater" },
  { number: 72, name: "금박점성술", legacyId: "future-072-golden-crow-constellation", id: "future-072-goldleaf-astrology" },
  { number: 73, name: "까치도박장", legacyId: "future-073-golden-crow-strange-tales", id: "future-073-magpie-casino" },
  { number: 74, name: "황금누룩공방", legacyId: "future-074-golden-crow-workshop", id: "future-074-golden-yeast-workshop" },
  { number: 75, name: "해바라기기사단", legacyId: "future-075-golden-crow-apostles", id: "future-075-sunflower-knights" },
  { number: 76, name: "일식북악대", legacyId: "future-076-golden-crow-ensemble", id: "future-076-eclipse-drum-corps" },
  { number: 77, name: "봉황세무국", legacyId: "future-077-golden-crow-dynasty", id: "future-077-phoenix-tax-office" },
  { number: 78, name: "광학연구소", legacyId: "future-078-golden-crow-academy", id: "future-078-optics-laboratory" },
  { number: 79, name: "사막태양선", legacyId: "future-079-golden-crow-fleet", id: "future-079-desert-sunship" },
  { number: 80, name: "해돋이방패단", legacyId: "future-080-golden-crow-guard", id: "future-080-sunrise-shieldguard" },
  { number: 81, name: "낙성구조대", legacyId: "future-081-meteor-blade-order", id: "future-081-falling-star-rescue" },
  { number: 82, name: "혜성기록관", legacyId: "future-082-meteor-constellation", id: "future-082-comet-archive" },
  { number: 83, name: "운석요리사", legacyId: "future-083-meteor-strange-tales", id: "future-083-meteor-chef" },
  { number: 84, name: "중력시계점", legacyId: "future-084-meteor-workshop", id: "future-084-gravity-clockshop" },
  { number: 85, name: "별가루순례자", legacyId: "future-085-meteor-apostles", id: "future-085-stardust-pilgrims" },
  { number: 86, name: "궤도타악단", legacyId: "future-086-meteor-ensemble", id: "future-086-orbital-percussion" },
  { number: 87, name: "성운상속국", legacyId: "future-087-meteor-dynasty", id: "future-087-nebula-heir-state" },
  { number: 88, name: "진공문법원", legacyId: "future-088-meteor-academy", id: "future-088-vacuum-grammar-bureau" },
  { number: 89, name: "소행성예인선", legacyId: "future-089-meteor-fleet", id: "future-089-asteroid-tugboat" },
  { number: 90, name: "대기권감시대", legacyId: "future-090-meteor-guard", id: "future-090-atmosphere-watch" },
  { number: 91, name: "쌍면검사", legacyId: "future-091-mirror-realm-blade-order", id: "future-091-double-faced-swordsman" },
  { number: 92, name: "반사천문원", legacyId: "future-092-mirror-realm-constellation", id: "future-092-reflection-observatory" },
  { number: 93, name: "거울미궁상회", legacyId: "future-093-mirror-realm-strange-tales", id: "future-093-mirror-maze-merchant" },
  { number: 94, name: "은경재단소", legacyId: "future-094-mirror-realm-workshop", id: "future-094-silver-mirror-tailor" },
  { number: 95, name: "역상수도회", legacyId: "future-095-mirror-realm-apostles", id: "future-095-inverse-monastery" },
  { number: 96, name: "메아리무도단", legacyId: "future-096-mirror-realm-ensemble", id: "future-096-echo-dancers" },
  { number: 97, name: "좌우왕국", legacyId: "future-097-mirror-realm-dynasty", id: "future-097-left-right-kingdom" },
  { number: 98, name: "프리즘논리원", legacyId: "future-098-mirror-realm-academy", id: "future-098-prism-logic-institute" },
  { number: 99, name: "수면함대", legacyId: "future-099-mirror-realm-fleet", id: "future-099-watersurface-fleet" },
  { number: 100, name: "파경수비대", legacyId: "future-100-mirror-realm-guard", id: "future-100-shattered-mirror-guard" },
  { number: 101, name: "분침결투사", legacyId: "future-101-clockwork-spring-blade-order", id: "future-101-minute-hand-duelist" },
  { number: 102, name: "시보관측국", legacyId: "future-102-clockwork-spring-constellation", id: "future-102-time-signal-observatory" },
  { number: 103, name: "초침도둑단", legacyId: "future-103-clockwork-spring-strange-tales", id: "future-103-second-hand-thieves" },
  { number: 104, name: "역행수리점", legacyId: "future-104-clockwork-spring-workshop", id: "future-104-reverse-repair-shop" },
  { number: 105, name: "태엽순교회", legacyId: "future-105-clockwork-spring-apostles", id: "future-105-clockwork-martyrs" },
  { number: 106, name: "톱니왈츠단", legacyId: "future-106-clockwork-spring-ensemble", id: "future-106-gear-waltz" },
  { number: 107, name: "시계탑섭정국", legacyId: "future-107-clockwork-spring-dynasty", id: "future-107-clocktower-regency" },
  { number: 108, name: "시간병리원", legacyId: "future-108-clockwork-spring-academy", id: "future-108-time-pathology" },
  { number: 109, name: "윤초비행선", legacyId: "future-109-clockwork-spring-fleet", id: "future-109-leap-second-airship" },
  { number: 110, name: "자명종경비대", legacyId: "future-110-clockwork-spring-guard", id: "future-110-alarm-clock-guard" },
  { number: 111, name: "등불잠수부", legacyId: "future-111-abyssal-lantern-blade-order", id: "future-111-lantern-divers" },
  { number: 112, name: "심해별지도", legacyId: "future-112-abyssal-lantern-constellation", id: "future-112-deep-sea-star-map" },
  { number: 113, name: "해파리극장", legacyId: "future-113-abyssal-lantern-strange-tales", id: "future-113-jellyfish-theater" },
  { number: 114, name: "진주압력공방", legacyId: "future-114-abyssal-lantern-workshop", id: "future-114-pearl-pressure-workshop" },
  { number: 115, name: "발광수도회", legacyId: "future-115-abyssal-lantern-apostles", id: "future-115-bioluminescent-monastery" },
  { number: 116, name: "고래노래극단", legacyId: "future-116-abyssal-lantern-ensemble", id: "future-116-whale-song-troupe" },
  { number: 117, name: "해구왕위계승단", legacyId: "future-117-abyssal-lantern-dynasty", id: "future-117-trench-succession" },
  { number: 118, name: "수압생물원", legacyId: "future-118-abyssal-lantern-academy", id: "future-118-hydrostatic-biome" },
  { number: 119, name: "검푸른인양선", legacyId: "future-119-abyssal-lantern-fleet", id: "future-119-darkblue-salvager" },
  { number: 120, name: "등대산호벽", legacyId: "future-120-abyssal-lantern-guard", id: "future-120-lighthouse-coral-wall" },
  { number: 121, name: "나비검무회", legacyId: "future-121-dream-butterfly-blade-order", id: "future-121-butterfly-sword-dance" },
  { number: 122, name: "수면예보국", legacyId: "future-122-dream-butterfly-constellation", id: "future-122-sleep-forecast-bureau" },
  { number: 123, name: "꿈벼룩시장", legacyId: "future-123-dream-butterfly-strange-tales", id: "future-123-dream-flea-market" },
  { number: 124, name: "기억염색소", legacyId: "future-124-dream-butterfly-workshop", id: "future-124-memory-dyehouse" },
  { number: 125, name: "잠의수도사", legacyId: "future-125-dream-butterfly-apostles", id: "future-125-sleep-monks" },
  { number: 126, name: "환몽실내악단", legacyId: "future-126-dream-butterfly-ensemble", id: "future-126-dream-chamber-ensemble" },
  { number: 127, name: "베개왕조", legacyId: "future-127-dream-butterfly-dynasty", id: "future-127-pillow-dynasty" },
  { number: 128, name: "몽상분류원", legacyId: "future-128-dream-butterfly-academy", id: "future-128-reverie-classification" },
  { number: 129, name: "새벽꿈유람선", legacyId: "future-129-dream-butterfly-fleet", id: "future-129-dawn-dream-cruise" },
  { number: 130, name: "악몽문지기", legacyId: "future-130-dream-butterfly-guard", id: "future-130-nightmare-gatekeeper" },
  { number: 131, name: "거석운반단", legacyId: "future-131-stone-grove-blade-order", id: "future-131-megalith-carriers" },
  { number: 132, name: "이끼천문원", legacyId: "future-132-stone-grove-constellation", id: "future-132-moss-observatory" },
  { number: 133, name: "돌가면설화단", legacyId: "future-133-stone-grove-strange-tales", id: "future-133-stone-mask-storytellers" },
  { number: 134, name: "현무암조각소", legacyId: "future-134-stone-grove-workshop", id: "future-134-basalt-sculptors" },
  { number: 135, name: "룬석순례회", legacyId: "future-135-stone-grove-apostles", id: "future-135-runestone-pilgrims" },
  { number: 136, name: "동굴합창단", legacyId: "future-136-stone-grove-ensemble", id: "future-136-cave-choir" },
  { number: 137, name: "산림왕관국", legacyId: "future-137-stone-grove-dynasty", id: "future-137-forest-crown-kingdom" },
  { number: 138, name: "지층고고원", legacyId: "future-138-stone-grove-academy", id: "future-138-strata-archaeology" },
  { number: 139, name: "바위섬함대", legacyId: "future-139-stone-grove-fleet", id: "future-139-rock-island-fleet" },
  { number: 140, name: "거목성벽대", legacyId: "future-140-stone-grove-guard", id: "future-140-great-tree-rampart" },
] as const;

export const FUTURE_PART_ID_SUFFIXES = [
  "starter1",
  "starter2",
  "bridge",
  "finisher",
  "recursion",
  "support-1-1",
  "support-1-2",
  "support-1-3",
  "support-2-1",
  "support-2-2",
  "support-2-3",
  "support-3-1",
  "support-3-2",
  "support-3-3",
] as const;

export const LEGACY_FUTURE_THEME_ID_MAP: Readonly<Record<string, string>> =
  Object.fromEntries(
    FUTURE_THEME_ID_MIGRATIONS.map(({ legacyId, id }) => [legacyId, id]),
  );

export const CURRENT_FUTURE_THEME_ID_MAP: Readonly<Record<string, string>> =
  Object.fromEntries(
    FUTURE_THEME_ID_MIGRATIONS.map(({ legacyId, id }) => [id, legacyId]),
  );

export const LEGACY_FUTURE_PART_ID_MAP: Readonly<Record<string, string>> =
  Object.fromEntries(
    FUTURE_THEME_ID_MIGRATIONS.flatMap(({ legacyId, id }) =>
      FUTURE_PART_ID_SUFFIXES.map((suffix) => [
        `${legacyId}-${suffix}`,
        `${id}-${suffix}`,
      ]),
    ),
  );

export const CURRENT_FUTURE_PART_ID_MAP: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(LEGACY_FUTURE_PART_ID_MAP).map(([legacyId, id]) => [
      id,
      legacyId,
    ]),
  );

/** Maps an exact v0.1.5 theme or part ID to its authored v0.1.6 ID. */
export function migrateLegacyFutureIdentifier(value: string): string {
  return (
    LEGACY_FUTURE_THEME_ID_MAP[value] ??
    LEGACY_FUTURE_PART_ID_MAP[value] ??
    value
  );
}

/**
 * Returns the pre-rename key used by seeded simulation rolls. Keeping this
 * stable means an in-progress campaign continues with the same random stream.
 */
export function getStableThemeRandomIdentifier(value: string): string {
  return (
    CURRENT_FUTURE_THEME_ID_MAP[value] ??
    CURRENT_FUTURE_PART_ID_MAP[value] ??
    value
  );
}
