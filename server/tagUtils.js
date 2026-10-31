export const TAG_ENTITY_TYPES = {
  PAGE: 'page',
  LANGUAGE: 'language',
  COURSE: 'course',
  TRAVEL: 'travel',
  CALENDAR_EVENT: 'calendar_event',
  HABIT: 'habit',
  LOAN: 'loan',
  GOAL: 'goal',
  SHELF: 'shelf',
  WISH: 'wish',
};

export const sortTags = (tags) =>
  [...tags].sort((a, b) => a.label.localeCompare(b.label, 'ru', { sensitivity: 'base' }));

export const coerceTagIds = (input) => {
  if (!Array.isArray(input)) return null;
  const seen = new Set();
  for (const raw of input) {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) {
      seen.add(parsed);
    }
  }
  return Array.from(seen);
};

export async function fetchTagLinks(db, userId, entityType, entityIds = null) {
  if (!entityType) return new Map();
  if (Array.isArray(entityIds) && entityIds.length === 0) return new Map();
  const params = [userId, entityType];
  let sql =
    'SELECT tl.entity_id, t.id, t.label, t.color FROM tag_links tl JOIN tags t ON t.id = tl.tag_id WHERE tl.user_id=? AND tl.entity_type=?';
  if (Array.isArray(entityIds) && entityIds.length > 0) {
    const placeholders = entityIds.map(() => '?').join(',');
    sql += ' AND tl.entity_id IN (' + placeholders + ')';
    params.push(...entityIds);
  }
  sql += ' ORDER BY t.label COLLATE NOCASE';
  const rows = await db.all(sql, params);
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.entity_id)) map.set(row.entity_id, []);
    map.get(row.entity_id).push({ id: row.id, label: row.label, color: row.color });
  }
  for (const [key, list] of map) {
    map.set(key, sortTags(list));
  }
  return map;
}

export async function syncTagLinks(db, userId, entityType, entityId, inputTagIds) {
  const tagIds = Array.isArray(inputTagIds) ? inputTagIds : coerceTagIds(inputTagIds);
  if (tagIds === null) return null;

  if (tagIds.length === 0) {
    await db.run('DELETE FROM tag_links WHERE user_id=? AND entity_type=? AND entity_id=?', [userId, entityType, entityId]);
    return [];
  }

  const placeholders = tagIds.map(() => '?').join(',');
  const tagRows = await db.all(
    'SELECT id, label, color FROM tags WHERE user_id=? AND id IN (' + placeholders + ')',
    [userId, ...tagIds]
  );
  const allowedIds = tagRows.map((row) => row.id);
  if (!allowedIds.length) {
    return null;
  }

  const notInPlaceholders = allowedIds.map(() => '?').join(',');
  await db.run(
    'DELETE FROM tag_links WHERE user_id=? AND entity_type=? AND entity_id=? AND tag_id NOT IN (' + notInPlaceholders + ')',
    [userId, entityType, entityId, ...allowedIds]
  );

  for (const tagId of allowedIds) {
    await db.run(
      'INSERT INTO tag_links(user_id, tag_id, entity_type, entity_id) VALUES(?,?,?,?) ON CONFLICT(user_id, tag_id, entity_type, entity_id) DO NOTHING',
      [userId, tagId, entityType, entityId]
    );
  }

  return sortTags(tagRows.map((row) => ({ id: row.id, label: row.label, color: row.color })));
}

export async function appendPageTagsToLinks(db) {
  const rows = await db.all(
    `SELECT pt.user_id, pt.page_id AS entity_id, pt.tag_id, COALESCE(pt.created_at, CURRENT_TIMESTAMP) AS created_at
     FROM page_tags pt
     LEFT JOIN tag_links tl
       ON tl.user_id = pt.user_id AND tl.entity_type = 'page' AND tl.entity_id = pt.page_id AND tl.tag_id = pt.tag_id
     WHERE tl.tag_id IS NULL`
  );
  for (const row of rows) {
    await db.run(
      'INSERT OR IGNORE INTO tag_links(user_id, tag_id, entity_type, entity_id, created_at) VALUES(?,?,?,?,?)',
      [row.user_id, row.tag_id, TAG_ENTITY_TYPES.PAGE, row.entity_id, row.created_at]
    );
  }
}
