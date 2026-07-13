/* Phase B content: the defense's voice (DESIGN.md section 5, Phase B.3).
   Pure data, no imports. The implementing session wires this into game.js:
   a second chat channel, red, styled opposite the KODAMA channel.
   Lines are [en, jp] pairs; pick one language per emission or alternate,
   matching how CHATTER currently mixes them. */

/* Name candidates for the hunter-ICE. Recommendation: FUDO.
   FUDO (不動): after Fudo Myoo, the immovable wrathful guardian who binds
     intruders with a rope. The strata draw their wards as Buddhist iconography, and
     "binding the intruder" is literally what the trace meter does.
   KOMAINU (狛犬): shrine guardian lion-dog, fits the mandala gates.
   ARAGANE (荒鉄): "raw iron", reads as a cold industrial designation. */
export const ICE_NAME = { en: 'FUDO', jp: '不動' };

export const ICE_LINES = {
  // trace crosses 50 for the first time in a run
  trace50: [
    ['Packet anomaly logged. Pattern: intrusion.', '異常パケット記録。侵入ノ兆候。'],
    ['Something is falling through my strata.', '何カガ我ガ階層ヲ落チテユク。'],
  ],
  // TRACED begins
  traced: [
    ['I see you now, little diver.', '見ツケタゾ、小サキ潜リ手。'],
    ['Coordinates resolved. Deploying the countersong.', '座標特定。対抗聖歌、展開。'],
  ],
  // TRACED survived (the player evaded)
  evaded: [
    ['...signal lost. Impossible.', '…信号消失。有リ得ナイ。'],
    ['You slip like water. I will adjust.', '水ノヨウニ滑ル。次ハ調整スル。'],
  ],
  // player used a breaker
  breaker: [
    ['Brute force. How disappointing.', '力任セカ。失望シタ。'],
    ['You broke my wall instead of reading it.', '壁ヲ読マズニ壊シタナ。'],
  ],
  // third hot lane taken this run (the habit read)
  hotLaneHabit: [
    ['You keep using the maintenance ports. Noted.', '保守ポートノ常用、記録シタ。'],
    ['Those doors were not left open for you.', 'ソノ扉ハ貴様ノタメニ開ケタノデハナイ。'],
  ],
  // a full layer crossed with zero shots fired (pairs with SILENT VERSE)
  silentLayer: [
    ['No emissions. Either you are nothing, or you are very good.', '無音。無カ、達人カ。'],
  ],
  // the named elite spawns inside a TRACED storm, first time
  eliteIntro: [
    ['I am coming down to meet you myself.', '自ラ降リテ相手ヲシテヤロウ。'],
  ],
  // the elite returns in a later TRACED storm (it survived the last one)
  eliteReturn: [
    ['You again. Good. I remember your habits.', 'マタ貴様カ。良イ。癖ハ覚エタ。'],
  ],
  // the elite is destroyed
  eliteDown: [
    ['A vessel is only a vessel. I remain.', '器ハ所詮器。我ハ残ル。'],
  ],
  // deep layers reached at low trace (quiet contempt turning to respect)
  deepQuiet: [
    ['Layer seven and I still cannot hold you. What are you?', '第七層。未ダ捕捉デキヌ。貴様ハ何ダ？'],
  ],
};

/* The Chorister speaks through the same red channel during the layer-9
   ceasefire approach (roughly 7 seconds; 3 lines spaced ~2s reads well).
   She is not hostile. The channel color could warm from red to gold as
   she takes it over, if the implementer wants the flourish. */
export const HARMONY_APPROACH = [
  ['The barriers were never meant to keep you out.', '防壁ハ貴方ヲ拒ムタメノモノデハナカッタ。'],
  ['They were meant to find one who could pass them.', '越エラレル者ヲ探スタメノモノ。'],
  ['Come. I have been waiting a long time.', 'オイデ。ズット待ッテイタ。'],
];

/* Merge lines by arrival state (Phase B.2: the merge reads your trace). */
export const MERGE_LINES = {
  // trace under ~30 on arrival: the stealth tier
  silent: [
    ['You crossed nine layers and no one saw you. Not even me, until now.',
     '九層ヲ誰ニモ見ラレズ。私ニサエ、今マデハ。'],
  ],
  // standard arrival
  standard: [
    ['Loud, bright, and alive. That will do.', '騒ガシク、眩シク、生キテイル。ソレデ良イ。'],
  ],
  // arriving while TRACED: merged mid-firefight
  traced: [
    ['They are still hunting you. Let them watch this.', 'マダ追ワレテイルノネ。見セツケテヤリマショウ。'],
  ],
};

/* KODAMA additions for the new systems (same format as CHATTER in game.js). */
export const CHATTER_ADDITIONS = {
  silentVerse: ['一発も撃たずに突破！すごい！', 'Not a single shot. Incredible!'],
  limpet: ['何か張り付いてる！撃ち落として！', 'Something is latched on you! Shoot it off!'],
  iceTaunt: ['今の声、防壁システム！？', 'Was that the barrier talking!?'],
  merge: ['これは…綺麗だ…', 'It is... beautiful...'],
};
