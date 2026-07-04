'use strict';

const cloudbase = require('@cloudbase/node-sdk');
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = cloudbase.init({
  env: cloudbase.SYMBOL_CURRENT_ENV
});

const db = app.database();
const _ = db.command;

function env(name, fallback = '') {
  return process.env[name] || fallback;
}

function envOptional(name, fallback = '') {
  return Object.prototype.hasOwnProperty.call(process.env, name)
    ? process.env[name]
    : fallback;
}

const COLLECTION_ITEMS = env('COLLECTION_ITEMS', 'wechattaskitems');
const COLLECTION_BATCHES = env('COLLECTION_BATCHES', 'wechattaskbatches');
const COLLECTION_AUTH = env('COLLECTION_AUTH', 'wechattaskauth');
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(body)
  };
}

function html(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'text/html; charset=utf-8'
    },
    body
  };
}

function redirect(location) {
  return {
    statusCode: 302,
    headers: {
      location
    },
    body: ''
  };
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  throw err;
}

function parseBody(event) {
  if (!event) return {};
  if (event.body && typeof event.body === 'object') return event.body;
  if (!event.body || typeof event.body !== 'string') return {};

  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  try {
    return JSON.parse(raw);
  } catch (_err) {
    if (raw.includes('=') && raw.includes('&')) {
      return Object.fromEntries(new URLSearchParams(raw));
    }

    return { text: raw };
  }
}

function getQuery(event) {
  if (!event) return {};
  if (event.queryStringParameters) return event.queryStringParameters;
  if (event.query) return event.query;
  return {};
}

function getHeader(event, name) {
  const headers = event.headers || {};
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key];
  }
  return '';
}

function assertAuthorized(event, body) {
  const secret = env('INTAKE_SECRET');
  if (!secret) return;

  const query = getQuery(event);
  const headerToken = getHeader(event, 'x-intake-secret');
  const bearerToken = getHeader(event, 'authorization').replace(/^Bearer\s+/i, '');
  const bodyToken = body.secret || body.token || query.secret || query.token;
  if (headerToken === secret || bearerToken === secret || bodyToken === secret) return;

  const err = new Error('unauthorized');
  err.statusCode = 401;
  throw err;
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonLike(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || !['{', '['].includes(trimmed[0])) return null;

  try {
    return JSON.parse(trimmed);
  } catch (_err) {
    return null;
  }
}

function firstString(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return '';
}

function extractTextValue(value, seen = new Set()) {
  if (value === null || value === undefined) return '';

  if (typeof value === 'string') {
    const parsed = parseJsonLike(value);
    if (parsed) {
      const nested = extractTextValue(parsed, seen);
      if (nested) return nested;
    }
    return value.trim();
  }

  if (!isPlainObject(value) || seen.has(value)) return '';
  seen.add(value);

  const direct = firstString(
    value.text,
    value.rawText,
    value.raw_text,
    value.plainText,
    value.plain_text,
    value.title
  );
  if (direct) return direct;

  const nestedKeys = [
    'content',
    'message',
    'body',
    'payload',
    'data',
    'event'
  ];
  for (const key of nestedKeys) {
    const nested = extractTextValue(value[key], seen);
    if (nested) return nested;
  }

  return '';
}

function extractSenderValue(value) {
  if (!isPlainObject(value)) return firstString(value);
  return firstString(
    value.name,
    value.nickname,
    value.nickName,
    value.displayName,
    value.userName,
    value.userId,
    value.id,
    value.openId,
    value.open_id
  );
}

function normalizeIncoming(body, event) {
  const message = isPlainObject(body.message) ? body.message : {};
  const eventMessage = isPlainObject(body.event) && isPlainObject(body.event.message)
    ? body.event.message
    : {};
  const dataMessage = isPlainObject(body.data) && isPlainObject(body.data.message)
    ? body.data.message
    : {};

  const text = extractTextValue(body);
  const rawChannel = firstString(
    body.channel,
    body.channelType,
    body.channel_type,
    body.platform,
    body.adapter,
    message.channel,
    eventMessage.channel,
    dataMessage.channel
  );
  const channel = rawChannel.toLowerCase();
  const entry = firstString(body.entry, body.entrypoint, body.intent, body.action_name);
  const isWechatChannel = ['wechat', 'weixin', 'wx'].includes(channel);
  const source = firstString(
    body.source,
    body.provider,
    isWechatChannel || entry === 'openclaw-wechat' ? 'openclaw-wechat' : '',
    'ios-shortcut'
  );
  const sender = firstString(
    body.sender,
    body.senderName,
    body.fromName,
    extractSenderValue(body.from),
    extractSenderValue(body.user),
    extractSenderValue(body.senderInfo),
    extractSenderValue(message.sender),
    extractSenderValue(eventMessage.sender)
  );
  const chatId = firstString(
    body.chatId,
    body.chat_id,
    body.roomId,
    body.room_id,
    body.conversationId,
    body.conversation_id,
    message.chatId,
    message.chat_id,
    eventMessage.chat_id
  );
  const messageId = firstString(
    body.messageId,
    body.message_id,
    body.msgId,
    body.msg_id,
    message.id,
    message.messageId,
    message.message_id,
    eventMessage.message_id,
    dataMessage.message_id,
    getHeader(event, 'x-openclaw-message-id')
  );

  const runId = messageId || requestId(event);
  const dedupeKey = messageId
    ? crypto.createHash('sha256').update(`${source}:${messageId}`).digest('hex')
    : '';

  return {
    text,
    source,
    runId,
    dedupeKey,
    channel,
    entry,
    sender,
    chatId,
    messageId
  };
}

function normalizeText(body) {
  let text = typeof body === 'string' ? body.trim() : normalizeIncoming(body, {}).text;
  if (/%[0-9A-Fa-f]{2}/.test(text)) {
    try {
      text = decodeURIComponent(text);
    } catch (_err) {
      // Keep the original text when it is not valid percent-encoded UTF-8.
    }
  }

  const replacementCount = (text.match(/\uFFFD/g) || []).length;
  const controlCount = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g) || []).length;
  if (text.startsWith('TQP[') || replacementCount >= 3 || controlCount >= 3) {
    const err = new Error('clipboard is not plain text; add a "Get Text from Input" step before sending');
    err.statusCode = 400;
    throw err;
  }

  if (!text) {
    const err = new Error('missing text');
    err.statusCode = 400;
    throw err;
  }
  return text;
}

function requiredEnv(name) {
  const value = env(name);
  if (value) return value;

  const err = new Error(`${name} is not configured`);
  err.statusCode = 500;
  throw err;
}

function formatFeishuText(text) {
  const keyword = envOptional('FEISHU_KEYWORD', '微信待处理').trim();
  if (!keyword || text.includes(keyword)) return text;
  return `${keyword}：${text}`;
}

function formatCollectedText(text, pendingCount, batchSize) {
  return [
    formatFeishuText(text),
    '',
    `收集进度：${pendingCount}/${batchSize}`
  ].join('\n');
}

function displayText(item) {
  if (item.title && item.link) {
    return `${item.title}\n${item.link}`;
  }
  if (item.title) return item.title;
  return item.text;
}

async function sendFeishu(text) {
  const webhook = env('FEISHU_WEBHOOK_URL');
  if (!webhook) {
    const err = new Error('FEISHU_WEBHOOK_URL is not configured');
    err.statusCode = 500;
    throw err;
  }

  const securityKeyword = envOptional('FEISHU_SECURITY_KEYWORD', '').trim();
  const outgoingText = securityKeyword && !text.includes(securityKeyword)
    ? `${text}\n\n${securityKeyword}`
    : text;

  const resp = await fetch(webhook, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({
      msg_type: 'text',
      content: {
        text: outgoingText
      }
    })
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.code !== 0) {
    const err = new Error(`Feishu webhook failed: ${JSON.stringify(data)}`);
    err.statusCode = 502;
    err.feishu = data;
    throw err;
  }

  return data;
}

async function postFeishuToken(body) {
  const resp = await fetch('https://open.feishu.cn/open-apis/authen/v2/oauth/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(body)
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.code !== 0) {
    const err = new Error(`Feishu OAuth failed: ${JSON.stringify(data)}`);
    err.statusCode = 502;
    err.feishu = data;
    throw err;
  }

  return data.data || data;
}

async function feishuApi(accessToken, path, body) {
  return feishuRequest(accessToken, 'POST', path, body);
}

async function feishuRequest(accessToken, method, path, body) {
  const resp = await fetch(`https://open.feishu.cn${path}`, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json; charset=utf-8'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.code !== 0) {
    const err = new Error(`Feishu API failed: ${JSON.stringify(data)}`);
    err.statusCode = 502;
    err.feishu = data;
    throw err;
  }

  return data.data || {};
}

async function feishuPatch(accessToken, path, body) {
  return feishuRequest(accessToken, 'PATCH', path, body);
}

async function feishuGet(accessToken, path) {
  const resp = await fetch(`https://open.feishu.cn${path}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json; charset=utf-8'
    }
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.code !== 0) {
    const err = new Error(`Feishu API failed: ${JSON.stringify(data)}`);
    err.statusCode = 502;
    err.feishu = data;
    throw err;
  }

  return data.data || {};
}

async function fetchFeishuUserInfo(accessToken) {
  if (!accessToken) return {};
  return feishuGet(accessToken, '/open-apis/authen/v1/user_info');
}

function nowIso() {
  return new Date().toISOString();
}

function plusSeconds(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function shanghaiParts(date) {
  const local = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    second: local.getUTCSeconds(),
    weekday: local.getUTCDay()
  };
}

function fromShanghai({ year, month, day, hour, minute = 0, second = 0 }) {
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second));
}

function addDaysShanghai(parts, days) {
  const base = fromShanghai({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: 0
  });
  return shanghaiParts(new Date(base.getTime() + days * 24 * 60 * 60 * 1000));
}

function parseClock(value, fallbackHour, fallbackMinute) {
  const [hour, minute] = String(value || '').split(':').map((part) => Number(part));
  return {
    hour: Number.isFinite(hour) ? hour : fallbackHour,
    minute: Number.isFinite(minute) ? minute : fallbackMinute
  };
}

function formatShanghaiIso(date) {
  const part = shanghaiParts(date);
  const pad = (value) => String(value).padStart(2, '0');
  return `${part.year}-${pad(part.month)}-${pad(part.day)}T${pad(part.hour)}:${pad(part.minute)}:${pad(part.second)}+08:00`;
}

function formatShanghaiDateTime(dateOrIso) {
  const date = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  if (Number.isNaN(date.getTime())) return '';
  const part = shanghaiParts(date);
  const pad = (value) => String(value).padStart(2, '0');
  return `${part.year}-${pad(part.month)}-${pad(part.day)} ${pad(part.hour)}:${pad(part.minute)}:${pad(part.second)}`;
}

function unixSeconds(date) {
  return String(Math.floor(date.getTime() / 1000));
}

function roundUp(date, minutes) {
  const step = minutes * 60 * 1000;
  return new Date(Math.ceil(date.getTime() / step) * step);
}

function requestId(event) {
  const candidate =
    getHeader(event, 'x-request-id') ||
    getHeader(event, 'x-shortcut-run-id') ||
    '';

  return candidate || crypto.randomUUID();
}

async function findExistingItem(dedupeKey) {
  if (!dedupeKey) return null;

  const result = await db
    .collection(COLLECTION_ITEMS)
    .where({ dedupeKey })
    .limit(1)
    .get();

  return (result.data || [])[0] || null;
}

async function addPendingItem({
  text,
  source,
  runId,
  dedupeKey,
  channel,
  entry,
  sender,
  chatId,
  messageId,
  title,
  link,
  platform,
  metadataStatus,
  metadataError
}) {
  const existing = await findExistingItem(dedupeKey);
  if (existing) {
    return {
      duplicate: true,
      ...existing
    };
  }

  const doc = {
    text,
    source,
    runId,
    dedupeKey,
    channel,
    entry,
    sender,
    chatId,
    messageId,
    title,
    link,
    platform,
    metadataStatus,
    metadataError,
    status: 'pending',
    createdAt: nowIso()
  };

  const result = await db.collection(COLLECTION_ITEMS).add(doc);
  return {
    _id: result.id,
    ...doc
  };
}

function baseEnabled() {
  return Boolean(env('FEISHU_BASE_APP_TOKEN') && env('FEISHU_BASE_TABLE_ID'));
}

function basePath(recordId = '') {
  const appToken = encodeURIComponent(env('FEISHU_BASE_APP_TOKEN'));
  const tableId = encodeURIComponent(env('FEISHU_BASE_TABLE_ID'));
  const base = `/open-apis/base/v3/bases/${appToken}/tables/${tableId}/records`;
  return recordId ? `${base}/${encodeURIComponent(recordId)}` : base;
}

function extractFirstUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s<>"'）)】]+/i);
  return match ? match[0] : '';
}

function normalizeUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(trimmed)) return `https://${trimmed}`;
  return '';
}

async function ensureItemMetadata(item) {
  if (item.title || item.metadataStatus === 'no_link') return item;

  const metadata = await fetchLinkMetadata(item.text);
  const patch = {
    title: metadata.title,
    link: metadata.link || metadata.originalLink || item.link || '',
    platform: metadata.platform,
    metadataStatus: metadata.status,
    metadataError: metadata.error
  };
  await db.collection(COLLECTION_ITEMS).doc(item._id).update(patch);
  return {
    ...item,
    ...patch
  };
}

function detectPlatform(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'mp.weixin.qq.com') return '微信公众号';
    if (host.endsWith('xiaohongshu.com') || host === 'xhslink.com') return '小红书';
    if (host.endsWith('bilibili.com') || host === 'b23.tv') return 'B站';
    return '网页';
  } catch (_err) {
    return '未知';
  }
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function cleanTitle(value, platform) {
  let title = decodeHtmlEntities(value)
    .replace(/\s+/g, ' ')
    .trim();

  if (!title) return '';
  if (platform === 'B站') {
    title = title
      .replace(/_哔哩哔哩_bilibili$/i, '')
      .replace(/-哔哩哔哩_Bilibili$/i, '')
      .trim();
  }
  if (platform === '小红书') {
    title = title
      .replace(/ - 小红书$/i, '')
      .replace(/_小红书$/i, '')
      .trim();
  }
  if (platform === '微信公众号') {
    title = title
      .replace(/^\s*微信公众平台\s*$/i, '')
      .trim();
  }

  return title.slice(0, 200);
}

function extractMetaContent(html, matcher) {
  const metaPattern = /<meta\b[^>]*>/gi;
  const attrPattern = /([a-zA-Z_:.-]+)\s*=\s*(['"])(.*?)\2/g;
  let metaMatch;

  while ((metaMatch = metaPattern.exec(html))) {
    const attrs = {};
    let attrMatch;
    while ((attrMatch = attrPattern.exec(metaMatch[0]))) {
      attrs[attrMatch[1].toLowerCase()] = attrMatch[3];
    }
    if (matcher(attrs) && attrs.content) return attrs.content;
  }

  return '';
}

function extractHtmlTitle(html, platform) {
  const candidates = [
    extractMetaContent(html, (attrs) => attrs.property === 'og:title'),
    extractMetaContent(html, (attrs) => attrs.name === 'twitter:title'),
    extractMetaContent(html, (attrs) => attrs.name === 'title')
  ];
  const titleMatch = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) candidates.push(titleMatch[1]);

  for (const candidate of candidates) {
    const title = cleanTitle(candidate, platform);
    if (title) return title;
  }
  return '';
}

function extractBvid(url) {
  const match = String(url || '').match(/\/video\/(BV[0-9A-Za-z]+)/i) ||
    String(url || '').match(/\b(BV[0-9A-Za-z]{8,})\b/i);
  return match ? match[1] : '';
}

async function fetchBilibiliTitle(url) {
  const bvid = extractBvid(url);
  if (!bvid) return '';

  const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`;
  const resp = await fetchTextWithTimeout(apiUrl, 5000);
  if (!resp.ok || !resp.text) return '';

  try {
    const data = JSON.parse(resp.text);
    return cleanTitle(data && data.data && data.data.title ? data.data.title : '', 'B站');
  } catch (_err) {
    return '';
  }
}

async function fetchTextWithTimeout(url, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; WechatTaskCollector/1.0)',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const finalUrl = resp.url || url;
    if (!resp.ok) return { ok: false, finalUrl, text: '' };
    const text = await resp.text();
    return {
      ok: true,
      finalUrl,
      text
    };
  } catch (err) {
    return {
      ok: false,
      finalUrl: url,
      text: '',
      error: err.message || String(err)
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLinkMetadata(text) {
  const link = normalizeUrl(extractFirstUrl(text));
  if (!link) {
    return {
      link: '',
      platform: '未知',
      title: '',
      status: 'no_link',
      error: ''
    };
  }

  const initialPlatform = detectPlatform(link);
  const page = await fetchTextWithTimeout(link);
  const finalUrl = normalizeUrl(page.finalUrl || link) || link;
  const platform = detectPlatform(finalUrl) || initialPlatform;
  let title = page.text ? extractHtmlTitle(page.text, platform) : '';
  if (!title && platform === 'B站') {
    title = await fetchBilibiliTitle(finalUrl);
  }

  return {
    link: finalUrl,
    originalLink: link,
    platform,
    title,
    status: title ? 'ok' : (page.ok ? 'missing_title' : 'fetch_failed'),
    error: page.error || ''
  };
}

function baseSource(source) {
  if (['ios-shortcut', 'openclaw-wechat', 'manual'].includes(source)) return source;
  return source ? 'unknown' : 'unknown';
}

function baseChannel(channel) {
  if (['wechat', 'manual'].includes(channel)) return channel;
  return channel ? 'unknown' : 'unknown';
}

function baseItemFields(item) {
  const link = item.link || extractFirstUrl(item.text);
  return {
    '标题': item.title || null,
    '平台': item.platform || (link ? detectPlatform(link) : '未知'),
    '内容': item.text,
    '链接': link || null,
    '来源': baseSource(item.source || ''),
    '通道': baseChannel(item.channel || ''),
    '入口': item.entry || '',
    '发送人': item.sender || '',
    '消息ID': item.messageId || '',
    'CloudBaseItemId': item._id,
    '状态': '待读',
    '收集时间': formatShanghaiDateTime(item.createdAt || nowIso())
  };
}

function extractRecordId(data) {
  if (!data) return '';
  if (data.record_id) return data.record_id;
  if (data.record && data.record.record_id) return data.record.record_id;
  if (Array.isArray(data.record_id_list) && data.record_id_list[0]) return data.record_id_list[0];
  if (data.record && Array.isArray(data.record.record_id_list) && data.record.record_id_list[0]) {
    return data.record.record_id_list[0];
  }
  return '';
}

async function markItemBaseSync(itemId, patch) {
  await db.collection(COLLECTION_ITEMS).doc(itemId).update({
    ...patch,
    baseSyncedAt: nowIso()
  });
}

function getFieldIndex(fields, fieldName) {
  return Array.isArray(fields) ? fields.indexOf(fieldName) : -1;
}

async function findBaseRecordIdByItemId(auth, itemId) {
  if (!baseEnabled() || !auth || !auth.accessToken || !itemId) return '';

  const data = await feishuGet(auth.accessToken, `${basePath()}?page_size=500`);
  const fields = data.fields || (data.record && data.record.fields) || [];
  const rows = data.data || (data.record && data.record.data) || [];
  const recordIds = data.record_id_list || (data.record && data.record.record_id_list) || [];
  const itemIdIndex = getFieldIndex(fields, 'CloudBaseItemId');
  if (itemIdIndex < 0) return '';

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || [];
    if (String(row[itemIdIndex] || '') === String(itemId)) {
      return recordIds[index] || '';
    }
  }

  return '';
}

async function syncBaseRecordForItem(auth, item) {
  if (!baseEnabled()) return { enabled: false };
  if (!auth || !auth.accessToken) {
    await markItemBaseSync(item._id, {
      baseSyncStatus: 'skipped',
      baseSyncError: 'feishu oauth is not authorized'
    });
    return { enabled: true, skipped: true };
  }

  try {
    const data = await feishuApi(auth.accessToken, basePath(), {
      ...baseItemFields(item)
    });
    const recordId = extractRecordId(data);
    await markItemBaseSync(item._id, {
      baseRecordId: recordId,
      baseSyncStatus: 'created',
      baseSyncError: ''
    });
    return {
      enabled: true,
      recordId
    };
  } catch (err) {
    await db.collection(COLLECTION_ITEMS).doc(item._id).update({
      baseSyncStatus: 'failed',
      baseSyncError: err.message || String(err),
      baseSyncFailedAt: nowIso()
    });
    console.error('sync base record failed', err);
    return {
      enabled: true,
      error: err.message || String(err)
    };
  }
}

async function updateBaseRecord(auth, item, fields) {
  if (!baseEnabled() || !item.baseRecordId || !auth || !auth.accessToken) return false;

  try {
    await feishuPatch(auth.accessToken, basePath(item.baseRecordId), fields);
    await markItemBaseSync(item._id, {
      baseSyncStatus: 'updated',
      baseSyncError: ''
    });
    return true;
  } catch (err) {
    await db.collection(COLLECTION_ITEMS).doc(item._id).update({
      baseSyncStatus: 'failed',
      baseSyncError: err.message || String(err),
      baseSyncFailedAt: nowIso()
    });
    console.error('update base record failed', err);
    return false;
  }
}

async function updateBaseRecordsForSchedule(auth, items, batchId, schedule) {
  if (!baseEnabled() || !auth || !auth.accessToken) return;

  await Promise.all(items.map(async (item) => {
    if (!item.baseRecordId) {
      const created = await syncBaseRecordForItem(auth, item);
      if (created.recordId) item.baseRecordId = created.recordId;
    }

    return updateBaseRecord(auth, item, {
      '状态': '已排期',
      '批次ID': batchId,
      '日历开始': formatShanghaiDateTime(schedule.startIso),
      '日历结束': formatShanghaiDateTime(schedule.endIso),
      '日历链接': schedule.shareUrl || null
    });
  }));
}

function baseFollowupFields(item) {
  const fields = {};

  if (item.title) fields['标题'] = item.title;
  if (item.platform) fields['平台'] = item.platform;
  if (item.link) fields['链接'] = item.link;

  if (item.status === 'scheduled' || item.batchId) {
    fields['状态'] = item.readingStatus || '已排期';
    fields['批次ID'] = item.batchId || '';
    fields['日历开始'] = item.calendarStart ? formatShanghaiDateTime(item.calendarStart) : null;
    fields['日历结束'] = item.calendarEnd ? formatShanghaiDateTime(item.calendarEnd) : null;
    fields['日历链接'] = item.calendarShareUrl || item.calendarEventUrl || null;
  }

  if (item.readingStatus || item.feedbackAt || item.feedbackNote) {
    fields['状态'] = item.readingStatus || fields['状态'] || '已排期';
    fields['阅读反馈'] = item.readingStatus || null;
    fields['反馈时间'] = item.feedbackAt ? formatShanghaiDateTime(item.feedbackAt) : null;
    fields['备注'] = item.feedbackNote || null;
  }

  return fields;
}

async function repairBaseRecordForItem(auth, item) {
  if (!baseEnabled() || !auth || !auth.accessToken) {
    return {
      itemId: item._id,
      ok: false,
      skipped: true,
      reason: 'base disabled or feishu oauth unavailable'
    };
  }

  const result = {
    itemId: item._id,
    ok: false,
    created: false,
    updated: false,
    error: ''
  };

  try {
    item = await ensureItemMetadata(item);

    if (!item.baseRecordId) {
      const existingRecordId = await findBaseRecordIdByItemId(auth, item._id);
      if (existingRecordId) {
        item.baseRecordId = existingRecordId;
        await markItemBaseSync(item._id, {
          baseRecordId: existingRecordId,
          baseSyncStatus: 'linked',
          baseSyncError: ''
        });
      } else {
        const created = await syncBaseRecordForItem(auth, item);
        if (created.recordId) {
          item.baseRecordId = created.recordId;
          result.created = true;
        } else if (created.error) {
          throw new Error(created.error);
        }
      }
    }

    const followupFields = baseFollowupFields(item);
    if (item.baseRecordId && Object.keys(followupFields).length) {
      result.updated = await updateBaseRecord(auth, item, followupFields);
    }

    result.ok = Boolean(item.baseRecordId);
    return result;
  } catch (err) {
    result.error = err.message || String(err);
    return result;
  }
}

async function resyncBaseRecords(limit = 50) {
  const auth = await getCalendarAuth();
  const recent = await listRecent(Math.min(Math.max(Number(limit) || 50, 1), 100));
  const candidates = recent.filter((item) => (
    !item.baseRecordId ||
    item.baseSyncStatus === 'failed' ||
    item.baseSyncStatus === 'skipped' ||
    item.status === 'scheduled' ||
    Boolean(item.readingStatus) ||
    Boolean(item.feedbackAt) ||
    Boolean(extractFirstUrl(item.text) && (!item.title || !item.platform))
  ));

  const results = [];
  for (const item of candidates) {
    results.push(await repairBaseRecordForItem(auth, item));
  }

  return {
    checked: recent.length,
    candidates: candidates.length,
    results
  };
}

async function getStoredAuth() {
  const result = await db
    .collection(COLLECTION_AUTH)
    .where({ type: 'feishu_calendar_oauth' })
    .limit(1)
    .get();

  return (result.data || [])[0] || null;
}

async function saveAuth(tokenData) {
  const existing = await getStoredAuth();
  const accessToken = tokenData.access_token || (existing && existing.accessToken) || '';
  const refreshToken = tokenData.refresh_token || (existing && existing.refreshToken) || '';
  const userInfo = await fetchFeishuUserInfo(accessToken).catch((err) => {
    console.warn('fetch user info failed', err.message || String(err));
    return {};
  });

  const doc = {
    type: 'feishu_calendar_oauth',
    accessToken,
    refreshToken,
    tokenType: tokenData.token_type || 'Bearer',
    scope: tokenData.scope || (existing && existing.scope) || '',
    openId: tokenData.open_id || tokenData.open_id_v2 || userInfo.open_id || (existing && existing.openId) || '',
    unionId: tokenData.union_id || userInfo.union_id || (existing && existing.unionId) || '',
    userId: tokenData.user_id || userInfo.user_id || (existing && existing.userId) || '',
    userName: userInfo.name || (existing && existing.userName) || '',
    expiresAt: tokenData.expires_in
      ? plusSeconds(Number(tokenData.expires_in))
      : (existing && existing.expiresAt) || plusSeconds(7200),
    refreshExpiresAt: tokenData.refresh_expires_in
      ? plusSeconds(Number(tokenData.refresh_expires_in))
      : (existing && existing.refreshExpiresAt) || plusSeconds(2592000),
    updatedAt: nowIso()
  };

  if (existing && existing._id) {
    await db.collection(COLLECTION_AUTH).doc(existing._id).update(doc);
    return {
      _id: existing._id,
      ...existing,
      ...doc
    };
  }

  const result = await db.collection(COLLECTION_AUTH).add({
    ...doc,
    createdAt: nowIso()
  });

  return {
    _id: result.id,
    ...doc
  };
}

async function exchangeCode(code, redirectUri) {
  return postFeishuToken({
    grant_type: 'authorization_code',
    client_id: requiredEnv('FEISHU_APP_ID'),
    client_secret: requiredEnv('FEISHU_APP_SECRET'),
    code,
    redirect_uri: redirectUri
  });
}

async function refreshAuthToken(auth) {
  const tokenData = await postFeishuToken({
    grant_type: 'refresh_token',
    client_id: requiredEnv('FEISHU_APP_ID'),
    client_secret: requiredEnv('FEISHU_APP_SECRET'),
    refresh_token: auth.refreshToken
  });

  return saveAuth({
    ...tokenData,
    open_id: tokenData.open_id || auth.openId,
    union_id: tokenData.union_id || auth.unionId
  });
}

async function getCalendarAuth() {
  const auth = await getStoredAuth();
  if (!auth || !auth.accessToken) return null;

  const expiresAt = auth.expiresAt ? new Date(auth.expiresAt).getTime() : 0;
  if (expiresAt - Date.now() > 5 * 60 * 1000) return auth;

  if (!auth.refreshToken) return null;
  return refreshAuthToken(auth);
}

function buildAuthStartUrl() {
  const redirectUri = requiredEnv('FEISHU_REDIRECT_URI');
  const state = env('OAUTH_STATE_SECRET', env('INTAKE_SECRET'));
  const url = new URL('https://open.feishu.cn/open-apis/authen/v1/index');
  url.searchParams.set('app_id', requiredEnv('FEISHU_APP_ID'));
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', [
    'offline_access',
    'calendar:calendar.event:create',
    'calendar:calendar.event:read',
    'calendar:calendar.event:update',
    'calendar:calendar.free_busy:read',
    'base:app:update'
  ].join(' '));
  url.searchParams.set('state', state);
  return url.toString();
}

async function handleAuthCallback(query) {
  const expectedState = env('OAUTH_STATE_SECRET', env('INTAKE_SECRET'));
  if (!query.code) {
    return html(400, '<h1>飞书日历授权失败</h1><p>缺少 code。</p>');
  }
  if (expectedState && query.state !== expectedState) {
    return html(400, '<h1>飞书日历授权失败</h1><p>state 校验失败。</p>');
  }

  try {
    const tokenData = await exchangeCode(query.code, requiredEnv('FEISHU_REDIRECT_URI'));
    const auth = await saveAuth(tokenData);
    await sendFeishu(formatFeishuText(`飞书日历授权成功。\n\nopen_id：${auth.openId || '已保存'}`));
    return html(200, '<h1>飞书日历授权成功</h1><p>可以关闭这个页面了。之后凑够 5 条会自动尝试写入日历。</p>');
  } catch (err) {
    console.error(err);
    return html(500, `<h1>飞书日历授权失败</h1><pre>${escapeHtml(err.message || String(err))}</pre>`);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function listPending(limit) {
  const result = await db
    .collection(COLLECTION_ITEMS)
    .where({ status: 'pending' })
    .orderBy('createdAt', 'asc')
    .limit(limit)
    .get();

  return result.data || [];
}

async function countByStatus(status) {
  const result = await db
    .collection(COLLECTION_ITEMS)
    .where({ status })
    .count();

  return result.total || 0;
}

async function listRecent(limit) {
  const result = await db
    .collection(COLLECTION_ITEMS)
    .where({})
    .orderBy('createdAt', 'desc')
    .limit(limit + 5)
    .get();

  return (result.data || [])
    .filter((item) => item.type !== '_system')
    .slice(0, limit);
}

async function listRecentBatches(limit) {
  const result = await db
    .collection(COLLECTION_BATCHES)
    .where({})
    .orderBy('createdAt', 'desc')
    .limit(limit + 5)
    .get();

  return (result.data || [])
    .filter((batch) => batch.type !== '_system')
    .slice(0, limit);
}

async function getBatchByBatchId(batchId) {
  const result = await db
    .collection(COLLECTION_BATCHES)
    .where({ batchId })
    .limit(1)
    .get();

  return (result.data || [])[0] || null;
}

async function listItemsByIds(ids) {
  if (!Array.isArray(ids) || !ids.length) return [];

  const result = await db
    .collection(COLLECTION_ITEMS)
    .where({ _id: _.in(ids) })
    .limit(ids.length)
    .get();

  const byId = new Map((result.data || []).map((item) => [item._id, item]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

async function markProcessing(items, batchId) {
  const ids = items.map((item) => item._id);
  if (!ids.length) return;

  await db.collection(COLLECTION_ITEMS)
    .where({ _id: _.in(ids) })
    .update({
      status: 'batched',
      batchId,
      batchedAt: nowIso()
    });
}

async function markScheduled(items, batchId, schedule) {
  const ids = items.map((item) => item._id);
  if (!ids.length) return;

  await db.collection(COLLECTION_ITEMS)
    .where({ _id: _.in(ids) })
    .update({
      status: 'scheduled',
      batchId,
      scheduledAt: nowIso(),
      calendarEventId: schedule.eventId,
      calendarStart: schedule.startIso,
      calendarEnd: schedule.endIso
    });
}

function buildScheduledBatchText(items, schedule) {
  return [
    `已创建日历 block：${items.length} 条待处理`,
    `时间：${schedule.startIso} - ${schedule.endIso}`,
    schedule.shareUrl ? `日程链接：${schedule.shareUrl}` : ''
  ].filter(Boolean).join('\n');
}

function feedbackSecret() {
  return env('OAUTH_STATE_SECRET', env('INTAKE_SECRET'));
}

function feedbackToken(batchId) {
  const secret = feedbackSecret();
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(String(batchId)).digest('hex').slice(0, 32);
}

function assertFeedbackToken(batchId, token) {
  const expected = feedbackToken(batchId);
  if (!expected || !token || expected !== token) {
    const err = new Error('invalid feedback token');
    err.statusCode = 403;
    throw err;
  }
}

function publicActionUrl(action, params = {}) {
  const base = new URL(requiredEnv('FEISHU_REDIRECT_URI'));
  base.search = '';
  base.searchParams.set('action', action);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      base.searchParams.set(key, String(value));
    }
  }
  return base.toString();
}

function feedbackUrl(batchId) {
  return publicActionUrl('feedback', {
    batchId,
    token: feedbackToken(batchId)
  });
}

function buildPendingCalendarText(items, reason) {
  return [
    `已凑够 ${items.length} 条，但暂时没有创建日历 block。`,
    reason ? `原因：${reason}` : ''
  ].filter(Boolean).join('\n');
}

function normalizeBusyInterval(item) {
  const start = item.start_time || item.start || item.time_min || item.begin_time || {};
  const end = item.end_time || item.end || item.time_max || item.finish_time || {};
  const startValue = start.timestamp || start.date_time || item.start_time || item.time_min;
  const endValue = end.timestamp || end.date_time || item.end_time || item.time_max;
  const startDate = /^\d+$/.test(String(startValue)) ? new Date(Number(startValue) * 1000) : new Date(startValue);
  const endDate = /^\d+$/.test(String(endValue)) ? new Date(Number(endValue) * 1000) : new Date(endValue);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return {
    start: startDate,
    end: endDate
  };
}

function extractBusyIntervals(data) {
  if (!data) return [];

  const candidates = [];
  if (Array.isArray(data)) candidates.push(...data);
  if (Array.isArray(data.freebusy_list)) candidates.push(...data.freebusy_list);
  if (Array.isArray(data.freebusy_infos)) candidates.push(...data.freebusy_infos);
  if (Array.isArray(data.items)) candidates.push(...data.items);

  return candidates
    .map(normalizeBusyInterval)
    .filter(Boolean);
}

function overlaps(start, end, intervals) {
  return intervals.some((item) => start < item.end && end > item.start);
}

function fallbackSlot(durationMinutes) {
  const now = new Date();
  const today = shanghaiParts(now);
  const workStart = parseClock(env('CALENDAR_WORK_START', '10:00'), 10, 0);
  let day = today;

  for (let offset = 0; offset < 10; offset += 1) {
    day = addDaysShanghai(today, offset);
    if (day.weekday === 0 || day.weekday === 6) continue;

    const start = fromShanghai({
      year: day.year,
      month: day.month,
      day: day.day,
      hour: workStart.hour,
      minute: workStart.minute
    });
    if (start > now) {
      return {
        start,
        end: new Date(start.getTime() + durationMinutes * 60 * 1000),
        source: 'fallback'
      };
    }
  }

  const start = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return {
    start,
    end: new Date(start.getTime() + durationMinutes * 60 * 1000),
    source: 'fallback'
  };
}

async function findNextSlot(auth, durationMinutes) {
  if (!auth.openId) return fallbackSlot(durationMinutes);

  const now = new Date();
  const lookaheadDays = Number(env('CALENDAR_LOOKAHEAD_DAYS', '7'));
  const workStart = parseClock(env('CALENDAR_WORK_START', '09:30'), 9, 30);
  const workEnd = parseClock(env('CALENDAR_WORK_END', '18:00'), 18, 0);
  const today = shanghaiParts(now);

  for (let offset = 0; offset < lookaheadDays; offset += 1) {
    const day = addDaysShanghai(today, offset);
    if (day.weekday === 0 || day.weekday === 6) continue;

    let cursor = fromShanghai({
      year: day.year,
      month: day.month,
      day: day.day,
      hour: workStart.hour,
      minute: workStart.minute
    });
    const dayEnd = fromShanghai({
      year: day.year,
      month: day.month,
      day: day.day,
      hour: workEnd.hour,
      minute: workEnd.minute
    });

    if (cursor < now) cursor = roundUp(new Date(now.getTime() + 30 * 60 * 1000), 30);

    const busyData = await feishuApi(auth.accessToken, '/open-apis/calendar/v4/freebusy/list', {
      user_id: auth.openId,
      time_min: formatShanghaiIso(cursor),
      time_max: formatShanghaiIso(dayEnd),
      need_rsvp_status: true
    });
    const busy = extractBusyIntervals(busyData);

    while (cursor.getTime() + durationMinutes * 60 * 1000 <= dayEnd.getTime()) {
      const end = new Date(cursor.getTime() + durationMinutes * 60 * 1000);
      if (!overlaps(cursor, end, busy)) {
        return {
          start: cursor,
          end,
          source: 'freebusy'
        };
      }
      cursor = new Date(cursor.getTime() + 30 * 60 * 1000);
    }
  }

  return fallbackSlot(durationMinutes);
}

function calendarDescription(items, batchId) {
  const lines = items.map((item, index) => `${index + 1}. ${displayText(item)}`);
  return [
    '这段时间用于集中处理从微信收集来的待办消息。',
    `反馈入口：${feedbackUrl(batchId)}`,
    '',
    ...lines
  ].join('\n');
}

async function createCalendarEvent(auth, items, batchId) {
  const durationMinutes = Number(env('CALENDAR_BLOCK_MINUTES', '45'));
  const slot = await findNextSlot(auth, durationMinutes);

  const data = await feishuApi(auth.accessToken, '/open-apis/calendar/v4/calendars/primary/events', {
    summary: env('CALENDAR_EVENT_TITLE', '集中处理微信待办'),
    description: calendarDescription(items, batchId),
    start_time: {
      timestamp: unixSeconds(slot.start)
    },
    end_time: {
      timestamp: unixSeconds(slot.end)
    },
    free_busy_status: 'busy',
    reminders: [
      {
        minutes: Number(env('CALENDAR_REMINDER_MINUTES', '5'))
      }
    ]
  });

  return {
    eventId: data.event && data.event.event_id ? data.event.event_id : data.event_id || '',
    calendarId: data.event && data.event.calendar_id ? data.event.calendar_id : data.calendar_id || 'primary',
    shareUrl: data.event && data.event.share_url ? data.event.share_url : data.share_url || '',
    startIso: formatShanghaiIso(slot.start),
    endIso: formatShanghaiIso(slot.end),
    slotSource: slot.source
  };
}

function feedbackOption(value, label, checked) {
  return [
    '<label>',
    `<input type="radio" name="${value.name}" value="${escapeHtml(value.value)}"${checked ? ' checked' : ''}>`,
    escapeHtml(label),
    '</label>'
  ].join('');
}

function renderFeedbackPage(batch, items, token) {
  const cards = items.map((item, index) => {
    const radioName = `status_${item._id}`;
    const noteName = `note_${item._id}`;
    const current = item.readingStatus || '';
    const url = item.link || extractFirstUrl(item.text);
    const title = item.title || '';
    return `
      <section class="item">
        <div class="meta">第 ${index + 1} 篇${item.platform ? ` · ${escapeHtml(item.platform)}` : ''}</div>
        ${title ? `<h2>${escapeHtml(title)}</h2>` : ''}
        <div class="content">${escapeHtml(item.text)}</div>
        ${url ? `<a class="link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">打开原文</a>` : ''}
        <div class="options">
          ${feedbackOption({ name: radioName, value: '已读完' }, '已读完', current === '已读完')}
          ${feedbackOption({ name: radioName, value: '未读完' }, '未读完', current === '未读完')}
          ${feedbackOption({ name: radioName, value: '稍后再读' }, '稍后再读', current === '稍后再读')}
          ${feedbackOption({ name: radioName, value: '放弃' }, '放弃', current === '放弃')}
        </div>
        <textarea name="${noteName}" placeholder="备注">${escapeHtml(item.feedbackNote || '')}</textarea>
      </section>
    `;
  }).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>阅读反馈</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#f7f7f4;color:#202124}
    main{max-width:760px;margin:0 auto;padding:24px 16px 48px}
    h1{font-size:24px;margin:0 0 8px}
    .sub{color:#5f6368;margin-bottom:20px}
    .item{background:#fff;border:1px solid #e5e2da;border-radius:8px;padding:16px;margin-bottom:12px}
    .meta{font-size:13px;color:#6b7280;margin-bottom:8px}
    .content{white-space:pre-wrap;line-height:1.55;word-break:break-word}
    h2{font-size:18px;line-height:1.4;margin:0 0 10px}
    .link{display:inline-block;margin-top:10px;color:#0b57d0;text-decoration:none}
    .options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}
    label{display:flex;gap:8px;align-items:center;border:1px solid #dedbd2;border-radius:6px;padding:10px;background:#fbfaf7}
    textarea{box-sizing:border-box;width:100%;min-height:72px;border:1px solid #dedbd2;border-radius:6px;padding:10px;font:inherit;resize:vertical}
    button{width:100%;border:0;border-radius:6px;background:#1f6f50;color:#fff;font-size:17px;padding:14px 16px}
  </style>
</head>
<body>
  <main>
    <h1>阅读反馈</h1>
    <div class="sub">批次 ${escapeHtml(batch.batchId)} · ${items.length} 篇</div>
    <form method="post" action="${escapeHtml(publicActionUrl('feedback_submit'))}">
      <input type="hidden" name="batchId" value="${escapeHtml(batch.batchId)}">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      ${cards}
      <button type="submit">保存反馈</button>
    </form>
  </main>
</body>
</html>`;
}

async function handleFeedback(query) {
  const batchId = firstString(query.batchId);
  const token = firstString(query.token);
  if (!batchId) badRequest('missing batchId');
  assertFeedbackToken(batchId, token);

  const batch = await getBatchByBatchId(batchId);
  if (!batch) return html(404, '<h1>未找到这个阅读批次</h1>');
  const items = await listItemsByIds(batch.itemIds || []);
  return html(200, renderFeedbackPage(batch, items, token));
}

async function handleFeedbackSubmit(body) {
  const batchId = firstString(body.batchId);
  const token = firstString(body.token);
  if (!batchId) badRequest('missing batchId');
  assertFeedbackToken(batchId, token);

  const batch = await getBatchByBatchId(batchId);
  if (!batch) return html(404, '<h1>未找到这个阅读批次</h1>');

  const items = await listItemsByIds(batch.itemIds || []);
  const auth = await getCalendarAuth();
  const feedbackAt = nowIso();
  const updates = [];

  for (const item of items) {
    const status = firstString(body[`status_${item._id}`]);
    const note = firstString(body[`note_${item._id}`]);
    if (!status && !note) continue;
    const readingStatus = status || item.readingStatus || '';
    const patch = {
      readingStatus,
      feedbackNote: note,
      feedbackAt
    };
    await db.collection(COLLECTION_ITEMS).doc(item._id).update(patch);
    await updateBaseRecord(auth, item, {
      '状态': readingStatus || '已排期',
      '阅读反馈': readingStatus || null,
      '反馈时间': formatShanghaiDateTime(feedbackAt),
      '备注': note || null
    });
    updates.push({
      id: item._id,
      status: readingStatus
    });
  }

  await updateBatch(batch._id, {
    feedbackUpdatedAt: feedbackAt,
    feedbackCount: updates.length
  });

  return html(200, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>反馈已保存</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#f7f7f4;color:#202124}main{max-width:680px;margin:0 auto;padding:40px 18px}h1{font-size:24px}.box{background:#fff;border:1px solid #e5e2da;border-radius:8px;padding:18px}</style></head><body><main><div class="box"><h1>反馈已保存</h1><p>已更新 ${updates.length} 篇文章的阅读状态。</p></div></main></body></html>`);
}

async function updateBatch(batchDocId, patch) {
  await db.collection(COLLECTION_BATCHES).doc(batchDocId).update({
    ...patch,
    updatedAt: nowIso()
  });
}

async function createBatchIfReady() {
  const batchSize = Number(env('BATCH_SIZE', '5'));
  const pending = await listPending(batchSize);

  if (pending.length < batchSize) {
    return {
      ready: false,
      pendingCount: pending.length
    };
  }

  const batchId = crypto.randomUUID();
  const batch = {
    batchId,
    status: 'pending_calendar',
    itemIds: pending.map((item) => item._id),
    texts: pending.map((item) => item.text),
    createdAt: nowIso()
  };

  const batchDoc = await db.collection(COLLECTION_BATCHES).add(batch);
  await markProcessing(pending, batchId);

  const auth = await getCalendarAuth();
  if (!auth) {
    await sendFeishu(buildPendingCalendarText(pending, '尚未完成飞书日历授权'));
    return {
      ready: true,
      batchId,
      count: pending.length,
      status: 'pending_calendar'
    };
  }

  try {
    const schedule = await createCalendarEvent(auth, pending, batchId);
    await markScheduled(pending, batchId, schedule);
    await updateBatch(batchDoc.id, {
      status: 'scheduled',
      scheduledAt: nowIso(),
      calendarEventId: schedule.eventId,
      calendarId: schedule.calendarId,
      calendarStart: schedule.startIso,
      calendarEnd: schedule.endIso,
      calendarShareUrl: schedule.shareUrl,
      slotSource: schedule.slotSource
    });
    await updateBaseRecordsForSchedule(auth, pending, batchId, schedule);
    await sendFeishu(buildScheduledBatchText(pending, schedule));

    return {
      ready: true,
      batchId,
      count: pending.length,
      status: 'scheduled',
      schedule
    };
  } catch (err) {
    console.error(err);
    await updateBatch(batchDoc.id, {
      status: 'pending_calendar',
      calendarError: err.message || String(err)
    });
    await sendFeishu(buildPendingCalendarText(pending, err.message || String(err)));

    return {
      ready: true,
      batchId,
      count: pending.length,
      status: 'pending_calendar',
      error: err.message || String(err)
    };
  }

}

async function getStatus() {
  const batchSize = Number(env('BATCH_SIZE', '5'));
  const [auth, pendingCount, batchedCount, scheduledCount, recentItems, recentBatches] = await Promise.all([
    getStoredAuth(),
    countByStatus('pending'),
    countByStatus('batched'),
    countByStatus('scheduled'),
    listRecent(10),
    listRecentBatches(5)
  ]);

  return {
    batchSize,
    counts: {
      pending: pendingCount,
      batched: batchedCount,
      scheduled: scheduledCount
    },
    calendarAuth: {
      authorized: Boolean(auth && auth.accessToken && (!auth.expiresAt || new Date(auth.expiresAt).getTime() > Date.now())),
      refreshable: Boolean(auth && auth.refreshToken),
      freebusyReady: Boolean(auth && auth.openId),
      baseScopeReady: Boolean(auth && String(auth.scope || '').includes('base:app:update')),
      openId: auth && auth.openId ? auth.openId : '',
      userName: auth && auth.userName ? auth.userName : '',
      expiresAt: auth && auth.expiresAt ? auth.expiresAt : '',
      refreshExpiresAt: auth && auth.refreshExpiresAt ? auth.refreshExpiresAt : ''
    },
    base: {
      enabled: baseEnabled(),
      appTokenConfigured: Boolean(env('FEISHU_BASE_APP_TOKEN')),
      tableIdConfigured: Boolean(env('FEISHU_BASE_TABLE_ID'))
    },
    recentItems: recentItems.map((item) => ({
      id: item._id,
      text: item.text,
      title: item.title || '',
      link: item.link || '',
      platform: item.platform || '',
      source: item.source || '',
      channel: item.channel || '',
      entry: item.entry || '',
      sender: item.sender || '',
      status: item.status,
      readingStatus: item.readingStatus || '',
      baseSyncStatus: item.baseSyncStatus || '',
      baseSyncError: item.baseSyncError || '',
      batchId: item.batchId || '',
      createdAt: item.createdAt,
      batchedAt: item.batchedAt || '',
      scheduledAt: item.scheduledAt || ''
    })),
    recentBatches: recentBatches.map((batch) => ({
      id: batch._id,
      batchId: batch.batchId,
      status: batch.status,
      count: Array.isArray(batch.itemIds) ? batch.itemIds.length : 0,
      createdAt: batch.createdAt,
      scheduledAt: batch.scheduledAt || '',
      calendarEventId: batch.calendarEventId || '',
      calendarStart: batch.calendarStart || '',
      calendarEnd: batch.calendarEnd || '',
      slotSource: batch.slotSource || ''
    }))
  };
}

exports.main = async (event) => {
  try {
    const body = parseBody(event);
    const query = getQuery(event);
    const action = String(body.action || query.action || '').toLowerCase();

    if (action === 'oauth_callback') {
      return handleAuthCallback(query);
    }

    if (action === 'feedback') {
      return handleFeedback(query);
    }

    if (action === 'feedback_submit') {
      return handleFeedbackSubmit(body);
    }

    assertAuthorized(event, body);

    if (action === 'auth_start') {
      return redirect(buildAuthStartUrl());
    }

    if (action === 'status') {
      return json(200, {
        ok: true,
        status: await getStatus()
      });
    }

    if (action === 'base_resync') {
      return json(200, {
        ok: true,
        result: await resyncBaseRecords(body.limit || query.limit || 50)
      });
    }

    if (action === 'metadata_preview') {
      const previewText = normalizeText(body.text || query.text || '');
      return json(200, {
        ok: true,
        metadata: await fetchLinkMetadata(previewText)
      });
    }

    const incoming = normalizeIncoming(body, event);
    const text = normalizeText(incoming.text);
    const auth = await getCalendarAuth();
    const metadata = await fetchLinkMetadata(text);

    const item = await addPendingItem({
      text,
      source: incoming.source,
      runId: incoming.runId,
      dedupeKey: incoming.dedupeKey,
      channel: incoming.channel,
      entry: incoming.entry,
      sender: incoming.sender,
      chatId: incoming.chatId,
      messageId: incoming.messageId,
      title: metadata.title,
      link: metadata.link || metadata.originalLink || '',
      platform: metadata.platform,
      metadataStatus: metadata.status,
      metadataError: metadata.error
    });

    if (item.duplicate) {
      return json(200, {
        ok: true,
        duplicate: true,
        itemId: item._id
      });
    }

    const baseSync = await syncBaseRecordForItem(auth, item);
    if (baseSync.recordId) item.baseRecordId = baseSync.recordId;

    const batchSize = Number(env('BATCH_SIZE', '5'));
    const pendingCount = await countByStatus('pending');
    if (pendingCount < batchSize) {
      const feishuText = formatCollectedText(displayText(item), pendingCount, batchSize);
      await sendFeishu(feishuText);
    }

    const batch = await createBatchIfReady();

    return json(200, {
      ok: true,
      itemId: item._id,
      baseSync,
      batch
    });
  } catch (err) {
    console.error(err);
    return json(err.statusCode || 500, {
      ok: false,
      error: err.message || String(err),
      feishu: err.feishu || undefined
    });
  }
};
