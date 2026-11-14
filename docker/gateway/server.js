#!/usr/bin/env node
/**
 * KA Music API gateway
 * --------------------
 * kgka_Music_hl 客户端期望的后端协议（会话头、少量返回结构）与原生
 * KuGouMusicApi 不完全一致。本网关运行在 KuGouMusicApi 前面，负责：
 *
 *  1. 服务端会话：客户端只在 `X-Kg-Session-Id` / `t1` 头里携带登录态，
 *     网关把会话映射为酷狗 cookie 后通过 Authorization 头转发给上游。
 *  2. 登录协议适配：二维码登录 / 手机号登录 / token 刷新 / 退出登录。
 *  3. 少数接口的返回结构适配（播放列表详情、专辑详情、相似歌单、歌词）。
 *  4. 客户端使用但上游未提供的少量接口（创建歌单、退出登录、听歌时长上报等）。
 *
 * 仅使用 Node 内置模块，无第三方依赖。监听 127.0.0.1。
 */
'use strict';

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.KA_GATEWAY_PORT || 3005);
const HOST = process.env.KA_GATEWAY_HOST || '127.0.0.1';
const API_BASE = new URL(process.env.KA_API_TARGET || 'http://127.0.0.1:3006');
const SESSION_FILE =
  process.env.KA_SESSION_FILE || path.join('/config', 'ka-music', 'sessions.json');
const MAX_BODY = 32 * 1024 * 1024;
const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 天

// ---------------------------------------------------------------------------
// 会话存储
// ---------------------------------------------------------------------------

/** @type {Map<string, {id: string, token?: string, userid?: string, t1?: string, cookie: Record<string,string>, updatedAt: number}>} */
const sessions = new Map();
/** 原始酷狗 token -> 会话 id（兼容刷新 token 后客户端仍携带旧值的情况） */
const tokenIndex = new Map();

function loadSessions() {
  try {
    const raw = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    const list = Array.isArray(raw) ? raw : [];
    const now = Date.now();
    for (const item of list) {
      if (!item || typeof item.id !== 'string') continue;
      if (item.updatedAt && now - item.updatedAt > SESSION_TTL_MS) continue;
      item.cookie = item.cookie && typeof item.cookie === 'object' ? item.cookie : {};
      sessions.set(item.id, item);
      if (item.token) tokenIndex.set(String(item.token), item.id);
    }
    console.log(`[gateway] loaded ${sessions.size} session(s)`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('[gateway] failed to load sessions:', error.message);
    }
  }
}

function saveSessions() {
  try {
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    const tmp = `${SESSION_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify([...sessions.values()]), 'utf8');
    fs.renameSync(tmp, SESSION_FILE);
  } catch (error) {
    console.warn('[gateway] failed to save sessions:', error.message);
  }
}

function newSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

let saveTimer = null;
function scheduleSessionSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveSessions();
  }, 1000);
}

function upsertSession({ id, token, userid, t1, cookie = {} }) {
  let session = id ? sessions.get(id) : undefined;
  if (!session) {
    session = { id: newSessionId(), cookie: {}, updatedAt: Date.now() };
    sessions.set(session.id, session);
  }
  const mergedCookie = { ...session.cookie, ...cookie };
  if (token) {
    session.token = String(token);
    mergedCookie.token = String(token);
    tokenIndex.set(String(token), session.id);
  }
  if (userid !== undefined && userid !== null && String(userid) !== '') {
    session.userid = String(userid);
    mergedCookie.userid = String(userid);
  }
  if (t1) {
    session.t1 = String(t1);
    mergedCookie.t1 = String(t1);
  }
  session.cookie = mergedCookie;
  session.updatedAt = Date.now();

  // 清理过期会话，避免文件无限增长
  const now = Date.now();
  for (const [key, value] of sessions) {
    if (now - value.updatedAt > SESSION_TTL_MS) {
      sessions.delete(key);
      if (value.token) tokenIndex.delete(String(value.token));
    }
  }
  saveSessions();
  return session;
}

function resolveSession(req, url) {
  const headerId = req.headers['x-kg-session-id'];
  const candidates = [];
  if (headerId) candidates.push(String(headerId));
  if (url && url.searchParams.get('token')) candidates.push(url.searchParams.get('token'));
  const cookieSid = parseRequestCookies(req.headers.cookie)['kg_sid'];
  if (cookieSid) candidates.push(cookieSid);

  for (const candidate of candidates) {
    if (sessions.has(candidate)) return sessions.get(candidate);
    if (tokenIndex.has(candidate)) return sessions.get(tokenIndex.get(candidate));
  }
  return null;
}

function parseRequestCookies(header) {
  const out = {};
  if (!header) return out;
  for (const pair of header.split(/;\s*/)) {
    const index = pair.indexOf('=');
    if (index < 1) continue;
    out[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
  }
  return out;
}

function cookiesFromSetCookie(setCookie) {
  const out = {};
  for (const item of setCookie || []) {
    const first = String(item).split(';')[0];
    const index = first.indexOf('=');
    if (index < 1) continue;
    const key = first.slice(0, index).trim();
    let value = first.slice(index + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch (_) {
      /* keep raw */
    }
    out[key] = value;
  }
  return out;
}

function authHeaderFor(session, req) {
  if (!session) return null;
  const cookie = { ...session.cookie };
  if (session.token) cookie.token = session.token;
  if (session.userid) cookie.userid = session.userid;
  if (!cookie.t1 && session.t1) cookie.t1 = session.t1;
  // 客户端每次请求都会带 t1，作为兜底更新
  const t1Header = req.headers['t1'];
  if (!cookie.t1 && t1Header) cookie.t1 = String(t1Header);
  const parts = [];
  for (const [key, value] of Object.entries(cookie)) {
    if (value === undefined || value === null || String(value) === '') continue;
    parts.push(`${key}=${value}`);
  }
  return parts.length ? parts.join('; ') : null;
}

// ---------------------------------------------------------------------------
// HTTP 工具
// ---------------------------------------------------------------------------

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function requestUpstream({ method, pathname, searchParams, headers, body }) {
  return new Promise((resolve, reject) => {
    const query = searchParams ? searchParams.toString() : '';
    const transport = API_BASE.protocol === 'https:' ? https : http;
    const request = transport.request(
      {
        protocol: API_BASE.protocol,
        hostname: API_BASE.hostname,
        port: API_BASE.port || (API_BASE.protocol === 'https:' ? 443 : 80),
        method,
        path: `${pathname}${query ? `?${query}` : ''}`,
        headers,
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode || 502,
            headers: response.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    request.on('error', reject);
    request.setTimeout(45000, () => request.destroy(new Error('upstream timeout')));
    if (body && body.length) request.write(body);
    request.end();
  });
}

function sendJson(res, statusCode, value, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    ...extraHeaders,
  });
  res.end(body);
}

function sendRaw(res, upstream, extraHeaders = {}) {
  const headers = {
    'content-type': upstream.headers['content-type'] || 'application/json; charset=utf-8',
    'content-length': upstream.body.length,
    ...extraHeaders,
  };
  res.writeHead(upstream.statusCode, headers);
  res.end(upstream.body);
}

function parseJson(buffer) {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch (_) {
    return null;
  }
}

const AUDIO_HOST_SUFFIXES = ['.kugou.com', '.kgimg.com'];

function isAllowedAudioUrl(target) {
  const host = target.hostname.toLowerCase();
  return (
    /^https?:$/.test(target.protocol) &&
    !target.username &&
    !target.password &&
    AUDIO_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

/**
 * 同源音频代理：把 http 的酷狗音频流转发给 HTTPS 页面，避免混合内容。
 * 仅允许酷狗/KG 图片域名，防止被当作任意 SSRF 代理；Range 请求完整透传。
 */
function streamAudioProxy(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { status: 0, error: 'method_not_allowed' });
    return;
  }
  const raw = url.searchParams.get('url') || '';
  let target;
  try {
    target = new URL(raw);
  } catch (_) {
    sendJson(res, 400, { status: 0, error: 'invalid_audio_url' });
    return;
  }

  const fetchOnce = (targetUrl, redirects) => {
    if (!isAllowedAudioUrl(targetUrl)) {
      sendJson(res, 400, {
        status: 0,
        error: 'audio_url_not_allowed',
        message: '仅允许代理酷狗音频域名',
      });
      return;
    }
    if (redirects > 6) {
      sendJson(res, 502, { status: 0, error: 'audio_too_many_redirects' });
      return;
    }
    const transport = targetUrl.protocol === 'https:' ? https : http;
    const headers = {
      'user-agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      accept: '*/*',
    };
    for (const name of ['range', 'if-range', 'if-none-match', 'if-modified-since']) {
      if (req.headers[name]) headers[name] = req.headers[name];
    }
    const upstream = transport.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || undefined,
        path: `${targetUrl.pathname}${targetUrl.search}`,
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers,
      },
      (upstreamRes) => {
        const status = upstreamRes.statusCode || 502;
        if ([301, 302, 303, 307, 308].includes(status) && upstreamRes.headers.location) {
          upstreamRes.resume();
          let next;
          try {
            next = new URL(upstreamRes.headers.location, targetUrl);
          } catch (_) {
            sendJson(res, 502, { status: 0, error: 'bad_audio_redirect' });
            return;
          }
          fetchOnce(next, redirects + 1);
          return;
        }
        const out = {};
        for (const name of [
          'content-type',
          'content-length',
          'accept-ranges',
          'content-range',
          'etag',
          'last-modified',
          'cache-control',
        ]) {
          const value = upstreamRes.headers[name];
          if (value !== undefined) out[name] = value;
        }
        res.writeHead(status, out);
        if (req.method === 'HEAD') {
          upstreamRes.resume();
          res.end();
          return;
        }
        upstreamRes.pipe(res);
      },
    );
    upstream.on('error', (error) => {
      if (!res.headersSent) {
        sendJson(res, 502, {
          status: 0,
          error: 'audio_upstream_failed',
          message: error.message,
        });
      } else {
        res.destroy();
      }
    });
    upstream.setTimeout(30000, () => upstream.destroy(new Error('audio upstream timeout')));
    req.on('close', () => upstream.destroy());
    upstream.end();
  };

  fetchOnce(target, 0);
}

// ---------------------------------------------------------------------------
// 对外接口适配
// ---------------------------------------------------------------------------

/**
 * 将客户端请求转发到 KuGouMusicApi，可按需改写路径 / 查询参数 / 请求体。
 *
 * 返回值：
 *  - manual=false（默认）：函数内部已将响应写回客户端，返回 upstream 供日志使用。
 *  - manual=true：不写响应，返回 { upstream, session, sessionId }，由调用方改写后输出。
 */
async function proxy(req, res, options = {}) {
  const url = new URL(req.url, 'http://localhost');
  const session = options.session !== undefined ? options.session : resolveSession(req, url);
  const sessionId = session ? session.id : null;

  const pathname = options.pathname || url.pathname;
  const searchParams = options.searchParams || url.searchParams;
  const body = options.body !== undefined ? options.body : req.body;
  const headers = {
    accept: 'application/json',
    'content-type': req.headers['content-type'] || 'application/json',
    'user-agent': 'KA-Music-Gateway/1.0',
  };
  if (body && body.length) headers['content-length'] = body.length;
  const sessionCookie = authHeaderFor(session, req);
  // 必须用 Cookie 头而不是 Authorization 头：上游的 ensureCookie 中间件只检查
  // Cookie 头，Authorization 里的设备 cookie 不会阻止它重新生成设备标识，
  // 导致同一会话内 MID/GUID/DEV 不断变化，/user/detail 等接口返回 20018。
  if (sessionCookie) headers.cookie = sessionCookie;
  if (process.env.KA_GATEWAY_DEBUG === '1') {
    console.log(
      `[gateway] ${req.method} ${pathname} session=${sessionId || '-'} cookie=${sessionCookie || '-'}`,
    );
  }

  let upstream;
  try {
    upstream = await requestUpstream({
      method: req.method,
      pathname,
      searchParams,
      headers,
      body,
    });
  } catch (error) {
    console.warn(`[gateway] upstream error ${req.method} ${pathname}: ${error.message}`);
    if (options.manual) {
      throw error;
    }
    sendJson(res, 502, {
      status: 0,
      error: 'upstream_unavailable',
      message: `KuGouMusicApi 请求失败：${error.message}`,
    }, sessionId ? { 'x-kg-session-id': sessionId } : {});
    return null;
  }

  // 上游会不断下发设备 cookie，同步回会话，保证后续请求设备信息一致。
  if (session) {
    const setCookie = cookiesFromSetCookie(upstream.headers['set-cookie']);
    if (Object.keys(setCookie).length) {
      session.cookie = { ...session.cookie, ...setCookie };
      session.updatedAt = Date.now();
      scheduleSessionSave();
    }
  }

  if (options.manual) {
    return { upstream, session, sessionId };
  }

  if (!options.transform) {
    sendRaw(res, upstream, sessionId ? { 'x-kg-session-id': sessionId } : {});
    return upstream;
  }

  const json = parseJson(upstream.body);
  if (json === null) {
    sendRaw(res, upstream, sessionId ? { 'x-kg-session-id': sessionId } : {});
    return upstream;
  }

  const transformed = options.transform(json, { session, req, upstream }) || {};
  sendJson(
    res,
    options.statusCode || 200,
    transformed,
    sessionId ? { 'x-kg-session-id': sessionId } : {},
  );
  return upstream;
}

/** 从登录响应（body.data 或 Set-Cookie）中提取会话字段。 */
function sessionFieldsFrom(json, upstream, fallback = {}) {
  const data = json && typeof json.data === 'object' && json.data !== null ? json.data : json || {};
  const cookies = cookiesFromSetCookie(upstream.headers['set-cookie']);
  return {
    token: data.token || cookies.token || fallback.token,
    userid: data.userid ?? cookies.userid ?? fallback.userid,
    t1: data.t1 || cookies.t1 || fallback.t1,
    cookie: { ...cookies },
    nickname: data.nickname,
    avatar: data.pic,
  };
}

// ---------------------------------------------------------------------------
// 主路由
// ---------------------------------------------------------------------------

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  let body = Buffer.alloc(0);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      body = await readBody(req);
    } catch (error) {
      sendJson(res, 413, { status: 0, error: 'body_too_large', message: error.message });
      return;
    }
  }
  req.body = body;

  // 健康检查（容器 healthcheck 使用）
  if (pathname === '/healthz') {
    sendJson(res, 200, { status: 'ok', sessions: sessions.size });
    return;
  }

  // ---------------- 登录 / 会话 ----------------

  if (pathname === '/login/qr/key') {
    await proxy(req, res, { session: null });
    return;
  }

  if (pathname === '/login/qr/check') {
    const { upstream } = await proxy(req, res, { session: null, manual: true });
    const json = parseJson(upstream.body);
    if (!json) {
      sendRaw(res, upstream);
      return;
    }
    const data = json.data && typeof json.data === 'object' ? json.data : json;
    let sessionId = null;
    if (Number(data.status) === 4) {
      const fields = sessionFieldsFrom(json, upstream);
      if (fields.token) {
        const session = upsertSession(fields);
        sessionId = session.id;
        // 客户端把 token 当作会话 id 使用，这里替换为服务端会话 id。
        if (json.data && typeof json.data === 'object') json.data.token = session.id;
        else json.token = session.id;
      }
    }
    sendJson(res, 200, json, sessionId ? { 'x-kg-session-id': sessionId } : {});
    return;
  }

  if (pathname === '/login/logout') {
    const session = resolveSession(req, url);
    if (session) {
      sessions.delete(session.id);
      if (session.token) tokenIndex.delete(String(session.token));
      saveSessions();
    }
    sendJson(res, 200, { status: 1, error_code: 0 });
    return;
  }

  if (pathname === '/login/cellphone') {
    const { upstream } = await proxy(req, res, { session: null, manual: true });
    const json = parseJson(upstream.body);
    if (!json) {
      sendRaw(res, upstream);
      return;
    }
    const data = json.data && typeof json.data === 'object' ? json.data : json;
    let sessionId = null;
    if (data.token) {
      const session = upsertSession(sessionFieldsFrom(json, upstream));
      sessionId = session.id;
      data.token = session.id;
    }
    sendJson(res, 200, json, sessionId ? { 'x-kg-session-id': sessionId } : {});
    return;
  }

  if (pathname === '/login/token') {
    const session = resolveSession(req, url);
    const searchParams = new URLSearchParams(url.searchParams);
    if (session) {
      // 客户端传的 token 是网关会话 id，上游需要原始酷狗 token。
      if (session.token) searchParams.set('token', session.token);
      if (session.userid) searchParams.set('userid', session.userid);
    }
    let result;
    try {
      result = await proxy(req, res, { session, searchParams, manual: true });
    } catch (error) {
      sendJson(res, 502, { status: 0, error: 'login_refresh_failed', message: error.message });
      return;
    }
    const { upstream } = result;
    const json = parseJson(upstream.body);
    if (!json) {
      sendRaw(res, upstream);
      return;
    }
    const data = json.data && typeof json.data === 'object' ? json.data : json;
    let active = session;
    if (data.token || data.t1) {
      active = upsertSession({
        id: session ? session.id : undefined,
        ...sessionFieldsFrom(json, upstream, {
          token: session?.token,
          userid: session?.userid,
          t1: session?.t1,
        }),
      });
      data.token = active.id;
      if (active.userid && !data.userid) data.userid = active.userid;
    } else if (session) {
      // 刷新失败：保持会话 id，客户端继续使用旧登录态。
      active = session;
    }
    sendJson(
      res,
      200,
      json,
      active ? { 'x-kg-session-id': active.id } : {},
    );
    return;
  }

  // ---------------- 返回结构适配 ----------------

  if (pathname === '/playlist/detail' && req.method === 'GET') {
    await proxy(req, res, {
      transform: (json) => {
        if (json && Array.isArray(json.data)) {
          json.data = json.data[0] || {};
        }
        return json;
      },
    });
    return;
  }

  if (pathname === '/album/detail' && req.method === 'GET') {
    await proxy(req, res, {
      transform: (json) => {
        if (json && Array.isArray(json.data)) {
          json.data = json.data[0] || {};
        }
        return json;
      },
    });
    return;
  }

  if (pathname === '/playlist/similar' && req.method === 'GET') {
    await proxy(req, res, {
      transform: (json) => {
        if (json && Array.isArray(json.data)) {
          return {
            status: json.status ?? 1,
            error_code: json.error_code ?? 0,
            data: { data: json.data },
          };
        }
        return json;
      },
    });
    return;
  }

  // 客户端对 /lastest/songs/listen 的解析期望再解一层 data（与参考后端一致）。
  if (pathname === '/lastest/songs/listen') {
    await proxy(req, res, {
      transform: (json) => {
        const payload = json && json.data ? json.data : json;
        return {
          status: (json && json.status) ?? 1,
          data: { data: payload },
        };
      },
    });
    return;
  }

  if (pathname === '/lyric') {
    await proxy(req, res, {
      transform: (json) => {
        if (json && (json.content || json.decodeContent)) {
          return {
            rawContent: json.content || '',
            decodedContent: json.decodeContent || '',
            decodedTranslation: json.decodeTranslation || '',
            rawJson: json,
          };
        }
        return json;
      },
    });
    return;
  }

  // 客户端提交的是结构化歌曲数组，转成上游需要的 "name|hash|album_id|mixsongid" 串。
  if (pathname === '/playlist/tracks/add' && req.method === 'POST') {
    let payload = {};
    try {
      payload = JSON.parse(body.toString('utf8'));
    } catch (_) {
      /* ignore */
    }
    const songs = Array.isArray(payload.songs) ? payload.songs : [];
    const data = songs
      .map((song) =>
        [song.name || '', song.hash || '', song.albumId || 0, song.mixSongId || 0].join('|'),
      )
      .join(',');
    const searchParams = new URLSearchParams({
      listid: String(payload.listId || ''),
      data,
    });
    await proxy(req, res, {
      searchParams,
      body: Buffer.from('{}'),
    });
    return;
  }

  // 客户端 /playlist/create?name=..&type=0|1，上游用 /playlist/add 创建歌单。
  if (pathname === '/playlist/create' && req.method === 'POST') {
    const searchParams = new URLSearchParams({
      name: url.searchParams.get('name') || '',
      type: '0',
      is_pri: url.searchParams.get('type') === '1' ? '1' : '0',
    });
    await proxy(req, res, { pathname: '/playlist/add', searchParams, body: Buffer.from('{}') });
    return;
  }

  // 网易云歌单分享文本解析（QQ 音乐由客户端本地解析，不会走到这里）。
  if (pathname === '/playlist/external/parse' && req.method === 'POST') {
    let payload = {};
    try {
      payload = JSON.parse(body.toString('utf8'));
    } catch (_) {
      /* ignore */
    }
    const result = await parseNetEasePlaylist(payload.sourceText || '');
    if (result.error) {
      sendJson(res, 502, { status: 0, error: result.error, message: result.error });
    } else {
      sendJson(res, 200, result);
    }
    return;
  }

  // 听歌时长上报：本服务不向酷狗同步，直接返回成功，避免客户端反复重试。
  if (pathname === '/listen/timeadd') {
    sendJson(res, 200, { status: 1, error_code: 0 });
    return;
  }

  // Linux 客户端不会检查更新（仅 Android），保留一个安全的成功响应。
  if (pathname === '/mobile/app/versions/latest') {
    sendJson(res, 200, {
      platform: url.searchParams.get('platform') || 'android',
      versionName: '3.3.0',
      versionCode: 329,
      updateContent: '',
      downloadUrl: '',
      forceUpdate: false,
    });
    return;
  }

  // 音频同源代理：酷狗音频 CDN 只支持 http，Web PWA 在 HTTPS 下会被
  // 混合内容策略拦截；这里由服务端转发，Range 请求原样透传以支持拖动进度。
  if (pathname === '/audio-proxy') {
    streamAudioProxy(req, res, url);
    return;
  }

  // ---------------- 默认透传 ----------------
  await proxy(req, res);
}

// ---------------------------------------------------------------------------
// 网易云歌单解析（使用网易云公开接口）
// ---------------------------------------------------------------------------

function extractNetEasePlaylistId(text) {
  const match = String(text).match(/(?:playlist|toplist)[^\d]*?(\d{4,})/i);
  if (match) return match[1];
  const idMatch = String(text).match(/[?&]id=(\d{4,})/);
  return idMatch ? idMatch[1] : '';
}

function httpsJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'user-agent': 'Mozilla/5.0', ...headers } }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject)
      .setTimeout(20000, function () {
        this.destroy(new Error('netease timeout'));
      });
  });
}

async function parseNetEasePlaylist(sourceText) {
  const id = extractNetEasePlaylistId(sourceText);
  if (!id) {
    return { error: '未识别到网易云歌单 ID', status: 0 };
  }
  const candidates = [
    `https://music.163.com/api/v6/playlist/detail?id=${id}&n=1000`,
    `https://music.163.com/api/playlist/detail?id=${id}`,
  ];
  for (const target of candidates) {
    try {
      const json = await httpsJson(target, {
        referer: 'https://music.163.com/',
        'content-type': 'application/json',
      });
      const playlist = json?.playlist || json?.result?.playlist;
      if (playlist) {
        const songNames = (playlist.tracks || [])
          .map((track) => track?.name)
          .filter(Boolean);
        return {
          sourcePlatform: 'netease',
          playlistName: playlist.name || '网易云歌单',
          songNames,
          totalSongCount: playlist.trackCount || songNames.length,
        };
      }
    } catch (error) {
      console.warn(`[gateway] netease playlist ${id} failed: ${error.message}`);
    }
  }
  return { error: '网易云歌单解析失败，请检查分享链接是否有效', status: 0 };
}

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

loadSessions();

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error('[gateway] unhandled error:', error);
    if (!res.headersSent) {
      sendJson(res, 500, { status: 0, error: 'internal_error', message: error.message });
    } else {
      res.end();
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[gateway] KA Music gateway listening on http://${HOST}:${PORT}`);
  console.log(`[gateway] upstream: ${API_BASE.href}`);
  console.log(`[gateway] session file: ${SESSION_FILE}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    saveSessions();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  });
}
