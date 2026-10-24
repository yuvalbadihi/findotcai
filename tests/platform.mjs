// A local SQLite-backed adapter for the subset of the platform SDK used here.
// Production modules are loaded unchanged; no test sends requests to Telegram.
import { DatabaseSync } from 'node:sqlite';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

export async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  const calls = [];
  const clock = { milliseconds: Date.now() };
  class TestDate extends Date {
    static now() {
      return clock.milliseconds;
    }
  }
  const state = { botStatus: 'administrator', gifts: { gifts: [] } };
  const quote = (name) => `"${name}"`;
  const column = (name, type) => ({
    name,
    type,
    primary: false,
    required: false,
    primaryKey() {
      this.primary = true;
      return this;
    },
    notNull() {
      this.required = true;
      return this;
    },
    default(value) {
      this.defaultValue = value;
      return this;
    },
  });
  const table = (name, columns, indexes) => {
    const target = { ...columns, tableName: name };
    for (const column of Object.values(columns)) column.tableName = name;
    sqlite.exec(
      `CREATE TABLE ${quote(name)} (${Object.values(columns)
        .map(
          (c) =>
            `${quote(c.name)} ${c.type}${c.primary ? ' PRIMARY KEY' : ''}${c.required ? ' NOT NULL' : ''}${c.defaultValue !== undefined ? ' DEFAULT ' + c.defaultValue : ''}`,
        )
        .join(',')})`,
    );
    indexes?.(target);
    return target;
  };
  const sql = (strings, ...values) => ({ query: strings.join('?'), values });
  const raw = (input, params) =>
    typeof input === 'string'
      ? { query: input, values: params ? [params] : [] }
      : input;
  const db = {
    run(input, params) {
      const { query, values } = raw(input, params);
      state.queryCount = (state.queryCount || 0) + 1;
      const statement = sqlite.prepare(query);
      if (/\bRETURNING\b/i.test(query)) {
        const rows = statement.all(...values);
        return Promise.resolve({ rows, rowsAffected: rows.length });
      }
      const result = statement.run(...values);
      return Promise.resolve({
        rows: [],
        rowsAffected: Number(result.changes),
      });
    },
    get(input, params) {
      const { query, values } = raw(input, params);
      state.queryCount = (state.queryCount || 0) + 1;
      return Promise.resolve(sqlite.prepare(query).get(...values) || null);
    },
    all(input, params) {
      const { query, values } = raw(input, params);
      state.queryCount = (state.queryCount || 0) + 1;
      return Promise.resolve(sqlite.prepare(query).all(...values));
    },
    select() {
      let target, condition;
      return {
        from(value) {
          target = value;
          return this;
        },
        where(value) {
          condition = value;
          return this;
        },
        get() {
          const row = sqlite
            .prepare(
              `SELECT * FROM ${quote(target.tableName)} WHERE ${quote(condition.column.name)} = ?`,
            )
            .get(condition.value);
          return Promise.resolve(
            row
              ? Object.fromEntries(
                  Object.entries(target)
                    .filter(([key]) => key !== 'tableName')
                    .map(([key, c]) => [key, row[c.name]]),
                )
              : null,
          );
        },
      };
    },
    insert(target) {
      let rows, conflict;
      return {
        values(value) {
          rows = Array.isArray(value) ? value : [value];
          return this;
        },
        onConflictDoNothing(value) {
          conflict = { ...value, nothing: true };
          return this;
        },
        onConflictDoUpdate(value) {
          conflict = value;
          return this;
        },
        async run() {
          const keys = Object.keys(rows[0]);
          const values = rows.flatMap((row) => keys.map((key) => row[key]));
          let query = `INSERT INTO ${quote(target.tableName)} (${keys.map((key) => quote(target[key].name)).join(',')}) VALUES ${rows.map(() => '(' + keys.map(() => '?').join(',') + ')').join(',')}`;
          if (conflict) {
            query += ` ON CONFLICT(${quote(conflict.target.name)}) DO `;
            if (conflict.nothing) query += 'NOTHING';
            else {
              query +=
                'UPDATE SET ' +
                Object.keys(conflict.set)
                  .map((key) => `${quote(target[key].name)}=?`)
                  .join(',');
              values.push(...Object.values(conflict.set));
            }
          }
          return await db.run({ query, values });
        },
      };
    },
    update(target) {
      let values, condition;
      return {
        set(value) {
          values = value;
          return this;
        },
        where(value) {
          condition = value;
          return this;
        },
        run() {
          return db.run({
            query: `UPDATE ${quote(target.tableName)} SET ${Object.keys(values)
              .map((key) => `${quote(target[key].name)}=?`)
              .join(',')} WHERE ${quote(condition.column.name)}=?`,
            values: [...Object.values(values), condition.value],
          });
        },
      };
    },
  };
  const api = new Proxy(
    {},
    {
      get(_target, method) {
        return async (input) => {
          calls.push({ method, input });
          if (method === 'getMe') return { id: 8731206462 };
          if (method === 'getChatMember')
            return {
              status: state.botStatuses?.[input.chat_id] ?? state.botStatus,
            };
          if (method === 'getChat') {
            if (state.onGetChat) await state.onGetChat(input);
            if (state.metadataError)
              throw Object.assign(new Error('Unavailable'), { code: 403 });
            return (
              state.chats?.[input.chat_id] || {
                title: 'Free Market',
                username: 'freemarket',
                paid_message_star_count: 350,
              }
            );
          }
          if (method === 'getChatMemberCount')
            return state.memberCounts?.[input.chat_id] ?? 2353;
          if (method === 'getChatAdministrators')
            return (
              state.admins?.[input.chat_id] || [
                { status: 'creator', user: { id: 41 } },
                { status: 'administrator', user: { id: 42 } },
                { status: 'administrator', user: { id: 43 } },
                { status: 'administrator', user: { id: 44, is_bot: true } },
              ]
            );
          if (method === 'getUserGifts') {
            if (state.giftError)
              throw Object.assign(new Error('Unavailable'), {
                code: 429,
                parameters: { retry_after: 600 },
              });
            return typeof state.gifts === 'function'
              ? await state.gifts(input)
              : state.gifts;
          }
          if (method === 'sendMessage' && input.chat_id > 0) return {};
          throw new Error(`Forbidden outbound operation: ${String(method)}`);
        };
      },
    },
  );
  class EndpointError extends Error {
    constructor(message, parameters) {
      super(message);
      this.parameters = parameters;
    }
  }
  const fetch = async (url) => {
    state.priceFetches = (state.priceFetches || 0) + 1;
    if (state.priceFailures > 0) {
      state.priceFailures--;
      throw new Error('Temporary transport failure');
    }
    if (state.priceError) throw new Error('Price source unavailable');
    state.priceRequests = [...(state.priceRequests || []), url];
    return {
      ok: true,
      json: async () =>
        state.floors || [{ id: '1', stats: { count: 3, floor: '2500000000' } }],
    };
  };
  const sdk = { api, db, EndpointError, fetch };
  const makeIndex = (unique) => (name) => ({
    on(...columns) {
      sqlite.exec(
        `CREATE ${unique ? 'UNIQUE ' : ''}INDEX ${quote(name)} ON ${quote(columns[0].tableName)} (${columns.map((c) => quote(c.name)).join(',')})`,
      );
      return {};
    },
  });
  const dsl = {
    table,
    integer: (name) => column(name, 'INTEGER'),
    text: (name) => column(name, 'TEXT'),
    index: makeIndex(false),
    uniqueIndex: makeIndex(true),
    eq: (column, value) => ({ column, value }),
    sql,
  };
  const context = createContext({ console: { warn() {} }, Date: TestDate });
  const modules = new Map();
  function load(path) {
    if (modules.has(path)) return modules.get(path);
    let module;
    if (path === 'sdk' || path === 'sdk/db') {
      const exports = path === 'sdk' ? sdk : dsl;
      module = new SyntheticModule(
        Object.keys(exports),
        function () {
          for (const [key, value] of Object.entries(exports))
            this.setExport(key, value);
        },
        { context, identifier: path },
      );
    } else {
      module = new SourceTextModule(readFileSync(path, 'utf8'), {
        context,
        identifier: path,
      });
    }
    modules.set(path, module);
    return module;
  }
  const root = new SourceTextModule(
    `import * as otc from './tgcloud/lib/otc.js'; import * as valuation from './tgcloud/lib/gift-valuation.js'; import * as chatState from './tgcloud/lib/chat-state.js'; import * as maintenance from './tgcloud/lib/maintenance.js'; import handler from './tgcloud/handlers/message.js'; import endpoint from './tgcloud/endpoints/getOtcStats.js'; import likeEndpoint from './tgcloud/endpoints/setOtcLike.js'; import refreshEndpoint from './tgcloud/endpoints/refreshDirectory.js'; export { otc, valuation, chatState, maintenance, handler, endpoint, likeEndpoint, refreshEndpoint };`,
    { context, identifier: resolve('test-entry.js') },
  );
  await root.link((specifier, parent) =>
    load(
      specifier.startsWith('sdk')
        ? specifier
        : resolve(dirname(parent.identifier), specifier),
    ),
  );
  await root.evaluate();
  return {
    ...root.namespace,
    sqlite,
    state,
    calls,
    now: () => Math.floor(clock.milliseconds / 1000),
    advance: (seconds) => {
      clock.milliseconds += seconds * 1000;
    },
    close: () => sqlite.close(),
  };
}
