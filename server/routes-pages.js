import express from "express";
import { randomUUID } from "crypto";
import { getDB } from "./utils.js";
import { TAG_ENTITY_TYPES, coerceTagIds, fetchTagLinks, sortTags, syncTagLinks } from "./tagUtils.js";

const router = express.Router();

const DEFAULT_TAG_COLOR = "#6366F1";
const TAG_NAME_LIMIT = 60;

const sanitizeTitle = (title) => {
  if (typeof title !== "string") return "Untitled page";
  const trimmed = title.trim();
  return trimmed.length ? trimmed : "Untitled page";
};

const sanitizeDate = (value) => {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  } catch {
    return null;
  }
};

const sanitizeOptionalText = (value, limit = 2048) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, limit);
};

const serializeBlocks = (blocks) => {
  if (!Array.isArray(blocks)) return "[]";
  return JSON.stringify(
    blocks.map((block) => ({
      id: block.id || randomUUID(),
      type: typeof block.type === "string" ? block.type : "text",
      text: block.text ?? "",
      checked: block.checked ?? false,
      url: block.url ?? null,
      relation: block.relation ?? null
    }))
  );
};

const normalizeColor = (value) => {
  if (typeof value !== "string") return DEFAULT_TAG_COLOR;
  let color = value.trim();
  if (!color) return DEFAULT_TAG_COLOR;
  if (!color.startsWith("#")) color = "#" + color;
  const hex = color.slice(1);
  if (![3, 6].includes(hex.length) || !/^[0-9a-fA-F]+$/.test(hex)) {
    return DEFAULT_TAG_COLOR;
  }
  if (hex.length === 3) {
    const expanded = hex
      .split("")
      .map((char) => char + char)
      .join("");
    return ("#" + expanded).toUpperCase();
  }
  return ("#" + hex).toUpperCase();
};

const formatTag = (row) => ({
  id: row.id,
  label: row.label,
  color: row.color
});

const mapPageRow = (row) => ({
  id: row.id,
  title: row.title,
  blocks_json: row.blocks_json,
  updated_at: row.updated_at,
  created_at: row.created_at,
  page_date: row.page_date,
  banner_url: row.banner_url ?? null,
  banner_gradient: row.banner_gradient ?? null,
  pinned: !!row.pinned
});

const fetchPageTags = (db, userId, pageIds = null) =>
  fetchTagLinks(db, userId, TAG_ENTITY_TYPES.PAGE, pageIds);

const fetchTagsWithCounts = async (db, userId) => {
  const rows = await db.all(
    `SELECT
       t.id,
       t.label,
       t.color,
       SUM(CASE WHEN tl.entity_type = 'page' THEN 1 ELSE 0 END) AS page_count,
       SUM(CASE WHEN tl.entity_type = 'language' THEN 1 ELSE 0 END) AS language_count,
       SUM(CASE WHEN tl.entity_type = 'course' THEN 1 ELSE 0 END) AS course_count,
       SUM(CASE WHEN tl.entity_type = 'travel' THEN 1 ELSE 0 END) AS travel_count,
       SUM(CASE WHEN tl.entity_type = 'calendar_event' THEN 1 ELSE 0 END) AS calendar_count
     FROM tags t
     LEFT JOIN tag_links tl ON tl.tag_id = t.id AND tl.user_id = t.user_id
     WHERE t.user_id = ?
     GROUP BY t.id
     ORDER BY t.label COLLATE NOCASE`,
    [userId]
  );
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    color: row.color,
    page_count: Number(row.page_count) || 0,
    language_count: Number(row.language_count) || 0,
    course_count: Number(row.course_count) || 0,
    travel_count: Number(row.travel_count) || 0,
    calendar_count: Number(row.calendar_count) || 0
  }));
};

const syncPageTags = async (db, userId, pageId, tagIdsInput) => {
  const tagIds = coerceTagIds(tagIdsInput);
  if (tagIds === null) return null;

  if (tagIds.length === 0) {
    await db.run("DELETE FROM page_tags WHERE user_id=? AND page_id=?", [userId, pageId]);
    await syncTagLinks(db, userId, TAG_ENTITY_TYPES.PAGE, pageId, []);
    return [];
  }

  const placeholders = tagIds.map(() => "?").join(",");
  const tagRows = await db.all(
    "SELECT id, label, color FROM tags WHERE user_id=? AND id IN (" + placeholders + ")",
    [userId, ...tagIds]
  );
  const allowedIds = tagRows.map((row) => row.id);

  if (allowedIds.length === 0) {
    return null;
  }

  const notInPlaceholders = allowedIds.map(() => "?").join(",");
  await db.run(
    "DELETE FROM page_tags WHERE user_id=? AND page_id=? AND tag_id NOT IN (" + notInPlaceholders + ")",
    [userId, pageId, ...allowedIds]
  );

  for (const tagId of allowedIds) {
    await db.run(
      "INSERT INTO page_tags(user_id, page_id, tag_id) VALUES(?,?,?) ON CONFLICT(user_id, page_id, tag_id) DO NOTHING",
      [userId, pageId, tagId]
    );
  }

  const synced = await syncTagLinks(db, userId, TAG_ENTITY_TYPES.PAGE, pageId, allowedIds);
  return synced ?? sortTags(tagRows.map(formatTag));
};

router.get("/tags", async (req, res) => {
  const db = await getDB();
  const tags = await fetchTagsWithCounts(db, req.user.uid);
  res.json({ items: tags });
});

router.post("/tags", async (req, res) => {
  const db = await getDB();
  const rawLabel = typeof req.body?.label === "string" ? req.body.label.trim() : "";
  if (!rawLabel) {
    return res.status(400).json({ error: "label_required" });
  }
  const label = rawLabel.slice(0, TAG_NAME_LIMIT).trim();
  const color = normalizeColor(req.body?.color);
  const now = new Date().toISOString();
  const result = await db.run(
    "INSERT INTO tags(user_id,label,color,created_at,updated_at) VALUES(?,?,?,?,?)",
    [req.user.uid, label, color, now, now]
  );
  res.json({ tag: { id: result.lastID, label, color, page_count: 0 } });
});

router.put("/tags/:id", async (req, res) => {
  const db = await getDB();
  const tagId = Number(req.params.id);
  if (!Number.isInteger(tagId) || tagId <= 0) {
    return res.status(400).json({ error: "bad_id" });
  }

  const updates = [];
  const values = [];
  if (typeof req.body?.label === "string") {
    const label = req.body.label.trim().slice(0, TAG_NAME_LIMIT).trim();
    if (!label) return res.status(400).json({ error: "label_required" });
    updates.push("label=?");
    values.push(label);
  }
  if (req.body?.color !== undefined) {
    updates.push("color=?");
    values.push(normalizeColor(req.body.color));
  }
  if (!updates.length) {
    return res.json({ success: true });
  }
  updates.push("updated_at=?");
  values.push(new Date().toISOString(), tagId, req.user.uid);

  await db.run("UPDATE tags SET " + updates.join(", ") + " WHERE id=? AND user_id=?", values);
  const tag = await db.get(
    "SELECT t.id, t.label, t.color, COUNT(pt.page_id) AS page_count FROM tags t LEFT JOIN page_tags pt ON pt.tag_id = t.id AND pt.user_id = t.user_id WHERE t.user_id=? AND t.id=? GROUP BY t.id",
    [req.user.uid, tagId]
  );
  if (!tag) return res.status(404).json({ error: "not_found" });
  res.json({ tag: { id: tag.id, label: tag.label, color: tag.color, page_count: Number(tag.page_count) || 0 } });
});

router.delete("/tags/:id", async (req, res) => {
  const db = await getDB();
  await db.run("DELETE FROM page_tags WHERE tag_id=? AND user_id=?", [req.params.id, req.user.uid]);
  await db.run(
    "DELETE FROM tag_links WHERE tag_id=? AND user_id=?",
    [req.params.id, req.user.uid]
  );
  await db.run("DELETE FROM tags WHERE id=? AND user_id=?", [req.params.id, req.user.uid]);
  res.json({ success: true });
});

router.get("/", async (req, res) => {
  const db = await getDB();
  const rows = await db.all(
    "SELECT id, title, blocks_json, updated_at, created_at, page_date, banner_url, banner_gradient, pinned FROM journal_pages WHERE user_id=? ORDER BY pinned DESC, updated_at DESC",
    [req.user.uid]
  );
  const ids = rows.map((row) => row.id);
  const tagMap = await fetchPageTags(db, req.user.uid, ids);
  const items = rows.map((row) => ({
    ...mapPageRow(row),
    tags: tagMap.get(row.id) || []
  }));
  res.json({ items });
});

router.post("/", async (req, res) => {
  const db = await getDB();
  const title = sanitizeTitle(req.body?.title);
  const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
  const pageDate = sanitizeDate(req.body?.page_date);
  const pinned = req.body?.pinned ? 1 : 0;
  const bannerUrl = sanitizeOptionalText(req.body?.banner_url ?? req.body?.bannerUrl);
  const bannerGradient = sanitizeOptionalText(
    req.body?.banner_gradient ?? req.body?.bannerGradient,
    4096
  );
  const now = new Date().toISOString();
  const serialized = serializeBlocks(blocks);

  const result = await db.run(
    "INSERT INTO journal_pages(user_id, title, blocks_json, page_date, banner_url, banner_gradient, pinned, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [req.user.uid, title, serialized, pageDate, bannerUrl, bannerGradient, pinned, now, now]
  );

  await db.run(
    "INSERT INTO life_feed(user_id,type,title,text,meta,ts) VALUES(?,?,?,?,?,?)",
    [req.user.uid, "journal_page", title, "Created page: " + title, JSON.stringify({ page_id: result.lastID }), now]
  );

  let tags = [];
  if (Array.isArray(req.body?.tags)) {
    const synced = await syncPageTags(db, req.user.uid, result.lastID, req.body.tags);
    if (synced === null) {
      return res.status(400).json({ error: "invalid_tags" });
    }
    tags = synced;
  }

  res.json({ id: result.lastID, page_date: pageDate, pinned: !!pinned, tags });
});

router.put("/:id", async (req, res) => {
  const db = await getDB();
  const page = await db.get("SELECT id FROM journal_pages WHERE id=? AND user_id=?", [req.params.id, req.user.uid]);
  if (!page) return res.status(404).json({ error: "not_found" });

  const now = new Date().toISOString();
  const updates = [];
  const values = [];
  let normalizedTitle = null;

  if (typeof req.body?.title === "string") {
    normalizedTitle = sanitizeTitle(req.body.title);
    updates.push("title=?");
    values.push(normalizedTitle);
  }

  if (req.body?.blocks !== undefined) {
    updates.push("blocks_json=?");
    values.push(serializeBlocks(Array.isArray(req.body.blocks) ? req.body.blocks : []));
  }

  if (req.body?.page_date !== undefined) {
    updates.push("page_date=?");
    values.push(sanitizeDate(req.body.page_date));
  }

  if (req.body?.pinned !== undefined) {
    updates.push("pinned=?");
    values.push(req.body.pinned ? 1 : 0);
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "banner_url") || Object.prototype.hasOwnProperty.call(req.body || {}, "bannerUrl")) {
    updates.push("banner_url=?");
    values.push(sanitizeOptionalText(req.body?.banner_url ?? req.body?.bannerUrl));
  }

  if (
    Object.prototype.hasOwnProperty.call(req.body || {}, "banner_gradient") ||
    Object.prototype.hasOwnProperty.call(req.body || {}, "bannerGradient")
  ) {
    updates.push("banner_gradient=?");
    values.push(sanitizeOptionalText(req.body?.banner_gradient ?? req.body?.bannerGradient, 4096));
  }

  updates.push("updated_at=?");
  values.push(now, req.params.id, req.user.uid);

  await db.run("UPDATE journal_pages SET " + updates.join(", ") + " WHERE id=? AND user_id=?", values);

  if (normalizedTitle) {
    await db.run(
      "INSERT INTO life_feed(user_id,type,title,text,meta,ts) VALUES(?,?,?,?,?,?)",
      [req.user.uid, "journal_page", normalizedTitle, "Updated page: " + normalizedTitle, JSON.stringify({ page_id: req.params.id }), now]
    );
  }

  let tags = null;
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "tags")) {
    const synced = await syncPageTags(db, req.user.uid, page.id, req.body.tags);
    if (synced === null) return res.status(400).json({ error: "invalid_tags" });
    tags = synced;
  }

  res.json(tags ? { success: true, tags } : { success: true });
});

router.put("/:id/tags", async (req, res) => {
  const db = await getDB();
  const page = await db.get("SELECT id FROM journal_pages WHERE id=? AND user_id=?", [req.params.id, req.user.uid]);
  if (!page) return res.status(404).json({ error: "not_found" });
  const tags = await syncPageTags(db, req.user.uid, page.id, req.body?.tags);
  if (tags === null) return res.status(400).json({ error: "invalid_tags" });
  res.json({ tags });
});

router.get("/:id", async (req, res) => {
  const db = await getDB();
  const row = await db.get(
    "SELECT id, title, blocks_json, created_at, updated_at, page_date, banner_url, banner_gradient, pinned FROM journal_pages WHERE id=? AND user_id=?",
    [req.params.id, req.user.uid]
  );
  if (!row) return res.status(404).json({ error: "not_found" });
  let blocks = [];
  try {
    blocks = row.blocks_json ? JSON.parse(row.blocks_json) : [];
  } catch {
    blocks = [];
  }
  const tagMap = await fetchPageTags(db, req.user.uid, [row.id]);
  res.json({
    page: {
      id: row.id,
      title: row.title,
      created_at: row.created_at,
      updated_at: row.updated_at,
      page_date: row.page_date,
      banner_url: row.banner_url || null,
      banner_gradient: row.banner_gradient || null,
      pinned: !!row.pinned,
      blocks,
      tags: tagMap.get(row.id) || []
    }
  });
});

router.delete("/:id", async (req, res) => {
  const db = await getDB();
  await db.run("DELETE FROM page_tags WHERE page_id=? AND user_id=?", [req.params.id, req.user.uid]);
  await db.run(
    "DELETE FROM tag_links WHERE entity_type=? AND entity_id=? AND user_id=?",
    [TAG_ENTITY_TYPES.PAGE, req.params.id, req.user.uid]
  );
  await db.run("DELETE FROM journal_pages WHERE id=? AND user_id=?", [req.params.id, req.user.uid]);
  res.json({ success: true });
});

export default router;
