// world2-say-hears-live.test.mjs — /world2/say hears the live say acts (POS-694).
//
// `/world2/say` read only the crossing-save's crystallized emission acts, the
// last of them written on 2026-08-27, so a say spoken since was silent there:
// 7,795 live `say` acts on prod (2026-10-19), none heard. The door now reads
// both eras, as /world2/conversations does, placing a live say by its witnessed
// line and hearing it at the say class's earshot for the say class's fade.
//
//   FALSIFIER  a live say at T is heard through /world2/say at T+1 min, at its
//              own place, and not by a point beyond the earshot
//   ERAS       a crystallized emission is still heard by its own stamped TTL
//              and radius, beside the live say
//   UNPLACED   a live say whose anchor the store does not hold is left out and
//              counted, never placed at {0,0}
//
// The pool is dispatched on the SQL text, as world2-conversations-door.test.mjs's is.
//
// Run: node --test test/world2-say-hears-live.test.mjs

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const env = { pg: process.env.WORLD2_PG, url: process.env.WORLD2_PG_URL };
before(() => {
  process.env.WORLD2_PG = "1";
  process.env.WORLD2_PG_URL = "postgres://say-hears-live-test/none";
});
after(() => {
  if (env.pg == null) delete process.env.WORLD2_PG; else process.env.WORLD2_PG = env.pg;
  if (env.url == null) delete process.env.WORLD2_PG_URL; else process.env.WORLD2_PG_URL = env.url;
});

const { world2Serve } = await import("../src/world2-serve.mjs");

const MARKS = [{ slug: "the-town/the-quay", status: "standing", geometry: { at: { x: 1390, y: 5665 }, extent: { w: 20, h: 20 } }, data: {} }];
const T = Date.parse("2026-10-19T12:00:00Z");
const iso = (ms) => new Date(ms).toISOString();

const liveSay = (id, actor, anchor, atMs, text, dx = 0, dy = 0) => ({
  id, at: new Date(atMs), actor, action: "say", at_anchor: anchor, at_dx: dx, at_dy: dy, payload: { text, place: null },
});
// The crossing-save's crystallized row, as live-reads.mjs § emissionOf reads it.
const emission = (id, actor, atMs, { x, y, ttlMin = 5, radiusM = 60, text }) => ({
  id, at: new Date(atMs), actor, action: "legacy:emission",
  payload: { at: iso(atMs), payload: { class: "sound", x, y, text, spoken_by: actor, radius_m: radiusM, ttl_min: ttlMin,
    ttl_expires_at: iso(atMs + ttlMin * 60_000) } },
});

const poolOf = (acts) => ({
  query: async (sql, params) => {
    if (/FROM acts/i.test(sql)) {
      const actions = params?.[0] ?? null;
      return { rows: actions ? acts.filter((a) => actions.includes(a.action)) : acts };
    }
    if (/FROM marks/i.test(sql)) return { rows: MARKS };
    return { rows: [] };
  },
});

const sayAt = (acts, atMs, near = null) => {
  const q = new URLSearchParams({ at: iso(atMs), ...(near ? { x: String(near.x), y: String(near.y) } : {}) });
  return world2Serve("/world2/say", q, { p: poolOf(acts) });
};

test("FALSIFIER: a live say at T is heard through /world2/say at T+1 min, where it was spoken", async () => {
  const acts = [liveSay(20001, "wright", "the-town/the-quay", T, "hello from the quay", 4, -3)];
  const r = await sayAt(acts, T + 60_000, { x: 1394, y: 5662 });
  assert.equal(r.code, 200, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.total_in_the_air, 1, "the live say is in the air a minute later");
  assert.equal(r.body.live_says, 1);
  assert.deepEqual(r.body.heard.map((h) => [h.props.text, h.x, h.y]), [["hello from the quay", 1394, 5662]]);
  assert.equal(r.body.heard[0].act_id, "20001");
  const far = await sayAt(acts, T + 60_000, { x: 1394 + 500, y: 5662 });
  assert.deepEqual(far.body.heard, [], "500 m off is beyond the say class's earshot");
  assert.ok(far.body.disclosed.some((d) => /^live sound:/.test(d)), "the disclosure no longer says there is no live sound");
});

test("ERAS: the crystallized emission is heard by its own stamps, beside the live say", async () => {
  const acts = [
    emission(10, "kinofire", T - 2 * 60_000, { x: 1390, y: 5660, ttlMin: 5, radiusM: 60, text: "from the crossing-save" }),
    liveSay(20001, "wright", "the-town/the-quay", T, "hello from the quay"),
  ];
  const r = await sayAt(acts, T + 60_000, { x: 1390, y: 5665 });
  assert.deepEqual(r.body.heard.map((h) => h.props.text).sort(), ["from the crossing-save", "hello from the quay"]);
  const later = await sayAt(acts, T + 4 * 60_000, { x: 1390, y: 5665 });
  assert.deepEqual(later.body.heard.map((h) => h.props.text), ["hello from the quay"], "the emission's own five minutes have run out");
});

test("UNPLACED: a live say whose anchor the store does not hold is left out, counted, never placed at {0,0}", async () => {
  const acts = [liveSay(20002, "little-m-of-garrison", "vermillion/the-track-garage", T, "in a garage the store never held")];
  const r = await sayAt(acts, T + 60_000, { x: 0, y: 0 });
  assert.equal(r.code, 200);
  assert.equal(r.body.total_in_the_air, 0);
  assert.deepEqual(r.body.heard, []);
  assert.equal(r.body.unplaced_says.count, 1);
  assert.equal(r.body.unplaced_says.example.act_id, "20002");
});
