// Read SQL statement boundaries without changing quoted function bodies or comments.
function statements(sql) {
  const result = [];
  let start = 0, codeStart = null, code = '', i = 0;
  const finish = end => {
    result.push({ start, end, codeStart, code: code.trim().replace(/\s+/g, ' ') });
    start = end; codeStart = null; code = '';
  };
  while (i < sql.length) {
    const c = sql[i], next = sql[i + 1];
    if (c === '-' && next === '-') {
      const end = sql.indexOf('\n', i + 2);
      i = end < 0 ? sql.length : end; code += ' '; continue;
    }
    if (c === '/' && next === '*') {
      let depth = 1; i += 2;
      while (i < sql.length && depth) {
        if (sql[i] === '/' && sql[i + 1] === '*') { depth++; i += 2; }
        else if (sql[i] === '*' && sql[i + 1] === '/') { depth--; i += 2; }
        else i++;
      }
      if (depth) throw Error('Unterminated SQL block comment.');
      code += ' '; continue;
    }
    if (c === ';') { i++; finish(i); continue; }
    if (!/\s/.test(c) && codeStart === null) codeStart = i;
    if (c === "'" || c === '"') {
      const quote = c;
      const escaped = quote === "'" && /[eE]/.test(sql[i - 1] || '') && !/[\w$]/.test(sql[i - 2] || '');
      let closed = false; i++;
      while (i < sql.length) {
        if (escaped && sql[i] === '\\') { i += 2; continue; }
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) { i += 2; continue; }
          i++; closed = true; break;
        }
        i++;
      }
      if (!closed) throw Error('Unterminated SQL quoted value or identifier.');
      code += ' <quoted> '; continue;
    }
    if (c === '$' && !/[\w$]/.test(sql[i - 1] || '')) {
      const tag = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0];
      if (tag) {
        const end = sql.indexOf(tag, i + tag.length);
        if (end < 0) throw Error('Unterminated SQL dollar-quoted body.');
        i = end + tag.length; code += ' <quoted> '; continue;
      }
    }
    code += c; i++;
  }
  if (start < sql.length) finish(sql.length);
  return result;
}

function removeTransactionBoundaries(sql, source = 'SQL source') {
  let depth = 0, begins = 0, commits = 0;
  const output = [];
  for (const statement of statements(sql)) {
    const boundary = /^(BEGIN|COMMIT|END)(?: WORK| TRANSACTION)?$/i.exec(statement.code);
    if (boundary) {
      const opening = boundary[1].toUpperCase() === 'BEGIN';
      if (opening ? depth !== 0 : depth !== 1) throw Error(`${source}: unbalanced transaction boundary.`);
      depth = opening ? 1 : 0;
      if (opening) begins++; else commits++;
      // Retain leading comments and whitespace; remove only the command itself.
      output.push(sql.slice(statement.start, statement.codeStart));
      continue;
    }
    if (/^(?:BEGIN|COMMIT|END|ABORT|ROLLBACK|SAVEPOINT|RELEASE|START TRANSACTION|PREPARE TRANSACTION|SET TRANSACTION)\b/i.test(statement.code)) {
      throw Error(`${source}: unsupported transaction control: ${statement.code.slice(0, 80)}`);
    }
    output.push(sql.slice(statement.start, statement.end));
  }
  if (depth) throw Error(`${source}: transaction was not closed.`);
  return { sql: output.join(''), begins, commits };
}

function assertSingleTransaction(sql) {
  const commands = statements(sql).filter(s => s.code);
  if (commands[0]?.code.toUpperCase() !== 'BEGIN' || commands.at(-1)?.code.toUpperCase() !== 'COMMIT') {
    throw Error('Candidate must have one enclosing BEGIN/COMMIT pair.');
  }
  const interior = commands.slice(1, -1);
  for (const command of interior) {
    if (/^(?:BEGIN|COMMIT|END|ABORT|ROLLBACK|SAVEPOINT|RELEASE|START TRANSACTION|PREPARE TRANSACTION|SET TRANSACTION)\b/i.test(command.code)) {
      throw Error('Candidate contains internal transaction control.');
    }
    if (/^(?:CREATE|DROP|REINDEX).*\bCONCURRENTLY\b/i.test(command.code) || /^(?:VACUUM|ALTER SYSTEM|CREATE DATABASE|DROP DATABASE)\b/i.test(command.code)) {
      throw Error('Candidate contains a statement incompatible with the enclosing transaction.');
    }
  }
  return commands;
}

module.exports = { statements, removeTransactionBoundaries, assertSingleTransaction };
